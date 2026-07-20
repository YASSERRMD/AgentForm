import { describe, expect, it } from 'vitest';
import { af013ProductionModelAliasesMustBePinned } from './af013-production-model-aliases-must-be-pinned.js';
import { withApplication } from '../test-fixtures.js';
import type { PolicyContext } from '../types.js';

describe('AF013 production-model-aliases-must-be-pinned', () => {
  it('passes a non-production environment with an unpinned model', () => {
    const context: PolicyContext = { application: withApplication(() => {}) };
    expect(af013ProductionModelAliasesMustBePinned.check(context)).toEqual([]);
  });

  it('rejects an unpinned model in a production runtime environment', () => {
    const app = withApplication((application) => {
      application.spec.runtime.environment = 'production';
    });
    const findings = af013ProductionModelAliasesMustBePinned.check({ application: app });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.resourceAddress).toBe('spec.models.primary.version');
  });

  it('passes a pinned model in a production runtime environment', () => {
    const app = withApplication((application) => {
      application.spec.runtime.environment = 'prod';
      const model = application.spec.models.primary;
      if (model) {
        model.version = '2026-01-15';
      }
    });
    expect(af013ProductionModelAliasesMustBePinned.check({ application: app })).toEqual([]);
  });
});
