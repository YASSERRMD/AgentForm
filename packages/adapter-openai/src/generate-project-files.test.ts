import { describe, expect, it } from 'vitest';
import {
  generateEnvExample,
  generateIndexFile,
  generatePackageJson,
  generateReadme,
  generateTsconfig,
  generateWorkflowsIndexFile,
} from './generate-project-files.js';
import { baseIR } from './test-fixtures.js';

describe('generatePackageJson', () => {
  it('produces valid JSON with pinned (non-range) dependency versions', () => {
    const parsed = JSON.parse(generatePackageJson(baseIR())) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(parsed.dependencies['@openai/agents']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.dependencies.zod).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.devDependencies.typescript).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('names the package after the application', () => {
    const parsed = JSON.parse(generatePackageJson(baseIR())) as { name: string };
    expect(parsed.name).toBe('fixture-app-openai');
  });
});

describe('generateTsconfig', () => {
  it('produces valid JSON with strict mode enabled', () => {
    const parsed = JSON.parse(generateTsconfig()) as { compilerOptions: { strict: boolean } };
    expect(parsed.compilerOptions.strict).toBe(true);
  });
});

describe('generateEnvExample', () => {
  it('documents OPENAI_API_KEY without a value', () => {
    const content = generateEnvExample();
    expect(content).toContain('OPENAI_API_KEY=');
    expect(content).not.toMatch(/OPENAI_API_KEY=sk-/);
  });
});

describe('generateReadme', () => {
  it('includes run and test instructions', () => {
    const readme = generateReadme(baseIR());
    expect(readme).toContain('## Run');
    expect(readme).toContain('## Test');
  });

  it('mentions the application name', () => {
    expect(generateReadme(baseIR())).toContain('fixture-app');
  });
});

describe('generateWorkflowsIndexFile', () => {
  it('re-exports every workflow module', () => {
    const content = generateWorkflowsIndexFile(['main', 'secondary']);
    expect(content).toContain("export * from './main.js';");
    expect(content).toContain("export * from './secondary.js';");
  });
});

describe('generateIndexFile', () => {
  it('produces a no-op export when there are no workflows', () => {
    expect(generateIndexFile([])).toBe('export {};\n');
  });

  it('wires the first workflow function as the CLI entrypoint', () => {
    const content = generateIndexFile(['run_main']);
    expect(content).toContain('run_main');
  });
});
