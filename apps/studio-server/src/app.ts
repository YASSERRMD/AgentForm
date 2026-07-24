import type { FileSystem } from '@agentform/parser';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerHealthRoute } from './routes/health.js';
import { registerSpecRoute } from './routes/spec.js';

export interface BuildAppOptions {
  readonly rootDir: string;
  readonly fs?: FileSystem;
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

  registerHealthRoute(app, { rootDir: options.rootDir });
  registerSpecRoute(app, { rootDir: options.rootDir, fs: options.fs });

  return app;
}
