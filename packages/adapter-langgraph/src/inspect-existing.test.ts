import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectLangGraphProject } from './inspect-existing.js';

function tempProject(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'agentform-langgraph-import-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(dir, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf-8');
  }
  return dir;
}

let dir: string | undefined;

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

const GRAPH_SOURCE = [
  'from langgraph.graph import StateGraph',
  'from .state import State',
  '',
  'workflow = StateGraph(State)',
  'workflow.add_node("triage", triage_node)',
  'workflow.add_node("specialist", specialist_node)',
  'workflow.add_edge("triage", "specialist")',
  'workflow.set_entry_point("triage")',
  'graph = workflow.compile()',
  '',
].join('\n');

describe('inspectLangGraphProject', () => {
  it('does not recognize a project with no LangGraph signal', async () => {
    dir = tempProject({ 'main.py': 'print("hello world")' });
    const result = await inspectLangGraphProject({ rootDir: dir });
    expect(result.recognized).toBe(false);
    expect(result.candidates).toEqual([]);
  });

  it('recognizes a StateGraph and recovers nodes, edges, and entrypoint', async () => {
    dir = tempProject({ 'src/graph.py': GRAPH_SOURCE });
    const result = await inspectLangGraphProject({ rootDir: dir });
    expect(result.recognized).toBe(true);

    const workflow = result.candidates.find((c) => c.kind === 'workflow');
    expect(workflow?.resourceAddress).toBe('workflow.graph');
    expect(workflow?.value).toMatchObject({
      entrypoint: 'triage',
      nodes: {
        triage: { type: 'agent', agent: 'triage' },
        specialist: { type: 'agent', agent: 'specialist' },
      },
      edges: [{ from: 'triage', to: 'specialist' }],
    });

    const agentAddresses = result.candidates
      .filter((c) => c.kind === 'agent')
      .map((c) => c.resourceAddress);
    expect(agentAddresses.sort()).toEqual(['agent.specialist', 'agent.triage']);
  });

  it('guesses the entrypoint from the first add_node call when set_entry_point is absent', async () => {
    dir = tempProject({
      'src/graph.py': [
        'from langgraph.graph import StateGraph',
        'workflow = StateGraph(State)',
        'workflow.add_node("start", start_node)',
        '',
      ].join('\n'),
    });
    const result = await inspectLangGraphProject({ rootDir: dir });
    const workflow = result.candidates.find((c) => c.kind === 'workflow');
    expect((workflow?.value as { entrypoint: string }).entrypoint).toBe('start');
    expect(result.unsupportedConstructs.some((note) => note.includes('set_entry_point'))).toBe(
      true,
    );
  });

  it('produces one workflow candidate per file containing a graph', async () => {
    dir = tempProject({
      'src/a.py': GRAPH_SOURCE,
      'src/b.py': GRAPH_SOURCE.replace(/triage/g, 'intake').replace(/specialist/g, 'resolver'),
    });
    const result = await inspectLangGraphProject({ rootDir: dir });
    expect(result.candidates.filter((c) => c.kind === 'workflow')).toHaveLength(2);
  });

  it('always reports unsupported constructs and manual actions when recognized', async () => {
    dir = tempProject({ 'src/graph.py': GRAPH_SOURCE });
    const result = await inspectLangGraphProject({ rootDir: dir });
    expect(result.unsupportedConstructs.length).toBeGreaterThan(0);
    expect(result.manualActions.length).toBeGreaterThan(0);
  });

  it('reports recognized but no candidates when the framework is present with no extractable graph', async () => {
    dir = tempProject({ 'src/empty.py': 'from langgraph.graph import StateGraph\n' });
    const result = await inspectLangGraphProject({ rootDir: dir });
    expect(result.recognized).toBe(true);
    expect(result.candidates).toEqual([]);
  });
});
