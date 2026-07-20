import { isProductionEnvironment } from '../production.js';
import type { PolicyDefinition, PolicyFinding } from '../types.js';

/**
 * A production-labeled runtime environment (`spec.runtime.environment`
 * matching "prod"/"production", case-insensitively) must declare both
 * evaluation datasets and thresholds — an evaluation block that exists
 * but gates nothing is treated the same as no evaluation block at all.
 */
export const af008ProductionRequiresEvaluationGates: PolicyDefinition = {
  id: 'AF008',
  name: 'production-requires-evaluation-gates',
  description:
    'Reject a production runtime environment with no evaluation datasets and thresholds.',
  defaultSeverity: 'error',
  mandatory: true,
  check: (context) => {
    const { runtime, evaluations } = context.application.spec;
    if (!isProductionEnvironment(runtime.environment)) {
      return [];
    }
    const hasDatasets = (evaluations?.datasets?.length ?? 0) > 0;
    const hasThresholds = Object.keys(evaluations?.thresholds ?? {}).length > 0;
    if (hasDatasets && hasThresholds) {
      return [];
    }
    const finding: PolicyFinding = {
      message: `Runtime environment "${runtime.environment}" looks like production but spec.evaluations does not declare both datasets and thresholds.`,
      resourceAddress: 'spec.evaluations',
      remediation:
        'Add spec.evaluations.datasets and spec.evaluations.thresholds so production deploys are gated by evaluation results.',
    };
    return [finding];
  },
};
