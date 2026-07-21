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
  it('names the project after the application and pins the exact crewai version', () => {
    const toml = generatePyprojectToml(baseIR());
    expect(toml).toContain('name = "fixture-app"');
    expect(toml).toContain('"crewai==1.15.5"');
    expect(toml).toContain('requires-python = ">=3.10,<3.14"');
  });
});

describe('generateEnvExample', () => {
  it('names the two natively-verified provider credential env vars and documents declared models', () => {
    const env = generateEnvExample(multiAgentIR());
    expect(env).toContain('OPENAI_API_KEY=');
    expect(env).toContain('GOOGLE_API_KEY=');
    expect(env).toContain('GEMINI_API_KEY=');
    expect(env).toContain('# primary: provider=openai model=gpt-5');
  });
});

describe('generateReadme', () => {
  it('documents setup, run, delegation scope, and human-input scope', () => {
    const readme = generateReadme(multiAgentIR());
    expect(readme).toContain('# multi-agent-fixture (CrewAI)');
    expect(readme).toContain('python -m src.main');
    expect(readme).toContain('crew-wide');
    expect(readme).toContain('human_input=True');
  });
});

describe('generateMainFile', () => {
  it('wires a synchronous build_crew().kickoff() call', () => {
    const source = generateMainFile([{ id: 'main' }]);
    expect(source).toContain('from .workflows.main import build_crew');
    expect(source).toContain('crew = build_crew()');
    expect(source).toContain('result = crew.kickoff()');
    expect(source).not.toContain('async');
    expect(source).not.toContain('asyncio');
    expect(isSyntacticallyValidPython(source)).toBe(true);
  });

  it('sanitizes a hyphenated workflow id for the import path', () => {
    const source = generateMainFile([{ id: 'my-workflow' }]);
    expect(source).toContain('from .workflows.my_workflow import build_crew');
  });

  it('falls back to a raising stub when there are no workflows', () => {
    const source = generateMainFile([]);
    expect(source).toContain('raise NotImplementedError(');
  });
});
