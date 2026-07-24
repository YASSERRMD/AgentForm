import type { FileSystem } from '@agentform/parser';
import { specDocumentResponseSchema } from '@agentform/studio-core';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { z } from 'zod';
import { loadSpecDocument } from '../lib/load-spec-document.js';

export interface RegisterSpecRouteOptions {
  readonly rootDir: string;
  readonly fs?: FileSystem;
}

type SpecDocumentBody = z.infer<typeof specDocumentResponseSchema>;

/**
 * One atomic snapshot, not split into a separate diagnostics endpoint —
 * splitting would mean two independent re-reads of a project directory
 * that could be mid-edit between the two requests, risking an
 * inconsistent application/diagnostics pairing in the UI for no
 * benefit. Always 200: an invalid spec is a successful response
 * carrying error-severity diagnostics as data, not a transport failure.
 */
export function registerSpecRoute(app: FastifyInstance, options: RegisterSpecRouteOptions): void {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/spec',
    { schema: { response: { 200: specDocumentResponseSchema } } },
    async (): Promise<SpecDocumentBody> => {
      const document = loadSpecDocument({ rootDir: options.rootDir, fs: options.fs });
      // SpecDocumentResponse's fields are deliberately `readonly`; Zod's
      // inferred schema type is mutable by default. The two are
      // behaviorally identical at runtime (studio-core's own
      // http-contracts test proves real values parse against this exact
      // schema) — this cast bridges the readonly/mutable mismatch at the
      // one HTTP boundary where it matters, rather than loosening the
      // shared domain type everywhere it's used.
      return document as SpecDocumentBody;
    },
  );
}
