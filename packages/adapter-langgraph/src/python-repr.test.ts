import { describe, expect, it } from 'vitest';
import { pythonStringLiteral } from './python-repr.js';

describe('pythonStringLiteral', () => {
  it('single-quotes a plain string', () => {
    expect(pythonStringLiteral('search-registry')).toBe("'search-registry'");
  });

  it('does not escape embedded double quotes', () => {
    expect(pythonStringLiteral('Tool "search-registry" is not yet implemented.')).toBe(
      "'Tool \"search-registry\" is not yet implemented.'",
    );
  });

  it('prefers double quotes when the string contains a single quote but no double quote', () => {
    expect(pythonStringLiteral("it's fine")).toBe('"it\'s fine"');
  });

  it('escapes an embedded single quote when the string also contains a double quote', () => {
    expect(pythonStringLiteral('it\'s "fine"')).toBe('\'it\\\'s "fine"\'');
  });

  it('escapes backslashes and newlines', () => {
    expect(pythonStringLiteral('a\\b\nc')).toBe("'a\\\\b\\nc'");
  });
});
