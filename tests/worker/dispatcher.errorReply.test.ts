/**
 * Error replies carry a string code, whatever was thrown.
 *
 * The bridge maps a reply's `code` to an error class by its prefix. A
 * `DOMException` is an `Error` whose `code` is a legacy number: posting a
 * result that cannot be cloned throws one with code 25, and copying that
 * code into the reply left the bridge unable to read it, and the query
 * pending for good.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __resetDispatcherForTests,
  handleMessage,
  toErrorPayload,
  type Respond,
} from '@/worker/dispatcher';
import { executeQueryCancellable } from '@/worker/duckdb';
import type { WorkerMessage } from '@/worker/types';

vi.mock('@/worker/duckdb', () => ({
  initializeDuckDB: vi.fn(() => Promise.resolve()),
  executeQuery: vi.fn(() => Promise.resolve([])),
  executeQueryCancellable: vi.fn(() => Promise.resolve([])),
  getConnection: vi.fn(() => ({ cancelSent: vi.fn(() => Promise.resolve(true)) })),
  getDatabase: vi.fn(() => ({})),
  isInitialized: vi.fn(() => true),
}));

interface Reply {
  id: string;
  type: 'result' | 'error' | 'progress';
  payload: unknown;
}

/** A `respond` that clones each payload as `postMessage` does, and throws as it does. */
function postingRespond(): { respond: Respond; replies: Reply[] } {
  const replies: Reply[] = [];
  const respond: Respond = (id, type, payload) => {
    replies.push({ id, type, payload: structuredClone(payload) });
  };
  return { respond, replies };
}

describe('worker dispatcher — error replies', () => {
  beforeEach(() => {
    __resetDispatcherForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    __resetDispatcherForTests();
  });

  it('a query result that cannot be cloned gets an error reply with code QUERY_RUNTIME', async () => {
    // A row holding a function, as an Arrow list value copied field by field did.
    vi.mocked(executeQueryCancellable).mockResolvedValueOnce([{ tags: { get: () => 1 } }]);
    const { respond, replies } = postingRespond();

    await handleMessage(
      { id: 'q1', type: 'query', payload: { sql: 'SELECT tags FROM t' } } as WorkerMessage,
      respond,
    );

    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ id: 'q1', type: 'error' });
    const payload = replies[0]!.payload as { code: unknown; message: string };
    expect(payload.code).toBe('QUERY_RUNTIME');
    expect(payload.message).toMatch(/could not be cloned/);
  });
});

describe('toErrorPayload', () => {
  it('gives a DOMException the fallback code, not its numeric one', () => {
    const error = new DOMException('(index) => x could not be cloned.', 'DataCloneError');
    expect(error.code).toBe(25);
    expect(toErrorPayload(error, 'Unknown error', 'QUERY_RUNTIME')).toEqual({
      message: '(index) => x could not be cloned.',
      code: 'QUERY_RUNTIME',
    });
  });

  it('keeps a string code and the details a loader attached', () => {
    const error = Object.assign(new Error('too big'), {
      code: 'LOAD_MEMORY_EXCEEDED',
      details: { rows: 10 },
    });
    expect(toErrorPayload(error, 'Failed to load data', 'LOAD_PARSE_FAILED')).toEqual({
      message: 'too big',
      code: 'LOAD_MEMORY_EXCEEDED',
      details: { rows: 10 },
    });
  });

  it.each([
    ['a number', 25],
    ['an empty string', ''],
    ['an object', { name: 'X' }],
  ])('treats a code that is %s as no code', (_label, code) => {
    const error = Object.assign(new Error('boom'), { code });
    expect(toErrorPayload(error, 'Export failed', 'EXPORT_FAILED')).toEqual({
      message: 'boom',
      code: 'EXPORT_FAILED',
    });
    expect(toErrorPayload(error, 'Export failed')).toEqual({ message: 'boom' });
  });

  it('uses the fallback message and code for a value that is not an Error', () => {
    expect(toErrorPayload('nope', 'Unknown error', 'QUERY_RUNTIME')).toEqual({
      message: 'Unknown error',
      code: 'QUERY_RUNTIME',
    });
  });
});
