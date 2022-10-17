import { MuxConfig } from "src/config";

const config: MuxConfig = {
  rootDir: './',
  logPath: 'logs',
  processes: [
    {
      name: 'long sleeper',
      run: {
        exec: 'sleep 1000',
      }
    }
  ]
};

export default config;