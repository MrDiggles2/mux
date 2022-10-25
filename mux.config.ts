import { MuxConfig } from "src/config";

const dcBin = "docker compose --ansi=always -f example/docker-compose.yml"

const config: MuxConfig = {
  rootDir: './',
  logPath: 'logs',
  processes: [
    {
      name: "docker nginx",
      install: {
        exec: `${dcBin} build`
      },
      run: {
        exec: `${dcBin} up --remove-orphans`
      },
      stop: {
        exec: `${dcBin} down`
      }
    },
    {
      name: 'random number printer',
      install: {
        dir: './example',
        exec: 'npm ci',
      },
      run: {
        dir: './example',
        exec: 'npm start',
      }
    }
  ]
};

export default config;