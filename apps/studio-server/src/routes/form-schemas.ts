import { formSchemasResponseSchema, generateAllResourceFormSchemas } from '@agentform/studio-core';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

/**
 * Static, project-independent — every field is derived from
 * @agentform/schema's own Zod schemas, not from any file on disk, so
 * this never needs `rootDir` and studio-web can safely fetch it once
 * and cache it for the session.
 */
export function registerFormSchemasRoute(app: FastifyInstance): void {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      '/api/form-schemas',
      { schema: { response: { 200: formSchemasResponseSchema } } },
      async () => generateAllResourceFormSchemas(),
    );
}
