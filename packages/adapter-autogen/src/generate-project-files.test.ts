import { isSyntacticallyValidPython } from '@agentform/compiler';
import { describe, expect, it } from 'vitest';
import {
  generateEnvExample,
  generateMainFile,
  generatePyprojectToml,
  generateReadme,
} from './generate-project-files.js';
import { baseIR, multiAgentIR } from './test-fixtures.js';

describe('generatePyprojectToml', () => {
  it('names the project after the application and pins exact autogen versions', () => {
    const toml = generatePyprojectToml(baseIR());
    expect(toml).toContain('name = "fixture-app"');
    expect(toml).toContain('"autogen-agentchat==0.7.5"');
    expect(toml).toContain('"autogen-ext[openai]==0.7.5"');
    expect(toml).toContain('requires-python = ">=3.10"');
  });

  it('configures hatchling to package the src directory', () => {
    const toml = generatePyprojectToml(baseIR());
    expect(toml).toContain('build-backend = "hatchling.build"');
    expect(toml).toContain('packages = ["src"]');
  });
});

describe('generateEnvExample', () => {
  it('documents declared models instead of guessing a credential env var', () => {
    const env = generateEnvExample(baseIR());
    expect(env).toContain('# primary: provider=openai model=gpt-5');
  });
});

describe('generateReadme', () => {
  it('documents setup, run, and human-approval instructions', () => {
    const readme = generateReadme(multiAgentIR());
    expect(readme).toContain('# multi-agent-fixture (AutoGen)');
    expect(readme).toContain('python -m src.main');
    expect(readme).toContain('UserProxyAgent');
  });
});

describe('generateMainFile', () => {
  it('calls run(task) directly for a single-agent workflow', () => {
    const source = generateMainFile([{ id: 'main', isSingleAgent: true }]);
    expect(source).toContain('from .workflows.main import run');
    expect(source).toContain('result = await run(task="Hello!")');
    expect(isSyntacticallyValidPython(source)).toBe(true);
  });

  it('builds and runs a team for a multi-participant workflow', () => {
    const source = generateMainFile([{ id: 'main', isSingleAgent: false }]);
    expect(source).toContain('from .workflows.main import build_team');
    expect(source).toContain('team = build_team()');
    expect(source).toContain('result = await team.run(task="Hello!")');
    expect(isSyntacticallyValidPython(source)).toBe(true);
  });

  it('sanitizes a hyphenated workflow id for the import path', () => {
    const source = generateMainFile([{ id: 'my-workflow', isSingleAgent: true }]);
    expect(source).toContain('from .workflows.my_workflow import run');
  });

  it('falls back to a raising stub when there are no workflows', () => {
    const source = generateMainFile([]);
    expect(source).toContain('raise NotImplementedError(');
  });
});
