import { createInMemoryFileSystem } from '@agentform/parser';
import type { DesignDraft } from '@agentform/studio-design';
import { describe, expect, it } from 'vitest';
import { applyDesignPatch } from './apply-design-patch.js';
import { createInMemoryFileWriter, type FileWriter } from './file-writer.js';

/** Reads back the one audit-log entry a test's write produced, from a `FileWriter` double's own captured writes — avoids needing a shared fs/fileWriter double just to prove provenance, since the log's own path is a fixed, known constant. */
function lastAuditEntry(
  fileWriter: FileWriter & { readonly written: Map<string, string> },
): unknown {
  const [, content] = [...fileWriter.written.entries()].find(([path]) =>
    path.endsWith('.agentform/studio-audit.jsonl'),
  )!;
  const lines = content.trim().split('\n');
  return JSON.parse(lines[lines.length - 1]!);
}

const ENTRY_PATH = '/project/agentform.yaml';

const VALID_YAML = `apiVersion: agentform.dev/v1alpha1
kind: AgenticApplication

metadata:
  name: fixture-app
  version: 1.0.0

spec:
  runtime:
    target: openai
    environment: development
  models:
    primary:
      provider: openai
      model: gpt-5
  agents:
    assistant:
      model: primary
      role: assistant
      instructions:
        text: Be helpful.
      inputSchema:
        type: object
        properties:
          name: {}
  workflows:
    main:
      entrypoint: assistant
      nodes:
        assistant:
          type: agent
          agent: assistant
`;

describe('applyDesignPatch', () => {
  it('stamps and writes a valid agent form-layout draft', () => {
    const fs = createInMemoryFileSystem({ [ENTRY_PATH]: VALID_YAML });
    const fileWriter = createInMemoryFileWriter();
    const draft: DesignDraft = {
      binding: { resourceType: 'agents', resourceId: 'assistant' },
      layout: { input: [{ id: 'f1', type: 'field', fieldPath: 'name', widget: 'text' }] },
    };

    const result = applyDesignPatch({ rootDir: '/project', draft, fs, fileWriter });

    expect(result.success).toBe(true);
    expect(result.design?.designVersion).toBe('1');
    expect(result.design?.specVersionTarget).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.design?.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    // The design artifact itself, plus the audit-log entry (Phase 18) —
    // every successful write records provenance, not just the design file.
    expect(fileWriter.written.size).toBe(2);
    const designEntry = [...fileWriter.written.entries()].find(([path]) =>
      path.includes('agents.assistant.afdesign.json'),
    )!;
    expect(designEntry[0]).toContain('design');
    expect(JSON.parse(designEntry[1]).binding).toEqual(draft.binding);
  });

  it('stamps and writes a valid workflow canvas-position draft', () => {
    const fs = createInMemoryFileSystem({ [ENTRY_PATH]: VALID_YAML });
    const fileWriter = createInMemoryFileWriter();
    const draft: DesignDraft = {
      binding: { resourceType: 'workflows', resourceId: 'main' },
      positions: { assistant: { x: 10, y: 20 } },
    };

    const result = applyDesignPatch({ rootDir: '/project', draft, fs, fileWriter });

    expect(result.success).toBe(true);
    expect(fileWriter.written.size).toBe(2);
  });

  it('rejects a draft bound to a resource id that does not exist, writes nothing', () => {
    const fs = createInMemoryFileSystem({ [ENTRY_PATH]: VALID_YAML });
    const fileWriter = createInMemoryFileWriter();
    const draft: DesignDraft = {
      binding: { resourceType: 'agents', resourceId: 'ghost' },
    };

    const result = applyDesignPatch({ rootDir: '/project', draft, fs, fileWriter });

    expect(result.success).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('AGF8002');
    expect(fileWriter.written.size).toBe(0);
  });

  it('rejects a form-layout field path not declared on the agent, writes nothing', () => {
    const fs = createInMemoryFileSystem({ [ENTRY_PATH]: VALID_YAML });
    const fileWriter = createInMemoryFileWriter();
    const draft: DesignDraft = {
      binding: { resourceType: 'agents', resourceId: 'assistant' },
      layout: { input: [{ id: 'f1', type: 'field', fieldPath: 'not-declared' }] },
    };

    const result = applyDesignPatch({ rootDir: '/project', draft, fs, fileWriter });

    expect(result.success).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('AGF8003');
    expect(fileWriter.written.size).toBe(0);
  });

  it('rejects when the project itself fails to load, writes nothing', () => {
    const fs = createInMemoryFileSystem({});
    const fileWriter = createInMemoryFileWriter();
    const draft: DesignDraft = { binding: { resourceType: 'agents', resourceId: 'assistant' } };

    const result = applyDesignPatch({ rootDir: '/project', draft, fs, fileWriter });

    expect(result.success).toBe(false);
    expect(fileWriter.written.size).toBe(0);
  });

  it('records a manual-source audit entry with a derived summary when no provenance is given', () => {
    const fs = createInMemoryFileSystem({ [ENTRY_PATH]: VALID_YAML });
    const fileWriter = createInMemoryFileWriter();
    const draft: DesignDraft = {
      binding: { resourceType: 'agents', resourceId: 'assistant' },
      layout: { input: [{ id: 'f1', type: 'field', fieldPath: 'name' }] },
    };

    applyDesignPatch({ rootDir: '/project', draft, fs, fileWriter });

    expect(lastAuditEntry(fileWriter)).toMatchObject({
      source: 'manual',
      target: { kind: 'design', resourceType: 'agents', resourceId: 'assistant' },
    });
  });

  it('records the supplied provenance source and summary', () => {
    const fs = createInMemoryFileSystem({ [ENTRY_PATH]: VALID_YAML });
    const fileWriter = createInMemoryFileWriter();
    const draft: DesignDraft = {
      binding: { resourceType: 'agents', resourceId: 'assistant' },
      layout: { input: [{ id: 'f1', type: 'field', fieldPath: 'name' }] },
    };

    applyDesignPatch({
      rootDir: '/project',
      draft,
      fs,
      fileWriter,
      provenance: { source: 'chat', summary: 'Grouped the name field.' },
    });

    expect(lastAuditEntry(fileWriter)).toMatchObject({
      source: 'chat',
      summary: 'Grouped the name field.',
    });
  });

  it('never writes an audit entry when the write itself is rejected', () => {
    const fs = createInMemoryFileSystem({ [ENTRY_PATH]: VALID_YAML });
    const fileWriter = createInMemoryFileWriter();
    const draft: DesignDraft = { binding: { resourceType: 'agents', resourceId: 'ghost' } };

    applyDesignPatch({ rootDir: '/project', draft, fs, fileWriter });

    expect(fileWriter.written.size).toBe(0);
  });
});
