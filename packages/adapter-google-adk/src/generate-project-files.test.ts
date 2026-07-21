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
  it('names the project after the application and pins the exact google-adk version', () => {
    const toml = generatePyprojectToml(baseIR());
    expect(toml).toContain('name = "fixture-app"');
    expect(toml).toContain('"google-adk==2.5.0"');
    expect(toml).toContain('requires-python = ">=3.10"');
  });
});

describe('generateEnvExample', () => {
  it('names GOOGLE_API_KEY for the Gemini path and documents declared models', () => {
    const env = generateEnvExample(multiAgentIR());
    expect(env).toContain('GOOGLE_API_KEY=');
    expect(env).toContain('# primary: provider=openai model=gpt-5');
  });
});

describe('generateReadme', () => {
  it('documents setup, run, delegation, and human-approval scope', () => {
    const readme = generateReadme(multiAgentIR());
    expect(readme).toContain('# multi-agent-fixture (Google Agent Development Kit)');
    expect(readme).toContain('python -m src.main');
    expect(readme).toContain('single-parent tree');
    expect(readme).toContain('require_confirmation=True');
  });
});

describe('generateMainFile', () => {
  it('wires a real Runner + InMemorySessionService around the root agent', () => {
    const source = generateMainFile([{ id: 'main' }]);
    expect(source).toContain('from .workflows.main import build_root_agent');
    expect(source).toContain('session_service = InMemorySessionService()');
    expect(source).toContain(
      'runner = Runner(app_name=APP_NAME, agent=build_root_agent(), session_service=session_service)',
    );
    expect(source).toContain('async for event in runner.run_async(');
    expect(isSyntacticallyValidPython(source)).toBe(true);
  });

  it('sanitizes a hyphenated workflow id for the import path', () => {
    const source = generateMainFile([{ id: 'my-workflow' }]);
    expect(source).toContain('from .workflows.my_workflow import build_root_agent');
  });

  it('falls back to a raising stub when there are no workflows', () => {
    const source = generateMainFile([]);
    expect(source).toContain('raise NotImplementedError(');
  });
});
