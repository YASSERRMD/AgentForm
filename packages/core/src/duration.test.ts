import { describe, expect, it } from 'vitest';
import { parseDurationMs } from './duration.js';

describe('parseDurationMs', () => {
  it.each([
    ['500ms', 500],
    ['30s', 30_000],
    ['5m', 300_000],
    ['24h', 86_400_000],
    ['1d', 86_400_000],
    ['2d', 172_800_000],
  ])('parses %s as %d ms', (input, expected) => {
    expect(parseDurationMs(input)).toBe(expected);
  });

  it.each(['', '30', 'thirty seconds', '30x', '-5s', '5.5s'])(
    'rejects malformed duration %j',
    (input) => {
      expect(() => parseDurationMs(input)).toThrow(/Invalid duration/);
    },
  );
});
