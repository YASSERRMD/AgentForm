import { compile, isSyntacticallyValidPython } from '@agentform/compiler';
import { describe, expect, it } from 'vitest';
import { googleAdkAdapter } from './adapter.js';
import {
  baseIR,
  multiAgentIR,
  sharedDelegationTargetIR,
  unsupportedNodeIR,
} from './test-fixtures.js';

const CONTEXT = { outputDir: './generated/google-adk', agentformVersion: '0.1.0' };

describe('googleAdkAdapter.validateCompatibility', () => {
  it('reports the multi-agent fixture as fully compatible', async () => {
    const report = await googleAdkAdapter.validateCompatibility(multiAgentIR(), { outputDir: '.' });
    expect(report.hasBlockingIncompatibility).toBe(false);
    expect(report.target).toBe('google-adk');
  });

  it('flags an unsupported workflow node type as blocking', async () => {
    const report = await googleAdkAdapter.validateCompatibility(unsupportedNodeIR(), {
      outputDir: '.',
    });
    expect(report.hasBlockingIncompatibility).toBe(true);
  });
});

describe('googleAdkAdapter.generate', () => {
  it('generates a project with every expected file present', async () => {
    const project = await googleAdkAdapter.generate(multiAgentIR(), CONTEXT);
    const paths = project.files.map((f) => f.path);
    expect(paths).toContain('src/__init__.py');
    expect(paths).toContain('src/agents/__init__.py');
    expect(paths).toContain('src/tools/__init__.py');
    expect(paths).toContain('src/workflows/__init__.py');
    expect(paths).toContain('src/agents/intake.py');
    expect(paths).toContain('src/agents/research_specialist.py');
    expect(paths).toContain('src/tools/search_registry.py');
    expect(paths).toContain('src/workflows/main.py');
    expect(paths).toContain('src/main.py');
    expect(paths).toContain('pyproject.toml');
    expect(paths).toContain('.env.example');
    expect(paths).toContain('README.md');
  });

  it('every generated .py file is syntactically valid Python', async () => {
    const project = await googleAdkAdapter.generate(multiAgentIR(), CONTEXT);
    for (const file of project.files.filter((f) => f.path.endsWith('.py'))) {
      expect(isSyntacticallyValidPython(file.content), file.path).toBe(true);
    }
  }, 30000);

  it('sets the manifest correctly, including generatedAt: null', async () => {
    const project = await googleAdkAdapter.generate(baseIR(), CONTEXT);
    expect(project.manifest.adapter).toBe('@agentform/adapter-google-adk');
    expect(project.manifest.generatedAt).toBeNull();
    expect(project.manifest.irHash).toMatch(/^sha256:/);
  });

  it('deterministic generation: two generate() calls for the same IR produce byte-identical files', async () => {
    const first = await googleAdkAdapter.generate(multiAgentIR(), CONTEXT);
    const second = await googleAdkAdapter.generate(multiAgentIR(), CONTEXT);
    expect(first.files).toEqual(second.files);
  });

  it("a prompt-only change alters only that agent's file, not unrelated files", async () => {
    const before = await googleAdkAdapter.generate(multiAgentIR(), CONTEXT);

    const ir = multiAgentIR();
    const intake = ir.agents.get('intake');
    if (!intake) throw new Error('missing fixture agent');
    const mutatedAgents = new Map(ir.agents);
    mutatedAgents.set('intake', {
      ...intake,
      instructions: { text: 'Completely different instructions.' },
    });
    const mutatedIr = { ...ir, agents: mutatedAgents };
    const after = await googleAdkAdapter.generate(mutatedIr, CONTEXT);

    const beforeByPath = new Map(before.files.map((f) => [f.path, f.content]));
    const afterByPath = new Map(after.files.map((f) => [f.path, f.content]));

    const changedPaths = [...beforeByPath.keys()].filter(
      (path) => beforeByPath.get(path) !== afterByPath.get(path),
    );
    expect(changedPaths).toEqual(['src/agents/intake.py']);
  });
});

describe('compile() end-to-end with the real Google ADK adapter', () => {
  it('produces a project via the compiler orchestration', async () => {
    const result = await compile(multiAgentIR(), googleAdkAdapter, CONTEXT);
    expect(result.project).toBeDefined();
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('blocks generation for the unsupported-node fixture', async () => {
    const result = await compile(unsupportedNodeIR(), googleAdkAdapter, CONTEXT);
    expect(result.project).toBeUndefined();
  });

  it('blocks generation when two agents share a delegation target', async () => {
    const result = await compile(sharedDelegationTargetIR(), googleAdkAdapter, CONTEXT);
    expect(result.project).toBeUndefined();
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });
});
