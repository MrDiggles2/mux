export interface MuxCommand {
  /**
   * Command to run in a separate process
   */
  exec: string;
  /**
   * Path to run `exec` from. Appended to provided `rootDir` in mux.config.ts
   */
  dir?: string;
  /**
   * Additional environment variables to run command with
   */
  env?: NodeJS.ProcessEnv
}

export interface MuxConfig {
  /**
   * Root directory to operate from
   */
  rootDir: string;
  /**
   * Directory to dump all logs. Appended to `rootDir`
   */
  logPath: string;
  processes: MuxProcessConfig[];
};

export interface MuxProcessConfig {
  name: string;
  /**
   * Main command to watch. Executes after `install`.
   */
  run: MuxCommand;
  /**
   * Install command. Executes before `run`.
   */
  install?: MuxCommand;
  /**
   * Cleanup process to run before ending the process
   */
  stop?: MuxCommand;
};

export interface MuxLogger {
  log: (message: string) => void,
  info: (message: string) => void,
  debug: (message: string) => void,
  warn: (message: string) => void,
  error: (message: string) => void,
}
