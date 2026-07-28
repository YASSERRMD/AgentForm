import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { resolveGenAIProvider } from './lib/genai-provider.js';
import { GENAI_RATE_LIMIT } from './lib/rate-limit-config.js';

// Uncaught on purpose: an invalid AGENTFORM_STUDIO_PORT or an
// unrecognized AGENTFORM_STUDIO_GENAI_PROVIDER value should crash
// startup with StudioConfigError's own readable message, not be guessed
// at or silently downgraded to a default. See config.ts.
const config = loadConfig();
const genaiProvider = resolveGenAIProvider(config.genaiProviderName);
const app = buildApp({
  rootDir: config.rootDir,
  devOrigin: config.devOrigin,
  genaiProvider,
  authToken: config.authToken,
  genaiRateLimit: GENAI_RATE_LIMIT,
});

app
  .listen({ port: config.port, host: '127.0.0.1' })
  .then(() => {
    app.log.info(
      `Agentform Studio server serving "${config.rootDir}" at http://127.0.0.1:${config.port} (GenAI provider: ${genaiProvider.name})`,
    );
    if (config.authToken) {
      // Mirrors Jupyter's own `--NotebookApp.token` startup banner — a
      // ready-to-open URL, bootstrap-only (see lib/auth.ts for why the
      // query param is never used beyond a browser's first navigation).
      app.log.info(`Open Studio at ${config.devOrigin}/?token=${config.authToken}`);
    }
  })
  .catch((error: unknown) => {
    app.log.error(error);
    process.exitCode = 1;
  });
