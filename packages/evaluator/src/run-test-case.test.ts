import { describe, expect, it } from 'vitest';
import { runDataset, runTestCase } from './run-test-case.js';
import { testCaseSchema } from './test-case.js';
import { fixtureIR } from './test-fixtures.js';

/**
 * Mirrors §17's own motivating example as closely as the real schema
 * allows — `complaintRegistry.search` isn't a valid Agentform tool
 * identifier (dots aren't permitted; see `identifierSchema`), so this
 * uses the hyphenated equivalent from `fixtureIR()` while keeping the
 * same duplicate-detection structure and assertion vocabulary.
 */
function duplicateCheckTestCase() {
  return testCaseSchema.parse({
    name: 'duplicate complaints are not recreated',
    workflow: 'main',
    input: { description: 'Streetlight is broken', locationId: 'LOC-101' },
    mocks: {
      'complaint-registry-search': { return: { duplicateFound: true } },
    },
    nodes: {
      intake: {
        toolCalls: [{ tool: 'complaint-registry-search', args: { locationId: 'LOC-101' } }],
      },
    },
    assertions: [
      { type: 'toolCalled', tool: 'complaint-registry-search' },
      { type: 'toolNotCalled', tool: 'complaint-registry-create' },
      { type: 'maximumToolCalls', value: 3 },
      { type: 'workflowPath', equals: ['intake', 'done'] },
      { type: 'terminationReason', equals: 'duplicate-found' },
    ],
  });
}

describe('runTestCase', () => {
  it("passes every assertion for §17's own duplicate-complaint scenario", () => {
    const result = runTestCase(fixtureIR(), duplicateCheckTestCase());
    expect(result.passed).toBe(true);
    expect(result.assertionResults.every((assertion) => assertion.passed)).toBe(true);
  });

  it('fails, listing the specific failing assertions, when the scenario diverges from expectations', () => {
    const testCase = testCaseSchema.parse({
      name: 'wrongly expects a create call',
      workflow: 'main',
      mocks: { 'complaint-registry-search': { return: { duplicateFound: true } } },
      nodes: {
        intake: { toolCalls: [{ tool: 'complaint-registry-search' }] },
      },
      assertions: [
        { type: 'toolCalled', tool: 'complaint-registry-create' },
        { type: 'toolCalled', tool: 'complaint-registry-search' },
      ],
    });
    const result = runTestCase(fixtureIR(), testCase);
    expect(result.passed).toBe(false);
    expect(result.assertionResults[0]?.passed).toBe(false);
    expect(result.assertionResults[1]?.passed).toBe(true);
  });

  it('reports a run-time error (not a thrown exception) for an unknown workflow', () => {
    const testCase = testCaseSchema.parse({
      name: 'bad workflow reference',
      workflow: 'does-not-exist',
      assertions: [{ type: 'nodeVisited', node: 'intake' }],
    });
    const result = runTestCase(fixtureIR(), testCase);
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/No workflow "does-not-exist"/);
    expect(result.assertionResults).toEqual([]);
  });
});

describe('runDataset', () => {
  it('runs every test case independently and reports each result', () => {
    const results = runDataset(fixtureIR(), [
      duplicateCheckTestCase(),
      testCaseSchema.parse({
        name: 'a second, unrelated case',
        workflow: 'main',
        assertions: [{ type: 'nodeVisited', node: 'intake' }],
      }),
    ]);
    expect(results).toHaveLength(2);
    expect(results.every((result) => result.passed)).toBe(true);
  });
});
