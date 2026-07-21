import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixtureProject, runCli, type FixtureProject } from '../test-fixture-project.js';

function basicProject(target: string): string {
  return [
    'apiVersion: agentform.dev/v1alpha1',
    'kind: AgenticApplication',
    'metadata:',
    '  name: fixture-app',
    '  version: 1.0.0',
    'spec:',
    '  runtime:',
    `    target: ${target}`,
    '    environment: development',
    '  models:',
    '    primary:',
    '      provider: openai',
    '      model: gpt-5',
    '  agents:',
    '    assistant:',
    '      model: primary',
    '      role: assistant',
    '      instructions:',
    '        text: You are a helpful assistant.',
    '  workflows:',
    '    main:',
    '      entrypoint: assistant',
    '      nodes:',
    '        assistant:',
    '          type: agent',
    '          agent: assistant',
    '        done:',
    '          type: terminate',
    '      edges:',
    '        - from: assistant',
    '          to: done',
    '',
  ].join('\n');
}

/** A `humanApproval` node has no OpenAI adapter generator (`SUPPORTED_NODE_TYPES` in `@agentform/adapter-openai`'s `compatibility.ts`), but does have one in `@agentform/adapter-langgraph` — used to exercise the "unsupported target feature" exit code. */
function humanApprovalProject(target: string): string {
  return [
    'apiVersion: agentform.dev/v1alpha1',
    'kind: AgenticApplication',
    'metadata:',
    '  name: fixture-app',
    '  version: 1.0.0',
    'spec:',
    '  runtime:',
    `    target: ${target}`,
    '    environment: development',
    '  models:',
    '    primary:',
    '      provider: openai',
    '      model: gpt-5',
    '  agents:',
    '    assistant:',
    '      model: primary',
    '      role: assistant',
    '      instructions:',
    '        text: You are a helpful assistant.',
    '  workflows:',
    '    main:',
    '      entrypoint: assistant',
    '      nodes:',
    '        assistant:',
    '          type: agent',
    '          agent: assistant',
    '        approve:',
    '          type: humanApproval',
    '        done:',
    '          type: terminate',
    '      edges:',
    '        - from: assistant',
    '          to: approve',
    '        - from: approve',
    '          to: done',
    '',
  ].join('\n');
}

let project: FixtureProject | undefined;

afterEach(() => {
  project?.cleanup();
  project = undefined;
});

