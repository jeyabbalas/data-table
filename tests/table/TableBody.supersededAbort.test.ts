/**
 * @vitest-environment jsdom
 *
 * M3 — superseded fetches are aborted, not serialized behind. The old
 * pipeline never passed an AbortSignal: a query for a range the user had
 * already scrolled past ran to completion on the worker, and the fetch
 * for the range actually on screen queued behind it. Deep-offset queries
 * take hundreds of ms, so the visible range starved exactly when
 * latency was worst.
 *
 * Now every block fetch carries its own AbortController; when the
 * reconciler sees an in-flight block that no longer intersects the
 * padded viewport it aborts it and issues the needed block immediately.
 * The bridge mirror rejects aborted calls with QUERY_ABORTED, which the
 * pipeline swallows silently.
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

describe('TableBody — superseded block fetches abort immediately (M3)', () => {
  it('scrolling A→B aborts A, issues B without waiting, and swallows A silently', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const harness = setupTableBody({ totalRows: 10_000, body: { prefetch: false } });
    const { body, queries, scrollToRow, drain } = harness;
    await initialized(harness);

    // Park fetch A for an uncached range.
    scrollToRow(1000);
    expect(queries.length).toBe(2);
    const queryA = queries[1]!;
    expect(queryA.options?.priority).toBe('high');
    expect(queryA.options?.cache).toBe(false);
    const windowA = parseRowWindow(queryA.sql);

    // Jump to a disjoint range while A is still pending.
    scrollToRow(5000);

    // A's signal aborted; B issued synchronously — NOT after A resolves.
    expect(queryA.signal?.aborted).toBe(true);
    expect(queries.length).toBe(3);
    const queryB = queries[2]!;
    expect(queryB.signal?.aborted).toBe(false);
    const windowB = parseRowWindow(queryB.sql);
    expect(windowB.offset).toBeGreaterThan(4000);

    // Resolve B → the DOM shows B's rows, each data-row-id matching its
    // data-row-index (rowsFor synthesizes __rowid__ ≡ index).
    queryB.deferred.resolve(rowsFor(queryB.sql, HARNESS_COLUMNS));
    await drain();

    expect(body.__verifyDomOrderForTests()).toBe(true);
    const range = body.getVisibleRange();
    const rowElementMap = (body as unknown as { rowElementMap: Map<number, HTMLElement> })
      .rowElementMap;
    for (let i = range.start; i < range.end; i++) {
      const rowEl = rowElementMap.get(i)!;
      expect(rowEl.hasAttribute('data-placeholder'), `row ${i} promoted`).toBe(false);
      expect(rowEl.getAttribute('data-row-id')).toBe(String(i));
    }

    // A's rejection (QUERY_ABORTED via the bridge mirror) was silent and
    // wrote nothing: A's window never reached the cache.
    const cache = (body as unknown as { rowDataCache: Map<number, unknown> }).rowDataCache;
    expect(cache.has(windowA.offset)).toBe(false);
    expect(errorSpy).not.toHaveBeenCalled();

    body.destroy();
  });

  it('a genuine query failure still reaches console.error (only aborts are silent)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { body, queries, drain } = setupTableBody({
      totalRows: 100,
      body: { prefetch: false },
    });

    const initPromise = body.initialize();
    expect(queries.length).toBe(1);

    queries[0]!.deferred.reject(new Error('worker exploded'));
    await drain();

    expect(errorSpy).toHaveBeenCalledWith('Error fetching rows:', expect.any(Error));

    body.destroy();
    await initPromise.catch(() => {});
  });
});
