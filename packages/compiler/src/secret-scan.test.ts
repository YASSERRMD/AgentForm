import { describe, expect, it } from 'vitest';
import { scanForSecretLeaks } from './secret-scan.js';

describe('scanForSecretLeaks', () => {
  it('finds no leaks in ordinary generated code', () => {
    const files = [{ path: 'src/agents/assistant.ts', content: 'export const name = "assistant";' }];
    expect(scanForSecretLeaks(files)).toEqual([]);
  });

  it('flags a file containing an AWS-shaped access key', () => {
    const files = [
      { path: 'src/tools/registry.ts', content: 'const token = "AKIAABCDEFGHIJKLMNOP";' },
    ];
    const leaks = scanForSecretLeaks(files);
    expect(leaks).toHaveLength(1);
    expect(leaks[0]?.path).toBe('src/tools/registry.ts');
    expect(leaks[0]?.patternName).toContain('AWS');
  });

  it('never echoes the raw secret value in the leak report', () => {
    const secret = 'AKIAABCDEFGHIJKLMNOP';
    const files = [{ path: 'src/tools/registry.ts', content: `const token = "${secret}";` }];
    const leaks = scanForSecretLeaks(files);
    expect(leaks[0]?.redactedValue).not.toContain(secret);
  });

  it('checks every file independently', () => {
    const files = [
      { path: 'clean.ts', content: 'export const ok = true;' },
      { path: 'dirty.ts', content: 'const token = "AKIAABCDEFGHIJKLMNOP";' },
    ];
    const leaks = scanForSecretLeaks(files);
    expect(leaks.map((leak) => leak.path)).toEqual(['dirty.ts']);
  });
});
