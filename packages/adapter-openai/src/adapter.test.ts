import { describe, expect, it } from 'vitest';
import { compile } from '@agentform/compiler';
import { openAiAdapter } from './adapter.js';
import { baseIR, multiAgentIR } from './test-fixtures.js';
import { isSyntacticallyValidTypeScript } from './test-syntax-check.js';

const CONTEXT = { outputDir: './generated/openai', agentformVersion: '0.1.0' };

describe('openAiAdapter.validateCompatibility', () => {
  it('reports the basic-scope fixture as fully compatible', async () => {
    const report = await openAiAdapter.validateCompatibility(baseIR(), { outputDir: '.' });
    expect(report.hasBlockingIncompatibility).toBe(false);
    expect(report.target).toBe('openai');
  });

  it('flags an unsupported workflow node type as blocking', async () => {
    const ir = baseIR();
    const workflow = ir.workflows.get('main');
    if (!workflow) throw new Error('missing fixture workflow');
    const mutatedNodes = new Map(workflow.nodes);
    mutatedNodes.set('gate', { type: 'humanApproval' });
    const mutatedWorkflows = new Map(ir.workflows);
    mutatedWorkflows.set('main', { ...workflow, nodes: mutatedNodes });
    const mutatedIr = { ...ir, workflows: mutatedWorkflows };

    const report = await openAiAdapter.validateCompatibility(mutatedIr, { outputDir: '.' });
    expect(report.hasBlockingIncompatibility).toBe(true);
    expect(report.entries.some((e) => e.level === 'unsupported' && e.feature.includes('humanApproval'))).toBe(
      true,
    );
  });
});

describe('openAiAdapter.generate', () => {
  it('generates a project with every expected file present', async () => {
    const project = await openAiAdapter.generate(multiAgentIR(), CONTEXT);
    const paths = project.files.map((f) => f.path);
    expect(paths).toContain('src/agents/intake.ts');
    expect(paths).toContain('src/agents/research_specialist.ts');
    expect(paths).toContain('src/tools/search_registry.ts');
    expect(paths).toContain('src/workflows/main.ts');
    expect(paths).toContain('src/workflows/index.ts');
    expect(paths).toContain('src/policies/guardrails.ts');
    expect(paths).toContain('src/observability/tracing.ts');
    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('package.json');
    expect(paths).toContain('tsconfig.json');
    expect(paths).toContain('.env.example');
    expect(paths).toContain('README.md');
  });

  it('every generated .ts file is syntactically valid TypeScript', async () => {
    const project = await openAiAdapter.generate(multiAgentIR(), CONTEXT);
    for (const file of project.files.filter((f) => f.path.endsWith('.ts'))) {
      expect(isSyntacticallyValidTypeScript(file.content), file.path).toBe(true);
    }
  });

  it('every generated .json file is valid JSON', async () => {
    const project = await openAiAdapter.generate(multiAgentIR(), CONTEXT);
    for (const file of project.files.filter((f) => f.path.endsWith('.json'))) {
      expect(() => JSON.parse(file.content), file.path).not.toThrow();
    }
  });

  it('sets the manifest correctly, including generatedAt: null', async () => {
    const project = await openAiAdapter.generate(baseIR(), CONTEXT);
    expect(project.manifest.adapter).toBe('@agentform/adapter-openai');
    expect(project.manifest.generatedAt).toBeNull();
    expect(project.manifest.irHash).toMatch(/^sha256:/);
  });

  it('deterministic generation: two generate() calls for the same IR produce byte-identical files', async () => {
    const first = await openAiAdapter.generate(multiAgentIR(), CONTEXT);
    const second = await openAiAdapter.generate(multiAgentIR(), CONTEXT);
    expect(first.files).toEqual(second.files);
  });

  it('a prompt-only change alters only that agent\'s file, not unrelated files', async () => {
    const before = await openAiAdapter.generate(multiAgentIR(), CONTEXT);

    const ir = multiAgentIR();
    const intake = ir.agents.get('intake');
    if (!intake) throw new Error('missing fixture agent');
    const mutatedAgents = new Map(ir.agents);
    mutatedAgents.set('intake', {
      ...intake,
      instructions: { text: 'Completely different instructions.' },
    });
    const mutatedIr = { ...ir, agents: mutatedAgents };
    const after = await openAiAdapter.generate(mutatedIr, CONTEXT);

    const beforeByPath = new Map(before.files.map((f) => [f.path, f.content]));
    const afterByPath = new Map(after.files.map((f) => [f.path, f.content]));

    const changedPaths = [...beforeByPath.keys()].filter(
      (path) => beforeByPath.get(path) !== afterByPath.get(path),
    );
    expect(changedPaths).toEqual(['src/agents/intake.ts']);
  });
});

describe('compile() end-to-end with the real OpenAI adapter', () => {
  it('produces a project via the compiler orchestration', async () => {
    const result = await compile(multiAgentIR(), openAiAdapter, CONTEXT);
    expect(result.project).toBeDefined();
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});
