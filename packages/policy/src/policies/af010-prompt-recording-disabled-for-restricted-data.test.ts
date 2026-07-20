import { describe, expect, it } from 'vitest';
import { af010PromptRecordingDisabledForRestrictedData } from './af010-prompt-recording-disabled-for-restricted-data.js';
import { withApplication } from '../test-fixtures.js';
import type { PolicyContext } from '../types.js';

describe('AF010 prompt-recording-disabled-for-restricted-data', () => {
  it('passes when recordPrompts is unset', () => {
    const context: PolicyContext = { application: withApplication(() => {}) };
    expect(af010PromptRecordingDisabledForRestrictedData.check(context)).toEqual([]);
  });

  it('passes recordPrompts: true when there is no restricted data', () => {
    const app = withApplication((application) => {
      application.spec.observability = { recordPrompts: true };
    });
    expect(af010PromptRecordingDisabledForRestrictedData.check({ application: app })).toEqual([]);
  });

  it('passes restricted data when recordPrompts is unset', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        lookup: { type: 'function', handler: 'lookup.ts#run', dataClassification: 'restricted' },
      };
    });
    expect(af010PromptRecordingDisabledForRestrictedData.check({ application: app })).toEqual([]);
  });

  it('rejects recordPrompts: true combined with a restricted-classification tool', () => {
    const app = withApplication((application) => {
      application.spec.observability = { recordPrompts: true };
      application.spec.tools = {
        lookup: { type: 'function', handler: 'lookup.ts#run', dataClassification: 'restricted' },
      };
    });
    const findings = af010PromptRecordingDisabledForRestrictedData.check({ application: app });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.resourceAddress).toBe('spec.observability.recordPrompts');
  });
});
