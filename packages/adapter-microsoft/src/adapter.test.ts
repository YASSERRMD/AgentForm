import { compile } from '@agentform/compiler';
import { describe, expect, it } from 'vitest';
import { microsoftAdapter } from './adapter.js';
import { baseIR, multiAgentIR, unreachableHandoffIR, unsupportedNodeIR } from './test-fixtures.js';

const CONTEXT = { outputDir: './generated/microsoft', agentformVersion: '0.1.0' };

describe('microsoftAdapter.validateCompatibility', () => {
  it('reports the multi-agent fixture as fully compatible', async () => {
    const report = await microsoftAdapter.validateCompatibility(multiAgentIR(), { outputDir: '.' });
    expect(report.hasBlockingIncompatibility).toBe(false);
    expect(report.target).toBe('microsoft');
  });

  it('flags an unsupported workflow node type as blocking', async () => {
    const report = await microsoftAdapter.validateCompatibility(unsupportedNodeIR(), {
      outputDir: '.',
    });
    expect(report.hasBlockingIncompatibility).toBe(true);
  });

  it('flags an unreachable handoff source as blocking', async () => {
    const report = await microsoftAdapter.validateCompatibility(unreachableHandoffIR(), {
      outputDir: '.',
    });
    expect(report.hasBlockingIncompatibility).toBe(true);
  });
});

describe('microsoftAdapter.generate', () => {
  it('generates a project with every expected file present', async () => {
    const project = await microsoftAdapter.generate(multiAgentIR(), CONTEXT);
    const paths = project.files.map((f) => f.path);
    expect(paths).toContain('Agents/IntakeAgent.cs');
    expect(paths).toContain('Agents/ResearchSpecialistAgent.cs');
    expect(paths).toContain('Tools/SearchRegistryTool.cs');
    expect(paths).toContain('Models/PrimaryModel.cs');
    expect(paths).toContain('Workflows/MainWorkflow.cs');
    expect(paths).toContain('Program.cs');
    expect(paths).toContain('MultiAgentFixture.csproj');
    expect(paths).toContain('.env.example');
    expect(paths).toContain('README.md');
  });

  it('sets the manifest correctly, including generatedAt: null', async () => {
    const project = await microsoftAdapter.generate(baseIR(), CONTEXT);
    expect(project.manifest.adapter).toBe('@agentform/adapter-microsoft');
    expect(project.manifest.generatedAt).toBeNull();
    expect(project.manifest.irHash).toMatch(/^sha256:/);
  });

  it('deterministic generation: two generate() calls for the same IR produce byte-identical files', async () => {
    const first = await microsoftAdapter.generate(multiAgentIR(), CONTEXT);
    const second = await microsoftAdapter.generate(multiAgentIR(), CONTEXT);
    expect(first.files).toEqual(second.files);
  });

  it("a prompt-only change alters only that agent's file, not unrelated files", async () => {
    const before = await microsoftAdapter.generate(multiAgentIR(), CONTEXT);

    const ir = multiAgentIR();
    const intake = ir.agents.get('intake');
    if (!intake) throw new Error('missing fixture agent');
    const mutatedAgents = new Map(ir.agents);
    mutatedAgents.set('intake', {
      ...intake,
      instructions: { text: 'Completely different instructions.' },
    });
    const mutatedIr = { ...ir, agents: mutatedAgents };
    const after = await microsoftAdapter.generate(mutatedIr, CONTEXT);

    const beforeByPath = new Map(before.files.map((f) => [f.path, f.content]));
    const afterByPath = new Map(after.files.map((f) => [f.path, f.content]));

    const changedPaths = [...beforeByPath.keys()].filter(
      (path) => beforeByPath.get(path) !== afterByPath.get(path),
    );
    expect(changedPaths).toEqual(['Agents/IntakeAgent.cs']);
  });
});

describe('compile() end-to-end with the real Microsoft adapter', () => {
  it('produces a project via the compiler orchestration', async () => {
    const result = await compile(multiAgentIR(), microsoftAdapter, CONTEXT);
    expect(result.project).toBeDefined();
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('blocks generation for the unsupported-node fixture', async () => {
    const result = await compile(unsupportedNodeIR(), microsoftAdapter, CONTEXT);
    expect(result.project).toBeUndefined();
  });

  it('blocks generation for the unreachable-handoff-source fixture', async () => {
    const result = await compile(unreachableHandoffIR(), microsoftAdapter, CONTEXT);
    expect(result.project).toBeUndefined();
  });
});
