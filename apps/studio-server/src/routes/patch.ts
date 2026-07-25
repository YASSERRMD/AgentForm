import type { FileSystem } from '@agentform/parser';
import { patchSpecRequestSchema, patchSpecResponseSchema } from '@agentform/studio-core';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { z } from 'zod';
import { applySpecPatch } from '../lib/apply-spec-patch.js';
import type { FileWriter } from '../lib/file-writer.js';

export interface RegisterPatchSpecRouteOptions {
  readonly rootDir: string;
  readonly fs?: FileSystem;
  readonly fileWriter?: FileWriter;
}

type PatchSpecBody = z.infer<typeof patchSpecResponseSchema>;

/**
 * The one write endpoint in Studio. `applySpecPatch` re-validates the
 * *entire* pipeline server-side before anything touches disk — this
 * route is a thin transport wrapper around it, never itself a place
 * where trust decisions get made.
 */
export function registerPatchSpecRoute(
  app: FastifyInstance,
  options: RegisterPatchSpecRouteOptions,
): void {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/api/spec/patch',
    { schema: { body: patchSpecRequestSchema, response: { 200: patchSpecResponseSchema } } },
    async (request): Promise<PatchSpecBody> => {
      const result = applySpecPatch({
        rootDir: options.rootDir,
        fs: options.fs,
        fileWriter: options.fileWriter,
        patch: request.body.patch,
      });
      // See routes/spec.ts for why this cast is safe: readonly domain
      // type vs. Zod's mutable-by-default inference, not a real gap.
      return result as PatchSpecBody;
    },
  );
}
