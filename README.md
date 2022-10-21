# mux

Process muxer written in TypeScript.

Allows configuration of installation, runtime, and clean up of individual processes. Built in menu allows tailing, restarting, and rebuilding of processes within a single terminal session.

Particularly useful for monorepo setups where 

## Getting started

1. Install package

```
npm install @mrdiggles2/mux
```

2. Create a `mux.config.ts` at the root level of your project. Sample:

```
import { MuxConfig } from '@mrdiggles2/mux/config';

const config: MuxConfig = {
  rootDir: __dirname,
  logPath: '.mux/logs',
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
```

3. Execute `mux`

```
npx mux
```

## Configuration

Each process in `mux.config.ts` can be configured:

```
...
{
  name: 'YOUR PROCESS NAME HERE',
  run: MuxCommand,
  install?: MuxCommand,
  cleanup?: MuxCommand,

},
...
```

Where `MuxCommand` takes the form:

```
{
    exec: <Command to run in a separate process>;
    dir?: <Path to run `exec` from. Appended to provided `rootDir` in mux.config.ts>
    env?: {
      <Additional environment variables to run command with>
    }
}
```

Since `mux.config.ts` is a TypeScript file, you can also add dynamic configuration. Here is a more complete sample:

```
import path from "path";
import { MuxConfig } from '@mrdiggles2/mux/config';

const dockerComposeFiles = [
  'docker-compose.yml',
  'docker-compose.local.yaml'
].map(file => path.join(__dirname, file));

const dcBin = `docker compose --ansi=always ` + dockerComposeFiles.map(file => `-f ${file}`).join(' ');

const config: MuxConfig = {
  rootDir: __dirname,
  logPath: '.mux',
  processes: [
    {
      name: 'docker-services',
      install: {
        exec: `${dcBin} up -d --remove-orphans --wait`
      },
      run: {
        exec: `${dcBin} logs -f`
      },
      stop: {
        exec: `${dcBin} down`
      }
    },
    {
      name: 'nest-backend',
      install: {
        exec: 'npm ci',
        dir: 'backend',
      },
      run: {
        exec: 'npx nest --watch',
        dir: 'backend',
        env: {
          NODE_ENV: development
          ...<ENV VARS>
        },
      }
    },
    {
      name: 'react-frontend',
      install: {
        exec: `npm ci`,
        dir: 'frontend',
      },
      run: {
        exec: `npx react-scripts start`,
        dir: 'frontend',
        env: {
          FORCE_COLOR: '1'
          ...<ENV VARS>
        }
      }
    },
  ]
};

export default config;
```
