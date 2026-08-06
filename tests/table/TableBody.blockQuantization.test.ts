/**
 * @vitest-environment jsdom
 *
 * Block quantization: row fetches are aligned to `fetchBlockSize`
 * windows. Scrolling anywhere inside cached blocks costs zero queries;
 * crossing into an uncached block issues exactly one block-aligned
 * fetch. This is what collapses the old per-scroll re-fetch storm (every
 * 1-row shift re-queried the whole visible window) into at most one
 * query per block boundary.
 *
 * A user sort is pinned so the SQL keeps the LIMIT/OFFSET shape on every
 * commit (the unsorted fast-path shape is covered by the fastPathSql
 * suite); block alignment itself is path-independent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { parseLimitOffset, rowsFor } from '../helpers/rowFetchBridge';
import { HARNESS_COLUMNS, MockResizeObserver, setupTableBody } from '../helpers/tableBodyHarness';

const BLOCK = 16;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TableBody — block-quantized fetching', () => {
  it('in-block scrolling is query-free; a boundary cross issues exactly one aligned fetch', async () => {
    const { body, state, queries, scrollToRow, drain } = setupTableBody({
      totalRows: 10_000,
      body: { fetchBlockSize: BLOCK, prefetch: false },
    });
    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);

    // Initial range {0..15} sits inside block 0: one aligned fetch.
    const initPromise = body.initialize();
    expect(queries.length).toBe(1);
    const window0 = parseLimitOffset(queries[0]!.sql);
    expect(window0.offset).toBe(0);
    expect(window0.limit).toBeLessThanOrEqual(BLOCK);
    queries[0]!.deferred.resolve(rowsFor(queries[0]!.sql, HARNESS_COLUMNS));
    await initPromise;

    // Scroll within the cached block: range {0..16} ⊂ block 0 → zero queries.
    scrollToRow(1);
    expect(queries.length).toBe(1);

    // Cross into block 16: range {1..21} → exactly one new fetch, aligned.
    scrollToRow(6);
    expect(queries.length).toBe(2);
    const window1 = parseLimitOffset(queries[1]!.sql);
    expect(window1.offset).toBe(16);
    expect(window1.offset % BLOCK).toBe(0);
    expect(window1.limit).toBeLessThanOrEqual(BLOCK);
    queries[1]!.deferred.resolve(rowsFor(queries[1]!.sql, HARNESS_COLUMNS));
    await drain();

    // Both blocks now cached: moving across them again is query-free.
    scrollToRow(8);
    scrollToRow(3);
    scrollToRow(10);
    expect(queries.length).toBe(2);

    body.destroy();
  });

  it('a jump spanning several uncached blocks fetches each missing block once, top-first, capped at two in flight', async () => {
    const { body, state, queries, scrollToRow, drain } = setupTableBody({
      totalRows: 10_000,
      body: { fetchBlockSize: BLOCK, prefetch: false },
    });
    state.sortColumns.set([{ column: 'id', direction: 'asc' }]);

    const initPromise = body.initialize();
    queries[0]!.deferred.resolve(rowsFor(queries[0]!.sql, HARNESS_COLUMNS));
    await initPromise;

    // Range {995..1015} spans blocks 992 and 1008 — two uncached blocks.
    scrollToRow(1000);
    const range = body.getVisibleRange();
    expect(range.start).toBe(995);
    expect(range.end).toBe(1015);

    // Both issued immediately (the in-flight cap is 2), top block first.
    expect(queries.length).toBe(3);
    const offsets = [queries[1]!, queries[2]!].map((q) => parseLimitOffset(q.sql).offset);
    expect(offsets).toEqual([992, 1008]);

    // Each resolves and promotes; no block is ever requested twice.
    queries[1]!.deferred.resolve(rowsFor(queries[1]!.sql, HARNESS_COLUMNS));
    queries[2]!.deferred.resolve(rowsFor(queries[2]!.sql, HARNESS_COLUMNS));
    await drain();
    expect(queries.length).toBe(3);
    expect(body.__verifyDomOrderForTests()).toBe(true);

    body.destroy();
  });
});
