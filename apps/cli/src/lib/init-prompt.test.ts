import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { ProjectTemplate } from '../templates/index.js';
import { promptForMissing } from './init-prompt.js';

const templates: readonly ProjectTemplate[] = [
  { id: 'basic', title: 'Basic assistant', description: '', files: () => ({}) },
  { id: 'multi-agent', title: 'Multi-agent workflow', description: '', files: () => ({}) },
];

function fakeStreams() {
  const input = new PassThrough();
  const output = new PassThrough();
  const written: string[] = [];
  output.on('data', (chunk: Buffer) => written.push(chunk.toString('utf-8')));
  return { input, output, written };
}

function sendLine(input: PassThrough, line: string): void {
  input.write(`${line}\n`);
}

describe('promptForMissing', () => {
  it('prompts for both name and template when neither is given, and parses real answers', async () => {
    const { input, output, written } = fakeStreams();
    const resultPromise = promptForMissing(undefined, undefined, templates, { input, output });

    // The readline interface processes input asynchronously; queue answers
    // on the next tick so `question()` is already awaiting them.
    setImmediate(() => {
      sendLine(input, 'my-project');
      setImmediate(() => sendLine(input, '2'));
    });

    const result = await resultPromise;
    expect(result).toEqual({ name: 'my-project', templateId: 'multi-agent' });
    expect(written.join('')).toContain('Available templates:');
    expect(written.join('')).toContain('2. multi-agent — Multi-agent workflow');
  });

  it('does not prompt for a value that was already given', async () => {
    const { input, output, written } = fakeStreams();
    const resultPromise = promptForMissing('given-name', undefined, templates, { input, output });

    setImmediate(() => sendLine(input, '1'));

    const result = await resultPromise;
    expect(result).toEqual({ name: 'given-name', templateId: 'basic' });
    expect(written.join('')).not.toContain('Project name:');
  });

  it('does not prompt at all when both values are already given', async () => {
    const { input, output, written } = fakeStreams();
    const result = await promptForMissing('given-name', 'multi-agent', templates, {
      input,
      output,
    });
    expect(result).toEqual({ name: 'given-name', templateId: 'multi-agent' });
    expect(written.join('')).toBe('');
  });

  it('defaults to the first template when the answer is blank', async () => {
    const { input, output } = fakeStreams();
    const resultPromise = promptForMissing('given-name', undefined, templates, { input, output });

    setImmediate(() => sendLine(input, ''));

    const result = await resultPromise;
    expect(result.templateId).toBe('basic');
  });

  it('leaves the project name undefined when the answer is blank (caller applies its own fallback)', async () => {
    const { input, output } = fakeStreams();
    const resultPromise = promptForMissing(undefined, 'basic', templates, { input, output });

    setImmediate(() => sendLine(input, '   '));

    const result = await resultPromise;
    expect(result.name).toBeUndefined();
  });
});
