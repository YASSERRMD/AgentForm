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
export {
  createTestResultsRecord,
  parseTestResultsRecord,
  serializeTestResultsRecord,
  TEST_RESULTS_FORMAT_VERSION,
  type TestResultsRecord,
  type TestResultsVerificationResult,
} from './results-record.js';
export { checkEvaluationGateStatus, type EvaluationGateStatus } from './gate-status.js';
export { EVALUATOR_DIAGNOSTIC_CODES } from './codes.js';

export const PACKAGE_NAME = '@agentform/evaluator';
export const PACKAGE_VERSION = '0.1.0';
