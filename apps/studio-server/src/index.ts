import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = buildApp();

app
  .listen({ port: config.port, host: '127.0.0.1' })
  .then(() => {
    app.log.info(
      `Agentform Studio server serving "${config.rootDir}" at http://127.0.0.1:${config.port}`,
    );
  })
  .catch((error: unknown) => {
    app.log.error(error);
    process.exitCode = 1;
  });
