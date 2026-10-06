/**
 * Phase 2: cancellable pending-query execution.
 *
 * `conn.query()` is one blocking, uninterruptible call; `conn.send()` polls the
 * pending query in slices, so `cancelSent()` rejects the next poll with
 * 'query was canceled'. These tests exercise the real '@/worker/duckdb' module
 * with a stub connection injected via `__setConnForTests` (no vi.mock).
 */
import { describe, it, expect, afterEach } from 'vitest';

import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { executeQueryCancellable, __setConnForTests, type ResultBatch } from '@/worker/duckdb';
import { isCancelRejection } from '@/worker/dispatcher';

/**
 * Stands in for the Arrow RecordBatchStreamReader from `conn.send()`: `open()`
 * reads the schema (no dictionary-encoded fields here), then the batches.
 */
function asReader(batches: AsyncGenerator<ResultBatch>) {
  return Object.assign(batches, {
    schema: { fields: [] as { type: { typeId: number } }[] },
    open: async function (this: unknown) {
      return this;
    },
  });
}

/** A record batch of rows, read column by column as `convertBatch` reads one. */
function batchOf(rows: Record<string, unknown>[]): ResultBatch {
  const names = Object.keys(rows[0] ?? {});
  return {
    numRows: rows.length,
    schema: { fields: names.map((name) => ({ name })) },
    getChildAt: (index) => ({ get: (row) => rows[row]?.[names[index]!] }),
  };
}

/** A reader over rows, batch by batch. */
function makeReader(batches: Record<string, unknown>[][]) {
  return asReader(
    (async function* () {
      for (const rows of batches) {
        yield batchOf(rows);
      }
    })(),
  );
}

/** Awaits a promise expected to reject and returns the captured rejection. */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected promise to reject, but it resolved.');
}

describe('executeQueryCancellable', () => {
  afterEach(() => __setConnForTests(null));

  it('materializes rows across batches identically to executeQuery semantics', async () => {
    const sent: string[] = [];
    const conn = {
      send: async (sql: string) => {
        sent.push(sql);
        return makeReader([
          [
            { id: 1n, name: 'a', score: 2.5 },
            { id: 2n, name: 'b', score: null },
          ],
          [{ id: 9007199254740991n, name: 'c', score: 0 }],
        ]);
      },
    } as unknown as AsyncDuckDBConnection;
    __setConnForTests(conn);

    const rows = await executeQueryCancellable('SELECT * FROM t');

    expect(rows).toEqual([
      { id: 1, name: 'a', score: 2.5 },
      { id: 2, name: 'b', score: null },
      { id: 9007199254740991, name: 'c', score: 0 },
    ]);
    expect(sent).toEqual(['SELECT * FROM t']);
  });

  it('send() rejection with the real cancel string is recognized', async () => {
    const conn = {
      send: () => Promise.reject(new Error('query was canceled')),
    } as unknown as AsyncDuckDBConnection;
    __setConnForTests(conn);

    await expect(executeQueryCancellable('SELECT 1')).rejects.toThrow('query was canceled');

    const err = await rejectionOf(executeQueryCancellable('SELECT 1'));
    expect(isCancelRejection(err)).toBe(true);
  });

  it('mid-iteration rejection with a cancel-shaped message is recognized', async () => {
    const conn = {
      send: async () =>
        asReader(
          (async function* () {
            yield batchOf([{ id: 1n, name: 'a' }]);
            throw new Error('query was canceled');
          })(),
        ),
    } as unknown as AsyncDuckDBConnection;
    __setConnForTests(conn);

    const err = await rejectionOf(executeQueryCancellable('SELECT * FROM big'));
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('query was canceled');
    expect(isCancelRejection(err)).toBe(true);
  });

  it("post-cancel race string 'no active pending query' is recognized by isCancelRejection", () => {
    expect(isCancelRejection(new Error('No active pending query'))).toBe(true);
    expect(isCancelRejection(new Error('no active pending query'))).toBe(true);
    expect(isCancelRejection(new Error('some other failure'))).toBe(false);
  });

  it('detached worker (send resolves undefined) throws a non-cancel runtime error', async () => {
    const conn = {
      send: async () => undefined,
    } as unknown as AsyncDuckDBConnection;
    __setConnForTests(conn);

    const err = await rejectionOf(executeQueryCancellable('SELECT 1'));
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('DuckDB worker is detached; cannot execute query.');
    expect(isCancelRejection(err)).toBe(false);
  });

  it('throws BRIDGE_NOT_READY-coded error when no connection', async () => {
    __setConnForTests(null);

    const err = await rejectionOf(executeQueryCancellable('SELECT 1'));
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/not initialized/i);
    expect((err as { code?: string }).code).toBe('BRIDGE_NOT_READY');
  });
});
