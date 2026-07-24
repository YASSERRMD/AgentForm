import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Builds (but does not `.listen()`) the Studio server. Tests call this
 * directly and exercise it via Fastify's `.inject()`, so no test ever
 * binds a real port.
 */
export function buildApp(): FastifyInstance {
  return Fastify({ logger: true });
}
