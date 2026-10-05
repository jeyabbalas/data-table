import { describe, it, expect } from 'vitest';
import {
  DataTableError,
  WorkerInitError,
  WorkerTerminatedError,
  QueryError,
  LoadError,
  SQLValidationError,
  DerivedColumnError,
  PersistenceError,
  ExportError,
  ConfigurationError,
  DestroyedError,
  reconstructError,
} from '@/core/errors';
import type { ErrorPayload } from '@/worker/types';

describe('DataTableError classes', () => {
  it('base class sets name, code, and preserves message', () => {
    const err = new DataTableError('boom', { code: 'INVARIANT' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DataTableError);
    expect(err.name).toBe('DataTableError');
    expect(err.code).toBe('INVARIANT');
    expect(err.message).toBe('boom');
  });

  it('defaults code to UNKNOWN on the base class when omitted', () => {
    const err = new DataTableError('no code');
    expect(err.code).toBe('UNKNOWN');
  });

  it('wires Error.cause via the native options bag', () => {
    const root = new Error('root');
    const err = new LoadError('wrapped', { code: 'PARSE_FAILED', cause: root });
    expect(err.cause).toBe(root);
  });

  it('attaches details for structured logging', () => {
    const err = new DerivedColumnError('cycle', {
      code: 'CIRCULAR_DEPENDENCY',
      details: { cycle: ['a', 'b'] },
    });
    expect(err.details).toEqual({ cycle: ['a', 'b'] });
  });

  it('toJSON produces a stable, non-circular shape', () => {
    const root = new Error('root-cause');
    const err = new LoadError('outer', {
      code: 'PARSE_FAILED',
      cause: root,
      details: { file: 'x.csv' },
    });
    const json = err.toJSON();
    expect(json).toEqual({
      name: 'LoadError',
      code: 'PARSE_FAILED',
      message: 'outer',
      details: { file: 'x.csv' },
      cause: 'root-cause',
    });
    // round-trip JSON.stringify must not throw or produce circular refs
    const text = JSON.stringify(err);
    expect(text).toContain('"code":"PARSE_FAILED"');
    expect(text).toContain('"name":"LoadError"');
  });

  describe.each([
    ['WorkerInitError', WorkerInitError, 'WORKER_CRASHED'],
    ['WorkerTerminatedError', WorkerTerminatedError, 'WORKER_TERMINATED'],
    ['QueryError', QueryError, 'QUERY_RUNTIME'],
    ['LoadError', LoadError, 'PARSE_FAILED'],
    ['SQLValidationError', SQLValidationError, 'SQL_SYNTAX'],
    ['DerivedColumnError', DerivedColumnError, 'EXPRESSION_INVALID'],
    ['PersistenceError', PersistenceError, 'SAVE_FAILED'],
    ['ExportError', ExportError, 'EXPORT_FAILED'],
    ['ConfigurationError', ConfigurationError, 'INVARIANT'],
    ['DestroyedError', DestroyedError, 'DESTROYED'],
  ])('subclass %s', (name, Ctor, defaultCode) => {
    it('instanceof DataTableError and self', () => {
      const err = new Ctor('x');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(DataTableError);
      expect(err).toBeInstanceOf(Ctor);
      expect(err.name).toBe(name);
    });

    it(`defaults code to ${defaultCode} when omitted`, () => {
      const err = new Ctor('x');
      expect(err.code).toBe(defaultCode);
    });

    it('honours a caller-provided code', () => {
      const err = new Ctor('x', { code: 'SOMETHING_SPECIFIC' });
      expect(err.code).toBe('SOMETHING_SPECIFIC');
    });
  });
});

describe('reconstructError', () => {
  it('maps LOAD_* codes to LoadError', () => {
    const err = reconstructError({ code: 'LOAD_PARSE_FAILED', message: 'bad csv' });
    expect(err).toBeInstanceOf(LoadError);
    expect(err.code).toBe('LOAD_PARSE_FAILED');
    expect(err.message).toBe('bad csv');
  });

  it('maps QUERY_* codes to QueryError', () => {
    const err = reconstructError({ code: 'QUERY_SYNTAX', message: 'oops' });
    expect(err).toBeInstanceOf(QueryError);
  });

  it('maps WORKER_TERMINATED to WorkerTerminatedError (and other WORKER_* to WorkerInitError)', () => {
    expect(reconstructError({ code: 'WORKER_TERMINATED', message: 't' })).toBeInstanceOf(
      WorkerTerminatedError,
    );
    expect(reconstructError({ code: 'WORKER_CRASHED', message: 'c' })).toBeInstanceOf(
      WorkerInitError,
    );
  });

  it('maps SQL_* to SQLValidationError', () => {
    expect(reconstructError({ code: 'SQL_SYNTAX', message: 'bad' })).toBeInstanceOf(
      SQLValidationError,
    );
  });

  it('maps EXPORT / NO_TABLE_LOADED / CANVAS_UNAVAILABLE to ExportError', () => {
    expect(reconstructError({ code: 'NO_TABLE_LOADED', message: 'x' })).toBeInstanceOf(ExportError);
    expect(reconstructError({ code: 'EXPORT_FAILED', message: 'x' })).toBeInstanceOf(ExportError);
  });

  it('maps DESTROYED to DestroyedError', () => {
    expect(reconstructError({ code: 'DESTROYED', message: 'd' })).toBeInstanceOf(DestroyedError);
  });

  it('maps BRIDGE_NOT_READY / INVARIANT to ConfigurationError', () => {
    expect(reconstructError({ code: 'BRIDGE_NOT_READY', message: 'x' })).toBeInstanceOf(
      ConfigurationError,
    );
    expect(reconstructError({ code: 'INVARIANT', message: 'x' })).toBeInstanceOf(
      ConfigurationError,
    );
  });

  it('falls back to QueryError/QUERY_RUNTIME on missing code', () => {
    const err = reconstructError({ message: 'surprise' });
    expect(err).toBeInstanceOf(QueryError);
    expect(err.code).toBe('QUERY_RUNTIME');
  });

  it('preserves details from the payload', () => {
    const err = reconstructError({
      code: 'LOAD_PARSE_FAILED',
      message: 'bad',
      details: { file: 'a.csv' },
    });
    expect(err.details).toEqual({ file: 'a.csv' });
  });

  // The payload crossed an IPC boundary, so its fields can be any cloneable
  // value; reconstructError must still return an error, never throw.
  describe('payload fields of the wrong type', () => {
    it.each([
      ['a number', 25],
      ['an empty string', ''],
      ['an object', { code: 'LOAD_PARSE_FAILED' }],
      ['null', null],
    ])('a code that is %s counts as no code: QueryError/QUERY_RUNTIME', (_label, code) => {
      const err = reconstructError({ code, message: 'x' } as unknown as ErrorPayload);
      expect(err).toBeInstanceOf(QueryError);
      expect(err.code).toBe('QUERY_RUNTIME');
      expect(err.message).toBe('x');
    });

    it.each([
      ['a number', 42, '42'],
      ['undefined', undefined, ''],
      ['null', null, ''],
      ['an object', { a: 1 }, '[object Object]'],
      // Survives a structured clone, and String() of it throws.
      ['an object with no string form', { toString: 'x' }, '[object Object]'],
    ])('a message that is %s becomes a string', (_label, message, expected) => {
      const err = reconstructError({
        code: 'LOAD_PARSE_FAILED',
        message,
      } as unknown as ErrorPayload);
      expect(err).toBeInstanceOf(LoadError);
      expect(err.message).toBe(expected);
    });

    it('drops details that are not an object', () => {
      const err = reconstructError({
        code: 'LOAD_PARSE_FAILED',
        message: 'bad',
        details: 'a.csv',
      } as unknown as ErrorPayload);
      expect(err.details).toBeUndefined();
    });
  });
});
