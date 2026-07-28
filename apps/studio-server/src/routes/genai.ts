import type { FileSystem } from '@agentform/parser';
import {
  promptToSpecRequestSchema,
  promptToSpecResponseSchema,
  type PromptToSpecResponse,
} from '@agentform/studio-core';
import {
  promptToDesignRequestSchema,
  promptToDesignResponseSchema,
  validateDesignArtifact,
  type DesignDraft,
  type PromptToDesignResponse,
} from '@agentform/studio-design';
import { stampDesignArtifact } from '@agentform/studio-design/server';
import { promptToDesign, promptToSpec, type GenAIProvider } from '@agentform/studio-genai';
import type { Diagnostic } from '@agentform/diagnostics';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { z } from 'zod';
import { STUDIO_DIAGNOSTIC_CODES } from '../lib/codes.js';
import { loadSpecDocument } from '../lib/load-spec-document.js';
import type { GenAIRateLimitConfig } from '../lib/rate-limit-config.js';
import { validateSpecPatch } from '../lib/validate-spec-patch.js';

export interface RegisterGenaiRouteOptions {
  readonly rootDir: string;
  readonly fs?: FileSystem;
  /** Omit to leave GenAI unconfigured — both routes still exist and respond, just always with `success: false`, rather than 404ing. The real process entrypoint always provides one (see config.ts / lib/genai-provider.ts); only tests that don't care about GenAI omit it. */
  readonly provider?: GenAIProvider;
  /** Omit to leave both routes unlimited — requires `@fastify/rate-limit` to already be registered on `app` (see app.ts), which only happens when this is set. */
  readonly rateLimit?: GenAIRateLimitConfig;
}

// readonly domain types vs. Zod's mutable-by-default inference — same
// documented, deliberate cast routes/patch.ts and routes/design.ts
// already use, not a real gap.
type PromptToSpecBody = z.infer<typeof promptToSpecResponseSchema>;
type PromptToDesignBody = z.infer<typeof promptToDesignResponseSchema>;

function notConfiguredDiagnostics(): Diagnostic[] {
  return [
    {
      code: STUDIO_DIAGNOSTIC_CODES.GENAI_GENERATION_FAILED.code,
      severity: 'error',
      message: 'GenAI is not configured for this server (no provider available).',
    },
  ];
}

function generationFailedDiagnostics(error: unknown): Diagnostic[] {
  const message = error instanceof Error ? error.message : String(error);
  return [
    {
      code: STUDIO_DIAGNOSTIC_CODES.GENAI_GENERATION_FAILED.code,
      severity: 'error',
      message: `GenAI generation failed: ${message}`,
    },
  ];
}

/**
 * The two GenAI preview endpoints (§34.3, Phase 17). Both are
 * preview-only: neither ever writes to disk. Each runs the same real
 * validation pipeline its non-GenAI counterpart write path uses
 * (`validateSpecPatch` / `validateDesignArtifact`) before reporting
 * `success`, so a proposal that previews as accepted is guaranteed to
 * still be accepted the moment the client re-submits it to the real
 * write endpoint (`POST /api/spec/patch` / `PUT /api/design/...`) —
 * this route never becomes a second, potentially-drifting source of
 * truth about validity.
 */
export function registerGenaiRoute(app: FastifyInstance, options: RegisterGenaiRouteOptions): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/api/genai/prompt-to-spec',
    {
      schema: { body: promptToSpecRequestSchema, response: { 200: promptToSpecResponseSchema } },
      ...(options.rateLimit ? { config: { rateLimit: options.rateLimit } } : {}),
    },
    async (request): Promise<PromptToSpecBody> => {
      if (!options.provider) {
        return { success: false, diagnostics: notConfiguredDiagnostics() } as PromptToSpecBody;
      }

      const specDocument = loadSpecDocument({ rootDir: options.rootDir, fs: options.fs });
      if (!specDocument.application) {
        const rejected: PromptToSpecResponse = {
          success: false,
          diagnostics: specDocument.diagnostics,
        };
        return rejected as PromptToSpecBody;
      }

      let result;
      try {
        result = await promptToSpec({
          prompt: request.body.prompt,
          currentApplication: specDocument.application,
          provider: options.provider,
        });
      } catch (error) {
        const failed: PromptToSpecResponse = {
          success: false,
          diagnostics: generationFailedDiagnostics(error),
        };
        return failed as PromptToSpecBody;
      }

      const validation = validateSpecPatch({
        rootDir: options.rootDir,
        patch: result.patch,
        fs: options.fs,
      });
      const response: PromptToSpecResponse = {
        success: validation.success,
        summary: result.summary,
        patch: result.patch,
        skipped: result.skipped,
        diagnostics: validation.diagnostics,
      };
      return response as PromptToSpecBody;
    },
  );

  typedApp.post(
    '/api/genai/prompt-to-design',
    {
      schema: {
        body: promptToDesignRequestSchema,
        response: { 200: promptToDesignResponseSchema },
      },
      ...(options.rateLimit ? { config: { rateLimit: options.rateLimit } } : {}),
    },
    async (request): Promise<PromptToDesignBody> => {
      if (!options.provider) {
        return { success: false, diagnostics: notConfiguredDiagnostics() } as PromptToDesignBody;
      }

      const specDocument = loadSpecDocument({ rootDir: options.rootDir, fs: options.fs });
      if (!specDocument.application) {
        const rejected: PromptToDesignResponse = {
          success: false,
          diagnostics: specDocument.diagnostics,
        };
        return rejected as PromptToDesignBody;
      }

      let result;
      try {
        result = await promptToDesign({
          prompt: request.body.prompt,
          agentId: request.body.agentId,
          currentApplication: specDocument.application,
          provider: options.provider,
        });
      } catch (error) {
        const failed: PromptToDesignResponse = {
          success: false,
          diagnostics: generationFailedDiagnostics(error),
        };
        return failed as PromptToDesignBody;
      }

      const draft: DesignDraft = {
        binding: { resourceType: 'agents', resourceId: request.body.agentId },
        layout: result.layout,
      };
      const stamped = stampDesignArtifact(draft, specDocument.application);
      const diagnostics = validateDesignArtifact(stamped, specDocument.application);
      const response: PromptToDesignResponse = {
        success: !diagnostics.some((d) => d.severity === 'error'),
        design: stamped,
        diagnostics,
      };
      return response as PromptToDesignBody;
    },
  );
}
