import { describe, expect, it } from 'vitest';
import { classifyPatchImpact } from './patch-risk.js';
import type { AgenticApplication } from './types.js';

const BASE_APPLICATION: AgenticApplication = {
  apiVersion: 'agentform.dev/v1alpha1',
  kind: 'AgenticApplication',
  metadata: { name: 'patch-risk-fixture', version: '1.0.0' },
  spec: {
    runtime: { target: 'openai', environment: 'development' },
    models: { primary: { provider: 'openai', model: 'gpt-5' } },
    tools: {
      deleteRecord: { type: 'function', handler: 'records.ts#delete', sideEffect: 'destructive' },
    },
    agents: {
      assistant: { model: 'primary', role: 'assistant', instructions: { text: 'Be helpful.' } },
    },
    workflows: {
      main: {
        entrypoint: 'assistant',
        nodes: { assistant: { type: 'agent', agent: 'assistant' } },
      },
    },
  },
};

describe('classifyPatchImpact', () => {
  it('classifies a purely additive patch as low', () => {
    const patch = [
      { op: 'add' as const, path: ['spec', 'tools', 'lookup'], value: { type: 'function' } },
    ];
    expect(classifyPatchImpact(patch)).toBe('low');
  });

  it('classifies a patch containing a replace as medium', () => {
    const patch = [
      { op: 'replace' as const, path: ['spec', 'agents', 'assistant', 'role'], value: 'helper' },
    ];
    expect(classifyPatchImpact(patch)).toBe('medium');
  });

  it('classifies a patch containing a remove as high, even alongside adds/replaces', () => {
    const patch = [
      { op: 'add' as const, path: ['spec', 'tools', 'lookup'], value: { type: 'function' } },
      { op: 'replace' as const, path: ['spec', 'agents', 'assistant', 'role'], value: 'helper' },
      { op: 'remove' as const, path: ['spec', 'workflows', 'legacy'] },
    ];
    expect(classifyPatchImpact(patch)).toBe('high');
  });

  it('skips the destructive-tool check with no currentApplication, staying purely op-type-based', () => {
    const patch = [
      {
        op: 'add' as const,
        path: ['spec', 'workflows', 'main', 'nodes', 'deleteRecord'],
        value: { type: 'tool', tool: 'deleteRecord' },
      },
      {
        op: 'add' as const,
        path: ['spec', 'workflows', 'main', 'edges'],
        value: [{ from: 'assistant', to: 'deleteRecord' }],
      },
    ];
    expect(classifyPatchImpact(patch)).toBe('low');
  });

  it('escalates to high when the proposed spec would contain an ungated destructive tool call', () => {
    const patch = [
      {
        op: 'add' as const,
        path: ['spec', 'workflows', 'main', 'nodes', 'deleteRecord'],
        value: { type: 'tool', tool: 'deleteRecord' },
      },
      {
        op: 'add' as const,
        path: ['spec', 'workflows', 'main', 'edges'],
        value: [{ from: 'assistant', to: 'deleteRecord' }],
      },
    ];
    expect(classifyPatchImpact(patch, BASE_APPLICATION)).toBe('high');
  });

  it('does not escalate when the destructive tool call is gated by a human approval node', () => {
    const patch = [
      {
        op: 'add' as const,
        path: ['spec', 'workflows', 'main', 'nodes', 'approval'],
        value: { type: 'humanApproval' },
      },
      {
        op: 'add' as const,
        path: ['spec', 'workflows', 'main', 'nodes', 'deleteRecord'],
        value: { type: 'tool', tool: 'deleteRecord' },
      },
      {
        op: 'add' as const,
        path: ['spec', 'workflows', 'main', 'edges'],
        value: [
          { from: 'assistant', to: 'approval' },
          { from: 'approval', to: 'deleteRecord' },
        ],
      },
    ];
    expect(classifyPatchImpact(patch, BASE_APPLICATION)).toBe('low');
  });
});
