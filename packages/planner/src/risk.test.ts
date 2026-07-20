import { buildIR, type AgentformIR } from '@agentform/ir';
import { describe, expect, it } from 'vitest';
import { classifyRisk } from './risk.js';
import { baseIR } from './test-fixtures.js';
import type { PlanItem } from './types.js';

function riskInput(overrides: Partial<Pick<PlanItem, 'operation' | 'kind' | 'after'>>) {
  return { operation: 'CREATE' as const, kind: 'agent' as const, after: undefined, ...overrides };
}

describe('classifyRisk', () => {
  const ir = baseIR();

  it('NO_OP/READ/IMPORT are always LOW regardless of kind', () => {
    expect(classifyRisk(riskInput({ operation: 'NO_OP' }), ir)).toBe('LOW');
    expect(classifyRisk(riskInput({ operation: 'READ' }), ir)).toBe('LOW');
    expect(classifyRisk(riskInput({ operation: 'IMPORT' }), ir)).toBe('LOW');
  });

  it('CREATE of a non-tool resource is LOW by default', () => {
    expect(classifyRisk(riskInput({ operation: 'CREATE', kind: 'agent' }), ir)).toBe('LOW');
  });

  it('creating a read-only tool is MEDIUM ("new read-only tool: medium")', () => {
    const risk = classifyRisk(
      riskInput({
        operation: 'CREATE',
        kind: 'tool',
        after: { type: 'function', sideEffect: 'read' },
      }),
      ir,
    );
    expect(risk).toBe('MEDIUM');
  });

  it('creating a write-capable tool is HIGH ("new write-capable tool: high")', () => {
    const risk = classifyRisk(
      riskInput({
        operation: 'CREATE',
        kind: 'tool',
        after: { type: 'function', sideEffect: 'write' },
      }),
      ir,
    );
    expect(risk).toBe('HIGH');
  });

  it('creating a destructive tool is HIGH', () => {
    const risk = classifyRisk(
      riskInput({
        operation: 'CREATE',
        kind: 'tool',
        after: { type: 'function', sideEffect: 'destructive' },
      }),
      ir,
    );
    expect(risk).toBe('HIGH');
  });

  it('UPDATE of a non-model resource defaults to MEDIUM', () => {
    expect(classifyRisk(riskInput({ operation: 'UPDATE', kind: 'agent' }), ir)).toBe('MEDIUM');
  });

  it('UPDATE of a model escalates to HIGH', () => {
    expect(classifyRisk(riskInput({ operation: 'UPDATE', kind: 'model' }), ir)).toBe('HIGH');
  });

  it('REPLACE is always HIGH', () => {
    expect(classifyRisk(riskInput({ operation: 'REPLACE', kind: 'tool' }), ir)).toBe('HIGH');
  });

  it('DELETE of a non-workflow resource is HIGH', () => {
    expect(classifyRisk(riskInput({ operation: 'DELETE', kind: 'agent' }), ir)).toBe('HIGH');
  });

  it('DELETE of a workflow is CRITICAL', () => {
    expect(classifyRisk(riskInput({ operation: 'DELETE', kind: 'workflow' }), ir)).toBe('CRITICAL');
  });

  describe('ungated destructive tool call', () => {
    function buildWorkflowIR(gated: boolean): AgentformIR {
      const nodes: Record<string, unknown> = {
        assistant: { type: 'agent', agent: 'assistant' },
        wipe: { type: 'tool', tool: 'wipeDatabase' },
      };
      const edges = [{ from: 'assistant', to: 'wipe' }];
      if (gated) {
        nodes.approval = { type: 'humanApproval' };
        edges[0] = { from: 'assistant', to: 'approval' };
        edges.push({ from: 'approval', to: 'wipe' });
      }

      const result = buildIR({
        apiVersion: 'agentform.dev/v1alpha1',
        kind: 'AgenticApplication',
        metadata: { name: 'fixture-app', version: '1.0.0' },
        spec: {
          runtime: { target: 'openai', environment: 'development' },
          models: { primary: { provider: 'openai', model: 'gpt-5' } },
          tools: {
            wipeDatabase: {
              type: 'function',
              handler: 'db.ts#wipe',
              sideEffect: 'destructive',
              permissions: ['db:wipe'],
              idempotencyStrategy: 'no-op if already empty',
            },
          },
          agents: {
            assistant: {
              model: 'primary',
              role: 'assistant',
              instructions: { text: 'You are a helpful assistant.' },
              tools: ['wipeDatabase'],
            },
          },
          workflows: { main: { entrypoint: 'assistant', nodes, edges } },
        },
      });
      if (!result.ir) {
        throw new Error(`fixture failed to build: ${JSON.stringify(result.diagnostics)}`);
      }
      return result.ir;
    }

    it('flags CRITICAL when a destructive tool call has no human approval gate', () => {
      const workflowIr = buildWorkflowIR(false);
      const workflow = workflowIr.workflows.get('main');
      const risk = classifyRisk(
        riskInput({ operation: 'CREATE', kind: 'workflow', after: workflow }),
        workflowIr,
      );
      expect(risk).toBe('CRITICAL');
    });

    it('does not flag CRITICAL when the same destructive tool call is gated', () => {
      const workflowIr = buildWorkflowIR(true);
      const workflow = workflowIr.workflows.get('main');
      const risk = classifyRisk(
        riskInput({ operation: 'CREATE', kind: 'workflow', after: workflow }),
        workflowIr,
      );
      expect(risk).not.toBe('CRITICAL');
    });
  });
});
