import { ChildProcess, spawn } from "child_process";
import path from "path";
import fs from 'fs';
import { Tail } from "tail";
import treeKill from "tree-kill";
import { MuxCommand, MuxProcessConfig, MuxLogger, MuxConfig } from "./mux.types";

export class MuxProcess {
  public name: string;

  private children: ChildProcess[] = [];
  private logPath?: string;
  private startPromise?: Promise<void>;

  constructor(
    private muxConfig: MuxConfig,
    private processConfig: MuxProcessConfig,
    private logger: MuxLogger,
  ) {
    this.name = processConfig.name;
  }

  public async stop(): Promise<void> {
    if (!this.startPromise) {
      throw new Error('Not started yet');
    }

    this.logger.info(`${this.name}: cleaning up`);

    await this.runCommand(this.processConfig.stop);

    this.logger.info(`${this.name}: shutting down`);

    for (const child of this.children) {
      if (child.pid) {
        // Normally, we could send a SIGTERM to the the top level process and
        // have it propagate down to all its children. HOWEVER, NPM will try to
        // keep their child processes alive at all possible costs which leaves
        // orphaned processes all over the place.
        //
        // So instead, use `treeKill` to send a SIGTERM to all child processes
        // at once to ensure a clean exit.
        treeKill(child.pid, 'SIGTERM');
      }
    }

    await this.startPromise;

    fs.truncateSync(this.getLogPath(), 0);
  }

  public async install(): Promise<void> {
    await this.runCommand(this.processConfig.install);
  }

  public async start(): Promise<void> {
    this.logger.info(`${this.name}: starting`);
    this.startPromise = this.runCommand(this.processConfig.run);
    await this.startPromise;
  }

  private getLogPath(): string {
    if (!this.logPath) {
      const logDir = path.join(this.muxConfig.rootDir, this.muxConfig.logPath);
      fs.mkdirSync(logDir, { recursive: true });
      this.logPath = path.join(logDir, `${this.name.toLowerCase().replace(/ /g, '-')}.log`);
      fs.appendFileSync(this.logPath, ''); // "touch the file"
      fs.truncateSync(this.logPath, 0);
    }

    return this.logPath;
  }

  public getLogStream(lines = 100): Tail {
    return new Tail(this.getLogPath(), { nLines: lines, follow: true });
  }

  protected async runCommand(command?: MuxCommand): Promise<void> {
    if (!command) {
      return Promise.resolve();
    }

    const {
      exec,
      dir = './',
      env = {}
    } = command;

    const cwd = path.join(this.muxConfig.rootDir, dir);

    const logFile = this.getLogPath();

    let resolver: () => void;
    const promise = new Promise<void>(resolve => {
      resolver = resolve
    });

    const envVars = Object.keys(env)
      .map((key) => `${key}='${env[key]}'`)
      .join(' ');
    const bin = "sh";
    const args = ['-c', `'cd ${cwd} && ${envVars} ${exec}'`];

    this.logger.info(`${this.name}: Executing "${bin} ${args.join(' ')}"`);

    const child = spawn(bin, args, {
      shell: true
    });

    child.stdout.on('data', (data: Buffer) => {
      fs.appendFileSync(logFile, data);
    });
    
    child.stderr.on('data', (data: Buffer) => {
      fs.appendFileSync(logFile, data);
    });
    
    child.on('close', (code) => {
      fs.appendFileSync(logFile, `exited with code ${code}`);
      resolver();
    });

    this.children.push(child);

    return promise;
  }
}
