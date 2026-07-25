import { identifierSchema } from '@agentform/schema';
import { nodeFileSystem, type FileSystem } from '@agentform/parser';
import {
  getDesignResponseSchema,
  putDesignRequestSchema,
  putDesignResponseSchema,
} from '@agentform/studio-design';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { applyDesignPatch } from '../lib/apply-design-patch.js';
import { readDesignFile } from '../lib/design-fs.js';
import type { FileWriter } from '../lib/file-writer.js';

// readonly domain types vs. Zod's mutable-by-default inference — same
// documented, deliberate cast routes/patch.ts already uses, not a real gap.
type GetDesignBody = z.infer<typeof getDesignResponseSchema>;
type PutDesignBody = z.infer<typeof putDesignResponseSchema>;

export interface RegisterDesignRouteOptions {
  readonly rootDir: string;
  readonly fs?: FileSystem;
  readonly fileWriter?: FileWriter;
}

// resourceId is constrained to the same identifierSchema every spec
// resource id is already validated against, before it ever reaches a
// filesystem path (design-fs.ts's own resolvePathWithinRoot is the
// defense-in-depth backstop, not the only gate).
const designParamsSchema = z.object({
  resourceType: z.enum(['agents', 'workflows']),
  resourceId: identifierSchema,
});

/**
 * The design-artifact read/write endpoints. GET always returns 200 with
 * `{design: null}` when none exists yet — a missing design is a normal,
 * expected state (nothing has been laid out), not an error. PUT delegates
 * entirely to applyDesignPatch, same "route is a thin transport wrapper,
 * never itself a trust decision" discipline as routes/patch.ts.
 */
export function registerDesignRoute(
  app: FastifyInstance,
  options: RegisterDesignRouteOptions,
): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.get(
    '/api/design/:resourceType/:resourceId',
    { schema: { params: designParamsSchema, response: { 200: getDesignResponseSchema } } },
    async (request): Promise<GetDesignBody> => {
      const { resourceType, resourceId } = request.params;
      const design = readDesignFile(
        options.rootDir,
        options.fs ?? nodeFileSystem,
        resourceType,
        resourceId,
      );
      return { design } as GetDesignBody;
    },
  );

  typedApp.put(
    '/api/design/:resourceType/:resourceId',
    {
      schema: {
        params: designParamsSchema,
        body: putDesignRequestSchema,
        response: { 200: putDesignResponseSchema },
      },
    },
    async (request): Promise<PutDesignBody> => {
      const { resourceType, resourceId } = request.params;
      const { design: draft, provenance } = request.body;
      if (draft.binding.resourceType !== resourceType || draft.binding.resourceId !== resourceId) {
        return {
          success: false,
          diagnostics: [
            {
              code: 'AGF8005',
              severity: 'error' as const,
              message:
                'Request URL and request body binding disagree on which resource this design targets.',
            },
          ],
        };
      }
      const result = applyDesignPatch({
        rootDir: options.rootDir,
        draft,
        fs: options.fs,
        fileWriter: options.fileWriter,
        provenance,
      });
      return result as PutDesignBody;
    },
  );
}
