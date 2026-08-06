/**
 * @vitest-environment jsdom
 *
 * Direction-aware prefetch: when the pipeline is fully idle (no missing
 * visible blocks, nothing in flight), TableBody speculatively fetches
 * the single next block in the last scroll direction at 'normal' worker
 * priority — visible fetches always jump ahead of it in the worker's
 * priority queue. Prefetched rows land in the cache only; the DOM is
 * untouched until the viewport actually reaches them.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { parseRowWindow, rowsFor } from '../helpers/rowFetchBridge';
import {
  HARNESS_COLUMNS,
  MockResizeObserver,
  setupTableBody,
  type TableBodyHarness,
} from '../helpers/tableBodyHarness';

const BLOCK = 16;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function initialized(harness: TableBodyHarness): Promise<void> {
  const initPromise = harness.body.initialize();
  expect(harness.queries.length).toBeGreaterThanOrEqual(1);
  harness.queries[0]!.deferred.resolve(rowsFor(harness.queries[0]!.sql, HARNESS_COLUMNS));
  await initPromise;
}

describe('TableBody — direction-aware prefetch', () => {
  it('going idle prefetches exactly one adjacent block at normal priority, cache-only', async () => {
    const harness = setupTableBody({
      totalRows: 10_000,
      body: { fetchBlockSize: BLOCK },
    });
    const { body, queries, drain } = harness;
    await initialized(harness);
    await drain();

    // Idle after init: exactly one speculative fetch for the next block
    // down (direction defaults to 1), at normal priority.
    expect(queries.length).toBe(2);
    const prefetchQuery = queries[1]!;
    expect(prefetchQuery.options?.priority).toBe('normal');
    const prefetchWindow = parseRowWindow(prefetchQuery.sql);
    expect(prefetchWindow.offset).toBe(BLOCK); // block adjacent to {0..15}

    const rowElementMap = (body as unknown as { rowElementMap: Map<number, HTMLElement> })
      .rowElementMap;
    const domSizeBefore = rowElementMap.size;

    prefetchQuery.deferred.resolve(rowsFor(prefetchQuery.sql, HARNESS_COLUMNS));
    await drain();

    // Rows landed in cache without touching the DOM…
    const cache = (body as unknown as { rowDataCache: Map<number, unknown> }).rowDataCache;
    expect(cache.has(BLOCK)).toBe(true);
    expect(rowElementMap.size).toBe(domSizeBefore);
    for (const index of rowElementMap.keys()) {
      expect(index).toBeLessThan(BLOCK + 1); // still the initial range only
    }

    // …and the candidate is the SINGLE adjacent block: once it is cached,
    // the pipeline stays idle instead of chaining further speculation.
    await drain(8);
    expect(queries.length).toBe(2);

    body.destroy();
  });

  it('a direction flip aborts the now-wrong-way prefetch', async () => {
    const harness = setupTableBody({
      totalRows: 10_000,
      body: { fetchBlockSize: BLOCK },
    });
    const { body, queries, scrollToRow, drain } = harness;
    await initialized(harness);
    await drain();

    // Idle prefetch for block 16 (downward).
    expect(queries.length).toBe(2);
    const downwardPrefetch = queries[1]!;
    expect(downwardPrefetch.options?.priority).toBe('normal');

    // Scroll DOWN into blocks 16/32 territory first so the flip is real…
    scrollToRow(40); // range {35..55} → needs blocks 32 and 48
    for (const q of queries) {
      if (q.signal?.aborted !== true) q.deferred.resolve(rowsFor(q.sql, HARNESS_COLUMNS));
    }
    await drain();

    // …idle again → prefetch block 64 (still downward).
    const speculative = queries[queries.length - 1]!;
    expect(speculative.options?.priority).toBe('normal');
    expect(parseRowWindow(speculative.sql).offset).toBe(64);

    // Flip: scroll upward. The downward prefetch is now pointing the
    // wrong way — aborted, not awaited.
    scrollToRow(20);
    expect(speculative.signal?.aborted).toBe(true);

    body.destroy();
  });

  it('prefetch: false disables speculation entirely', async () => {
    const harness = setupTableBody({
      totalRows: 10_000,
      body: { fetchBlockSize: BLOCK, prefetch: false },
    });
    const { body, queries, drain } = harness;
    await initialized(harness);
    await drain(8);

    expect(queries.length).toBe(1); // the initial block fetch, nothing else

    body.destroy();
  });

  it('a prefetched block landing into an at-cap cache does not evict itself into a refetch loop', async () => {
    // Livelock regression pin (deviation from the phase spec's bare
    // distance metric): the direction-ahead block is genuinely the most
    // distant cached block the moment it lands, so metric-only eviction
    // would drop it, the finally-reconcile would re-prefetch it, forever.
    // evictDistantBlocks exempts the just-written block; the cycle must
    // converge by evicting the trailing block instead.
    const harness = setupTableBody({
      totalRows: 10_000,
      body: { fetchBlockSize: BLOCK, rowCacheRows: 4 * BLOCK },
    });
    const { body, queries, scrollToRow, drain } = harness;
    await initialized(harness);

    // Fill the cache to exactly the 4-block cap: blocks 0, 16, 32, 48.
    scrollToRow(20); // range {15..35} → blocks 0 (15), 16, 32
    for (const q of queries) {
      if (q.signal?.aborted !== true) q.deferred.resolve(rowsFor(q.sql, HARNESS_COLUMNS));
    }
    await drain();
    scrollToRow(40); // range {35..55} → block 48
    for (const q of queries) {
      if (q.signal?.aborted !== true) q.deferred.resolve(rowsFor(q.sql, HARNESS_COLUMNS));
    }
    await drain();

    const cache = (body as unknown as { rowDataCache: Map<number, unknown> }).rowDataCache;
    expect(cache.size).toBe(4 * BLOCK); // at cap

    // Idle → prefetch block 64; resolving it pushes the cache over cap.
    const prefetchQuery = queries[queries.length - 1]!;
    expect(prefetchQuery.options?.priority).toBe('normal');
    expect(parseRowWindow(prefetchQuery.sql).offset).toBe(64);
    const queriesBefore = queries.length;
    prefetchQuery.deferred.resolve(rowsFor(prefetchQuery.sql, HARNESS_COLUMNS));
    await drain(10);

    // Converged: the just-written block survived, the trailing block was
    // evicted, and — critically — NO new query was issued (no loop).
    expect(cache.has(64)).toBe(true);
    expect(cache.has(0)).toBe(false);
    expect(cache.size).toBeLessThanOrEqual(4 * BLOCK + BLOCK);
    expect(queries.length).toBe(queriesBefore);

    // And it stays quiet.
    await drain(10);
    expect(queries.length).toBe(queriesBefore);

    body.destroy();
  });
});
