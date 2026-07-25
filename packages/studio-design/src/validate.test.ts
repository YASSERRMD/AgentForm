import type { AgenticApplication } from '@agentform/schema';
import { describe, expect, it } from 'vitest';
import { validateDesignArtifact } from './validate.js';
import type { DesignArtifact } from './types.js';

const APPLICATION: AgenticApplication = {
  apiVersion: 'agentform.dev/v1alpha1',
  kind: 'AgenticApplication',
  metadata: { name: 'fixture', version: '1.0.0' },
  spec: {
    runtime: { target: 'openai', environment: 'test' },
    models: { primary: { provider: 'openai', model: 'gpt-4' } },
    agents: {
      assistant: {
        model: 'primary',
        role: 'assistant',
        instructions: { text: 'Help the user.' },
        inputSchema: { type: 'object', properties: { name: { type: 'string' }, age: {} } },
        outputSchema: { type: 'object', properties: { summary: {} } },
      },
    },
    workflows: {
      main: {
        entrypoint: 'respond',
        nodes: { respond: { type: 'agent', agent: 'assistant' } },
        edges: [],
      },
    },
  },
};

function agentDesign(overrides: Partial<DesignArtifact> = {}): DesignArtifact {
  return {
    binding: { resourceType: 'agents', resourceId: 'assistant' },
    designVersion: '1',
    specVersionTarget: 'sha256:test',
    contentHash: 'sha256:test',
    ...overrides,
  };
}

function workflowDesign(overrides: Partial<DesignArtifact> = {}): DesignArtifact {
  return {
    binding: { resourceType: 'workflows', resourceId: 'main' },
    designVersion: '1',
    specVersionTarget: 'sha256:test',
    contentHash: 'sha256:test',
    ...overrides,
  };
}

describe('validateDesignArtifact', () => {
  it('accepts a design with no dangling references', () => {
    const design = agentDesign({
      layout: { input: [{ id: 'f1', type: 'field', fieldPath: 'name' }] },
    });
    expect(validateDesignArtifact(design, APPLICATION)).toEqual([]);
  });

  it('rejects a binding to a resource id that does not exist', () => {
    const design = agentDesign({ binding: { resourceType: 'agents', resourceId: 'ghost' } });
    const diagnostics = validateDesignArtifact(design, APPLICATION);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('AGF8002');
  });

  it('rejects a binding to a workflow id that does not exist', () => {
    const design = workflowDesign({ binding: { resourceType: 'workflows', resourceId: 'ghost' } });
    const diagnostics = validateDesignArtifact(design, APPLICATION);
    expect(diagnostics[0]?.code).toBe('AGF8002');
  });

  it('rejects a form-layout field path not present in the agent inputSchema', () => {
    const design = agentDesign({
      layout: { input: [{ id: 'f1', type: 'field', fieldPath: 'does-not-exist' }] },
    });
    const diagnostics = validateDesignArtifact(design, APPLICATION);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('AGF8003');
  });

  it('rejects a form-layout field path not present in the agent outputSchema', () => {
    const design = agentDesign({
      layout: { output: [{ id: 'f1', type: 'field', fieldPath: 'does-not-exist' }] },
    });
    const diagnostics = validateDesignArtifact(design, APPLICATION);
    expect(diagnostics[0]?.code).toBe('AGF8003');
  });

  it('finds a dangling field path nested inside a container', () => {
    const design = agentDesign({
      layout: {
        input: [
          {
            id: 'group',
            type: 'container',
            children: [{ id: 'f1', type: 'field', fieldPath: 'nope' }],
          },
        ],
      },
    });
    const diagnostics = validateDesignArtifact(design, APPLICATION);
    expect(diagnostics[0]?.code).toBe('AGF8003');
  });

  it('skips field-path checking when inputSchema is not shaped like a JSON schema object', () => {
    const app: AgenticApplication = {
      ...APPLICATION,
      spec: {
        ...APPLICATION.spec,
        agents: {
          assistant: { ...APPLICATION.spec.agents.assistant!, inputSchema: { anything: 'goes' } },
        },
      },
    };
    const design = agentDesign({
      layout: { input: [{ id: 'f1', type: 'field', fieldPath: 'whatever' }] },
    });
    expect(validateDesignArtifact(design, app)).toEqual([]);
  });

  it('rejects a canvas position referencing a node id not in the workflow', () => {
    const design = workflowDesign({ positions: { ghost: { x: 0, y: 0 } } });
    const diagnostics = validateDesignArtifact(design, APPLICATION);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('AGF8004');
  });

  it('accepts a canvas position for a real node id', () => {
    const design = workflowDesign({ positions: { respond: { x: 10, y: 20 } } });
    expect(validateDesignArtifact(design, APPLICATION)).toEqual([]);
  });

  it('rejects an agents-bound design that carries workflow positions', () => {
    const design = agentDesign({ positions: { respond: { x: 0, y: 0 } } });
    const diagnostics = validateDesignArtifact(design, APPLICATION);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('AGF8005');
  });

  it('rejects a workflows-bound design that carries a form layout', () => {
    const design = workflowDesign({ layout: { input: [] } });
    const diagnostics = validateDesignArtifact(design, APPLICATION);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('AGF8005');
  });
});
