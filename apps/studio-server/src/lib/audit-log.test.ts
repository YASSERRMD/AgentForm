import { createInMemoryFileSystem, type FileSystem } from '@agentform/parser';
import { describe, expect, it } from 'vitest';
import { appendAuditEntry, describeSpecPatch, readAuditLog } from './audit-log.js';
import type { FileWriter } from './file-writer.js';

/** `appendAuditEntry` reads-then-rewrites the whole log file, so a real test needs the read and write sides to share state — the same reasoning apply-spec-patch.test.ts's own `createSharedInMemoryProject` double already documents. */
function createSharedInMemoryFiles(initial: Record<string, string> = {}): {
  readonly fs: FileSystem;
  readonly fileWriter: FileWriter;
} {
  const files = new Map(Object.entries(initial));
  const fs: FileSystem = {
    readFile: (absolutePath) => {
      const contents = files.get(absolutePath);
      if (contents === undefined) {
        throw new Error(`ENOENT: no such file: ${absolutePath}`);
      }
      return contents;
    },
    exists: (absolutePath) => files.has(absolutePath),
    listFiles: () => [],
  };
  const fileWriter: FileWriter = {
    writeFile: (absolutePath, content) => {
      files.set(absolutePath, content);
    },
  };
  return { fs, fileWriter };
}

describe('appendAuditEntry / readAuditLog', () => {
  it('reads back an appended entry, stamped with a timestamp', () => {
    const { fs, fileWriter } = createSharedInMemoryFiles();

    appendAuditEntry('/project', fs, fileWriter, {
      source: 'manual',
      summary: 'replace metadata.version',
      target: { kind: 'spec' },
    });

    const entries = readAuditLog('/project', fs);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      source: 'manual',
      summary: 'replace metadata.version',
      target: { kind: 'spec' },
    });
    expect(entries[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns an empty list when nothing has ever been written, not an error', () => {
    const fs = createInMemoryFileSystem({});
    expect(readAuditLog('/project', fs)).toEqual([]);
  });

  it('accumulates multiple entries and returns them newest first', () => {
    const { fs, fileWriter } = createSharedInMemoryFiles();

    appendAuditEntry('/project', fs, fileWriter, {
      source: 'manual',
      summary: 'first change',
      target: { kind: 'spec' },
    });
    appendAuditEntry('/project', fs, fileWriter, {
      source: 'genai',
      summary: 'second change',
      target: { kind: 'design', resourceType: 'agents', resourceId: 'assistant' },
    });

    const entries = readAuditLog('/project', fs);
    expect(entries.map((e) => e.summary)).toEqual(['second change', 'first change']);
  });

  it('respects a limit', () => {
    const { fs, fileWriter } = createSharedInMemoryFiles();
    for (let i = 0; i < 5; i += 1) {
      appendAuditEntry('/project', fs, fileWriter, {
        source: 'manual',
        summary: `change ${i}`,
        target: { kind: 'spec' },
      });
    }

    expect(readAuditLog('/project', fs, 2)).toHaveLength(2);
  });
});

describe('describeSpecPatch', () => {
  it('describes a single operation by op and path', () => {
    expect(
      describeSpecPatch([{ op: 'replace', path: ['spec', 'agents', 'assistant', 'role'] }]),
    ).toBe('replace spec.agents.assistant.role');
  });

  it('summarizes multiple operations by count', () => {
    expect(
      describeSpecPatch([
        { op: 'add', path: ['spec', 'tools', 'lookup'] },
        { op: 'remove', path: ['spec', 'workflows', 'old'] },
      ]),
    ).toBe('Applied 2 changes');
  });

  it('describes an empty patch as a no-op', () => {
    expect(describeSpecPatch([])).toBe('Applied an empty patch (no-op).');
  });
});
