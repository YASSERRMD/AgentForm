import { describe, expect, it } from 'vitest';
import { generateWorkflowFile } from './generate-workflow.js';
import { baseIR, multiAgentIR } from './test-fixtures.js';
import { isSyntacticallyValidTypeScript } from './test-syntax-check.js';

describe('generateWorkflowFile', () => {
  it('produces syntactically valid TypeScript for a simple workflow', () => {
    const ir = baseIR();
    const workflow = ir.workflows.get('main');
    if (!workflow) throw new Error('missing fixture workflow');
    const source = generateWorkflowFile('main', workflow);
    expect(isSyntacticallyValidTypeScript(source)).toBe(true);
    expect(source).toContain("import { run } from '@openai/agents';");
    expect(source).toContain('export async function run_main(input: string)');
  });

  it('imports and runs the entrypoint agent', () => {
    const ir = multiAgentIR();
    const workflow = ir.workflows.get('main');
    if (!workflow) throw new Error('missing fixture workflow');
    const source = generateWorkflowFile('main', workflow);
    expect(source).toContain("from '../agents/intake.js'");
    expect(source).toContain('run(intake, input)');
  });

  it('never includes a timestamp', () => {
    const ir = baseIR();
    const workflow = ir.workflows.get('main');
    if (!workflow) throw new Error('missing fixture workflow');
    const source = generateWorkflowFile('main', workflow);
    expect(source).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
