import type { FileSystem } from '@agentform/parser';
import type { GenAIProvider } from '@agentform/studio-genai';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { FileWriter } from './lib/file-writer.js';
import { registerAuditRoute } from './routes/audit.js';
import { registerDesignRoute } from './routes/design.js';
import { registerFormSchemasRoute } from './routes/form-schemas.js';
import { registerGenaiRoute } from './routes/genai.js';
import { registerHealthRoute } from './routes/health.js';
import { registerPatchSpecRoute } from './routes/patch.js';
import { registerSpecRoute } from './routes/spec.js';

export interface BuildAppOptions {
  readonly rootDir: string;
  readonly fs?: FileSystem;
  readonly fileWriter?: FileWriter;
  /** The single allowed CORS origin. Omit to disable CORS entirely (tests never need it — `.inject()` has no browser origin). */
  readonly devOrigin?: string;
  /** Omit to leave the GenAI routes unconfigured (they still exist, always responding `success: false`) — see routes/genai.ts. */
  readonly genaiProvider?: GenAIProvider;
}

/**
 * Builds (but does not `.listen()`) the Studio server. Tests call this
 * directly and exercise it via Fastify's `.inject()`, so no test ever
 * binds a real port.
 */
export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: true });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  if (options.devOrigin) {
    // Narrow allowlist, not `origin: true`/`*` — this server has no auth
    // by design (see docs/security/threat-model.md), so CORS is the one
    // cheap layer stopping an arbitrary webpage the developer has open
    // in the same browser from reaching it.
    void app.register(cors, { origin: [options.devOrigin] });
  }

  registerHealthRoute(app, { rootDir: options.rootDir });
  registerSpecRoute(app, { rootDir: options.rootDir, fs: options.fs });
  registerPatchSpecRoute(app, {
    rootDir: options.rootDir,
    fs: options.fs,
    fileWriter: options.fileWriter,
  });
  registerFormSchemasRoute(app);
  registerDesignRoute(app, {
    rootDir: options.rootDir,
    fs: options.fs,
    fileWriter: options.fileWriter,
  });
  registerGenaiRoute(app, {
    rootDir: options.rootDir,
    fs: options.fs,
    provider: options.genaiProvider,
  });
  registerAuditRoute(app, { rootDir: options.rootDir, fs: options.fs });

  return app;
}
