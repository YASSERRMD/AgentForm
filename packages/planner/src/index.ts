export type { PlanOperation, PlanRisk, FieldChange, PlanItem, Plan } from './types.js';
export { collectDesiredResources, type DesiredResource } from './desired-resources.js';
export { comparePlan, type ComparePlanOptions } from './compare.js';
export { planDestroy } from './destroy-plan.js';
export { classifyRisk } from './risk.js';
export { orderPlanItems } from './order.js';
export {
  createPlanFile,
  serializePlanFile,
  verifyPlanFile,
  PLAN_FILE_FORMAT_VERSION,
  type PlanFile,
  type PlanFileVerificationResult,
} from './plan-file.js';

export const PACKAGE_NAME = '@agentform/planner';
export const PACKAGE_VERSION = '0.1.0';
