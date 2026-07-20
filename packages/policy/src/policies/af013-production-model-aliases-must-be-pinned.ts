import { isProductionEnvironment } from '../production.js';
import type { PolicyDefinition, PolicyFinding } from '../types.js';

/**
 * In a production runtime environment, every model must declare a
 * non-blank `version` (§6.2) — an unpinned model identifier (e.g. a bare
 * "gpt-5" alias with no `version`) can silently change behavior whenever
 * the provider updates what that alias resolves to.
 */
export const af013ProductionModelAliasesMustBePinned: PolicyDefinition = {
  id: 'AF013',
  name: 'production-model-aliases-must-be-pinned',
  description: 'Reject unpinned (versionless) models in a production runtime environment.',
  defaultSeverity: 'error',
  mandatory: true,
  check: (context) => {
    const { runtime, models } = context.application.spec;
    if (!isProductionEnvironment(runtime.environment)) {
      return [];
    }
    const findings: PolicyFinding[] = [];
    for (const [modelId, model] of Object.entries(models)) {
      if ((model.version ?? '').trim().length > 0) {
        continue;
      }
      findings.push({
        message: `Model "${modelId}" has no pinned version in a production runtime environment.`,
        resourceAddress: `spec.models.${modelId}.version`,
        remediation:
          'Set version to a specific, pinned model version rather than leaving it to float.',
      });
    }
    return findings;
  },
};
