import { compile } from '@agentform/compiler';
import { describe, expect, it } from 'vitest';
import { langGraphAdapter } from './adapter.js';
import { baseIR, graphWorkflowIR, unsupportedNodeIR } from './test-fixtures.js';
import { isSyntacticallyValidPython } from './test-syntax-check.js';

const CONTEXT = { outputDir: './generated/langgraph', agentformVersion: '0.1.0' };

describe('langGraphAdapter.validateCompatibility', () => {
  it('reports the full-graph fixture as fully compatible', async () => {
    const report = await langGraphAdapter.validateCompatibility(graphWorkflowIR(), { outputDir: '.' });
    expect(report.hasBlockingIncompatibility).toBe(false);
    expect(report.target).toBe('langgraph');
  });

  it('flags an unsupported workflow node type as blocking', async () => {
    const report = await langGraphAdapter.validateCompatibility(unsupportedNodeIR(), { outputDir: '.' });
    expect(report.hasBlockingIncompatibility).toBe(true);
  });
});

describe('langGraphAdapter.generate', () => {
  it('generates a project with every expected file present', async () => {
    const project = await langGraphAdapter.generate(graphWorkflowIR(), CONTEXT);
    const paths = project.files.map((f) => f.path);
    expect(paths).toContain('src/__init__.py');
    expect(paths).toContain('src/agents/__init__.py');
    expect(paths).toContain('src/tools/__init__.py');
    expect(paths).toContain('src/workflows/__init__.py');
    expect(paths).toContain('src/state.py');
    expect(paths).toContain('src/agents/triage.py');
    expect(paths).toContain('src/agents/researcher.py');
    expect(paths).toContain('src/tools/search_registry.py');
    expect(paths).toContain('src/workflows/main.py');
    expect(paths).toContain('src/main.py');
    expect(paths).toContain('pyproject.toml');
    expect(paths).toContain('.env.example');
    expect(paths).toContain('README.md');
  });

  it('every generated .py file is syntactically valid Python', async () => {
    const project = await langGraphAdapter.generate(graphWorkflowIR(), CONTEXT);
    for (const file of project.files.filter((f) => f.path.endsWith('.py'))) {
      expect(isSyntacticallyValidPython(file.content), file.path).toBe(true);
    }
  });

  it('sets the manifest correctly, including generatedAt: null', async () => {
    const project = await langGraphAdapter.generate(baseIR(), CONTEXT);
    expect(project.manifest.adapter).toBe('@agentform/adapter-langgraph');
    expect(project.manifest.generatedAt).toBeNull();
    expect(project.manifest.irHash).toMatch(/^sha256:/);
  });

  it('deterministic generation: two generate() calls for the same IR produce byte-identical files', async () => {
    const first = await langGraphAdapter.generate(graphWorkflowIR(), CONTEXT);
    const second = await langGraphAdapter.generate(graphWorkflowIR(), CONTEXT);
    expect(first.files).toEqual(second.files);
  });

  it('a prompt-only change alters only that agent\'s file, not unrelated files', async () => {
    const before = await langGraphAdapter.generate(graphWorkflowIR(), CONTEXT);

    const ir = graphWorkflowIR();
    const triage = ir.agents.get('triage');
    if (!triage) throw new Error('missing fixture agent');
    const mutatedAgents = new Map(ir.agents);
    mutatedAgents.set('triage', { ...triage, instructions: { text: 'Completely different instructions.' } });
    const mutatedIr = { ...ir, agents: mutatedAgents };
    const after = await langGraphAdapter.generate(mutatedIr, CONTEXT);

    const beforeByPath = new Map(before.files.map((f) => [f.path, f.content]));
    const afterByPath = new Map(after.files.map((f) => [f.path, f.content]));

    const changedPaths = [...beforeByPath.keys()].filter((path) => beforeByPath.get(path) !== afterByPath.get(path));
    expect(changedPaths).toEqual(['src/agents/triage.py']);
  });
});

describe('compile() end-to-end with the real LangGraph adapter', () => {
  it('produces a project via the compiler orchestration', async () => {
    const result = await compile(graphWorkflowIR(), langGraphAdapter, CONTEXT);
    expect(result.project).toBeDefined();
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('blocks generation for the unsupported-node fixture', async () => {
    const result = await compile(unsupportedNodeIR(), langGraphAdapter, CONTEXT);
    expect(result.project).toBeUndefined();
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });
});
