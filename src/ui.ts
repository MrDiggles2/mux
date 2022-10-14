import { performance } from 'perf_hooks';
import chalk from 'chalk';
import { Tail } from 'tail';
import { MuxProcess } from './process';
import { MuxLogger } from './config';

type DefaultNode = {
  name: string;
  getAction?: () => {
    start: () => Promise<void>,
    stop: () => Promise<void>
  }
};

type MenuNode = { menu: DefaultNode[] } & DefaultNode;
type PromptNode = { onAnyKeypress: DefaultNode } & DefaultNode;
type ActionNode = { onActionComplete: DefaultNode } & DefaultNode;
type EndNode = DefaultNode;

type StateNode =
 | MenuNode
 | PromptNode
 | ActionNode
 | EndNode;

export class MuxUI {
  private initialState: StateNode;
  private stopped = false;

  constructor(
    private processes: MuxProcess[],
    private uiHooks: {
      onChoicePrompt: (prompt: string, items: string[]) => Promise<number>,
      waitForNextKey: () => Promise<void>,
    },
    private logger: MuxLogger,
  ) {
    this.initialState = this.buildStateGraph(processes);
  }

  public async die() {
    this.stopped = true;
    const startTime = performance.now();

    this.logger.info('cleaning up...');
    await Promise.all(this.processes.map(process => process.stop()));

    this.logger.debug(`Sending SIGINT to my PID: ${process.pid}`);
    process.kill(process.pid, "SIGINT");

    this.logger.debug(`Shut down took ${performance.now() - startTime}ms`)
  }

  public async start(): Promise<void> {
    await this.initialize();

    this.handleNextState(this.initialState);

    // Return a never ending promise
    return new Promise(_ => {});
  }

  private async initialize(): Promise<void> {
    const startTime = performance.now();

    await Promise.all(this.processes.map(async process => {
      this.logger.info(`${process.name}: installing`);
      const stream = process.getLogStream();
      stream.on('line', line => this.handleProcessLog(process, line));
      await process.install();
      stream.unwatch();
    }));

    this.logger.debug(`Start up took ${performance.now() - startTime}ms`)

    this.processes.forEach(process => {
      this.logger.info(`${process.name}: Starting`);
      process.start();
    });
  }

  private handleProcessLog = (process: MuxProcess,line: string): void => {
    const formatted = chalk.yellow(process.name) + `: ${line}`;
    this.logger.log(formatted);
  }

  private async handleNextState(currentState: StateNode) {
    if (this.stopped) {
      return;
    }

    this.logger.debug(`Entering "${currentState.name}"`);

    let startPromise = Promise.resolve();
    let stopFn = () => Promise.resolve();

    if (currentState.getAction) {
      const {
        start,
        stop
      } = currentState.getAction();

      startPromise = start();
      stopFn = stop;
    }

    if ("onActionComplete" in currentState) {
      this.logger.debug(`Handling "${currentState.name}" as ActionNode. Waiting for completion...`);
      await startPromise;
      await stopFn();
      this.logger.debug(`Action complete`);
      this.handleNextState(currentState.onActionComplete);
    } else if ("onAnyKeypress" in currentState) {
      this.logger.debug(`Handling "${currentState.name}" as PromptNode. Waiting for key press...`);
      await this.uiHooks.waitForNextKey();
      await stopFn();
      this.handleNextState(currentState.onAnyKeypress);
    } else if ("menu" in currentState) {
      this.logger.debug(`Handling "${currentState.name}" as MenuNode. Waiting for selection...`);
      const items = currentState.menu.map(item => item.name);
      const prompt = `${currentState.name}`;
      const index = await this.uiHooks.onChoicePrompt(prompt, items);
      this.logger.debug(`Selected index: ${index}`);
      const nextState = Object.values(currentState.menu)[index];
      await stopFn();
      this.handleNextState(nextState);
    } else {
      // Intentially blank - end node
      this.logger.debug(`Handling "${currentState.name}" as EndNode`);
    }
  }

  /**
   * Builds state-machine and returns the start node
   */
  private buildStateGraph(processes: MuxProcess[]): StateNode {

    const quit: EndNode = {
      name: 'quit',
      getAction: () => ({
        start: async () => await this.die(),
        stop: async () => {}
      })
    };

    const startMenu: MenuNode = {
      name: 'main menu',
      menu: [ quit ]
    };

    const rebuildAll: ActionNode = {
      name: 'rebuild all processes',
      getAction: () => ({
        start: async () => {
          this.logger.info(`Stopping all processes...`);
          await Promise.all(this.processes.map(process => process.stop()));

          await this.initialize();
        },
        stop: async () => {}
      }),
      onActionComplete: startMenu,
    };

    startMenu.menu.unshift(rebuildAll);

    for (let i = 0; i < processes.length; i++) {
      const process = processes[i];

      const processTail: PromptNode = {
        name: `${process.name}:tail`,
        getAction: () => {
          let stream: Tail | undefined;
          return {
            start: async () => {
              this.logger.info(`Tailing ${process.name}...`);
              stream = process.getLogStream();
              stream.on('line', this.logger.log);
              return new Promise(_ => {});
            },
            stop: async () => {
              stream?.unwatch();
            }
          }
        },
        onAnyKeypress: () => {} // Replaced later
      };

      // Restart process, go straight to tail

      const processRestart: ActionNode = {
        name: `${process.name}:restart`,
        getAction: () => {
          let stream: Tail | undefined;
          return {
            start: async () => {
              this.logger.info(`Restarting ${process.name}...`);
              stream = process.getLogStream(0);
              stream.on('line', this.logger.log);

              await process.stop();
              process.start();
            },
            stop: async () => {
              stream?.unwatch();
            }
          }
        },
        onActionComplete: processTail
      };

      // Rebuild and restart process, go straight to tail

      const processRebuild: ActionNode = {
        name: `${process.name}:rebuild`,
        getAction: () => {
          let stream: Tail | undefined;
          return {
            start: async () => {
              this.logger.info(`Rebuilding ${process.name}...`);
              stream = process.getLogStream(0);
              stream.on('line', this.logger.log);

              await process.stop();
              await process.install();
              process.start();
            },
            stop: async () => {
              stream?.unwatch();
            }
          }
        },
        onActionComplete: processTail
      };

      const processMenu: MenuNode = {
        name: `${process.name}:menu`,
        menu: [ startMenu, processTail, processRestart, processRebuild ]
      };

      processTail.onAnyKeypress = processMenu;
      startMenu.menu.unshift(processTail);
    }

    return startMenu;
  }
}
