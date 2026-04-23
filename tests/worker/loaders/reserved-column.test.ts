import { describe, it, expect } from 'vitest';
import {
  makeReservedColumnError,
  wrapReservedColumnError,
} from '@/worker/loaders/common';

describe('Reserved __rowid__ column error helpers', () => {
  describe('makeReservedColumnError', () => {
    it('returns an Error tagged with LOAD_RESERVED_COLUMN_NAME', () => {
      const err = makeReservedColumnError() as Error & {
        code?: string;
        details?: unknown;
      };
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe('LOAD_RESERVED_COLUMN_NAME');
      expect(err.details).toEqual({ sourceColumn: '__rowid__' });
      // Message must tell the user exactly what to do (rename and reload).
      expect(err.message).toMatch(/__rowid__/);
      expect(err.message).toMatch(/rename/i);
    });
  });

  describe('wrapReservedColumnError', () => {
    it('rewraps DuckDB duplicate-column errors that mention __rowid__', () => {
      const err = new Error(
        'Binder Error: Duplicate column name "__rowid__" in CREATE TABLE',
      );
      const wrapped = wrapReservedColumnError(err) as Error & { code?: string };
      expect(wrapped.code).toBe('LOAD_RESERVED_COLUMN_NAME');
    });

    it('handles alternative DuckDB phrasings like "duplicate alias"', () => {
      const err = new Error(
        'Binder Error: duplicate alias "__rowid__" in subquery',
      );
      const wrapped = wrapReservedColumnError(err) as Error & { code?: string };
      expect(wrapped.code).toBe('LOAD_RESERVED_COLUMN_NAME');
    });

    it('passes through unrelated errors unchanged', () => {
      const err = new Error('Parser Error: syntax error at or near "FROM"');
      const wrapped = wrapReservedColumnError(err) as Error & { code?: string };
      expect(wrapped.code).toBeUndefined();
      expect(wrapped.message).toContain('syntax error');
    });

    it('passes through duplicate errors that do not mention __rowid__', () => {
      const err = new Error('Duplicate column "name" in CREATE TABLE');
      const wrapped = wrapReservedColumnError(err) as Error & { code?: string };
      expect(wrapped.code).toBeUndefined();
    });

    it('normalizes non-Error inputs to Error', () => {
      const wrapped = wrapReservedColumnError('bare string') as Error;
      expect(wrapped).toBeInstanceOf(Error);
      expect(wrapped.message).toBe('bare string');
    });
  });
});
