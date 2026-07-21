import { describe, expect, it } from 'vitest';
import { slugifyIdentifier } from './slugify.js';

describe('slugifyIdentifier', () => {
  it('lowercases nothing but replaces whitespace with underscores', () => {
    expect(slugifyIdentifier('Triage Agent', 'fallback')).toBe('Triage_Agent');
  });

  it('collapses a run of non-alphanumeric characters into one underscore', () => {
    expect(slugifyIdentifier('web---search & fetch!!', 'fallback')).toBe('web_search_fetch');
  });

  it('trims leading and trailing separators', () => {
    expect(slugifyIdentifier('  --hello--  ', 'fallback')).toBe('hello');
  });

  it('prefixes a leading digit so the result starts with a letter', () => {
    expect(slugifyIdentifier('123 agent', 'fallback')).toBe('a_123_agent');
  });

  it('falls back when nothing alphanumeric survives', () => {
    expect(slugifyIdentifier('!!!', 'fallback')).toBe('fallback');
    expect(slugifyIdentifier('', 'fallback')).toBe('fallback');
  });
});
