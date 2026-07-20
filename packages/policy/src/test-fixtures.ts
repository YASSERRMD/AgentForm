import { validateAgenticApplication, type AgenticApplication } from '@agentform/schema';

/**
 * A minimal, schema-valid `AgenticApplication` used as the base for every
 * policy test in this package. Building it through the real
 * `validateAgenticApplication` (rather than a hand-typed object literal
 * cast to the type) means a fixture that drifts out of sync with the
 * schema fails loudly in the test that uses it, instead of silently
 * asserting past a real shape mismatch. Mirrors `@agentform/ir`'s
 * `test-fixtures.ts`.
 */
export function baseApplication(): AgenticApplication {
  const result = validateAgenticApplication({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'fixture-app', version: '1.0.0' },
    spec: {
      runtime: { target: 'openai', environment: 'development' },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      agents: {
        assistant: {
          model: 'primary',
          role: 'assistant',
          instructions: { text: 'You are a helpful assistant.' },
        },
      },
      workflows: {
        main: {
          entrypoint: 'assistant',
          nodes: { assistant: { type: 'agent', agent: 'assistant' } },
        },
      },
    },
  });

  if (!result.success || !result.data) {
    throw new Error(
      `baseApplication() fixture is not schema-valid: ${JSON.stringify(result.diagnostics)}`,
    );
  }
  return result.data;
}

/** Deep-clones `baseApplication()` and applies `mutate` to the clone, so each test starts from an independent copy. */
export function withApplication(mutate: (app: AgenticApplication) => void): AgenticApplication {
  const app = structuredClone(baseApplication());
  mutate(app);
  return app;
}
