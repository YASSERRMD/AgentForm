import { generatedFileHeader, toIdentifier } from '@agentform/compiler';
import type { AgentformIR } from '@agentform/ir';

/** Every distinct guardrail name referenced by any agent, in a stable (sorted) order — deterministic generation doesn't depend on `Map`/`Set` iteration order matching some other pass. */
export function collectGuardrailNames(ir: AgentformIR): readonly string[] {
  const names = new Set<string>();
  for (const agent of ir.agents.values()) {
    for (const name of agent.guardrails ?? []) {
      names.add(name);
    }
  }
  return [...names].sort();
}

/**
 * One file, one `InputGuardrail`-shaped stub per distinct guardrail name
 * referenced anywhere in the application. Agentform's schema stores a
 * guardrail as a bare name reference (`agent.guardrails: string[]`), not
 * logic — there is nothing to generate beyond a scaffold a human fills
 * in. Everything becomes an *input* guardrail: the schema doesn't
 * distinguish input from output, and input is the more common case.
 *
 * A plain object literal typed as `InputGuardrail`, not a builder call —
 * verified against the real `@openai/agents` SDK: unlike
 * `defineOutputGuardrail`, `defineInputGuardrail` exists in the SDK's
 * source but isn't part of its public package export, so generated code
 * can't call it. The `InputGuardrail` *type* is exported and gives the
 * object literal's `execute` parameters their types via contextual
 * typing, so this needs no separate type annotations either.
 */
export function generateGuardrailsFile(ir: AgentformIR): string | undefined {
  const names = collectGuardrailNames(ir);
  if (names.length === 0) {
    return undefined;
  }

  const header = generatedFileHeader({ commentPrefix: '//' });
  const definitions = names.map((name) => {
    const varName = toIdentifier(name);
    return (
      `export const ${varName}: InputGuardrail = {\n` +
      `  name: ${JSON.stringify(name)},\n` +
      `  execute: async ({ input }) => {\n` +
      `    // TODO: implement the "${name}" guardrail.\n` +
      `    return { tripwireTriggered: false, outputInfo: null };\n` +
      `  },\n` +
      `};`
    );
  });

  return (
    `${header}\n` +
    `import type { InputGuardrail } from '@openai/agents';\n\n` +
    `${definitions.join('\n\n')}\n`
  );
}
