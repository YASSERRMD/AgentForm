// Synthetic project generator for the benchmark suite. Produces a
// schema-valid AgenticApplication document scaled to a requested agent
// count — one shared model, one tool + one workflow node per agent, chained
// into a single linear workflow (staying well under the 200-node/500-edge
// structural caps in packages/ir/src/semantic/limits.ts even at the
// "large" tier). Real projects vary in shape far more than this, but
// agent/tool count is the dimension that actually drives pipeline cost
// (schema validation, graph checks, policy scans, code generation all
// scale with resource count), so it's what these fixtures vary.

export function buildSyntheticProject(agentCount) {
  const tools = {};
  const agents = {};
  const nodes = {};
  const edges = [];

  for (let i = 0; i < agentCount; i += 1) {
    const agentId = `agent${i}`;
    const toolId = `tool${i}`;

    tools[toolId] = {
      type: 'function',
      handler: `handlers.${toolId}`,
      sideEffect: 'read',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    };

    agents[agentId] = {
      model: 'primary',
      role: 'assistant',
      description: `Synthetic benchmark agent ${i}.`,
      instructions: {
        text: `You are synthetic benchmark agent ${i}. Use tool${i} then hand off to the next agent.`,
      },
      tools: [toolId],
      limits: { maxSteps: 4, timeout: '15s', maxCostUsd: 0.05 },
    };

    nodes[agentId] = { type: 'agent', agent: agentId };
    if (i > 0) {
      edges.push({ from: `agent${i - 1}`, to: agentId });
    }
  }

  return {
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: {
      name: `benchmark-${agentCount}`,
      version: '1.0.0',
      description: `Synthetic benchmark project with ${agentCount} agents.`,
    },
    spec: {
      runtime: { target: 'openai', environment: 'development' },
      models: {
        primary: { provider: 'openai', model: 'gpt-5', temperature: 0 },
      },
      tools,
      agents,
      workflows: {
        main: { entrypoint: 'agent0', nodes, edges },
      },
      observability: {
        tracing: { provider: 'opentelemetry' },
        recordPrompts: false,
        recordToolCalls: true,
      },
    },
  };
}

export const BENCHMARK_SIZES = [
  { name: 'small', agentCount: 5 },
  { name: 'medium', agentCount: 25 },
  { name: 'large', agentCount: 100 },
];
