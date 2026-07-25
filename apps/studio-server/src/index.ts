import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { resolveGenAIProvider } from './lib/genai-provider.js';

const config = loadConfig();
const genaiProvider = resolveGenAIProvider(config.genaiProviderName);
const app = buildApp({ rootDir: config.rootDir, devOrigin: config.devOrigin, genaiProvider });

app
  .listen({ port: config.port, host: '127.0.0.1' })
  .then(() => {
    app.log.info(
      `Agentform Studio server serving "${config.rootDir}" at http://127.0.0.1:${config.port} (GenAI provider: ${genaiProvider.name})`,
    );
  })
  .catch((error: unknown) => {
    app.log.error(error);
    process.exitCode = 1;
  });
