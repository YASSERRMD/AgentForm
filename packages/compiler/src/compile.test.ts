import { describe, expect, it } from 'vitest';
import { compile } from './compile.js';
import { baseIR, fakeAdapter } from './test-fixtures.js';

const OPTIONS = { outputDir: './generated/fake', agentformVersion: '0.1.0' };

describe('compile', () => {
  it('returns the generated project when the adapter is fully compatible', async () => {
    const result = await compile(baseIR(), fakeAdapter(), OPTIONS);
    expect(result.project).toBeDefined();
    expect(result.diagnostics).toEqual([]);
  });

  it('does not call generate() at all when there is a blocking incompatibility', async () => {
    let generateCalled = false;
    const adapter = fakeAdapter({ compatibilityReport: { hasBlockingIncompatibility: true } });
    const originalGenerate = adapter.generate.bind(adapter);
    adapter.generate = async (...args) => {
      generateCalled = true;
      return originalGenerate(...args);
    };

    const result = await compile(baseIR(), adapter, OPTIONS);

    expect(generateCalled).toBe(false);
    expect(result.project).toBeUndefined();
  });

  it('surfaces unsupported-feature diagnostics from the compatibility report', async () => {
    const adapter = fakeAdapter({
      compatibilityReport: {
        hasBlockingIncompatibility: true,
        entries: [{ feature: 'loop node', level: 'unsupported' }],
      },
    });
    const result = await compile(baseIR(), adapter, OPTIONS);
    expect(result.diagnostics.some((d) => d.code === 'AGF5001')).toBe(true);
  });

  it('blocks the result when a generated file would contain a secret', async () => {
    const adapter = fakeAdapter({
      generatedProject: {
        files: [{ path: 'src/tools/registry.ts', content: 'const key = "AKIAABCDEFGHIJKLMNOP";' }],
      },
    });
    const result = await compile(baseIR(), adapter, OPTIONS);
    expect(result.project).toBeUndefined();
    expect(result.diagnostics.some((d) => d.code === 'AGF5003')).toBe(true);
  });

  it('never echoes the raw secret in a blocked result', async () => {
    const secret = 'AKIAABCDEFGHIJKLMNOP';
    const adapter = fakeAdapter({
      generatedProject: { files: [{ path: 'src/tools/registry.ts', content: `"${secret}"` }] },
    });
    const result = await compile(baseIR(), adapter, OPTIONS);
    expect(result.diagnostics.every((d) => !d.message.includes(secret))).toBe(true);
  });

  it('still reports warning-level diagnostics for partial/emulated features on an otherwise-successful compile', async () => {
    const adapter = fakeAdapter({
      compatibilityReport: { entries: [{ feature: 'sessions', level: 'partial' }] },
    });
    const result = await compile(baseIR(), adapter, OPTIONS);
    expect(result.project).toBeDefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.severity).toBe('warning');
  });
});
