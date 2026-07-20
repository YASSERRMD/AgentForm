import { describe, expect, it } from 'vitest';
import { durationToMs } from './duration.js';

describe('durationToMs', () => {
  it.each([
    ['500ms', 500],
    ['30s', 30_000],
    ['5m', 300_000],
    ['2h', 7_200_000],
    ['1d', 86_400_000],
  ])('converts %s to %d ms', (duration, expected) => {
    expect(durationToMs(duration)).toBe(expected);
  });

  it('returns undefined for a malformed value', () => {
    expect(durationToMs('not-a-duration')).toBeUndefined();
  });
});
