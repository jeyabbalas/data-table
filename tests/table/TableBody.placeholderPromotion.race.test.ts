/**
 * @vitest-environment jsdom
 *
 * Regression: placeholder→data row promotion leaves columns 1..N empty.
 *
 * `rowElementMap` can hold two structurally incompatible row shapes:
 * - data rows: `visibleColumns.length` cells, listeners attached
 * - placeholder rows: 1 cell carrying the loading label and
 *   `dt-cell--placeholder`, no listeners, marked `data-placeholder`
 *   (`createPlaceholderRow`)
 *
 * When the visible range expands faster than the row-data fetch (e.g. a
 * histogram brush slide flips `filteredRows` from 4 → 64 while a `LIMIT 4`
 * SELECT is still in flight), `renderVisibleRows` paints rows past the
 * cached range as placeholders — in the block pipeline this happens
 * SYNCHRONOUSLY on the range change, while the in-flight block fetch keeps
 * running (same-block dedupe means no duplicate query is issued). When the
 * short block lands, the reconciler in `fetchBlock`'s finally re-issues the
 * block against the live viewport; when THAT lands, the `else if (rowData)`
 * branch must replace each placeholder with a fresh pooled data row
 * (correct cell count + listeners). Updating a placeholder in place is the
 * historical bug: `updateRowContent`'s loop is bounded by
 * `min(columns, cells)`, so only column 0 of a 1-cell placeholder got
 * written — rows 5..N showed one column in tertiary text with empty space
 * to the right (the `bugs/rendering/` screenshots).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableBody } from '@/table/TableBody';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema, Filter } from '@/core/types';

import { makeRowFetchBridge, parseRowWindow } from '../helpers/rowFetchBridge';

class MockResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'tag', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Body harness with a controllable bridge.query queue and a forced
 * non-zero clientHeight so VirtualScroller produces a real visible range.
 * Mirrors `tests/table/TableBody.race.test.ts:setup` and shrinks the
 * row counts so the small→large expansion is easy to drive.
 */
function setup(initialRows = 4) {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const state: TableState = createTableState();
  state.tableName.set('t');
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(initialRows);
  state.filteredRows.set(initialRows);

  const { bridge, queries } = makeRowFetchBridge();
  const actions = new StateActions(state, bridge as unknown as Parameters<typeof StateActions>[1]);

  const body = new TableBody(
    container,
    state,
    bridge as unknown as Parameters<typeof TableBody>[2],
    actions,
  );

  // Force a non-empty visible range — JSDOM defaults clientHeight to 0.
  // 320 / 32 = 10 rows visible; with bufferRows=5 the end is +5.
  const scrollContainer = body.getVirtualScroller().getScrollContainer();
  Object.defineProperty(scrollContainer, 'clientHeight', {
    value: 320,
    configurable: true,
  });
  body.getVirtualScroller().setTotalRows(initialRows);

  return { body, state, bridge, queries, container };
}

/** Drain the microtask queue a few times so awaited promises resolve. */
async function drainMicrotasks(times = 3) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** Build a row payload row that mirrors what `bridge.query` returns
 *  for `SELECT __rowid__, id, tag FROM t [WHERE …]` window fetches. */
function payloadRow(index: number, tag: string) {
  return { __rowid__: index, id: index, tag };
}

