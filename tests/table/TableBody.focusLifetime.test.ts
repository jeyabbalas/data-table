/**
 * @vitest-environment jsdom
 *
 * Regression: virtualization strands real DOM focus on `<body>` and the whole
 * keyboard layer goes dead.
 *
 * Body cells are permanently `tabindex="-1"` — the cursor is normally
 * published via `aria-activedescendant` rather than by moving focus. But a
 * *click* still lands real focus on the clicked cell, and that cell lives in a
 * pooled row. The moment scrolling recycles that row (or a refresh, a
 * cell-count mismatch, or `destroy()` detaches it), the browser drops focus to
 * `<body>` — and because `KeyboardNavigator` listens on `.dt-root`, keydowns
 * aimed at `<body>` never reach it. Arrows do nothing until the user tabs back
 * in. Confirmed in a real browser.
 *
 * The fix is one helper called at all five removal sites. It is deliberately
 * narrow: focus moves only when the element being detached actually holds it,
 * because in every other case the removal would not have disturbed focus at
 * all — and relocating focus a user did not ask for is as hostile as trapping
 * Tab, which is the bug this whole effort exists to avoid.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableBody } from '@/table/TableBody';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';

import {
  SPACERS_PER_ROW,
  bodyCells,
  newRowSized,
  rowElements,
  rowPool,
} from '../helpers/tableBodyDom';

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
  document.body.innerHTML = '';
});

/**
 * The private surface this suite drives directly. Row-DOM reads and the
 * `rowElementMap` / `rowPool` reaches go through `tests/helpers/tableBodyDom`
 * instead; what is left here is the render-loop state these tests poke.
 * Site 4 reaches `getOrCreateRow` too, but through `newRowSized`, which is
 * where the synthetic-window knowledge belongs.
 */
interface Internals {
  currentRange: { start: number; end: number; offsetY: number };
  renderVisibleRows(): void;
}

/**
 * Body mounted in a live document with a focusable `.dt-grid` sibling — jsdom
 * refuses to focus detached or untabbable elements, and `.dt-grid` only
 * carries `tabindex` while grid semantics are active (which, when rows exist,
 * they always are).
 */
