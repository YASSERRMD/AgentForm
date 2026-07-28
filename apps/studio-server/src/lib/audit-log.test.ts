import { computeContentHash } from '@agentform/ir';
import { createInMemoryFileSystem, type FileSystem } from '@agentform/parser';
import { describe, expect, it } from 'vitest';
import { appendAuditEntry, describeSpecPatch, readAuditLog, verifyAuditLog } from './audit-log.js';
import type { FileWriter } from './file-writer.js';

const AUDIT_LOG_PATH = '/project/.agentform/studio-audit.jsonl';

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
  it('reads back an appended entry, stamped with a timestamp and hashed', () => {
    const { fs, fileWriter } = createSharedInMemoryFiles();

    appendAuditEntry('/project', fs, fileWriter, {
      source: 'manual',
      summary: 'replace metadata.version',
      target: { kind: 'spec' },
    });

    const { entries, verification } = readAuditLog('/project', fs);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      source: 'manual',
      summary: 'replace metadata.version',
      target: { kind: 'spec' },
      previousEntryHash: 'genesis',
    });
    expect(entries[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entries[0]?.entryHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(verification).toEqual({ valid: true, verifiedEntryCount: 1, totalEntryCount: 1 });
  });

  it('returns an empty list when nothing has ever been written, not an error', () => {
    const fs = createInMemoryFileSystem({});
    expect(readAuditLog('/project', fs)).toEqual({
      entries: [],
      verification: { valid: true, verifiedEntryCount: 0, totalEntryCount: 0 },
    });
  });

  it('accumulates multiple entries, returns them newest first, and chains each hash to the previous entry', () => {
    const { fs, fileWriter } = createSharedInMemoryFiles();

    const first = appendAuditEntry('/project', fs, fileWriter, {
      source: 'manual',
      summary: 'first change',
      target: { kind: 'spec' },
    });
    const second = appendAuditEntry('/project', fs, fileWriter, {
      source: 'genai',
      summary: 'second change',
      target: { kind: 'design', resourceType: 'agents', resourceId: 'assistant' },
    });

    const { entries, verification } = readAuditLog('/project', fs);
    expect(entries.map((e) => e.summary)).toEqual(['second change', 'first change']);
    expect(first.previousEntryHash).toBe('genesis');
    expect(second.previousEntryHash).toBe(first.entryHash);
    expect(verification).toEqual({ valid: true, verifiedEntryCount: 2, totalEntryCount: 2 });
  });

  it('respects a limit on entries, while verification still covers every entry ever written', () => {
    const { fs, fileWriter } = createSharedInMemoryFiles();
    for (let i = 0; i < 5; i += 1) {
      appendAuditEntry('/project', fs, fileWriter, {
        source: 'manual',
        summary: `change ${i}`,
        target: { kind: 'spec' },
      });
    }

    const { entries, verification } = readAuditLog('/project', fs, 2);
    expect(entries).toHaveLength(2);
    expect(verification).toEqual({ valid: true, verifiedEntryCount: 5, totalEntryCount: 5 });
  });

  it('normalizes a pre-hardening legacy entry (no hash fields on disk) instead of returning it as-is', () => {
    const legacyLine = JSON.stringify({
      timestamp: '2026-01-01T00:00:00.000Z',
      source: 'manual',
      summary: 'written before hashing existed',
      target: { kind: 'spec' },
    });
    const fs = createInMemoryFileSystem({
      '/project/.agentform/studio-audit.jsonl': `${legacyLine}\n`,
    });

    const { entries, verification } = readAuditLog('/project', fs);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      summary: 'written before hashing existed',
      previousEntryHash: 'legacy',
      entryHash: 'legacy',
    });
    expect(verification).toEqual({ valid: true, verifiedEntryCount: 1, totalEntryCount: 1 });
  });
});

