/**
 * @vitest-environment jsdom
 *
 * M1 — the primary flicker mechanism: the old pipeline skipped rendering
 * while a fetch was in flight (`handleScroll` stored the new range in the
 * single-slot `pendingFetch` and returned), so rows fetched for the OLD
 * range stayed painted at the NEW scroll offset until the slow fetch
 * resolved — wrong data at screen positions.
 *
 * The rewrite renders on EVERY range change, synchronously, before any
 * fetch bookkeeping: missing rows appear as placeholders in the same
 * frame the viewport moves. This suite completes initialization, parks a
 * scroll fetch on an unresolved deferred, moves again, and asserts the
 * DOM is already correct with NOTHING further resolved — no drains, no
 * fetch completion.
 *
 * Prefetch is disabled: these tests assert exact query counts, and the
 * speculative fetch is covered by its own suite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { rowsFor } from '../helpers/rowFetchBridge';
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

describe('TableBody — render is never skipped while a fetch is in flight (M1)', () => {
  it('a disjoint jump paints placeholders synchronously, with the previous fetch still parked', async () => {
    const harness = setupTableBody({ totalRows: 10_000, body: { prefetch: false } });
    const { body, queries, scrollToRow } = harness;
    await initialized(harness);

    // Park a fetch: scroll to an uncached range and leave its block
    // query unresolved.
    scrollToRow(1000);
    expect(queries.length).toBe(2);

    // Jump again while that fetch is in flight. Everything below is
    // asserted SYNCHRONOUSLY — nothing has resolved, no microtasks ran.
    scrollToRow(2000);

    const range = body.getVisibleRange();
    expect(range.start).toBeGreaterThan(1900); // sanity: we really moved

    const rowElementMap = (body as unknown as { rowElementMap: Map<number, HTMLElement> })
      .rowElementMap;

    // rowElementMap keys are exactly the new range…
    const keys = [...rowElementMap.keys()].sort((a, b) => a - b);
    const expected = Array.from({ length: range.end - range.start }, (_, i) => range.start + i);
    expect(keys).toEqual(expected);

    // …every one of them a placeholder (marker + aria-busy)…
    for (const [index, rowEl] of rowElementMap) {
      expect(rowEl.hasAttribute('data-placeholder'), `row ${index} is a placeholder`).toBe(true);
      expect(rowEl.getAttribute('aria-busy')).toBe('true');
      expect(Number(rowEl.getAttribute('data-row-index'))).toBe(index);
    }

    // …and the viewport carries no element with an out-of-range index, in
    // strictly ascending order (the DOM invariant hook checks both).
    expect(body.__verifyDomOrderForTests()).toBe(true);

    // The parked fetch was superseded (disjoint) and the new block was
    // requested without waiting for it.
    expect(queries[1]!.signal?.aborted).toBe(true);
    expect(queries.length).toBe(3);

    body.destroy();
  });

  it('an in-block move mid-fetch renders placeholders synchronously and issues no duplicate query', async () => {
    const harness = setupTableBody({ totalRows: 10_000, body: { prefetch: false } });
    const { body, queries, scrollToRow } = harness;
    await initialized(harness);

    // Range {295..315} sits inside block 256 (256..383): one parked fetch.
    scrollToRow(300);
    expect(queries.length).toBe(2);

    // Nudge within the same block while the fetch is in flight.
    scrollToRow(302);

    const range = body.getVisibleRange();
    const rowElementMap = (body as unknown as { rowElementMap: Map<number, HTMLElement> })
      .rowElementMap;
    expect(rowElementMap.size).toBe(range.end - range.start);
    for (const [index, rowEl] of rowElementMap) {
      expect(rowEl.hasAttribute('data-placeholder'), `row ${index} is a placeholder`).toBe(true);
    }
    expect(body.__verifyDomOrderForTests()).toBe(true);

    // Block dedupe: the nudged range still belongs to block 256, whose
    // fetch is in flight — no duplicate query, and it was NOT aborted.
    expect(queries.length).toBe(2);
    expect(queries[1]!.signal?.aborted).toBe(false);

    body.destroy();
  });
});
