import { describe, expect, it } from 'vitest';
import { af001NoInlineSecrets } from './af001-no-inline-secrets.js';
import { withApplication } from '../test-fixtures.js';
import type { PolicyContext } from '../types.js';

describe('AF001 no-inline-secrets', () => {
  it('passes a document with no secret-shaped values', () => {
    const context: PolicyContext = { application: withApplication(() => {}) };
    expect(af001NoInlineSecrets.check(context)).toEqual([]);
  });

  it('detects an inline AWS access key in agent instructions', () => {
    const app = withApplication((application) => {
      const assistant = application.spec.agents.assistant;
      if (assistant) {
        assistant.instructions = { text: 'Use key AKIAABCDEFGHIJKLMNOP to authenticate.' };
      }
    });
    const findings = af001NoInlineSecrets.check({ application: app });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain('AWS access key ID');
    expect(findings[0]?.resourceAddress).toBe('spec.agents.assistant.instructions.text');
  });

  it('never echoes the raw secret value in the finding message', () => {
    const secret = 'AKIAABCDEFGHIJKLMNOP';
    const app = withApplication((application) => {
      const assistant = application.spec.agents.assistant;
      if (assistant) {
        assistant.instructions = { text: `token=${secret}` };
      }
    });
    const findings = af001NoInlineSecrets.check({ application: app });
    expect(findings[0]?.message).not.toContain(secret);
  });

  it('detects a PEM private key block wherever it appears', () => {
    const app = withApplication((application) => {
      application.metadata.description = '-----BEGIN RSA PRIVATE KEY-----\nMIIB...';
    });
    const findings = af001NoInlineSecrets.check({ application: app });
    expect(findings.some((f) => f.message.includes('PEM private key block'))).toBe(true);
  });
});
