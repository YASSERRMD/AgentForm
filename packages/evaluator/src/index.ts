export { assertionSchema, type Assertion, type AssertionType } from './assertion.js';
export { testCaseSchema, type TestCase } from './test-case.js';
export { DatasetLoadError, loadDatasetFile, loadDatasets } from './dataset.js';
export {
  evaluateAssertion,
  evaluateAssertions,
  type AssertionResult,
  type EvaluationContext,
} from './evaluate.js';
export { runDataset, runTestCase, type TestCaseResult } from './run-test-case.js';
export { evaluateThresholds, type RunSummary, type ThresholdGateResult } from './threshold.js';
export { deepEqual } from './deep-equal.js';
export { getByPath } from './get-by-path.js';

export const PACKAGE_NAME = '@agentform/evaluator';
export const PACKAGE_VERSION = '0.1.0';
