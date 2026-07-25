import { createInMemoryFileSystem } from '@agentform/parser';
import { describe, expect, it } from 'vitest';
import { validateSpecPatch } from './validate-spec-patch.js';

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
  workflows:
    main:
      entrypoint: assistant
      nodes:
        assistant:
          type: agent
          agent: assistant
`;

describe('validateSpecPatch', () => {
  it('accepts a valid patch, returning the patched application and the entry file it resolved from', () => {
    const fs = createInMemoryFileSystem({ [ENTRY_PATH]: VALID_YAML });

    const result = validateSpecPatch({
      rootDir: '/project',
      fs,
      patch: [{ op: 'replace', path: ['metadata', 'version'], value: '2.0.0' }],
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error('expected success');
    }
    expect(result.application.metadata.version).toBe('2.0.0');
    expect(result.entryFile).toBe('agentform.yaml');
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(false);
  });

  it('rejects a patch that produces a schema-invalid document', () => {
    const fs = createInMemoryFileSystem({ [ENTRY_PATH]: VALID_YAML });

    const result = validateSpecPatch({
      rootDir: '/project',
      fs,
      patch: [{ op: 'remove', path: ['metadata', 'version'] }],
    });

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  it('rejects a patch on a project with no entry file', () => {
    const fs = createInMemoryFileSystem({});

    const result = validateSpecPatch({
      rootDir: '/project',
      fs,
      patch: [{ op: 'replace', path: ['metadata', 'version'], value: '2.0.0' }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a patch on a multi-file project (tools resolved via $ref) with AGF8001', () => {
    const multiFileYaml = VALID_YAML.replace(
      'agents:\n    assistant:',
      'tools:\n    $ref: tools.yaml\n  agents:\n    assistant:',
    ).replace('        text: Be helpful.', '        text: Be helpful.\n      tools: [lookup]');
    const fs = createInMemoryFileSystem({
      [ENTRY_PATH]: multiFileYaml,
      '/project/tools.yaml': 'lookup:\n  type: function\n  handler: lookup.js\n',
    });

    const result = validateSpecPatch({
      rootDir: '/project',
      fs,
      patch: [{ op: 'replace', path: ['metadata', 'version'], value: '2.0.0' }],
    });

    expect(result.success).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('AGF8001');
  });

  it('rejects a patch that a policy blocks (e.g. a literal secret)', () => {
    const fs = createInMemoryFileSystem({ [ENTRY_PATH]: VALID_YAML });

    const result = validateSpecPatch({
      rootDir: '/project',
      fs,
      patch: [
        {
          op: 'add',
          path: ['spec', 'models', 'secondary'],
          value: { provider: 'openai', model: 'gpt-5', apiKey: 'sk-live-abc123' },
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });
});