describe('verifyAuditLog', () => {
  it('is valid on an empty log', () => {
    expect(verifyAuditLog('')).toEqual({ valid: true, verifiedEntryCount: 0, totalEntryCount: 0 });
  });

  it('is valid on a real, untampered multi-entry chain', () => {
    const { fs, fileWriter } = createSharedInMemoryFiles();
    appendAuditEntry('/project', fs, fileWriter, {
      source: 'manual',
      summary: 'first',
      target: { kind: 'spec' },
    });
    appendAuditEntry('/project', fs, fileWriter, {
      source: 'chat',
      summary: 'second',
      target: { kind: 'spec' },
    });
    appendAuditEntry('/project', fs, fileWriter, {
      source: 'genai',
      summary: 'third',
      target: { kind: 'spec' },
    });

    const serialized = fs.readFile(AUDIT_LOG_PATH);

    expect(verifyAuditLog(serialized)).toEqual({
      valid: true,
      verifiedEntryCount: 3,
      totalEntryCount: 3,
    });
  });

  it('reports invalid, with the correct verifiedEntryCount, when a middle entry is altered after its hash was computed', () => {
    const { fs, fileWriter } = createSharedInMemoryFiles();
    appendAuditEntry('/project', fs, fileWriter, {
      source: 'manual',
      summary: 'A',
      target: { kind: 'spec' },
    });
    appendAuditEntry('/project', fs, fileWriter, {
      source: 'manual',
      summary: 'B',
      target: { kind: 'spec' },
    });
    appendAuditEntry('/project', fs, fileWriter, {
      source: 'manual',
      summary: 'C',
      target: { kind: 'spec' },
    });
    const lines = fs
      .readFile(AUDIT_LOG_PATH)
      .split('\n')
      .filter((line) => line.trim().length > 0);
    const entryB = JSON.parse(lines[1] ?? '{}') as Record<string, unknown>;
    // Change B's content after its entryHash was already computed and
    // stored — entryHash no longer matches a fresh recompute.
    const tamperedB = JSON.stringify({ ...entryB, summary: 'B — tampered after the fact' });
    const tampered = [lines[0], tamperedB, lines[2]].join('\n') + '\n';

    const result = verifyAuditLog(tampered);

    expect(result.valid).toBe(false);
    expect(result.verifiedEntryCount).toBe(1);
    expect(result.totalEntryCount).toBe(3);
    expect(result.error).toMatch(/tampered/);
  });

  it('reports invalid when an entry is deleted from the middle, breaking the chain', () => {
    const { fs, fileWriter } = createSharedInMemoryFiles();
    appendAuditEntry('/project', fs, fileWriter, {
      source: 'manual',
      summary: 'first',
      target: { kind: 'spec' },
    });
    appendAuditEntry('/project', fs, fileWriter, {
      source: 'manual',
      summary: 'second',
      target: { kind: 'spec' },
    });
    appendAuditEntry('/project', fs, fileWriter, {
      source: 'manual',
      summary: 'third',
      target: { kind: 'spec' },
    });
    const lines = fs
      .readFile(AUDIT_LOG_PATH)
      .split('\n')
      .filter((line) => line.trim().length > 0);
    const withMiddleDeleted = [lines[0], lines[2]].join('\n') + '\n';

    const result = verifyAuditLog(withMiddleDeleted);

    expect(result.valid).toBe(false);
    expect(result.verifiedEntryCount).toBe(1);
    expect(result.error).toMatch(/does not chain/);
  });

  it('reports invalid when two entries are reordered', () => {
    const { fs, fileWriter } = createSharedInMemoryFiles();
    appendAuditEntry('/project', fs, fileWriter, {
      source: 'manual',
      summary: 'first',
      target: { kind: 'spec' },
    });
    appendAuditEntry('/project', fs, fileWriter, {
      source: 'manual',
      summary: 'second',
      target: { kind: 'spec' },
    });
    const lines = fs
      .readFile(AUDIT_LOG_PATH)
      .split('\n')
      .filter((line) => line.trim().length > 0);
    const reordered = [lines[1], lines[0]].join('\n') + '\n';

    const result = verifyAuditLog(reordered);

    expect(result.valid).toBe(false);
    expect(result.verifiedEntryCount).toBe(0);
  });

  it('treats a pre-hardening legacy entry (no hash fields) as unverifiable, not tampered, and resumes the chain after it', () => {
    const legacyEntry = {
      timestamp: 't0',
      source: 'manual',
      summary: 'written before hashing existed',
      target: { kind: 'spec' },
    };
    const hashedFields = {
      timestamp: 't1',
      source: 'manual',
      summary: 'first hashed entry',
      target: { kind: 'spec' },
      previousEntryHash: 'genesis',
    };
    const hashedEntry = { ...hashedFields, entryHash: computeContentHash(hashedFields) };
    const serialized = `${JSON.stringify(legacyEntry)}\n${JSON.stringify(hashedEntry)}\n`;

    const result = verifyAuditLog(serialized);

    expect(result).toEqual({ valid: true, verifiedEntryCount: 2, totalEntryCount: 2 });
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
