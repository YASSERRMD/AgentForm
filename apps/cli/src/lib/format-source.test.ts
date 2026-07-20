import { describe, expect, it } from 'vitest';
import { formatSourceText } from './format-source.js';

describe('formatSourceText (YAML)', () => {
  it('normalizes indentation to 2 spaces', () => {
    const input = 'metadata:\n    name: app\n    version: 1.0.0\n';
    expect(formatSourceText(input, 'agentform.yaml')).toBe(
      'metadata:\n  name: app\n  version: 1.0.0\n',
    );
  });

  it('is idempotent — formatting already-formatted text is a no-op', () => {
    const input = 'metadata:\n  name: app\n  version: 1.0.0\n';
    const once = formatSourceText(input, 'agentform.yaml');
    const twice = formatSourceText(once, 'agentform.yaml');
    expect(twice).toBe(once);
  });

  it('preserves key order rather than sorting', () => {
    const input = 'metadata:\n  version: 1.0.0\n  name: app\n';
    const output = formatSourceText(input, 'agentform.yaml');
    expect(output.indexOf('version')).toBeLessThan(output.indexOf('name'));
  });

  it('does not fold long string values into block scalars', () => {
    const longValue = 'x'.repeat(200);
    const input = `note: ${longValue}\n`;
    const output = formatSourceText(input, 'agentform.yaml');
    expect(output).toBe(`note: ${longValue}\n`);
  });
});

describe('formatSourceText (JSON)', () => {
  it('reformats JSON with 2-space indentation and a trailing newline', () => {
    const input = '{"name":"app","version":"1.0.0"}';
    expect(formatSourceText(input, 'agentform.json')).toBe(
      '{\n  "name": "app",\n  "version": "1.0.0"\n}\n',
    );
  });

  it('is idempotent for JSON too', () => {
    const input = '{"name":"app"}';
    const once = formatSourceText(input, 'agentform.json');
    expect(formatSourceText(once, 'agentform.json')).toBe(once);
  });

  it('never rewrites JSON into YAML syntax', () => {
    const output = formatSourceText('{"name":"app"}', 'agentform.json');
    expect(output.trim().startsWith('{')).toBe(true);
  });
});
