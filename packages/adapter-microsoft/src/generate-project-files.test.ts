import { describe, expect, it } from 'vitest';
import {
  generateCsproj,
  generateEnvExample,
  generateProgramFile,
  generateReadme,
} from './generate-project-files.js';
import { baseIR, multiAgentIR } from './test-fixtures.js';

describe('generateCsproj', () => {
  it('names the assembly after the application and pins the exact package versions', () => {
    const csproj = generateCsproj(baseIR());
    expect(csproj).toContain('<AssemblyName>FixtureApp</AssemblyName>');
    expect(csproj).toContain('<TargetFramework>net10.0</TargetFramework>');
    expect(csproj).toContain('<PackageReference Include="Microsoft.Agents.AI" Version="1.13.0" />');
    expect(csproj).toContain(
      '<PackageReference Include="Microsoft.Agents.AI.Workflows" Version="1.13.0" />',
    );
  });
});

describe('generateEnvExample', () => {
  it('names OPENAI_API_KEY and documents declared models', () => {
    const env = generateEnvExample(multiAgentIR());
    expect(env).toContain('OPENAI_API_KEY=');
    expect(env).toContain('# primary: provider=openai model=gpt-5');
  });
});

describe('generateReadme', () => {
  it('documents setup, run, delegation reachability, and human-approval scope', () => {
    const readme = generateReadme(multiAgentIR());
    expect(readme).toContain('# multi-agent-fixture (Microsoft Agent Framework)');
    expect(readme).toContain('dotnet run');
    expect(readme).toContain('InvalidOperationException');
    expect(readme).toContain('ApprovalRequiredAIFunction');
  });
});

describe('generateProgramFile', () => {
  it('a single-agent workflow calls agent.RunAsync directly', () => {
    const source = generateProgramFile([{ id: 'main', isSingleAgent: true }]);
    expect(source).toContain('using GeneratedApp.Workflows;');
    expect(source).toContain('AIAgent agent = MainWorkflow.Build();');
    expect(source).toContain('await agent.RunAsync("Hello!")');
  });

  it('a multi-agent workflow uses InProcessExecution.RunAsync and streams WorkflowEvents', () => {
    const source = generateProgramFile([{ id: 'main', isSingleAgent: false }]);
    expect(source).toContain('Workflow workflow = MainWorkflow.Build();');
    expect(source).toContain(
      'await using Run run = await InProcessExecution.RunAsync(workflow, "Hello!");',
    );
    expect(source).toContain('ExecutorCompletedEvent');
  });

  it('falls back to a raising stub when there are no workflows', () => {
    const source = generateProgramFile([]);
    expect(source).toContain('throw new NotImplementedException(');
  });
});
