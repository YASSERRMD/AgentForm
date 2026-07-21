import { autoGenAdapter } from '@agentform/adapter-autogen';
import { crewAiAdapter } from '@agentform/adapter-crewai';
import { googleAdkAdapter } from '@agentform/adapter-google-adk';
import { langGraphAdapter } from '@agentform/adapter-langgraph';
import { microsoftAdapter } from '@agentform/adapter-microsoft';
import { openAiAdapter } from '@agentform/adapter-openai';
import { compile } from '@agentform/compiler';
import { buildIR, type AgentformIR } from '@agentform/ir';
import type { FrameworkAdapter } from '@agentform/plugin-sdk';
import { describe, expect, it } from 'vitest';

const ADAPTERS: readonly (readonly [string, FrameworkAdapter])[] = [
  ['openai', openAiAdapter],
  ['langgraph', langGraphAdapter],
  ['microsoft', microsoftAdapter],
  ['google-adk', googleAdkAdapter],
  ['autogen', autoGenAdapter],
  ['crewai', crewAiAdapter],
];

/**
 * `agent`/`terminate` workflow nodes plus a `function` tool are the one
 * combination every one of the six adapters' `compatibility.ts` marks
 * `supported` (see `docs/compiler-reference.md`'s cross-adapter matrix) —
 * this is the portable baseline a real specification can target across
 * every Agentform framework without a single `--target`-specific
 * incompatibility diagnostic.
 */
function portableIR(target: string): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'portable-fixture', version: '1.0.0' },
    spec: {
      runtime: { target, environment: 'development' },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      tools: {
        lookup: {
          type: 'function',
          handler: 'lookup.ts#run',
          sideEffect: 'read',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
      },
      agents: {
        assistant: {
          model: 'primary',
          role: 'assistant',
          instructions: { text: 'You are a helpful assistant with access to a lookup tool.' },
          tools: ['lookup'],
        },
      },
      workflows: {
        main: {
          entrypoint: 'assistant',
          nodes: {
            assistant: { type: 'agent', agent: 'assistant' },
            done: { type: 'terminate' },
          },
          edges: [{ from: 'assistant', to: 'done' }],
        },
      },
    },
  });
  if (!result.ir) {
    throw new Error(
      `portableIR(${target}) fixture failed to build: ${JSON.stringify(result.diagnostics)}`,
    );
  }
  return result.ir;
}

describe('cross-target portability', () => {
  it.each(ADAPTERS)(
    'a spec using only agent/terminate nodes and a function tool compiles cleanly for %s',
    async (target, adapter) => {
      const ir = portableIR(target);
      const result = await compile(ir, adapter, {
        outputDir: `./generated/${target}`,
        agentformVersion: '0.1.0',
      });
      expect(result.project, `expected ${target} to compile the portable fixture`).toBeDefined();
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(result.project?.files.length ?? 0).toBeGreaterThan(0);
    },
  );

  it('the same IR content produces a real project for every target, not just a subset', async () => {
    const outcomes = await Promise.all(
      ADAPTERS.map(async ([target, adapter]) => {
        const result = await compile(portableIR(target), adapter, {
          outputDir: `./generated/${target}`,
          agentformVersion: '0.1.0',
        });
        return { target, hasProject: result.project !== undefined };
      }),
    );
    expect(outcomes.every((outcome) => outcome.hasProject)).toBe(true);
    expect(outcomes.map((outcome) => outcome.target)).toEqual([
      'openai',
      'langgraph',
      'microsoft',
      'google-adk',
      'autogen',
      'crewai',
    ]);
  });
});
