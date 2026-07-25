import { createInMemoryFileSystem } from '@agentform/parser';
import type { DesignArtifact } from '@agentform/studio-design';
import { describe, expect, it } from 'vitest';
import { createInMemoryFileWriter } from './file-writer.js';
import { readDesignFile, writeDesignFile } from './design-fs.js';

const DESIGN: DesignArtifact = {
  binding: { resourceType: 'agents', resourceId: 'assistant' },
  designVersion: '1',
  specVersionTarget: 'sha256:aaa',
  contentHash: 'sha256:bbb',
  layout: { input: [{ id: 'f1', type: 'field', widget: 'text' }] },
};

describe('readDesignFile', () => {
  it('returns null when no design file exists yet', () => {
    const fs = createInMemoryFileSystem({});
    expect(readDesignFile('/project', fs, 'agents', 'assistant')).toBeNull();
  });

  it('reads and parses an existing design file', () => {
    const fs = createInMemoryFileSystem({
      '/project/design/agents.assistant.afdesign.json': JSON.stringify(DESIGN),
    });
    expect(readDesignFile('/project', fs, 'agents', 'assistant')).toEqual(DESIGN);
  });

  it('rejects a resourceId that attempts to escape the project root', () => {
    // Enough "../" segments to walk past both the "design/agents...."
    // prefix this template produces and the project root itself — a
    // shallower traversal (e.g. one "../..") gets absorbed into the
    // "agents." prefix and stays within root, which is correct, safe
    // behavior, not a gap: verified empirically with a real path.resolve
    // call before picking this input, rather than assumed.
    const fs = createInMemoryFileSystem({});
    expect(() =>
      readDesignFile('/project', fs, 'agents', '../../../../../../../etc/passwd'),
    ).toThrow();
  });
});

describe('writeDesignFile', () => {
  it('writes to design/<resourceType>.<resourceId>.afdesign.json', () => {
    const fileWriter = createInMemoryFileWriter();
    writeDesignFile('/project', fileWriter, DESIGN);
    const written = fileWriter.written.get('/project/design/agents.assistant.afdesign.json');
    expect(written).toBeDefined();
    expect(JSON.parse(written!)).toEqual(DESIGN);
  });

  it('writes workflows designs to a distinct path from agents designs', () => {
    const fileWriter = createInMemoryFileWriter();
    const workflowDesign: DesignArtifact = {
      ...DESIGN,
      binding: { resourceType: 'workflows', resourceId: 'assistant' },
      layout: undefined,
      positions: { node1: { x: 0, y: 0 } },
    };
    writeDesignFile('/project', fileWriter, workflowDesign);
    expect(fileWriter.written.has('/project/design/workflows.assistant.afdesign.json')).toBe(true);
    expect(fileWriter.written.has('/project/design/agents.assistant.afdesign.json')).toBe(false);
  });
});
