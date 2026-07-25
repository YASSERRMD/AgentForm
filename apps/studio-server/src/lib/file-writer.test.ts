import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createInMemoryFileWriter, nodeFileWriter } from './file-writer.js';

let dir: string | undefined;

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});

describe('nodeFileWriter', () => {
  // Regression test for a real bug found only via live browser verification
  // (Phase 16): writeFileSync alone does not create missing parent
  // directories, and every other test for this write path used
  // createInMemoryFileWriter, which has no concept of "directory" at all —
  // only a real filesystem write against a project with no pre-existing
  // design/ directory surfaced this.
  it('creates a missing parent directory before writing', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentform-studio-server-filewriter-'));
    const target = path.join(dir, 'design', 'agents.assistant.afdesign.json');

    expect(existsSync(path.dirname(target))).toBe(false);
    nodeFileWriter.writeFile(target, '{"hello":"world"}');

    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, 'utf-8')).toBe('{"hello":"world"}');
  });

  it('writes normally when the parent directory already exists', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentform-studio-server-filewriter-'));
    const target = path.join(dir, 'agentform.yaml');

    nodeFileWriter.writeFile(target, 'apiVersion: agentform.dev/v1alpha1\n');

    expect(readFileSync(target, 'utf-8')).toBe('apiVersion: agentform.dev/v1alpha1\n');
  });
});

describe('createInMemoryFileWriter', () => {
  it('captures writes without touching real disk', () => {
    const writer = createInMemoryFileWriter();
    writer.writeFile('/project/design/agents.assistant.afdesign.json', '{}');
    expect(writer.written.get('/project/design/agents.assistant.afdesign.json')).toBe('{}');
  });
});
