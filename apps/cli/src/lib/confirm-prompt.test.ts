import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { confirmAction, confirmCriticalChanges } from './confirm-prompt.js';

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

describe('confirmAction', () => {
  it('approves on exactly "yes"', async () => {
    const { input, output } = fakeStreams();
    const resultPromise = confirmAction('Proceed?', { input, output });
    setImmediate(() => sendLine(input, 'yes'));
    expect(await resultPromise).toBe(true);
  });

  it('is case-insensitive and trims surrounding whitespace', async () => {
    const { input, output } = fakeStreams();
    const resultPromise = confirmAction('Proceed?', { input, output });
    setImmediate(() => sendLine(input, '  YES  '));
    expect(await resultPromise).toBe(true);
  });

  it('declines on anything other than "yes", including an empty answer', async () => {
    const { input, output } = fakeStreams();
    const resultPromise = confirmAction('Proceed?', { input, output });
    setImmediate(() => sendLine(input, ''));
    expect(await resultPromise).toBe(false);
  });

  it('declines on "y" (no accidental partial-match approval)', async () => {
    const { input, output } = fakeStreams();
    const resultPromise = confirmAction('Proceed?', { input, output });
    setImmediate(() => sendLine(input, 'y'));
    expect(await resultPromise).toBe(false);
  });

  it('writes the given message before asking', async () => {
    const { input, output, written } = fakeStreams();
    const resultPromise = confirmAction('This will delete everything.', { input, output });
    setImmediate(() => sendLine(input, 'yes'));
    await resultPromise;
    expect(written.join('')).toContain('This will delete everything.');
  });
});

describe('confirmCriticalChanges', () => {
  it('approves on exactly "yes"', async () => {
    const { input, output } = fakeStreams();
    const resultPromise = confirmCriticalChanges(['workflow.main'], { input, output });
    setImmediate(() => sendLine(input, 'yes'));
    expect(await resultPromise).toBe(true);
  });

  it('declines on anything other than "yes", including an empty answer', async () => {
    const { input, output } = fakeStreams();
    const resultPromise = confirmCriticalChanges(['workflow.main'], { input, output });
    setImmediate(() => sendLine(input, ''));
    expect(await resultPromise).toBe(false);
  });

  it('lists every critical resource address before asking', async () => {
    const { input, output, written } = fakeStreams();
    const resultPromise = confirmCriticalChanges(['workflow.main', 'tool.wipeDb'], {
      input,
      output,
    });
    setImmediate(() => sendLine(input, 'yes'));
    await resultPromise;
    const rendered = written.join('');
    expect(rendered).toContain('workflow.main');
    expect(rendered).toContain('tool.wipeDb');
    expect(rendered).toContain('CRITICAL');
  });
});
