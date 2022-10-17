#!/usr/bin/env node

(async () => {
  if (process.env.MUX_DEV_MODE) {
    await import("ts-node/register");
  }
});

import path from 'path';
import { MuxUI } from "./ui";
import { MuxProcess } from './process';
import { terminal } from "terminal-kit";
import { MuxConfig, MuxLogger } from "./config";

const logger: MuxLogger = {
  log: (message: string) => {
    terminal.defaultColor(message + '\n');
  },
  info: (message: string) => {
    terminal.brightGreen('[INFO] ' + message + '\n');
  },
  debug: (message: string) => {
    if (process.env.DEBUG) {
      terminal.brightMagenta('[DEBUG] ' + message + '\n');
    }
  }
}

function runHelp() {
  logger.log(`
usage:

  ./mux [start|help]
`);
}

async function runStart() {

  // Manually require the config file so it can stay at the top level of the project

  const configPath = path.join(process.cwd(), 'mux.config.ts');
  const config: MuxConfig = require(configPath).default;

  const muxProcesses = config.processes.map(processConfig => {
    return new MuxProcess(config, processConfig, logger);
  });

  const ui = new MuxUI(
    muxProcesses,
    {
      onChoicePrompt: async (prompt, items) => {
        return new Promise(resolve => {
          terminal.defaultColor('\n');
          terminal.cyan(`${prompt}`);
          terminal.defaultColor('\n');
          terminal.singleColumnMenu(
            items,
            { leftPadding: "  " },
            (err, arg) => resolve(arg.selectedIndex)
          );
        });
      },
      waitForNextKey: async () => {
        return new Promise(resolve => {
          terminal.once('key', resolve);
        });
      },
    },
    logger
  );

  ui.start();

  let stopped = false;

  const cleanExit = async () => {
    if (stopped) {
      return;
    }
    stopped = true;

    terminal.reset();
    await ui.die();

    logger.debug(`Exiting my process...`);
    process.exit();
  }

  terminal.on('key', (name: string) => {
    // Allow SIGINTs to go through
    if (name === 'CTRL_C') {
      logger.info(`Received CTRL+C - exiting...`);
      cleanExit();
    }
  });

  process.on('SIGINT', () => { console.log('SIGINT'); cleanExit(); });
  process.on('SIGTERM', () => { console.log('SIGTERM'); cleanExit(); });
}


const main = async () => {
  const [ command ] = process.argv.slice(2);

  switch (command) {
    case 'start':
      await runStart();
    break;
  
    case 'attach':
      logger.log('attach');
    break;
  
    case 'stop':
      logger.log('stop');
    break;
  
    case 'help':
    default:
      runHelp();
    break;
  }
};

main();