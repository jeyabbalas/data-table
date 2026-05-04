/**
 * @vitest-environment jsdom
 *
 * Regression: placeholder→data row promotion leaves columns 1..N empty.
 *
 * `rowElementMap` can hold two structurally incompatible row shapes:
 * - data rows: `visibleColumns.length` cells, listeners attached
 * - placeholder rows: 1 cell carrying the loading label and
 *   `dt-cell--placeholder`, no listeners (`createPlaceholderRow`)
 *
 * When the visible range expands faster than the row-data fetch (e.g. a
 * histogram brush slide flips `filteredRows` from 4 → 64 while a `LIMIT 4`
 * SELECT is still in flight), `renderVisibleRows` paints rows past the
 * cached range as placeholders. When the trailing `pendingFetch` later
 * lands, the `else if (rowData)` branch in `renderVisibleRows` saw the
 * placeholder in the map and called `updateRowContent` IN PLACE — and that
 * loop is bounded by `min(columns, cells)`, so only column 0 of each
 * placeholder got written. Result: rows 5..N showed only `species` in
 * tertiary text colour with empty space to the right (the `bugs/rendering/`
 * screenshots).
 *
 * Fixed by detecting cell-count mismatch on the existing rowEl and
 * replacing it with a fresh data row (correct cell count + listeners +
 * pool-managed). Mirrors the seq-guard idiom used by neighbour fixes
 * (`969462b` TableBody.race, `cfef7cb` Histogram.staleGuard) — same shape,
 * different invariant.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableBody } from '@/table/TableBody';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema, Filter } from '@/core/types';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

  const queryQueue: Deferred<unknown[]>[] = [];
  const calls: string[] = [];
  const bridge = {
    query: vi.fn((sql: string) => {
      calls.push(sql);
      const d = deferred<unknown[]>();
      queryQueue.push(d);
      return d.promise;
    }),
    isInitialized: vi.fn().mockReturnValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
    loadData: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
    clearQueryCache: vi.fn(),
  };
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

  return { body, state, bridge, queryQueue, calls, container };
}

/** Drain the microtask queue a few times so awaited promises resolve. */
async function drainMicrotasks(times = 3) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** Build a row payload row that mirrors what `bridge.query` returns
 *  for `SELECT __rowid__, id, tag FROM t [WHERE …] LIMIT N OFFSET M`. */
function payloadRow(index: number, tag: string) {
  return { __rowid__: index, id: index, tag };
}

