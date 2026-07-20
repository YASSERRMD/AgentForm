import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { validateAgenticApplication } from './validate.js';

const specificationsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../specifications/v1alpha1',
);

function loadFixture(relativePath: string): unknown {
  const text = readFileSync(path.join(specificationsRoot, relativePath), 'utf-8');
  return parse(text);
}

describe('valid example specifications', () => {
  it.each(['examples/basic-assistant.yaml', 'examples/municipal-complaint-assistant.yaml'])(
    '%s validates with no diagnostics',
    (relativePath) => {
      const result = validateAgenticApplication(loadFixture(relativePath));
      expect(result.diagnostics).toEqual([]);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    },
  );
});

describe('invalid fixture collection', () => {
  it('missing-root-fields.yaml: reports missing spec and metadata.version', () => {
    const result = validateAgenticApplication(loadFixture('invalid/missing-root-fields.yaml'));
    expect(result.success).toBe(false);
    const paths = result.diagnostics.map((d) => d.path?.join('.'));
    expect(paths).toContain('spec');
    expect(paths).toContain('metadata.version');
    expect(result.diagnostics.every((d) => d.severity === 'error')).toBe(true);
    expect(result.diagnostics.every((d) => /^AGF2\d{3}$/.test(d.code))).toBe(true);
  });

  it('invalid-api-version.yaml: reports the apiVersion literal mismatch', () => {
    const result = validateAgenticApplication(loadFixture('invalid/invalid-api-version.yaml'));
    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.path?.join('.') === 'apiVersion')).toBe(true);
  });

  it('duplicate-tool-reference.yaml: reports the duplicate tools entry', () => {
    const result = validateAgenticApplication(loadFixture('invalid/duplicate-tool-reference.yaml'));
    expect(result.success).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.code === 'AGF2007' && d.path?.join('.') === 'spec.agents.assistant.tools.1',
      ),
    ).toBe(true);
  });

  it('invalid-node-type.yaml: reports the unknown workflow node type', () => {
    const result = validateAgenticApplication(loadFixture('invalid/invalid-node-type.yaml'));
    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('invalid-model-definition.yaml: reports the missing `model` field', () => {
    const result = validateAgenticApplication(loadFixture('invalid/invalid-model-definition.yaml'));
    expect(result.success).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.code === 'AGF2001' && d.path?.join('.') === 'spec.models.primary.model',
      ),
    ).toBe(true);
  });

  it('invalid-tool-definition.yaml: reports the missing `operation` field', () => {
    const result = validateAgenticApplication(loadFixture('invalid/invalid-tool-definition.yaml'));
    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('duplicate-policy-reference.yaml: reports the duplicate policy entry', () => {
    const result = validateAgenticApplication(
      loadFixture('invalid/duplicate-policy-reference.yaml'),
    );
    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'AGF2007')).toBe(true);
  });

  it('invalid-evaluation-threshold.yaml: reports the non-numeric threshold', () => {
    const result = validateAgenticApplication(
      loadFixture('invalid/invalid-evaluation-threshold.yaml'),
    );
    expect(result.success).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.path?.join('.') === 'spec.evaluations.thresholds.taskSuccess',
      ),
    ).toBe(true);
  });
});
