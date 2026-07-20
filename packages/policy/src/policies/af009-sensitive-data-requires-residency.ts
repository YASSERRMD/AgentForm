import type { PolicyDefinition, PolicyFinding } from '../types.js';

const SENSITIVE_CLASSIFICATIONS = new Set(['confidential', 'restricted']);

/**
 * `dataResidency` lives on a model (§6.2), not on a tool — so "sensitive
 * data requires residency" is checked by tracing, for each agent, whether
 * it uses any tool classified `confidential`/`restricted` (§6.4
 * `dataClassification`), and if so requiring that the agent's own model
 * declares a `dataResidency`.
 */
export const af009SensitiveDataRequiresResidency: PolicyDefinition = {
  id: 'AF009',
  name: 'sensitive-data-requires-residency',
  description:
    'Reject an agent handling sensitive data through a model with no declared data residency.',
  defaultSeverity: 'error',
  mandatory: true,
  check: (context) => {
    const findings: PolicyFinding[] = [];
    const { agents, models, tools } = context.application.spec;

    for (const [agentId, agent] of Object.entries(agents)) {
      const touchesSensitiveData = (agent.tools ?? []).some((toolId) => {
        const classification = tools?.[toolId]?.dataClassification;
        return classification !== undefined && SENSITIVE_CLASSIFICATIONS.has(classification);
      });
      if (!touchesSensitiveData) {
        continue;
      }
      const model = models[agent.model];
      if (model?.dataResidency !== undefined) {
        continue;
      }
      findings.push({
        message: `Agent "${agentId}" handles sensitive data but its model "${agent.model}" declares no dataResidency.`,
        resourceAddress: `spec.models.${agent.model}.dataResidency`,
        remediation:
          'Set dataResidency on the model to the region/jurisdiction this sensitive data must stay in.',
      });
    }
    return findings;
  },
};
