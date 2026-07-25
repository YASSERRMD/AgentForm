import type { AgenticApplication } from '@agentform/schema';
import { formLayoutSchema, type FormLayout } from '@agentform/studio-design';
import { z } from 'zod';
import type { GenAIHistoryMessage, GenAIProvider } from './provider.js';

export const chatDesignResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message'),
    message: z.string().min(1),
  }),
  z.object({
    type: z.literal('proposal'),
    message: z.string().min(1),
    layout: formLayoutSchema,
  }),
]);

export type ChatDesignResponse = z.infer<typeof chatDesignResponseSchema>;

export interface ChatDesignOptions {
  readonly message: string;
  readonly history?: readonly GenAIHistoryMessage[];
  readonly agentId: string;
  readonly currentApplication: AgenticApplication;
  readonly provider: GenAIProvider;
}

export interface ChatDesignResult {
  readonly message: string;
  /** Present only when the model proposed a layout this turn — absent for a plain conversational reply. A proposed layout always replaces the whole draft (same as `promptToDesign` and the editor's own Accept), never a partial patch — a layout tree has no natural smaller unit to diff against. */
  readonly layout?: FormLayout;
}

function extractFieldPaths(schemaValue: unknown): readonly string[] {
  if (
    schemaValue === null ||
    typeof schemaValue !== 'object' ||
    !('properties' in schemaValue) ||
    schemaValue.properties === null ||
    typeof schemaValue.properties !== 'object'
  ) {
    return [];
  }
  return Object.keys(schemaValue.properties);
}

function buildSystemPrompt(
  agentId: string,
  inputFields: readonly string[],
  outputFields: readonly string[],
): string {
  return [
    `You are a conversational assistant helping design agent "${agentId}"'s input/output form layout. Unlike a one-shot generator, you can both answer questions AND propose a layout, and the conversation may span several turns.`,
    '',
    "Respond with type 'message' when the user is asking a question, making conversation, or you need to ask a clarifying question first. Respond with type 'proposal' only when you have a concrete, ready-to-apply layout — it replaces the current draft entirely, so include every field that should still be placed, not only the ones being changed.",
    '',
    `Available input fields: ${inputFields.length > 0 ? inputFields.join(', ') : '(none declared)'}`,
    `Available output fields: ${outputFields.length > 0 ? outputFields.join(', ') : '(none declared)'}`,
    '',
    'Hard rules:',
    '- Every `fieldPath` you use in a proposal must be exactly one of the field names listed above, for the matching input/output section. You cannot invent a field that is not listed.',
    '- This is purely presentational: field order, grouping into named containers, and widget choice (text/textarea/number/select/checkbox/date). You cannot change what a field means or add validation.',
  ].join('\n');
}

/**
 * Same pure-orchestration contract as `promptToDesign`: never touches
 * disk, never runs `validateDesignArtifact` itself. Scoped to form
 * layout only, same reasoning as Phase 17 — never workflow canvas
 * positions.
 */
export async function chatEditDesign(options: ChatDesignOptions): Promise<ChatDesignResult> {
  const agent = options.currentApplication.spec.agents[options.agentId];
  const inputFields = extractFieldPaths(agent?.inputSchema);
  const outputFields = extractFieldPaths(agent?.outputSchema);

  const response = await options.provider.generate({
    systemPrompt: buildSystemPrompt(options.agentId, inputFields, outputFields),
    userPrompt: options.message,
    history: options.history,
    schema: chatDesignResponseSchema,
  });

  return response.type === 'proposal'
    ? { message: response.message, layout: response.layout }
    : { message: response.message };
}
