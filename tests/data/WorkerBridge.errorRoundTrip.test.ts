/**
 * Phase 4: error round-trip across the worker boundary.
 *
 * For every documented error class, push an `ErrorPayload` with the
 * canonical code from the mock worker and assert the bridge surfaces a
 * typed instance with `code`, `details`, and `message` preserved.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

import {
  AnnotationError,
  ConfigurationError,
  DerivedColumnError,
  DestroyedError,
  ExportError,
  LoadError,
  PersistenceError,
  QueryError,
  SQLValidationError,
  WorkerInitError,
  WorkerTerminatedError,
  type DataTableError,
} from '@/core/errors';
import { WorkerBridge } from '@/data/WorkerBridge';

import { createMockWorker, type MockWorkerHandle } from '../helpers/mockWorker';

interface RoundTripCase {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  expectInstanceOf: new (...args: unknown[]) => DataTableError;
}

const CASES: RoundTripCase[] = [
  // Worker layer
  { code: 'WORKER_INIT_TIMEOUT', message: 'init timed out', expectInstanceOf: WorkerInitError },
  { code: 'WORKER_CRASHED', message: 'worker crashed', expectInstanceOf: WorkerInitError },
  {
    code: 'WORKER_TERMINATED',
    message: 'worker terminated',
    expectInstanceOf: WorkerTerminatedError,
  },
  // Query layer
  { code: 'QUERY_RUNTIME', message: 'syntax error', expectInstanceOf: QueryError },
  { code: 'QUERY_ABORTED', message: 'aborted', expectInstanceOf: QueryError },
  { code: 'QUERY_CANCELLED', message: 'cancelled', expectInstanceOf: QueryError },
  // Load layer
  {
    code: 'LOAD_PARSE_FAILED',
    message: 'parse failed',
    details: { tableName: 't', stage: 'timestamp' },
    expectInstanceOf: LoadError,
  },
  {
    code: 'LOAD_RESERVED_COLUMN_NAME',
    message: 'reserved name',
    expectInstanceOf: LoadError,
  },
  // SQL validation
  { code: 'SQL_SYNTAX', message: 'bad SQL', expectInstanceOf: SQLValidationError },
  // Derived columns
  {
    code: 'DERIVED_VECTOR_TYPE_MISMATCH',
    message: 'wrong vector type',
    details: { name: 'tip_pct' },
    expectInstanceOf: DerivedColumnError,
  },
  {
    code: 'EXPRESSION_INVALID',
    message: 'expr invalid',
    expectInstanceOf: DerivedColumnError,
  },
  // Persistence
  {
    code: 'PERSISTENCE_QUOTA_EXCEEDED',
    message: 'quota exceeded',
    expectInstanceOf: PersistenceError,
  },
  { code: 'IDB_TX_FAILED', message: 'idb failed', expectInstanceOf: PersistenceError },
  // Annotations
  {
    code: 'ANNOTATION_NOT_FOUND',
    message: 'no such annotation',
    expectInstanceOf: AnnotationError,
  },
  // Export
  { code: 'EXPORT_FAILED', message: 'export failed', expectInstanceOf: ExportError },
  // Configuration
  { code: 'BRIDGE_NOT_READY', message: 'not ready', expectInstanceOf: ConfigurationError },
  { code: 'INVARIANT', message: 'invariant', expectInstanceOf: ConfigurationError },
  // Destroyed
  { code: 'DESTROYED', message: 'destroyed', expectInstanceOf: DestroyedError },
];

describe('WorkerBridge — error round-trip per subclass', () => {
  let mock: MockWorkerHandle;
  let bridge: WorkerBridge;

  beforeEach(async () => {
    mock = createMockWorker();
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();
  });

  for (const c of CASES) {
    it(`code=${c.code} → ${c.expectInstanceOf.name}`, async () => {
      // Use NON-cacheable SQL (UPDATE) so the bridge actually dispatches each call
      // — SELECTs are cached and would shortcut on the second invocation.
      const queryPromise = bridge.query(`UPDATE t SET x=1 -- ${c.code}`);
      await mock.waitForPosts(2);
      const queryPosted = mock.posted.find((m) => m.type === 'query');
      mock.sendFromWorker({
        id: queryPosted!.id,
        type: 'error',
        payload: { message: c.message, code: c.code, ...(c.details ? { details: c.details } : {}) },
      });
      await expect(queryPromise).rejects.toBeInstanceOf(c.expectInstanceOf);
      try {
        await queryPromise;
      } catch (err) {
        const e = err as DataTableError;
        expect(e.code).toBe(c.code);
        expect(e.message).toBe(c.message);
        if (c.details) {
          expect(e.details).toEqual(c.details);
        }
      }
    });
  }
});

describe('WorkerBridge — error round-trip preserves rich details', () => {
  let mock: MockWorkerHandle;
  let bridge: WorkerBridge;

  beforeEach(async () => {
    mock = createMockWorker();
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();
  });

  it('BigInt-valued details survive structured-clone (postMessage natively supports BigInt)', async () => {
    const queryPromise = bridge.query('UPDATE t SET y=1 -- bigint');
    await mock.waitForPosts(2);
    const queryPosted = mock.posted.find((m) => m.type === 'query');
    const bigVal = 9007199254740993n; // > Number.MAX_SAFE_INTEGER
    mock.sendFromWorker({
      id: queryPosted!.id,
      type: 'error',
      payload: {
        message: 'rowid out of range',
        code: 'INVALID_ROWID',
        details: { rowid: bigVal, count: 100n },
      },
    });
    try {
      await queryPromise;
      throw new Error('should have rejected');
    } catch (err) {
      const e = err as DataTableError;
      expect(e.code).toBe('INVALID_ROWID');
      expect(e.details?.['rowid']).toBe(bigVal);
      expect(e.details?.['count']).toBe(100n);
    }
  });

  it('an error payload with no code defaults to QueryError(QUERY_RUNTIME)', async () => {
    const queryPromise = bridge.query('UPDATE t SET z=1 -- no-code');
    await mock.waitForPosts(2);
    const queryPosted = mock.posted.find((m) => m.type === 'query');
    mock.sendFromWorker({
      id: queryPosted!.id,
      type: 'error',
      payload: { message: 'unknown error' },
    });
    try {
      await queryPromise;
      throw new Error('should have rejected');
    } catch (err) {
      const e = err as DataTableError;
      expect(e).toBeInstanceOf(QueryError);
      expect(e.code).toBe('QUERY_RUNTIME');
      expect(e.message).toBe('unknown error');
    }
  });
});

describe('WorkerBridge — every error reply settles its request', () => {
  let mock: MockWorkerHandle;
  let bridge: WorkerBridge;

  beforeEach(async () => {
    mock = createMockWorker();
    bridge = new WorkerBridge({ workerFactory: () => mock.worker });
    await bridge.initialize();
  });

  /** Post a query, answer it with an error reply carrying `payload`, and return its rejection. */
  async function rejectionFor(payload: unknown): Promise<DataTableError> {
    const posts = mock.posted.length;
    const queryPromise = bridge.query('UPDATE t SET w=1');
    await mock.waitForPosts(posts + 1);
    const queryPosted = mock.posted[posts]!;
    expect(queryPosted.type).toBe('query');
    mock.sendFromWorker({ id: queryPosted.id, type: 'error', payload });
    return queryPromise.then(
      () => {
        throw new Error('should have rejected');
      },
      (err: DataTableError) => err,
    );
  }

  it("a numeric code (a DOMException's) rejects with QueryError(QUERY_RUNTIME)", async () => {
    // What the worker sent when a result could not be cloned: the
    // DataCloneError's legacy code, 25. The query used to stay pending.
    const err = await rejectionFor({
      code: 25,
      message: '(index) => isChunkedValid(unchunkedData, index) could not be cloned.',
    });
    expect(err).toBeInstanceOf(QueryError);
    expect(err.code).toBe('QUERY_RUNTIME');
    expect(err.message).toMatch(/could not be cloned/);
  });

  it('a message that is not a string becomes one', async () => {
    const err = await rejectionFor({ code: 'QUERY_RUNTIME', message: 42 });
    expect(err).toBeInstanceOf(QueryError);
    expect(err.message).toBe('42');
  });

  it('a payload that cannot be read rejects with WORKER_PROTOCOL_VIOLATION', async () => {
    const payload = {
      message: 'unreadable',
      get code(): string {
        throw new Error('getter threw');
      },
    };
    const err = await rejectionFor(payload);
    expect(err).toBeInstanceOf(WorkerInitError);
    expect(err.code).toBe('WORKER_PROTOCOL_VIOLATION');
    expect((err.cause as Error).message).toBe('getter threw');
  });
});
