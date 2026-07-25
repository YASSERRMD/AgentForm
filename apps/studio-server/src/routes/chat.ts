import type { FileSystem } from '@agentform/parser';
import {
  chatSpecRequestSchema,
  chatSpecResponseSchema,
  type ChatSpecResponse,
} from '@agentform/studio-core';
import {
  chatDesignRequestSchema,
  chatDesignResponseSchema,
  validateDesignArtifact,
  type ChatDesignResponse,
  type DesignDraft,
} from '@agentform/studio-design';
import { stampDesignArtifact } from '@agentform/studio-design/server';
import { chatEditDesign, chatEditSpec, type GenAIProvider } from '@agentform/studio-genai';
import type { Diagnostic } from '@agentform/diagnostics';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { z } from 'zod';
import { STUDIO_DIAGNOSTIC_CODES } from '../lib/codes.js';
import { loadSpecDocument } from '../lib/load-spec-document.js';
import { validateSpecPatch } from '../lib/validate-spec-patch.js';

export interface RegisterChatRouteOptions {
  readonly rootDir: string;
  readonly fs?: FileSystem;
  /** Omit to leave chat unconfigured — both routes still exist and respond, just always with `success: false`, rather than 404ing. */
  readonly provider?: GenAIProvider;
}

// readonly domain types vs. Zod's mutable-by-default inference — same
// documented, deliberate cast routes/genai.ts already uses, not a real gap.
type ChatSpecBody = z.infer<typeof chatSpecResponseSchema>;
type ChatDesignBody = z.infer<typeof chatDesignResponseSchema>;

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
 * Edit-by-chat (§34.9-equivalent scope, Phase 18): multi-turn versions of
 * Phase 17's one-shot GenAI endpoints. A turn is either a plain
 * conversational reply (`patch`/`design` absent — nothing to validate,
 * `success` stays `true`) or a proposal (validated through the exact
 * same pipeline `routes/genai.ts` already uses — `validateSpecPatch` /
 * `validateDesignArtifact` — before `success` can ever be `true`). Both
 * routes are preview-only: accepting a proposal means re-submitting to
 * the real write endpoints, same as every other GenAI surface in Studio.
 */
export function registerChatRoute(app: FastifyInstance, options: RegisterChatRouteOptions): void {
  const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.post(
    '/api/genai/chat/spec',
    { schema: { body: chatSpecRequestSchema, response: { 200: chatSpecResponseSchema } } },
    async (request): Promise<ChatSpecBody> => {
      if (!options.provider) {
        return {
          success: false,
          message: '',
          diagnostics: notConfiguredDiagnostics(),
        } as ChatSpecBody;
      }

      const specDocument = loadSpecDocument({ rootDir: options.rootDir, fs: options.fs });
      if (!specDocument.application) {
        const rejected: ChatSpecResponse = {
          success: false,
          message: '',
          diagnostics: specDocument.diagnostics,
        };
        return rejected as ChatSpecBody;
      }

      let result;
      try {
        result = await chatEditSpec({
          message: request.body.message,
          history: request.body.history,
          currentApplication: specDocument.application,
          provider: options.provider,
        });
      } catch (error) {
        const failed: ChatSpecResponse = {
          success: false,
          message: '',
          diagnostics: generationFailedDiagnostics(error),
        };
        return failed as ChatSpecBody;
      }

      if (!result.patch) {
        const reply: ChatSpecResponse = { success: true, message: result.message, diagnostics: [] };
        return reply as ChatSpecBody;
      }

      const validation = validateSpecPatch({
        rootDir: options.rootDir,
        patch: result.patch,
        fs: options.fs,
      });
      const response: ChatSpecResponse = {
        success: validation.success,
        message: result.message,
        patch: result.patch,
        diagnostics: validation.diagnostics,
      };
      return response as ChatSpecBody;
    },
  );

  typedApp.post(
    '/api/genai/chat/design',
    { schema: { body: chatDesignRequestSchema, response: { 200: chatDesignResponseSchema } } },
    async (request): Promise<ChatDesignBody> => {
      if (!options.provider) {
        return {
          success: false,
          message: '',
          diagnostics: notConfiguredDiagnostics(),
        } as ChatDesignBody;
      }

      const specDocument = loadSpecDocument({ rootDir: options.rootDir, fs: options.fs });
      if (!specDocument.application) {
        const rejected: ChatDesignResponse = {
          success: false,
          message: '',
          diagnostics: specDocument.diagnostics,
        };
        return rejected as ChatDesignBody;
      }

      let result;
      try {
        result = await chatEditDesign({
          message: request.body.message,
          history: request.body.history,
          agentId: request.body.agentId,
          currentApplication: specDocument.application,
          provider: options.provider,
        });
      } catch (error) {
        const failed: ChatDesignResponse = {
          success: false,
          message: '',
          diagnostics: generationFailedDiagnostics(error),
        };
        return failed as ChatDesignBody;
      }

      if (!result.layout) {
        const reply: ChatDesignResponse = {
          success: true,
          message: result.message,
          diagnostics: [],
        };
        return reply as ChatDesignBody;
      }

      const draft: DesignDraft = {
        binding: { resourceType: 'agents', resourceId: request.body.agentId },
        layout: result.layout,
      };
      const stamped = stampDesignArtifact(draft, specDocument.application);
      const diagnostics = validateDesignArtifact(stamped, specDocument.application);
      const response: ChatDesignResponse = {
        success: !diagnostics.some((d) => d.severity === 'error'),
        message: result.message,
        design: stamped,
        diagnostics,
      };
      return response as ChatDesignBody;
    },
  );
}
