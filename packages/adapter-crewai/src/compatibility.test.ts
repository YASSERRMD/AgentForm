import { describe, expect, it } from 'vitest';
import { validateCrewAiCompatibility } from './compatibility.js';
import { baseIR, multiAgentIR, unsupportedNodeIR } from './test-fixtures.js';

describe('validateCrewAiCompatibility', () => {
  it('reports the basic-scope fixture as fully compatible', () => {
    const report = validateCrewAiCompatibility(baseIR());
    expect(report.hasBlockingIncompatibility).toBe(false);
    expect(report.target).toBe('crewai');
  });

  it('reports every node type in the multi-agent fixture as supported', () => {
    const report = validateCrewAiCompatibility(multiAgentIR());
    const nodeEntries = report.entries.filter((entry) => entry.feature.startsWith('workflow node'));
    expect(nodeEntries).toHaveLength(3);
    expect(nodeEntries.every((entry) => entry.level === 'supported')).toBe(true);
  });

  it("flags humanApproval as unsupported, with a detail explaining CrewAI's real task-scoped mechanism", () => {
    const report = validateCrewAiCompatibility(unsupportedNodeIR());
    expect(report.hasBlockingIncompatibility).toBe(true);
    const entry = report.entries.find((e) => e.feature === 'workflow node (humanApproval)');
    expect(entry?.level).toBe('unsupported');
    expect(entry?.detail).toMatch(/human_input/);
  });

  it('flags agent delegation as partial, not unsupported, since it works but is crew-wide', () => {
    const report = validateCrewAiCompatibility(multiAgentIR());
    expect(report.hasBlockingIncompatibility).toBe(false);
    const entry = report.entries.find((e) => e.feature === 'agent delegation');
    expect(entry?.level).toBe('partial');
    expect(entry?.detail).toContain('intake');
    expect(entry?.detail).toContain('research-specialist');
  });

  it('does not report a delegation entry when no agent declares allowedAgents', () => {
    const report = validateCrewAiCompatibility(baseIR());
    expect(report.entries.some((entry) => entry.feature === 'agent delegation')).toBe(false);
  });

  it('pins the generated dependency and runtime version', () => {
    const report = validateCrewAiCompatibility(baseIR());
    expect(report.generatedDependencies).toEqual({ crewai: '1.15.5' });
    expect(report.runtimeRequirements).toEqual(['python >=3.10,<3.14']);
  });
});
