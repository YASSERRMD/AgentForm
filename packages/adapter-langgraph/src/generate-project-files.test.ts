import { describe, expect, it } from 'vitest';
import { generateEnvExample, generateMainFile, generatePyprojectToml, generateReadme } from './generate-project-files.js';
import { baseIR, graphWorkflowIR } from './test-fixtures.js';

describe('generatePyprojectToml', () => {
  it('names the project after the application and pins the exact langgraph version', () => {
    const toml = generatePyprojectToml(baseIR());
    expect(toml).toContain('name = "fixture-app"');
    expect(toml).toContain('version = "1.0.0"');
    expect(toml).toContain('"langgraph==0.6.11"');
    expect(toml).toContain('requires-python = ">=3.9"');
  });

  it('configures hatchling to package the src directory', () => {
    const toml = generatePyprojectToml(baseIR());
    expect(toml).toContain('[build-system]');
    expect(toml).toContain('build-backend = "hatchling.build"');
    expect(toml).toContain('packages = ["src"]');
  });
});

describe('generateEnvExample', () => {
  it('documents declared models instead of guessing a credential env var', () => {
    const env = generateEnvExample(baseIR());
    expect(env).toContain('# primary: provider=openai model=gpt-5');
  });

  it('never fabricates a fixed API key variable name', () => {
    const env = generateEnvExample(baseIR());
    expect(env).not.toMatch(/^[A-Z_]+=$/m);
  });
});

describe('generateReadme', () => {
  it('documents setup, run, and human-approval instructions', () => {
    const readme = generateReadme(graphWorkflowIR());
    expect(readme).toContain('# graph-fixture (LangGraph)');
    expect(readme).toContain('python -m src.main');
    expect(readme).toContain('interrupt()');
    expect(readme).toContain('Command(resume=');
  });
});

describe('generateMainFile', () => {
  it('wires the first declared workflow with a MemorySaver checkpointer', () => {
    const source = generateMainFile(['main']);
    expect(source).toContain('from .workflows.main import build_graph');
    expect(source).toContain('MemorySaver');
    expect(source).toContain('graph = build_graph().compile(checkpointer=MemorySaver())');
  });

  it('passes a thread_id config to invoke() — required once a checkpointer is attached', () => {
    const source = generateMainFile(['main']);
    expect(source).toContain('import uuid');
    expect(source).toContain('"thread_id": str(uuid.uuid4())');
    expect(source).toContain('graph.invoke({"messages": []}, config)');
  });

  it('sanitizes a hyphenated workflow id for the import path', () => {
    const source = generateMainFile(['my-workflow']);
    expect(source).toContain('from .workflows.my_workflow import build_graph');
  });

  it('falls back to a raising stub when there are no workflows', () => {
    const source = generateMainFile([]);
    expect(source).toContain('raise NotImplementedError(');
  });
});
