/**
 * @vitest-environment jsdom
 *
 * M2 — no stored range is ever replayed. The old pipeline's
 * `fetchAndRender` finally-block replayed the single-slot `pendingFetch`
 * (a range stored at whatever moment a scroll was swallowed) and even
 * fabricated an offsetY for it — so after a burst of scrolls the
 * viewport could snap back to an intermediate, stale range.
 *
 * The rewrite keeps no stored ranges at all: reconciliation always reads
 * `currentRange`, which only ever holds the scroller's live value. After
 * any interleaving of scrolls and fetch completions, TableBody's range
 * must equal the scroller's, and the rendered rows must belong to it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { parseRowWindow, rowsFor } from '../helpers/rowFetchBridge';
import {
  HARNESS_COLUMNS,
  MockResizeObserver,
  setupTableBody,
  type TableBodyHarness,
} from '../helpers/tableBodyHarness';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function initialized(harness: TableBodyHarness): Promise<void> {
  const initPromise = harness.body.initialize();
  expect(harness.queries.length).toBe(1);
  harness.queries[0]!.deferred.resolve(rowsFor(harness.queries[0]!.sql, HARNESS_COLUMNS));
  await initPromise;
}

describe('TableBody — a stale range is never restored (M2)', () => {
  it('after R1→R2→R3 with fetches resolving in issue order, the body tracks R3 exactly', async () => {
    const harness = setupTableBody({ totalRows: 10_000, body: { prefetch: false } });
    const { body, queries, scrollToRow, drain } = harness;
    await initialized(harness);

    // Three scroll positions in quick succession, nothing resolved yet.
    scrollToRow(1000); // R1
    scrollToRow(3000); // R2
    scrollToRow(6000); // R3

    const scrollerRange = body.getVirtualScroller().getVisibleRange();

    // Resolve every captured query in ISSUE order. Aborted ones (R1/R2
    // blocks superseded along the way) were already rejected by the bridge
    // mirror — resolving a settled deferred is a no-op, exactly like a
    // worker response arriving after its request was cancelled.
    for (const q of queries) {
      q.deferred.resolve(rowsFor(q.sql, HARNESS_COLUMNS));
      await drain(2);
    }
    await drain();

    // The body's range is the scroller's LIVE range (R3) — not R1, not R2,
    // not anything a finally-block replayed.
    expect(body.getVisibleRange()).toEqual(body.getVirtualScroller().getVisibleRange());
    expect(body.getVisibleRange().start).toBe(scrollerRange.start);
    expect(body.getVisibleRange().end).toBe(scrollerRange.end);

    // And the DOM agrees: exact coverage, every data row carrying the
    // __rowid__ that belongs at its index.
    expect(body.__verifyDomOrderForTests()).toBe(true);
    const rowElementMap = (body as unknown as { rowElementMap: Map<number, HTMLElement> })
      .rowElementMap;
    for (const [index, rowEl] of rowElementMap) {
      expect(rowEl.hasAttribute('data-placeholder'), `row ${index} has data`).toBe(false);
      expect(rowEl.getAttribute('data-row-id')).toBe(String(index));
    }

    body.destroy();
  });

  it('a late slow resolve for an old range cannot move the viewport back', async () => {
    // Emulate a double that resolves after abort — the strongest version
    // of the stale-fetch threat: the superseded query stays pending and
    // "lands" long after the user left.
    const harness = setupTableBody({
      totalRows: 10_000,
      body: { prefetch: false },
      bridge: { rejectOnAbort: false },
    });
    const { body, queries, scrollToRow, drain } = harness;
    await initialized(harness);

    scrollToRow(1000); // fetch A parked
    expect(queries.length).toBe(2);
    const queryA = queries[1]!;
    const windowA = parseRowWindow(queryA.sql);

    scrollToRow(4000); // A superseded (aborted but still pending), B issued
    expect(queryA.signal?.aborted).toBe(true);
    expect(queries.length).toBe(3);
    queries[2]!.deferred.resolve(rowsFor(queries[2]!.sql, HARNESS_COLUMNS));
    await drain();

    const rangeAtB = { ...body.getVisibleRange() };
    const queriesAtB = queries.length;

    // The old range-A query resolves LAST — long after the user left.
    queryA.deferred.resolve(rowsFor(queryA.sql, HARNESS_COLUMNS));
    await drain();

    // Nothing moved, nothing re-rendered for the old range, no new fetch
    // was spawned on behalf of the stale resolve.
    expect(body.getVisibleRange()).toEqual(rangeAtB);
    expect(queries.length).toBe(queriesAtB);
    const cache = (body as unknown as { rowDataCache: Map<number, unknown> }).rowDataCache;
    expect(cache.has(windowA.offset)).toBe(false); // dropped by the aborted-signal guard

    body.destroy();
  });
});
