import type { FileSystem } from '@agentform/parser';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerHealthRoute } from './routes/health.js';
import { registerSpecRoute } from './routes/spec.js';

export interface BuildAppOptions {
  readonly rootDir: string;
  readonly fs?: FileSystem;
  /** The single allowed CORS origin. Omit to disable CORS entirely (tests never need it — `.inject()` has no browser origin). */
  readonly devOrigin?: string;
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

  return app;
}
