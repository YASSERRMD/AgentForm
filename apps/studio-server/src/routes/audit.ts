import { nodeFileSystem, type FileSystem } from '@agentform/parser';
import { auditListResponseSchema } from '@agentform/studio-core';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { z } from 'zod';
import { readAuditLog } from '../lib/audit-log.js';

export interface RegisterAuditRouteOptions {
  readonly rootDir: string;
  readonly fs?: FileSystem;
}

type AuditListBody = z.infer<typeof auditListResponseSchema>;

const DEFAULT_LIMIT = 50;

/**
 * Read-only view of the local provenance log (Phase 18). Always 200 — an
 * empty log (nothing has ever been written through Studio yet) is a
 * normal, expected state, not an error, same discipline as `GET
 * /api/design/:resourceType/:resourceId`'s `{design: null}`.
 */
export function registerAuditRoute(app: FastifyInstance, options: RegisterAuditRouteOptions): void {
  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      '/api/audit',
      { schema: { response: { 200: auditListResponseSchema } } },
      async (): Promise<AuditListBody> => {
        const entries = readAuditLog(options.rootDir, options.fs ?? nodeFileSystem, DEFAULT_LIMIT);
        // See routes/spec.ts for why this cast is safe: readonly domain
        // type vs. Zod's mutable-by-default inference, not a real gap.
        return { entries } as AuditListBody;
      },
    );
}
