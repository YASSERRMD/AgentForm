import { z } from 'zod';
import { agenticApplicationSchema, API_VERSION } from './application.js';

/**
 * Generates the standalone JSON Schema for the `v1alpha1` AgenticApplication
 * document. Deterministic by construction — `z.toJSONSchema` produces a
 * plain object from a fixed Zod schema graph with no timestamps or
 * non-deterministic ordering, and `JSON.stringify` on it is stable for a
 * fixed key-insertion order (which the Zod schema definitions above fix).
 */
export function generateJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(agenticApplicationSchema, {
    target: 'draft-7',
    io: 'input',
  });

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: `https://schema.agentform.dev/${API_VERSION}/agentic-application.schema.json`,
    title: 'AgenticApplication',
    ...schema,
  };
}
