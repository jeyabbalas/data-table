/**
 * @vitest-environment jsdom
 *
 * M8 — the __rowid__ range fast path and its density safety valve.
 *
 * With no filters and no user sort, positional index ≡ __rowid__ (loaders
 * materialize it densely as row_number()-1 and the derived VIEW preserves
 * it), so `WHERE "__rowid__" >= s AND "__rowid__" < e` returns exactly
 * the OFFSET window as a zonemap-prunable scan — constant-ish cost at any
 * scroll depth, where `LIMIT n OFFSET k` is a top-(k+n) sort that grows
 * with depth. Sorted/filtered fetches keep LIMIT/OFFSET.
 *
 * The valve: if a fast-path result ever violates the density premise
 * (short window, out-of-range rowid), the fast path is disabled for the
 * instance with a single console.warn and THAT block is re-issued via
 * OFFSET — a violated premise becomes slow-but-correct, never wrong rows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { parseLimitOffset, parseRowidRange, rowAt, rowsFor } from '../helpers/rowFetchBridge';
import { HARNESS_COLUMNS, MockResizeObserver, setupTableBody } from '../helpers/tableBodyHarness';

const BLOCK = 16;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TableBody — __rowid__ range fast path (M8)', () => {
  it('no sort, no filter → range predicate, explicit ORDER BY, defensive LIMIT, no OFFSET', async () => {
    const { body, queries } = setupTableBody({
      totalRows: 10_000,
      body: { fetchBlockSize: BLOCK, prefetch: false },
    });

    const initPromise = body.initialize();
    expect(queries.length).toBe(1);
    const sql = queries[0]!.sql;

    expect(sql).toContain('WHERE "__rowid__" >= 0 AND "__rowid__" < 16');
    expect(sql).toContain('ORDER BY "__rowid__" ASC');
    expect(sql).toContain('LIMIT 16'); // defensive cap
    expect(sql).not.toMatch(/OFFSET/i);

    queries[0]!.deferred.resolve(rowsFor(sql, HARNESS_COLUMNS));
    await initPromise;
    body.destroy();
  });

  it('a user sort forces the OFFSET path with the tiebreaker', async () => {
    const { body, state, queries } = setupTableBody({
      totalRows: 10_000,
      body: { fetchBlockSize: BLOCK, prefetch: false },
    });
    state.sortColumns.set([{ column: 'tag', direction: 'asc' }]);

    const initPromise = body.initialize();
    const sql = queries[0]!.sql;

    expect(sql).toContain('ORDER BY "tag" ASC, "__rowid__" ASC');
    expect(parseLimitOffset(sql)).toEqual({ limit: 16, offset: 0 });
    expect(sql).not.toContain('"__rowid__" >=');

    queries[0]!.deferred.resolve(rowsFor(sql, HARNESS_COLUMNS));
    await initPromise;
    body.destroy();
  });

  it('a filter forces the OFFSET path with the WHERE clause intact', async () => {
    const { body, state, queries } = setupTableBody({
      totalRows: 10_000,
      body: { fetchBlockSize: BLOCK, prefetch: false },
    });
    state.filters.set([{ type: 'point', column: 'tag', value: 'A' }]);

    const initPromise = body.initialize();
    const sql = queries[0]!.sql;

    expect(sql).toContain(`WHERE "tag" = 'A'`);
    expect(sql).toContain('ORDER BY "__rowid__" ASC');
    expect(parseLimitOffset(sql)).toEqual({ limit: 16, offset: 0 });
    expect(sql).not.toContain('"__rowid__" >=');

    queries[0]!.deferred.resolve(rowsFor(sql, HARNESS_COLUMNS));
    await initPromise;
    body.destroy();
  });

  it('a short fast-path result trips the valve: one warn, one OFFSET re-issue of the same block, fast path off thereafter', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { body, queries, scrollToRow, drain } = setupTableBody({
      totalRows: 10_000,
      body: { fetchBlockSize: BLOCK, prefetch: false },
    });

    const initPromise = body.initialize();
    expect(queries.length).toBe(1);
    expect(parseRowidRange(queries[0]!.sql)).toEqual({ start: 0, end: 16 });

    // Violate the density premise: 3 rows for a 16-row window.
    queries[0]!.deferred.resolve([
      rowAt(0, HARNESS_COLUMNS),
      rowAt(1, HARNESS_COLUMNS),
      rowAt(2, HARNESS_COLUMNS),
    ]);
    await drain();

    // Exactly one warn, and exactly one re-issue — same block, OFFSET form.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(queries.length).toBe(2);
    const reissued = queries[1]!.sql;
    expect(parseLimitOffset(reissued)).toEqual({ limit: 16, offset: 0 });
    expect(reissued).not.toContain('"__rowid__" >=');

    // Nothing from the violating result reached the cache.
    const cache = (body as unknown as { rowDataCache: Map<number, unknown> }).rowDataCache;
    expect(cache.size).toBe(0);

    queries[1]!.deferred.resolve(rowsFor(reissued, HARNESS_COLUMNS));
    await initPromise; // the re-issue is awaited inside the same block fetch

    // Every subsequent fetch uses OFFSET — the fast path stays off.
    scrollToRow(1000);
    const next = queries[queries.length - 1]!.sql;
    expect(next).toMatch(/LIMIT \d+ OFFSET \d+/);
    expect(next).not.toContain('"__rowid__" >=');
    expect(warnSpy).toHaveBeenCalledTimes(1); // still just the one warn

    body.destroy();
  });

  it('an out-of-window rowid trips the valve even when the row count matches', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { body, queries, drain } = setupTableBody({
      totalRows: 10_000,
      body: { fetchBlockSize: BLOCK, prefetch: false },
    });

    const initPromise = body.initialize();

    // 16 rows, but shifted out of the requested [0, 16) window.
    queries[0]!.deferred.resolve(
      Array.from({ length: BLOCK }, (_, i) => rowAt(1000 + i, HARNESS_COLUMNS)),
    );
    await drain();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(queries.length).toBe(2);
    expect(parseLimitOffset(queries[1]!.sql)).toEqual({ limit: 16, offset: 0 });

    // Neither the shifted keys nor the window keys were polluted.
    const cache = (body as unknown as { rowDataCache: Map<number, unknown> }).rowDataCache;
    expect(cache.size).toBe(0);

    queries[1]!.deferred.resolve(rowsFor(queries[1]!.sql, HARNESS_COLUMNS));
    await initPromise;
    body.destroy();
  });
});
