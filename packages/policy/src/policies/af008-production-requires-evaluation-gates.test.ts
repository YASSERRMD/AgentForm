import { describe, expect, it } from 'vitest';
import { af008ProductionRequiresEvaluationGates } from './af008-production-requires-evaluation-gates.js';
import { withApplication } from '../test-fixtures.js';
import type { PolicyContext } from '../types.js';

describe('AF008 production-requires-evaluation-gates', () => {
  it('passes a non-production environment with no evaluations at all', () => {
    const context: PolicyContext = { application: withApplication(() => {}) };
    expect(af008ProductionRequiresEvaluationGates.check(context)).toEqual([]);
  });

  it('rejects a production environment with no evaluations block', () => {
    const app = withApplication((application) => {
      application.spec.runtime.environment = 'production';
    });
    const findings = af008ProductionRequiresEvaluationGates.check({ application: app });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.resourceAddress).toBe('spec.evaluations');
  });

  it('rejects a production environment with datasets but no thresholds', () => {
    const app = withApplication((application) => {
      application.spec.runtime.environment = 'prod';
      application.spec.evaluations = { datasets: ['regression-set'] };
    });
    expect(af008ProductionRequiresEvaluationGates.check({ application: app })).toHaveLength(1);
  });

  it('passes a production environment with both datasets and thresholds', () => {
    const app = withApplication((application) => {
      application.spec.runtime.environment = 'production';
      application.spec.evaluations = {
        datasets: ['regression-set'],
        thresholds: { accuracy: 0.9 },
      };
    });
    expect(af008ProductionRequiresEvaluationGates.check({ application: app })).toEqual([]);
  });
});
