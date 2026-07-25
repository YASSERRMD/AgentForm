import type { AgenticApplication } from '@agentform/schema';
import { specPatchOperationSchema, type SpecPatch } from '@agentform/studio-core';
import { z } from 'zod';
import type { GenAIHistoryMessage, GenAIProvider } from './provider.js';

/**
 * Unlike `generatedSpecProposalSchema` (Phase 17's add-only, resource-
 * bucketed shape), chat output IS a real `SpecPatch` directly — the same
 * shape a hand-authored or UI-authored edit produces. This is what makes
 * "conversational edits ... diffs through the full pipeline" true in the
 * most literal sense: the model's output and a human's edit are
 * structurally the same kind of thing before either ever reaches
 * validation. `value` is intentionally schema-unconstrained here, same as
 * `specPatchOperationSchema` already is at the real `POST /api/spec/patch`
 * HTTP boundary — content correctness is entirely the validation
 * pipeline's job, never this request schema's.
 */
export const chatSpecResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message'),
    message: z.string().min(1),
  }),
  z.object({
    type: z.literal('proposal'),
    message: z.string().min(1),
    patch: z.array(specPatchOperationSchema),
  }),
]);

export type ChatSpecResponse = z.infer<typeof chatSpecResponseSchema>;

export interface ChatSpecOptions {
  readonly message: string;
  /** Prior turns of this conversation, oldest first — omit for the first turn. */
  readonly history?: readonly GenAIHistoryMessage[];
  readonly currentApplication: AgenticApplication;
  readonly provider: GenAIProvider;
}

export interface ChatSpecResult {
  readonly message: string;
  /** Present only when the model proposed a change this turn — absent for a plain conversational reply (a question, a clarification, an answer). */
  readonly patch?: SpecPatch;
}

function buildSystemPrompt(currentApplication: AgenticApplication): string {
  return [
    'You are a conversational assistant helping edit an Agentform specification — a provider-neutral, declarative description of an agentic AI system. Unlike a one-shot generator, you can both answer questions AND propose edits, and the conversation may span several turns.',
    '',
    "Respond with type 'message' when the user is asking a question, making conversation, or you need to ask a clarifying question before proposing anything. Respond with type 'proposal' only when you have a concrete, ready-to-apply change.",
    '',
    "A proposal's `patch` is a list of operations, each `{op, path, value}`:",
    "- `op` is 'add' (create something that does not exist yet), 'replace' (change something that does), or 'remove' (delete something that does).",
    "- `path` addresses a location in the spec as an array, e.g. `['spec','agents','assistant']` for the whole agent, or `['spec','agents','assistant','role']` for just its `role` field. Prefer the smallest path that satisfies the request — do not replace a whole resource to change one field.",
    '- `value` is omitted for `remove`, and is the new content for `add`/`replace`.',
    '',
    'Hard rules:',
    '- Target the schema and IR only. Never reference a specific framework SDK, API, or vendor concept — Agentform specs are provider-neutral by design.',
    '- Every tool, model, and agent a proposal references must either already exist in the current spec below, or be declared explicitly as part of the same proposal. Never reference something that exists nowhere.',
    '- Never write a literal secret, API key, password, or token anywhere. Use `${env.SOME_VAR}` interpolation for anything credential-shaped.',
    '- A `remove` must target something that actually exists in the current spec below — never propose removing something already absent.',
    '',
    'Current specification (for context — reference its real structure and existing resource ids, but only include what you are actually changing in `patch`):',
    JSON.stringify(currentApplication, null, 2),
  ].join('\n');
}

/**
 * Pure orchestration, same contract as `promptToSpec`/`promptToDesign`:
 * never validates or writes anything itself. The caller runs `patch`
 * through the same `validateSpecPatch` pipeline every other spec change
 * goes through before it can ever be shown as accepted — a chat proposal
 * earns no more trust than a hand-authored edit, regardless of how
 * confident its own `message` sounds.
 */
export async function chatEditSpec(options: ChatSpecOptions): Promise<ChatSpecResult> {
  const response = await options.provider.generate({
    systemPrompt: buildSystemPrompt(options.currentApplication),
    userPrompt: options.message,
    history: options.history,
    schema: chatSpecResponseSchema,
  });

  return response.type === 'proposal'
    ? { message: response.message, patch: response.patch }
    : { message: response.message };
}
