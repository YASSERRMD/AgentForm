import { describe, expect, it } from 'vitest';
import { defineDiagnosticCodes } from './codes.js';

describe('defineDiagnosticCodes', () => {
  it('returns the table unchanged when every code is unique', () => {
    const table = defineDiagnosticCodes({
      MISSING_FIELD: { code: 'AGF2001', summary: 'A required field is missing.' },
      INVALID_TYPE: { code: 'AGF2002', summary: 'A field has the wrong type.' },
    });

    expect(table.MISSING_FIELD.code).toBe('AGF2001');
    expect(table.INVALID_TYPE.code).toBe('AGF2002');
  });

  it('throws at definition time when two entries share a code', () => {
    expect(() =>
      defineDiagnosticCodes({
        A: { code: 'AGF2001', summary: 'first' },
        B: { code: 'AGF2001', summary: 'second' },
      }),
    ).toThrow(/Duplicate diagnostic code "AGF2001"/);
  });
});
