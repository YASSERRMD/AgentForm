import { describe, expect, it } from 'vitest';
import { validateGoogleAdkCompatibility } from './compatibility.js';
import {
  baseIR,
  multiAgentIR,
  sharedDelegationTargetIR,
  unsupportedNodeIR,
} from './test-fixtures.js';

describe('validateGoogleAdkCompatibility', () => {
  it('reports the basic-scope fixture as fully compatible', () => {
    const report = validateGoogleAdkCompatibility(baseIR());
    expect(report.hasBlockingIncompatibility).toBe(false);
    expect(report.target).toBe('google-adk');
  });

  it('reports every node type in the multi-agent fixture as supported', () => {
    const report = validateGoogleAdkCompatibility(multiAgentIR());
    const nodeEntries = report.entries.filter((entry) => entry.feature.startsWith('workflow node'));
    expect(nodeEntries).toHaveLength(3);
    expect(nodeEntries.every((entry) => entry.level === 'supported')).toBe(true);
  });

  it("flags humanApproval as unsupported, with a detail explaining ADK's real tool-level mechanism", () => {
    const report = validateGoogleAdkCompatibility(unsupportedNodeIR());
    expect(report.hasBlockingIncompatibility).toBe(true);
    const entry = report.entries.find((e) => e.feature === 'workflow node (humanApproval)');
    expect(entry?.level).toBe('unsupported');
    expect(entry?.detail).toMatch(/require_confirmation/);
  });

  it('flags a delegation target shared by more than one agent as unsupported', () => {
    const report = validateGoogleAdkCompatibility(sharedDelegationTargetIR());
    expect(report.hasBlockingIncompatibility).toBe(true);
    const entry = report.entries.find((e) => e.feature === 'agent delegation');
    expect(entry?.level).toBe('unsupported');
    expect(entry?.detail).toContain('parent-a');
    expect(entry?.detail).toContain('parent-b');
  });

  it('pins the generated dependency and runtime version', () => {
    const report = validateGoogleAdkCompatibility(baseIR());
    expect(report.generatedDependencies).toEqual({ 'google-adk': '2.5.0' });
    expect(report.runtimeRequirements).toEqual(['python >=3.10']);
  });
});
