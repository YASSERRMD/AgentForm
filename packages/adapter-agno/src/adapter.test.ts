import { compile, isSyntacticallyValidPython } from '@agentform/compiler';
import { describe, expect, it } from 'vitest';
import { agnoAdapter } from './adapter.js';
import { baseIR, loopAndStubsIR, richWorkflowIR, unsupportedNodeIR } from './test-fixtures.js';

const CONTEXT = { outputDir: './generated/agno', agentformVersion: '0.1.0' };

describe('agnoAdapter.validateCompatibility', () => {
  it('reports the rich-workflow fixture as compatible', async () => {
    const report = await agnoAdapter.validateCompatibility(richWorkflowIR(), { outputDir: '.' });
    expect(report.hasBlockingIncompatibility).toBe(false);
    expect(report.target).toBe('agno');
  });

  it('flags an unsupported workflow node type as blocking', async () => {
    const report = await agnoAdapter.validateCompatibility(unsupportedNodeIR(), {
      outputDir: '.',
    });
    expect(report.hasBlockingIncompatibility).toBe(true);
  });
});

describe('agnoAdapter.generate', () => {
  it('generates a project with every expected file present', async () => {
    const project = await agnoAdapter.generate(richWorkflowIR(), CONTEXT);
    const paths = project.files.map((f) => f.path);
    expect(paths).toContain('src/__init__.py');
    expect(paths).toContain('src/agents/__init__.py');
    expect(paths).toContain('src/tools/__init__.py');
    expect(paths).toContain('src/workflows/__init__.py');
    expect(paths).toContain('src/agents/triage.py');
    expect(paths).toContain('src/tools/lookup.py');
    expect(paths).toContain('src/workflows/main.py');
    expect(paths).toContain('src/main.py');
    expect(paths).toContain('pyproject.toml');
    expect(paths).toContain('.env.example');
    expect(paths).toContain('README.md');
  });

  it('every generated .py file is syntactically valid Python, for every fixture', async () => {
    for (const ir of [baseIR(), richWorkflowIR(), loopAndStubsIR()]) {
      const project = await agnoAdapter.generate(ir, CONTEXT);
      for (const file of project.files.filter((f) => f.path.endsWith('.py'))) {
        expect(
          isSyntacticallyValidPython(file.content),
          `${ir.application.name}: ${file.path}`,
        ).toBe(true);
      }
    }
  }, 30000);

  it('marks a destructive tool and a humanApproval node as requiring confirmation', async () => {
    const project = await agnoAdapter.generate(richWorkflowIR(), CONTEXT);
    const refundTool = project.files.find((f) => f.path === 'src/tools/issueRefund.py');
    expect(refundTool?.content).toContain('requires_confirmation=True');
    const workflow = project.files.find((f) => f.path === 'src/workflows/main.py');
    expect(workflow?.content).toContain('requires_confirmation=True');
  });

  it('sets the manifest correctly, including generatedAt: null', async () => {
    const project = await agnoAdapter.generate(baseIR(), CONTEXT);
    expect(project.manifest.adapter).toBe('@agentform/adapter-agno');
    expect(project.manifest.generatedAt).toBeNull();
    expect(project.manifest.irHash).toMatch(/^sha256:/);
  });

  it('deterministic generation: two generate() calls for the same IR produce byte-identical files', async () => {
    const first = await agnoAdapter.generate(richWorkflowIR(), CONTEXT);
    const second = await agnoAdapter.generate(richWorkflowIR(), CONTEXT);
    expect(first.files).toEqual(second.files);
  });

  it("a prompt-only change alters only that agent's file, not unrelated files", async () => {
    const before = await agnoAdapter.generate(richWorkflowIR(), CONTEXT);

    const ir = richWorkflowIR();
    const triage = ir.agents.get('triage');
    if (!triage) throw new Error('missing fixture agent');
    const mutatedAgents = new Map(ir.agents);
    mutatedAgents.set('triage', {
      ...triage,
      instructions: { text: 'Completely different instructions.' },
    });
    const mutatedIr = { ...ir, agents: mutatedAgents };
    const after = await agnoAdapter.generate(mutatedIr, CONTEXT);

    const beforeByPath = new Map(before.files.map((f) => [f.path, f.content]));
    const afterByPath = new Map(after.files.map((f) => [f.path, f.content]));

    const changedPaths = [...beforeByPath.keys()].filter(
      (path) => beforeByPath.get(path) !== afterByPath.get(path),
    );
    expect(changedPaths).toEqual(['src/agents/triage.py']);
  });
});

describe('compile() end-to-end with the real Agno adapter', () => {
  it('produces a project via the compiler orchestration', async () => {
    const result = await compile(richWorkflowIR(), agnoAdapter, CONTEXT);
    expect(result.project).toBeDefined();
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('blocks generation for the unsupported-node fixture', async () => {
    const result = await compile(unsupportedNodeIR(), agnoAdapter, CONTEXT);
    expect(result.project).toBeUndefined();
  });
});
