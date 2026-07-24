import { healthResponseSchema } from '@agentform/studio-core';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export interface RegisterHealthRouteOptions {
  readonly rootDir: string;
}

export function registerHealthRoute(
  app: FastifyInstance,
  options: RegisterHealthRouteOptions,
): void {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get('/api/health', { schema: { response: { 200: healthResponseSchema } } }, async () => ({
      status: 'ok' as const,
      rootDir: options.rootDir,
    }));
}
