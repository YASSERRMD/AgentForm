import { describe, expect, it } from 'vitest';
import { af009SensitiveDataRequiresResidency } from './af009-sensitive-data-requires-residency.js';
import { withApplication } from '../test-fixtures.js';
import type { PolicyContext } from '../types.js';

function withRestrictedTool() {
  return withApplication((application) => {
    application.spec.tools = {
      lookup: { type: 'function', handler: 'lookup.ts#run', dataClassification: 'restricted' },
    };
    const assistant = application.spec.agents.assistant;
    if (assistant) {
      assistant.tools = ['lookup'];
    }
  });
}

describe('AF009 sensitive-data-requires-residency', () => {
  it('passes an agent with no sensitive-classification tools', () => {
    const context: PolicyContext = { application: withApplication(() => {}) };
    expect(af009SensitiveDataRequiresResidency.check(context)).toEqual([]);
  });

  it('rejects an agent using a restricted tool whose model has no dataResidency', () => {
    const findings = af009SensitiveDataRequiresResidency.check({
      application: withRestrictedTool(),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.resourceAddress).toBe('spec.models.primary.dataResidency');
  });

  it('passes an agent using a restricted tool whose model declares dataResidency', () => {
    const app = withRestrictedTool();
    const model = app.spec.models.primary;
    if (model) {
      model.dataResidency = 'eu-west-1';
    }
    expect(af009SensitiveDataRequiresResidency.check({ application: app })).toEqual([]);
  });

  it('passes an agent using a public tool with no residency requirement', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        lookup: { type: 'function', handler: 'lookup.ts#run', dataClassification: 'public' },
      };
      const assistant = application.spec.agents.assistant;
      if (assistant) {
        assistant.tools = ['lookup'];
      }
    });
    expect(af009SensitiveDataRequiresResidency.check({ application: app })).toEqual([]);
  });
});
