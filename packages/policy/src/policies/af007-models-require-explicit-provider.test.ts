import { describe, expect, it } from 'vitest';
import { af007ModelsRequireExplicitProvider } from './af007-models-require-explicit-provider.js';
import { withApplication } from '../test-fixtures.js';
import type { PolicyContext } from '../types.js';

describe('AF007 models-require-explicit-provider', () => {
  it('passes the fixture application, which declares a real provider', () => {
    const context: PolicyContext = { application: withApplication(() => {}) };
    expect(af007ModelsRequireExplicitProvider.check(context)).toEqual([]);
  });

  it('rejects a model whose provider is whitespace only', () => {
    const app = withApplication((application) => {
      const model = application.spec.models.primary;
      if (model) {
        model.provider = '   ';
      }
    });
    const findings = af007ModelsRequireExplicitProvider.check({ application: app });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.resourceAddress).toBe('spec.models.primary.provider');
  });
});
