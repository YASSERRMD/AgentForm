import { describe, expect, it } from 'vitest';
import { StateLockError, StateMigrationError } from './errors.js';

describe('StateLockError', () => {
  it('carries the holder that currently owns the lock', () => {
    const holder = { holder: 'pid1@host', acquiredAt: '2026-01-01T00:00:00.000Z' };
    const error = new StateLockError('locked', holder);
    expect(error.name).toBe('StateLockError');
    expect(error.holder).toBe(holder);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('StateMigrationError', () => {
  it('is a named Error subclass', () => {
    const error = new StateMigrationError('cannot downgrade schema');
    expect(error.name).toBe('StateMigrationError');
    expect(error.message).toBe('cannot downgrade schema');
    expect(error).toBeInstanceOf(Error);
  });
});