describe('TableBody — placeholder→data row promotion (rowElementMap shape)', () => {
  it('reproduces the screenshot scenario: filteredRows expands mid-fetch, then pendingFetch promotes placeholders cleanly', async () => {
    const { body, state, queryQueue } = setup(4);

    // 1. Initial unfiltered fetch (4 rows, range {0,4} clamped to totalRows).
    const initPromise = body.initialize();
    expect(queryQueue.length).toBe(1);
    queryQueue[0]!.resolve([
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

    // 2. Apply a filter — TableBody filter subscriber synchronously calls
    //    invalidateCacheAndRefresh + handleScroll(currentRange={0,4}).
    //    fetchRows kicks off LIMIT 4 OFFSET 0 against the new WHERE.
    const filter: Filter = { type: 'point', column: 'tag', value: 'X' };
    state.filters.set([filter]);
    expect(queryQueue.length).toBe(2); // post-filter SELECT in flight

    // 3. Mid-fetch: filteredRows expands to a much larger count. This is the
    //    bug-triggering signal — coordinator's COUNT(*) lands and pushes the
    //    visible range from {0,4} to {0,15} synchronously.
    state.filteredRows.set(64);

    // currentRange must have widened (the onScroll callback fired
    // synchronously up to its await, queueing a pendingFetch).
    const tb = body as unknown as {
      currentRange: { start: number; end: number };
      pendingFetch: { start: number; end: number } | null;
    };
    expect(tb.currentRange.end).toBeGreaterThan(4);
    expect(tb.pendingFetch).not.toBeNull();
    const expandedEnd = tb.currentRange.end;

    // 4. Resolve the in-flight LIMIT 4 SELECT. fetchAndRender runs
    //    renderVisibleRows with currentRange={0,15}: rows 0..3 are data
    //    rows from cache; rows 4..14 fall through createPlaceholderRow.
    queryQueue[1]!.resolve([
      payloadRow(0, 'X'),
      payloadRow(1, 'X'),
      payloadRow(2, 'X'),
      payloadRow(3, 'X'),
    ]);
    await drainMicrotasks(4);

    // 5. The placeholder→data race is now exactly reproduced in the DOM.
    //    Confirm the bug shape: rows >= 4 are 1-cell placeholders, sitting
    //    in rowElementMap waiting for the pendingFetch to land.
    expect(rowElementMap.size).toBeGreaterThanOrEqual(expandedEnd);
    let placeholdersBeforePromotion = 0;
    for (let i = 4; i < expandedEnd; i++) {
      const row = rowElementMap.get(i);
      expect(row).toBeDefined();
      if (row && row.children.length === 1) placeholdersBeforePromotion++;
    }
    expect(placeholdersBeforePromotion).toBeGreaterThan(0);

    // 6. The pendingFetch was queued in fetchAndRender's finally; that path
    //    fires its own SELECT for the wider range. Resolve it with a full
    //    payload so renderVisibleRows runs again with cache fully populated
    //    — this is where the placeholder→data promotion happens.
    expect(queryQueue.length).toBe(3);
    const wideRows = Array.from({ length: expandedEnd }, (_, i) => payloadRow(i, 'X'));
    queryQueue[2]!.resolve(wideRows);
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
      // Loading-row class is also stripped.
      expect(rowEl.classList.contains('dt-row--loading')).toBe(false);
    }

    body.destroy();
  });

  it('invariant: every row in rowElementMap has visibleColumns.length cells once cache is filled (filter + sort sequence)', async () => {
    const { body, state, queryQueue } = setup(4);

    const initPromise = body.initialize();
    queryQueue[0]!.resolve([
      payloadRow(0, 'A'),
      payloadRow(1, 'B'),
      payloadRow(2, 'C'),
      payloadRow(3, 'D'),
    ]);
    await initPromise;

    // Apply filter, expand range mid-fetch, then change sort while the
    // pendingFetch is still in flight. This stacks several
    // invalidateCacheAndRefresh cycles — each one a candidate for leaving
    // a placeholder behind.
    state.filters.set([{ type: 'point', column: 'tag', value: 'X' }]);
    state.filteredRows.set(20);
    queryQueue[1]!.resolve([payloadRow(0, 'X'), payloadRow(1, 'X')]);
    await drainMicrotasks(2);

    // Sort change while pending fetch (queryQueue[2]) is in flight.
    state.sortColumns.set([{ column: 'id', direction: 'desc' }]);
    await drainMicrotasks(2);

    // queryQueue[2] is now stale (sortColumns invalidated); resolving it
    // is dropped by the seq guard. Then queryQueue[3] is the sorted+filtered
    // re-fetch.
    if (queryQueue[2]) queryQueue[2]!.resolve([payloadRow(0, 'X')]);
    await drainMicrotasks(2);

    // Final fetch lands with full payload covering the visible range.
    if (queryQueue[3]) {
      const finalRows = Array.from({ length: 15 }, (_, i) => payloadRow(i, 'X'));
      queryQueue[3]!.resolve(finalRows);
    }
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
    const { body, state, queryQueue } = setup(4);

    const initPromise = body.initialize();
    queryQueue[0]!.resolve([
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
    queryQueue[1]!.resolve([payloadRow(0, 'X'), payloadRow(1, 'X')]);
    await drainMicrotasks(3);

    // At this point rowElementMap holds a mix of data rows and placeholders.
    // Trigger another invalidation — this funnels every entry through
    // returnRowToPool, the place where placeholders must be filtered out.
    state.filters.set([{ type: 'point', column: 'tag', value: 'Y' }]);
    await drainMicrotasks(2);

    const rowPool = (body as unknown as { rowPool: HTMLElement[] }).rowPool;
    for (const pooled of rowPool) {
      const firstCell = pooled.firstElementChild as HTMLElement | null;
      expect(
        firstCell?.classList.contains('dt-cell--placeholder') ?? false,
        'placeholder row leaked into rowPool',
      ).toBe(false);
      // Defensive: pooled rows should be data-row shaped.
      expect(pooled.children.length).toBeGreaterThanOrEqual(1);
    }

    body.destroy();
  });

  it('promoted-from-placeholder rows have event listeners attached', async () => {
    const { body, state, actions, queryQueue } = (() => {
      const harness = setup(4);
      const a = new StateActions(
        harness.state,
        harness.bridge as unknown as Parameters<typeof StateActions>[1],
      );
      return { ...harness, actions: a };
    })();
    void actions; // listener wiring goes through body's own actions

    const initPromise = body.initialize();
    queryQueue[0]!.resolve([
      payloadRow(0, 'A'),
      payloadRow(1, 'B'),
      payloadRow(2, 'C'),
      payloadRow(3, 'D'),
    ]);
    await initPromise;

    state.filters.set([{ type: 'point', column: 'tag', value: 'X' }]);
    state.filteredRows.set(20);
    queryQueue[1]!.resolve([payloadRow(0, 'X'), payloadRow(1, 'X')]);
    await drainMicrotasks(3);

    if (queryQueue[2]) {
      const rows = Array.from({ length: 15 }, (_, i) => payloadRow(i, 'X'));
      queryQueue[2]!.resolve(rows);
    }
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