describe('agentform compile', () => {
  it("compiles to the project's declared runtime.target by default", () => {
    project = createFixtureProject({ 'agentform.yaml': basicProject('openai') });
    const outputDir = path.join(project.dir, 'generated');
    const result = runCli(['compile', '--output', outputDir], project.dir);
    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(outputDir, 'openai', 'src', 'index.ts'))).toBe(true);
  });

  it('compiles to an explicit --target, overriding the declared runtime.target', () => {
    project = createFixtureProject({ 'agentform.yaml': basicProject('openai') });
    const outputDir = path.join(project.dir, 'generated');
    const result = runCli(['compile', '--target', 'langgraph', '--output', outputDir], project.dir);
    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(outputDir, 'langgraph', 'src', 'state.py'))).toBe(true);
    expect(existsSync(path.join(outputDir, 'openai'))).toBe(false);
  });

  it.each([
    ['microsoft', ['Agents', 'AssistantAgent.cs']],
    ['google-adk', ['src', 'agents', 'assistant.py']],
    ['autogen', ['src', 'agents', 'assistant.py']],
    ['crewai', ['src', 'agents', 'assistant.py']],
  ] as const)('compiles to the Phase 9 --target %s', (target, expectedFile) => {
    project = createFixtureProject({ 'agentform.yaml': basicProject('openai') });
    const outputDir = path.join(project.dir, 'generated');
    const result = runCli(['compile', '--target', target, '--output', outputDir], project.dir);
    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(outputDir, target, ...expectedFile))).toBe(true);
  });

  it('writes a manifest.json alongside the generated project, with generatedAt: null', () => {
    project = createFixtureProject({ 'agentform.yaml': basicProject('openai') });
    const outputDir = path.join(project.dir, 'generated');
    const result = runCli(['compile', '--output', outputDir], project.dir);
    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(
      readFileSync(path.join(outputDir, 'openai', 'manifest.json'), 'utf-8'),
    ) as Record<string, unknown>;
    expect(manifest.generatedBy).toBe('agentform');
    expect(manifest.generatedAt).toBeNull();
    expect(manifest.adapter).toBe('@agentform/adapter-openai');
    expect(manifest.irHash).toMatch(/^sha256:/);
  });

  it('compiles for all six framework targets with --all', () => {
    project = createFixtureProject({ 'agentform.yaml': basicProject('openai') });
    const outputDir = path.join(project.dir, 'generated');
    const result = runCli(['compile', '--all', '--output', outputDir], project.dir);
    expect(result.exitCode).toBe(0);
    for (const target of ['openai', 'langgraph', 'microsoft', 'google-adk', 'autogen', 'crewai']) {
      expect(existsSync(path.join(outputDir, target, 'manifest.json'))).toBe(true);
    }
  });

  it('rejects using --target and --all together with INVALID_USAGE (2)', () => {
    project = createFixtureProject({ 'agentform.yaml': basicProject('openai') });
    const result = runCli(['compile', '--target', 'openai', '--all'], project.dir);
    expect(result.exitCode).toBe(2);
  });

  it('rejects an unrecognized --target with INVALID_USAGE (2)', () => {
    project = createFixtureProject({ 'agentform.yaml': basicProject('openai') });
    const result = runCli(['compile', '--target', 'not-a-real-framework'], project.dir);
    expect(result.exitCode).toBe(2);
  });

  it('fails with UNSUPPORTED_TARGET_FEATURE (13) when the project uses a node type the target cannot generate', () => {
    project = createFixtureProject({ 'agentform.yaml': humanApprovalProject('openai') });
    const outputDir = path.join(project.dir, 'generated');
    const result = runCli(['compile', '--output', outputDir], project.dir);
    expect(result.exitCode).toBe(13);
    expect(existsSync(path.join(outputDir, 'openai'))).toBe(false);
  });

  it('succeeds for the same humanApproval project against langgraph, which does support it', () => {
    project = createFixtureProject({ 'agentform.yaml': humanApprovalProject('langgraph') });
    const outputDir = path.join(project.dir, 'generated');
    const result = runCli(['compile', '--output', outputDir], project.dir);
    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(outputDir, 'langgraph', 'src', 'workflows', 'main.py'))).toBe(true);
  });

  it('--clean removes an existing output directory before writing', () => {
    project = createFixtureProject({ 'agentform.yaml': basicProject('openai') });
    const outputDir = path.join(project.dir, 'generated');
    const staleFile = path.join(outputDir, 'openai', 'stale.txt');
    mkdirSync(path.dirname(staleFile), { recursive: true });
    writeFileSync(staleFile, 'stale');

    const result = runCli(['compile', '--output', outputDir, '--clean'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(existsSync(staleFile)).toBe(false);
  });

  it('produces parseable JSON output with --json', () => {
    project = createFixtureProject({ 'agentform.yaml': basicProject('openai') });
    const outputDir = path.join(project.dir, 'generated');
    const result = runCli(['compile', '--output', outputDir, '--json'], project.dir);
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      success: boolean;
      targets: readonly { target: string; filesWritten: number }[];
    };
    expect(parsed.success).toBe(true);
    expect(parsed.targets[0]?.target).toBe('openai');
    expect(parsed.targets[0]?.filesWritten).toBeGreaterThan(0);
  });

  it('fails with the schema-validation exit code on an invalid project', () => {
    project = createFixtureProject({
      'agentform.yaml': 'apiVersion: agentform.dev/v1alpha1\nkind: AgenticApplication\n',
    });
    const result = runCli(['compile'], project.dir);
    expect(result.exitCode).toBe(4);
  });

  it('supports --help', () => {
    project = createFixtureProject({ 'agentform.yaml': basicProject('openai') });
    const result = runCli(['compile', '--help'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--target');
  });
});
