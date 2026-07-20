import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIR } from '@agentform/ir';
import { createInMemoryFileSystem, loadProject } from '@agentform/parser';
import { findTemplate, TEMPLATES } from './index.js';

const rootDir = path.resolve('/project');

function buildFixtureFileSystem(files: Record<string, string>) {
  const absolute: Record<string, string> = {};
  for (const [relativePath, content] of Object.entries(files)) {
    absolute[path.join(rootDir, relativePath)] = content;
  }
  return createInMemoryFileSystem(absolute);
}

describe('TEMPLATES', () => {
  it('has exactly the five required starter templates', () => {
    expect(TEMPLATES.map((t) => t.id).sort()).toEqual(
      ['basic', 'government-complaint', 'human-approval', 'multi-agent', 'tool-agent'].sort(),
    );
  });

  it('every template has a distinct id', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(TEMPLATES.map((t) => [t.id, t] as const))(
    'template "%s" always generates an agentform.yaml and a README',
    (_id, template) => {
      const files = template.files({ name: 'fixture-app', target: 'openai' });
      expect(files['agentform.yaml']).toBeTruthy();
      expect(files['README.md']).toBeTruthy();
    },
  );

  it.each(TEMPLATES.filter((t) => !t.requiredEnvVars?.length).map((t) => [t.id, t] as const))(
    'template "%s" (no required env vars) passes real validation immediately after generation',
    (_id, template) => {
      const files = template.files({ name: 'fixture-app', target: 'openai' });
      const fs = buildFixtureFileSystem(files);
      const project = loadProject({ rootDir, fs });
      const result = buildIR(project.value, { sourceMap: project.sourceMap });

      expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(result.ir).toBeDefined();
    },
  );

  it.each(TEMPLATES.filter((t) => t.requiredEnvVars?.length).map((t) => [t.id, t] as const))(
    'template "%s" passes validation once its required env vars are set',
    (_id, template) => {
      const files = template.files({ name: 'fixture-app', target: 'openai' });
      const fs = buildFixtureFileSystem(files);
      const env = Object.fromEntries(
        (template.requiredEnvVars ?? []).map((name) => [name, 'https://example.test']),
      );
      const project = loadProject({ rootDir, fs, env });
      const result = buildIR(project.value, { sourceMap: project.sourceMap });

      expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(result.ir).toBeDefined();
    },
  );

  it.each(TEMPLATES.filter((t) => t.requiredEnvVars?.length).map((t) => [t.id, t] as const))(
    'template "%s" fails cleanly (not a crash) when its required env vars are unset',
    (_id, template) => {
      const files = template.files({ name: 'fixture-app', target: 'openai' });
      const fs = buildFixtureFileSystem(files);
      const project = loadProject({ rootDir, fs, env: {} });

      // Mirrors lib/pipeline.ts's loadAndBuildIR: a parser-stage error
      // (project.value is undefined) must be read from project.diagnostics
      // directly — calling buildIR(undefined) would instead report a
      // schema-validation error about the missing document, masking the
      // real AGF1009 this test is checking for.
      expect(project.value).toBeUndefined();
      expect(project.diagnostics.some((d) => d.code === 'AGF1009')).toBe(true);
    },
  );

  it('every template with required env vars documents them in .env.example and README', () => {
    for (const template of TEMPLATES.filter((t) => t.requiredEnvVars?.length)) {
      const files = template.files({ name: 'fixture-app', target: 'openai' });
      for (const name of template.requiredEnvVars ?? []) {
        expect(files['.env.example']).toContain(name);
        expect(files['README.md']).toContain(name);
      }
    }
  });

  it('findTemplate resolves a known id and returns undefined for an unknown one', () => {
    expect(findTemplate('basic')?.id).toBe('basic');
    expect(findTemplate('does-not-exist')).toBeUndefined();
  });

  it('parameterizes the runtime target from the given context', () => {
    const files = findTemplate('basic')!.files({ name: 'app', target: 'langgraph' });
    expect(files['agentform.yaml']).toContain('target: langgraph');
  });
});
