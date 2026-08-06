/**
 * @vitest-environment jsdom
 *
 * M5 — eviction is keyed to the LIVE viewport, at whole-block granularity.
 * The old `evictDistantRows` measured distance from the *fetched* range,
 * so a fetch that resolved late could evict rows the user was currently
 * looking at, re-triggering fetch churn. It also evicted row-by-row,
 * leaving partially-populated windows that made every subsequent
 * missing-row scan re-fetch a whole window.
 *
 * `evictDistantBlocks` measures distance from `currentRange`, drops whole
 * blocks only, and never touches blocks intersecting the viewport.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { rowsFor } from '../helpers/rowFetchBridge';
import { HARNESS_COLUMNS, MockResizeObserver, setupTableBody } from '../helpers/tableBodyHarness';

const BLOCK = 16;
const CACHE_ROWS = 64; // 4 blocks — the floor

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TableBody — whole-block eviction by live-viewport distance (M5)', () => {
  it('a long downward walk keeps only whole blocks nearest the live range; every visible index stays cached', async () => {
    const { body, queries, scrollToRow, drain } = setupTableBody({
      totalRows: 10_000,
      body: { fetchBlockSize: BLOCK, rowCacheRows: CACHE_ROWS, prefetch: false },
    });

    const initPromise = body.initialize();
    queries[0]!.deferred.resolve(rowsFor(queries[0]!.sql, HARNESS_COLUMNS));
    await initPromise;

    // Walk down in steps, resolving every fetch as it appears, far enough
    // that early blocks MUST be evicted (cap is 64 rows; the walk caches
    // hundreds).
    for (let row = 20; row <= 400; row += 20) {
      scrollToRow(row);
      // Resolve everything currently unsettled (aborted deferreds reject
      // on their own; resolving them afterwards is a no-op).
      for (const q of queries) {
        q.deferred.resolve(rowsFor(q.sql, HARNESS_COLUMNS));
      }
      await drain();
    }

    const cache = (body as unknown as { rowDataCache: Map<number, unknown> }).rowDataCache;
    const range = body.getVisibleRange();

    // 1. Bounded: at most the cap, plus one block of just-written slack.
    expect(cache.size).toBeLessThanOrEqual(CACHE_ROWS + BLOCK);

    // 2. Every visible index retains its data — the live viewport is
    //    never evicted.
    for (let i = range.start; i < range.end; i++) {
      expect(cache.has(i), `visible row ${i} still cached`).toBe(true);
    }

    // 3. Survivors are WHOLE blocks (no partially-evicted stragglers that
    //    would re-trigger block fetches forever).
    const survivingBlocks = new Set<number>();
    for (const index of cache.keys()) {
      survivingBlocks.add(Math.floor(index / BLOCK) * BLOCK);
    }
    for (const blockStart of survivingBlocks) {
      for (let i = blockStart; i < blockStart + BLOCK; i++) {
        expect(cache.has(i), `block ${blockStart} fully populated at ${i}`).toBe(true);
      }
    }

    // 4. Survivors are the blocks nearest the live range: everything the
    //    walk cached near the top is long gone.
    expect(cache.has(0)).toBe(false);
    expect(cache.has(100)).toBe(false);
    const maxSurvivorDistance = Math.max(
      ...[...survivingBlocks].map((b) =>
        Math.min(Math.abs(b - range.start), Math.abs(b + BLOCK - range.end)),
      ),
    );
    expect(maxSurvivorDistance).toBeLessThanOrEqual(CACHE_ROWS + BLOCK);

    body.destroy();
  });

  it('a late-resolving fetch for a distant block cannot evict the visible rows', async () => {
    // The regression at the heart of M5: the OLD code evicted by distance
    // from the *fetch's own* range, so a stale fetch landing far away
    // treated the visible rows as "distant" and dropped them.
    const { body, queries, scrollToRow, drain } = setupTableBody({
      totalRows: 10_000,
      body: { fetchBlockSize: BLOCK, rowCacheRows: CACHE_ROWS, prefetch: false },
      bridge: { rejectOnAbort: false }, // superseded fetch stays pending
    });

    const initPromise = body.initialize();
    queries[0]!.deferred.resolve(rowsFor(queries[0]!.sql, HARNESS_COLUMNS));
    await initPromise;

    // Head for a far range; park its fetch (slow query).
    scrollToRow(5000);
    const parked = queries.filter((q) => !q.signal?.aborted && q !== queries[0]);

    // Return to the top; the parked far-block queries are aborted (but
    // still pending — sloppy double), and the top blocks re-fetch.
    scrollToRow(0);
    for (const q of queries) {
      if (q.signal?.aborted !== true) {
        q.deferred.resolve(rowsFor(q.sql, HARNESS_COLUMNS));
      }
    }
    await drain();

    const range = body.getVisibleRange();
    const cache = (body as unknown as { rowDataCache: Map<number, unknown> }).rowDataCache;
    for (let i = range.start; i < range.end; i++) {
      expect(cache.has(i), `visible row ${i} cached before stale resolve`).toBe(true);
    }

    // NOW the parked far-away fetches "land". Their rows are dropped by
    // the aborted-signal guard — and even if they weren't, eviction runs
    // against the LIVE range, so the visible rows must survive.
    for (const q of parked) {
      q.deferred.resolve(rowsFor(q.sql, HARNESS_COLUMNS));
    }
    await drain();

    for (let i = range.start; i < range.end; i++) {
      expect(cache.has(i), `visible row ${i} survives the stale resolve`).toBe(true);
    }
    const rowElementMap = (body as unknown as { rowElementMap: Map<number, HTMLElement> })
      .rowElementMap;
    for (const [index, rowEl] of rowElementMap) {
      expect(rowEl.hasAttribute('data-placeholder'), `row ${index} still a data row`).toBe(false);
    }

    body.destroy();
  });
});
