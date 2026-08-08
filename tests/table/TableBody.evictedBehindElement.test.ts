/**
 * @vitest-environment jsdom
 *
 * M6 — a rendered data row whose cache entry has vanished must not keep
 * its stale pixels. The old `renderVisibleRows` had no branch for
 * "element exists, cache entry missing": the loop fell straight through
 * to styling and the stale content persisted at that position
 * indefinitely. Combined with M5's visible-row eviction this was one of
 * the two ways stale cells survived at rest.
 *
 * The rewrite adds the demotion branch: such an element is recycled and
 * replaced with a placeholder until its block is re-fetched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { rowsFor } from '../helpers/rowFetchBridge';
import { bodyCells, isPlaceholder, rowElements } from '../helpers/tableBodyDom';
import { HARNESS_COLUMNS, MockResizeObserver, setupTableBody } from '../helpers/tableBodyHarness';

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TableBody — evicted cache entry behind a live element demotes to placeholder (M6)', () => {
  it('deleting a cached row behind a rendered data row yields a placeholder on the next render', async () => {
    const { body, queries } = setupTableBody({ totalRows: 100, body: { prefetch: false } });

    const initPromise = body.initialize();
    queries[0]!.deferred.resolve(rowsFor(queries[0]!.sql, HARNESS_COLUMNS));
    await initPromise;

    const internal = body as unknown as {
      rowDataCache: Map<number, unknown>;
      renderVisibleRows(): void;
    };

    const victim = 3;
    const before = rowElements(body).get(victim)!;
    expect(isPlaceholder(before)).toBe(false);
    expect(before.children.length).toBe(HARNESS_COLUMNS.length);
    expect(bodyCells(before)).toHaveLength(HARNESS_COLUMNS.length);

    // Simulate the eviction/invalidation race: the cache entry disappears
    // while the element stays mapped and painted.
    internal.rowDataCache.delete(victim);
    internal.renderVisibleRows();

    const after = rowElements(body).get(victim)!;
    expect(after).not.toBe(before);
    expect(isPlaceholder(after)).toBe(true);
    expect(after.getAttribute('aria-busy')).toBe('true');
    expect(after.children.length).toBe(1);
    expect(bodyCells(after)).toHaveLength(1);
    expect(Number(after.getAttribute('data-row-index'))).toBe(victim);
    // The stale element is out of the DOM entirely.
    expect(before.isConnected).toBe(false);

    // Neighbours with intact cache entries are untouched.
    const neighbour = rowElements(body).get(victim + 1)!;
    expect(isPlaceholder(neighbour)).toBe(false);
    expect(neighbour.children.length).toBe(HARNESS_COLUMNS.length);
    expect(bodyCells(neighbour)).toHaveLength(HARNESS_COLUMNS.length);

    // DOM order/coverage invariant still holds with the demoted row.
    expect(body.__verifyDomOrderForTests()).toBe(true);

    body.destroy();
  });
});
