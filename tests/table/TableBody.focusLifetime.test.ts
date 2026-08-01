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

interface Internals {
  rowElementMap: Map<number, HTMLElement>;
  rowDataCache: Map<number, Record<string, unknown>>;
  rowPool: HTMLElement[];
  currentRange: { start: number; end: number; offsetY: number };
  getOrCreateRow(columnCount: number): HTMLElement;
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
  const rowEl = harness.internal.rowElementMap.get(rowIndex);
  expect(rowEl).toBeDefined();
  const cell = rowEl!.children[0] as HTMLElement;
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

    expect(harness.internal.rowElementMap.has(0)).toBe(false);
    expect(document.activeElement).toBe(harness.gridElement);

    harness.body.destroy();
  });

  it('site 3: the cell-count-mismatch replacement hands focus to the grid', async () => {
    const harness = setup();
    const { rowEl } = await focusACell(harness, 0);

    // Shape the row like a placeholder (fewer cells than columns) so
    // renderVisibleRows takes the replace-from-pool branch, which detaches the
    // row without going through returnRowToPool.
    rowEl.removeChild(rowEl.lastElementChild!);
    expect(rowEl.children.length).not.toBe(harness.state.visibleColumns.get().length);

    harness.internal.renderVisibleRows();

    expect(harness.internal.rowElementMap.get(0)).not.toBe(rowEl);
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

    const pooled = harness.internal.getOrCreateRow(2);
    harness.container.appendChild(pooled);
    const surplus = pooled.children[1] as HTMLElement;
    surplus.focus();
    expect(document.activeElement).toBe(surplus);

    harness.internal.rowPool.push(pooled);
    harness.internal.getOrCreateRow(1);

    expect(pooled.children.length).toBe(1);
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
