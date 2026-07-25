import {
  agentSchema,
  identifierSchema,
  modelSchema,
  toolSchema,
  workflowSchema,
  type AgenticApplication,
} from '@agentform/schema';
import { z } from 'zod';
import type { SpecPatch, SpecPatchOperation } from '@agentform/studio-core';
import type { GenAIProvider } from './provider.js';

const RESOURCE_TYPES = ['models', 'tools', 'agents', 'workflows'] as const;
type SpecResourceType = (typeof RESOURCE_TYPES)[number];

/**
 * What the model must produce. Reuses the real per-resource Zod schemas
 * directly (not a hand-authored approximation) — handed straight to the
 * provider's own structured-output mechanism, so a generated resource is
 * schema-conformant the moment `provider.generate` resolves, before this
 * package's own orchestration logic ever runs.
 */
export const generatedSpecProposalSchema = z.object({
  summary: z.string().min(1),
  resources: z.object({
    models: z.record(identifierSchema, modelSchema).optional(),
    tools: z.record(identifierSchema, toolSchema).optional(),
    agents: z.record(identifierSchema, agentSchema).optional(),
    workflows: z.record(identifierSchema, workflowSchema).optional(),
  }),
});

export type GeneratedSpecProposal = z.infer<typeof generatedSpecProposalSchema>;

export interface PromptToSpecOptions {
  readonly prompt: string;
  readonly currentApplication: AgenticApplication;
  readonly provider: GenAIProvider;
}

export interface SkippedResource {
  readonly resourceType: SpecResourceType;
  readonly resourceId: string;
  readonly reason: string;
}

export interface PromptToSpecResult {
  readonly summary: string;
  readonly patch: SpecPatch;
  /** Resources the model proposed that collided with an existing id — excluded from `patch` rather than silently overwriting; see ADR-0020. */
  readonly skipped: readonly SkippedResource[];
}

function buildSystemPrompt(currentApplication: AgenticApplication): string {
  return [
    "You are extending an Agentform specification — a provider-neutral, declarative description of an agentic AI system. Generate NEW resources only (models, tools, agents, workflows) that satisfy the user's request.",
    '',
    'Hard rules:',
    '- Target the schema and IR only. Never reference a specific framework SDK, API, or vendor concept — Agentform specs are provider-neutral by design.',
    '- Every tool, model, and agent your new resources reference must either already exist in the current spec below, or be declared explicitly as part of your own output. Never reference something that exists nowhere.',
    '- Never write a literal secret, API key, password, or token anywhere. Use `${env.SOME_VAR}` interpolation for anything credential-shaped.',
    '- Only propose resources with NEW ids. Do not attempt to redefine or rename an id that already exists in the current spec.',
    '',
    'Current specification (for context — reference its existing resource ids freely, but do not repeat their definitions in your output):',
    JSON.stringify(currentApplication, null, 2),
  ].join('\n');
}

/**
 * Generates new spec resources from a natural-language prompt. Pure
 * orchestration: calls the provider, converts the validated proposal into
 * `add`-only patch operations, and returns — it never touches disk and
 * never runs schema/semantic/policy validation itself. The caller
 * (`apps/studio-server`) is responsible for running the result through
 * the same validation pipeline every other spec patch goes through before
 * ever showing it as accepted (§34's own pipeline diagram) — this
 * function's job ends at "here is a structurally well-formed proposal."
 */
export async function promptToSpec(options: PromptToSpecOptions): Promise<PromptToSpecResult> {
  const proposal = await options.provider.generate({
    systemPrompt: buildSystemPrompt(options.currentApplication),
    userPrompt: options.prompt,
    schema: generatedSpecProposalSchema,
  });

  const patch: SpecPatchOperation[] = [];
  const skipped: SkippedResource[] = [];

  for (const resourceType of RESOURCE_TYPES) {
    const declared = proposal.resources[resourceType];
    if (!declared) {
      continue;
    }
    const existing = options.currentApplication.spec[resourceType] as
      Record<string, unknown> | undefined;
    for (const [resourceId, value] of Object.entries(declared)) {
      if (existing && resourceId in existing) {
        skipped.push({
          resourceType,
          resourceId,
          reason: `"${resourceType}.${resourceId}" already exists in the current spec — not overwritten`,
        });
        continue;
      }
      patch.push({ op: 'add', path: ['spec', resourceType, resourceId], value });
    }
  }

  return { summary: proposal.summary, patch, skipped };
}