describe('TableBody — placeholder→data row promotion (rowElementMap shape)', () => {
  it('reproduces the screenshot scenario: filteredRows expands mid-fetch, then the re-issued block promotes placeholders cleanly', async () => {
    const { body, state, queries } = setup(4);

    // 1. Initial unfiltered fetch (4 rows, range {0,4} clamped to totalRows).
    const initPromise = body.initialize();
    expect(queries.length).toBe(1);
    queries[0]!.deferred.resolve([
      payloadRow(0, 'A'),
      payloadRow(1, 'B'),
      payloadRow(2, 'C'),
      payloadRow(3, 'D'),
    ]);
    await initPromise;

    const rowElementMap = (body as unknown as { rowElementMap: Map<number, HTMLElement> })
      .rowElementMap;
    expect(rowElementMap.size).toBe(4);
    // Each row at this point is a full data row (2 visible cols).
    for (const [, rowEl] of rowElementMap) {
      expect(rowEl.children.length).toBe(2);
    }

    // 2. Apply a filter — TableBody's filter subscriber synchronously runs
    //    invalidateCacheAndRefresh: epoch bump, placeholders painted, and
    //    the filtered block fetch (LIMIT 4 — totalRows is still 4) issued.
    const filter: Filter = { type: 'point', column: 'tag', value: 'X' };
    state.filters.set([filter]);
    expect(queries.length).toBe(2); // post-filter SELECT in flight

    // 3. Mid-fetch: filteredRows expands to a much larger count — the
    //    coordinator's COUNT(*) lands and pushes the visible range from
    //    {0,4} to {0,15} synchronously. handleScroll renders IMMEDIATELY
    //    (rows 4..14 appear as placeholders right now, not after the
    //    fetch), and the reconciler issues nothing new: the missing rows
    //    belong to block 0, which is already in flight — block dedupe.
    state.filteredRows.set(64);

    const tb = body as unknown as { currentRange: { start: number; end: number } };
    expect(tb.currentRange.end).toBeGreaterThan(4);
    const expandedEnd = tb.currentRange.end;
    expect(queries.length).toBe(2); // no duplicate fetch for the same block
    let placeholdersAfterExpansion = 0;
    for (let i = 4; i < expandedEnd; i++) {
      const row = rowElementMap.get(i);
      expect(row, `row ${i} rendered synchronously`).toBeDefined();
      if (row && row.children.length === 1) placeholdersAfterExpansion++;
    }
    expect(placeholdersAfterExpansion).toBe(expandedEnd - 4);

    // 4. Resolve the in-flight LIMIT 4 SELECT. fetchBlock writes rows 0..3,
    //    re-renders (rows 0..3 promote to data rows, 4..14 remain
    //    placeholders — the exact screenshot shape), and its finally
    //    reconciles against the LIVE viewport: block 0 still has missing
    //    indices, so the block is re-issued with the widened limit.
    queries[1]!.deferred.resolve([
      payloadRow(0, 'X'),
      payloadRow(1, 'X'),
      payloadRow(2, 'X'),
      payloadRow(3, 'X'),
    ]);
    await drainMicrotasks(4);

    // 5. The placeholder→data race is now exactly reproduced in the DOM.
    expect(rowElementMap.size).toBeGreaterThanOrEqual(expandedEnd);
    let placeholdersBeforePromotion = 0;
    for (let i = 4; i < expandedEnd; i++) {
      const row = rowElementMap.get(i);
      expect(row).toBeDefined();
      if (row && row.children.length === 1) placeholdersBeforePromotion++;
    }
    expect(placeholdersBeforePromotion).toBeGreaterThan(0);

    // 6. Resolve the re-issued block fetch with its full requested window
    //    so renderVisibleRows runs again with the cache fully populated —
    //    this is where the placeholder→data promotion happens.
    expect(queries.length).toBe(3);
    const window2 = parseRowWindow(queries[2]!.sql);
    queries[2]!.deferred.resolve(
      Array.from({ length: window2.limit }, (_, i) => payloadRow(window2.offset + i, 'X')),
    );
    await drainMicrotasks(4);

    // 7. The fix: every row in rowElementMap now has visibleColumns.length
    //    cells. No 1-cell placeholders remain.
    for (const [idx, rowEl] of rowElementMap) {
      expect(rowEl.children.length, `row ${idx} cell count`).toBe(2);
      // Cell 0 (id) and cell 1 (tag) both populated — the second column
      // would have been blank under the bug.
      expect(rowEl.children[0]!.textContent).toBeTruthy();
      expect(rowEl.children[1]!.textContent).toBeTruthy();
      // No promoted cell should still wear the placeholder tertiary-text
      // class — the replacement uses a fresh row from the pool.
      expect(rowEl.children[0]!.classList.contains('dt-cell--placeholder')).toBe(false);
      expect(rowEl.children[1]!.classList.contains('dt-cell--placeholder')).toBe(false);
      // Loading-row class and the placeholder marker are also stripped.
      expect(rowEl.classList.contains('dt-row--loading')).toBe(false);
      expect(rowEl.hasAttribute('data-placeholder')).toBe(false);
    }

    body.destroy();
  });

  it('invariant: every row in rowElementMap has visibleColumns.length cells once cache is filled (filter + sort sequence)', async () => {
    const { body, state, queries } = setup(4);

    const initPromise = body.initialize();
    queries[0]!.deferred.resolve([
      payloadRow(0, 'A'),
      payloadRow(1, 'B'),
      payloadRow(2, 'C'),
      payloadRow(3, 'D'),
    ]);
    await initPromise;

    // Apply filter, expand range mid-fetch, then change sort while the
    // re-issued block fetch is still in flight. This stacks several
    // invalidateCacheAndRefresh cycles — each one a candidate for leaving
    // a placeholder behind.
    state.filters.set([{ type: 'point', column: 'tag', value: 'X' }]);
    state.filteredRows.set(20);
    // The short resolve leaves block 0 incomplete; the finally-reconcile
    // re-issues it (queries[2]) with the widened limit.
    queries[1]!.deferred.resolve([payloadRow(0, 'X'), payloadRow(1, 'X')]);
    await drainMicrotasks(2);

    // Sort change while the re-issued fetch (queries[2]) is in flight —
    // the invalidation aborts it (the bridge mirror rejects, silently
    // swallowed) and issues the sorted+filtered re-fetch.
    state.sortColumns.set([{ column: 'id', direction: 'desc' }]);
    await drainMicrotasks(2);

    // A late resolve on the aborted deferred is a no-op — belt and braces
    // for doubles that resolve after abort.
    if (queries[2]) queries[2]!.deferred.resolve([payloadRow(0, 'X')]);
    await drainMicrotasks(2);

    // Final fetch lands with full payload covering the visible range.
    expect(queries.length).toBe(4);
    const window3 = parseRowWindow(queries[3]!.sql);
    queries[3]!.deferred.resolve(
      Array.from({ length: window3.limit }, (_, i) => payloadRow(window3.offset + i, 'X')),
    );
    await drainMicrotasks(4);

    const rowElementMap = (body as unknown as { rowElementMap: Map<number, HTMLElement> })
      .rowElementMap;
    const visibleColumnCount = state.visibleColumns.get().length;
    for (const [idx, rowEl] of rowElementMap) {
      expect(rowEl.children.length, `row ${idx} cell count`).toBe(visibleColumnCount);
    }

    body.destroy();
  });

  it('rowPool stays clean: placeholder-shaped rows never enter the pool', async () => {
    const { body, state, queries } = setup(4);

    const initPromise = body.initialize();
    queries[0]!.deferred.resolve([
      payloadRow(0, 'A'),
      payloadRow(1, 'B'),
      payloadRow(2, 'C'),
      payloadRow(3, 'D'),
    ]);
    await initPromise;

    // Drive the bug-triggering sequence so placeholders end up in
    // rowElementMap, then invalidate again to send everything through
    // returnRowToPool.
    state.filters.set([{ type: 'point', column: 'tag', value: 'X' }]);
    state.filteredRows.set(64);
    queries[1]!.deferred.resolve([payloadRow(0, 'X'), payloadRow(1, 'X')]);
    await drainMicrotasks(3);

    // At this point rowElementMap holds a mix of data rows and placeholders.
    // Trigger another invalidation — this funnels every entry through
    // returnRowToPool, the place where placeholders must be filtered out.
    state.filters.set([{ type: 'point', column: 'tag', value: 'Y' }]);
    await drainMicrotasks(2);

    const rowPool = (body as unknown as { rowPool: HTMLElement[] }).rowPool;
    for (const pooled of rowPool) {
      expect(pooled.hasAttribute('data-placeholder'), 'placeholder row leaked into rowPool').toBe(
        false,
      );
      const firstCell = pooled.firstElementChild as HTMLElement | null;
      expect(
        firstCell?.classList.contains('dt-cell--placeholder') ?? false,
        'placeholder cell leaked into rowPool',
      ).toBe(false);
      // Defensive: pooled rows should be data-row shaped.
      expect(pooled.children.length).toBeGreaterThanOrEqual(1);
    }

    body.destroy();
  });

  it('promoted-from-placeholder rows have event listeners attached', async () => {
    const { body, state, queries } = setup(4);

    const initPromise = body.initialize();
    queries[0]!.deferred.resolve([
      payloadRow(0, 'A'),
      payloadRow(1, 'B'),
      payloadRow(2, 'C'),
      payloadRow(3, 'D'),
    ]);
    await initPromise;

    state.filters.set([{ type: 'point', column: 'tag', value: 'X' }]);
    state.filteredRows.set(20);
    queries[1]!.deferred.resolve([payloadRow(0, 'X'), payloadRow(1, 'X')]);
    await drainMicrotasks(3);

    // The finally-reconcile re-issued block 0 for the widened range;
    // resolve it in full so every placeholder promotes.
    expect(queries.length).toBe(3);
    const window2 = parseRowWindow(queries[2]!.sql);
    queries[2]!.deferred.resolve(
      Array.from({ length: window2.limit }, (_, i) => payloadRow(window2.offset + i, 'X')),
    );
    await drainMicrotasks(4);

    const rowElementMap = (body as unknown as { rowElementMap: Map<number, HTMLElement> })
      .rowElementMap;
    // Pick a row that was originally a placeholder (index >= 4 came from
    // the placeholder branch) and verify the hover signal flows.
    const promoted = rowElementMap.get(8);
    expect(promoted).toBeDefined();
    expect(promoted!.children.length).toBe(2);

    promoted!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    // mouseenter handler calls actions.setHoveredRow(index). Read the
    // resulting state — proves the listener was attached during the
    // placeholder→data replacement, not lost.
    expect(state.hoveredRow.get()).toBe(8);

    body.destroy();
  });
});
