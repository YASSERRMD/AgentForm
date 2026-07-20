import { describe, expect, it } from 'vitest';
import type { IRWorkflow } from '@agentform/ir';
import { renderDot, renderGraphJson, renderMermaid } from './graph-render.js';

const workflow: IRWorkflow = {
  entrypoint: 'intake',
  nodes: new Map([
    ['intake', { type: 'agent', agent: 'intake' }],
    ['approval', { type: 'humanApproval' }],
    ['submit', { type: 'tool', tool: 'registry.create' }],
  ]) as IRWorkflow['nodes'],
  edges: [
    { from: 'intake', to: 'approval', when: 'output.confidence < 0.85' },
    { from: 'intake', to: 'submit', when: 'output.confidence >= 0.85' },
    { from: 'approval', to: 'submit' },
  ],
};

describe('renderMermaid', () => {
  it('produces a flowchart declaration', () => {
    expect(renderMermaid('main', workflow)).toContain('flowchart TD');
  });

  it('renders every node with its id and type', () => {
    const output = renderMermaid('main', workflow);
    expect(output).toContain('intake(["intake (agent)"])');
    expect(output).toContain('approval["approval (humanApproval)"]');
    expect(output).toContain('submit["submit (tool)"]');
  });

  it('gives the entrypoint a distinct stadium shape', () => {
    const output = renderMermaid('main', workflow);
    expect(output).toContain('intake(["intake (agent)"])');
    expect(output).not.toContain('approval(["approval (humanApproval)"])');
  });

  it('renders edges with their when-guard as a label', () => {
    const output = renderMermaid('main', workflow);
    expect(output).toContain('intake -->|"output.confidence < 0.85"| approval');
  });

  it('renders an unconditional edge with no label', () => {
    const output = renderMermaid('main', workflow);
    expect(output).toContain('approval --> submit');
  });

  it('escapes double quotes in labels', () => {
    const wf: IRWorkflow = {
      entrypoint: 'a',
      nodes: new Map([['a', { type: 'agent', agent: 'x' }]]) as IRWorkflow['nodes'],
      edges: [{ from: 'a', to: 'a', when: 'status == "approved"' }],
    };
    expect(renderMermaid('w', wf)).toContain('#quot;approved#quot;');
  });
});

describe('renderDot', () => {
  it('produces a digraph declaration named after the workflow', () => {
    expect(renderDot('main', workflow)).toContain('digraph "main" {');
  });

  it('renders every node as a labeled DOT statement', () => {
    const output = renderDot('main', workflow);
    expect(output).toContain('"intake" [label="intake (agent)", shape=doublecircle];');
    expect(output).toContain('"approval" [label="approval (humanApproval)"];');
  });

  it('renders edges with when-guards as edge labels', () => {
    const output = renderDot('main', workflow);
    expect(output).toContain('"intake" -> "approval" [label="output.confidence < 0.85"];');
  });

  it('renders an unconditional edge with no label attribute', () => {
    const output = renderDot('main', workflow);
    expect(output).toContain('"approval" -> "submit";');
  });

  it('escapes double quotes in DOT string literals', () => {
    const wf: IRWorkflow = {
      entrypoint: 'a',
      nodes: new Map([['a', { type: 'agent', agent: 'x' }]]) as IRWorkflow['nodes'],
      edges: [{ from: 'a', to: 'a', when: 'status == "approved"' }],
    };
    expect(renderDot('w', wf)).toContain('\\"approved\\"');
  });

  it('closes the digraph block', () => {
    expect(renderDot('main', workflow).trim().endsWith('}')).toBe(true);
  });
});

describe('renderGraphJson', () => {
  it('produces a plain, serializable graph structure', () => {
    const graph = renderGraphJson('main', workflow);
    expect(graph.workflow).toBe('main');
    expect(graph.entrypoint).toBe('intake');
    expect(graph.nodes).toEqual([
      { id: 'intake', type: 'agent', isEntrypoint: true },
      { id: 'approval', type: 'humanApproval', isEntrypoint: false },
      { id: 'submit', type: 'tool', isEntrypoint: false },
    ]);
    expect(graph.edges).toEqual([
      { from: 'intake', to: 'approval', when: 'output.confidence < 0.85' },
      { from: 'intake', to: 'submit', when: 'output.confidence >= 0.85' },
      { from: 'approval', to: 'submit' },
    ]);
  });

  it('omits the "when" key entirely for unconditional edges rather than setting it undefined', () => {
    const graph = renderGraphJson('main', workflow);
    const unconditional = graph.edges.find((e) => e.from === 'approval');
    expect(unconditional).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(unconditional, 'when')).toBe(false);
  });

  it('round-trips through JSON.stringify/parse unchanged', () => {
    const graph = renderGraphJson('main', workflow);
    expect(JSON.parse(JSON.stringify(graph))).toEqual(graph);
  });
});