function setup(rowCount = 40) {
  const root = document.createElement('div');
  root.className = 'dt-root';
  const gridElement = document.createElement('div');
  gridElement.className = 'dt-grid';
  gridElement.setAttribute('role', 'grid');
  gridElement.setAttribute('tabindex', '0');
  const container = document.createElement('div');
  gridElement.appendChild(container);
  root.appendChild(gridElement);
  document.body.appendChild(root);

  const state: TableState = createTableState();
  state.tableName.set('t');
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(rowCount);

  const bridge = {
    query: vi.fn(async (sql: string) => {
      const limit = Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? 0);
      const offset = Number(/OFFSET (\d+)/.exec(sql)?.[1] ?? 0);
      return Array.from({ length: limit }, (_, i) => ({
        __rowid__: offset + i,
        id: offset + i,
        tag: `row-${offset + i}`,
      }));
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
    { gridElement },
  );

  // JSDOM reports a zero-height viewport, so nothing would ever materialize.
  Object.defineProperty(body.getVirtualScroller().getScrollContainer(), 'clientHeight', {
    value: 320,
    configurable: true,
  });

  const internal = body as unknown as Internals;
  return { body, state, gridElement, container, internal };
}

/** Materialize rows and put real DOM focus on a cell, the way a click does. */
async function focusACell(harness: Awaited<ReturnType<typeof setup>>, rowIndex: number) {
  await harness.body.initialize();
  const rowEl = rowElements(harness.body).get(rowIndex);
  expect(rowEl).toBeDefined();
  const cell = bodyCells(rowEl!)[0]!;
  cell.focus();
  expect(document.activeElement).toBe(cell);
  return { rowEl: rowEl!, cell };
}

describe('TableBody — focus never outlives the element holding it', () => {
  it('site 1: invalidateCacheAndRefresh (refresh) hands focus to the grid', async () => {
    const harness = setup();
    await focusACell(harness, 0);

    harness.body.refresh();

    expect(document.activeElement).toBe(harness.gridElement);
    expect(document.activeElement).not.toBe(document.body);

    harness.body.destroy();
  });

  it('site 2: recycling a row out of the visible range hands focus to the grid', async () => {
    const harness = setup();
    await focusACell(harness, 0);

    // Scroll far enough that row 0 leaves the range — the everyday case, and
    // the one that made arrows go dead mid-scroll.
    harness.internal.currentRange = { start: 20, end: 30, offsetY: 20 * 32 };
    harness.internal.renderVisibleRows();

    expect(rowElements(harness.body).has(0)).toBe(false);
    expect(document.activeElement).toBe(harness.gridElement);

    harness.body.destroy();
  });

  it('site 3: the cell-count-mismatch replacement hands focus to the grid', async () => {
    const harness = setup();
    const { rowEl } = await focusACell(harness, 0);

    // Shape the row like a placeholder (fewer cells than columns) so
    // renderVisibleRows takes the replace-from-pool branch, which detaches the
    // row without going through returnRowToPool.
    //
    // The target is a *cell*, not whatever happens to be last: `lastElementChild`
    // is the right column spacer on a windowed row, and removing that would take
    // the branch for the wrong reason. The follow-up assertion is exact for the
    // same reason — `not.toBe(N)` is satisfied by `N + 2` children too.
    bodyCells(rowEl).at(-1)!.remove();
    expect(bodyCells(rowEl)).toHaveLength(harness.state.visibleColumns.get().length - 1);

    harness.internal.renderVisibleRows();

    expect(rowElements(harness.body).get(0)).not.toBe(rowEl);
    expect(document.activeElement).toBe(harness.gridElement);

    harness.body.destroy();
  });

  it('site 4: dropping surplus cells off a reused row hands focus to the grid', async () => {
    // Defensive path: rows in the pool are detached clones today, so a surplus
    // cell cannot hold focus in practice. Exercised with an attached row in
    // the pool so the guard itself is covered — a future change that pools
    // live rows must not silently reopen the hole.
    const harness = setup();
    await harness.body.initialize();

    // Synthetic windows on purpose: `newRow` always shapes a row for the body's
    // current column window (2 cells here), and the whole point of this test is
    // the mismatch — build a 2-cell row, then ask for a 1-cell one so the
    // reshape's surplus-removal branch runs.
    const pooled = newRowSized(harness.body, 2);
    harness.container.appendChild(pooled);
    const surplus = bodyCells(pooled)[1]!;
    surplus.focus();
    expect(document.activeElement).toBe(surplus);

    rowPool(harness.body).push(pooled);
    newRowSized(harness.body, 1);

    expect(pooled.children.length).toBe(1 + SPACERS_PER_ROW);
    expect(bodyCells(pooled)).toHaveLength(1);
    expect(document.activeElement).toBe(harness.gridElement);

    harness.body.destroy();
  });

  it('site 5: destroy() hands focus to the grid before detaching the rows', async () => {
    const harness = setup();
    await focusACell(harness, 0);

    // TableContainer.render() destroys and rebuilds the body on every schema /
    // visibleColumns change, so this fires far more often than teardown.
    harness.body.destroy();

    expect(document.activeElement).toBe(harness.gridElement);
  });

  it('leaves focus alone when the removed row was not holding it', async () => {
    // The guard must stay narrow. Focus outside the table is the user's, and
    // a removal that would not have disturbed it must not either.
    const harness = setup();
    await harness.body.initialize();

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    expect(document.activeElement).toBe(outside);

    harness.body.refresh();
    harness.internal.currentRange = { start: 20, end: 30, offsetY: 20 * 32 };
    harness.internal.renderVisibleRows();
    harness.body.destroy();

    expect(document.activeElement).toBe(outside);
  });

  it('is inert without a gridElement — no crash, focus simply falls where it falls', async () => {
    // `gridElement` is optional on TableBodyOptions; bodies constructed
    // directly (via /advanced) must keep working.
    const harness = setup();
    await harness.body.initialize();
    harness.body.destroy();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const state = createTableState();
    state.tableName.set('t');
    initializeColumnsFromSchema(state, SCHEMA);
    const bridge = {
      query: vi.fn().mockResolvedValue([]),
      isInitialized: vi.fn().mockReturnValue(true),
      initialize: vi.fn().mockResolvedValue(undefined),
      loadData: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn(),
      clearQueryCache: vi.fn(),
    };
    const body = new TableBody(
      container,
      state,
      bridge as unknown as Parameters<typeof TableBody>[2],
    );

    expect(() => body.destroy()).not.toThrow();
  });
});
