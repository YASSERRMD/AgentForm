import { createInMemoryFileSystem } from '@agentform/parser';
import type { DesignDraft } from '@agentform/studio-design';
import { describe, expect, it } from 'vitest';
import { applyDesignPatch } from './apply-design-patch.js';
import { createInMemoryFileWriter } from './file-writer.js';

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
    expect(fileWriter.written.size).toBe(1);
    const [writtenPath, writtenContent] = [...fileWriter.written.entries()][0]!;
    expect(writtenPath).toContain('design');
    expect(writtenPath).toContain('agents.assistant.afdesign.json');
    expect(JSON.parse(writtenContent).binding).toEqual(draft.binding);
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
    expect(fileWriter.written.size).toBe(1);
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
});
