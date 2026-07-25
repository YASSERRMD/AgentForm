import type { AgenticApplication } from '@agentform/schema';
import { formLayoutSchema, type FormLayout } from '@agentform/studio-design';
import type { GenAIProvider } from './provider.js';

export interface PromptToDesignOptions {
  readonly prompt: string;
  readonly agentId: string;
  readonly currentApplication: AgenticApplication;
  readonly provider: GenAIProvider;
}

export interface PromptToDesignResult {
  readonly layout: FormLayout;
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
    `You are designing the visual layout of agent "${agentId}"'s input and output form fields. Arrange EXISTING fields only — you cannot invent a field that isn't listed below.`,
    '',
    `Available input fields: ${inputFields.length > 0 ? inputFields.join(', ') : '(none declared)'}`,
    `Available output fields: ${outputFields.length > 0 ? outputFields.join(', ') : '(none declared)'}`,
    '',
    'Hard rules:',
    '- Every `fieldPath` you use must be exactly one of the field names listed above, for the matching input/output section.',
    '- This is purely presentational: field order, grouping into named containers, and widget choice (text/textarea/number/select/checkbox/date). You cannot change what a field means or add validation.',
    '- Leave a section empty (omit it, or use an empty array) if there is nothing sensible to lay out for it.',
  ].join('\n');
}

/**
 * Scoped to form-layout generation only (agents' input/output field
 * arrangement), not workflow canvas positions — deliberately: dagre's
 * deterministic auto-layout already produces a good result for free,
 * and there's no real basis for an LLM to guess meaningful x/y
 * coordinates the way it can meaningfully group/order named fields.
 * See ADR-0020.
 *
 * Same pure-orchestration contract as `promptToSpec`: never touches
 * disk, never runs `validateDesignArtifact` itself — the caller runs the
 * result through the real validation pipeline before ever showing it as
 * accepted, which is also what catches a hallucinated `fieldPath` (the
 * existing `DANGLING_FIELD_PATH` check), not anything new here.
 */
export async function promptToDesign(
  options: PromptToDesignOptions,
): Promise<PromptToDesignResult> {
  const agent = options.currentApplication.spec.agents[options.agentId];
  const inputFields = extractFieldPaths(agent?.inputSchema);
  const outputFields = extractFieldPaths(agent?.outputSchema);

  const layout = await options.provider.generate({
    systemPrompt: buildSystemPrompt(options.agentId, inputFields, outputFields),
    userPrompt: options.prompt,
    schema: formLayoutSchema,
  });

  return { layout };
}
