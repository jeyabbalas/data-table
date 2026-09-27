/**
 * @vitest-environment jsdom
 *
 * Pinned columns lead the row, and `visibleColumns` follows `columnOrder`.
 *
 * Sticky offsets are summed over the pinned columns on the assumption that
 * they come first, and `aria-colindex` numbers columns by `columnOrder` on
 * the assumption that `visibleColumns` is a subsequence of it (ARIA requires
 * the indices to ascend along a row). Pinning used to write `pinnedColumns`
 * before the order that goes with it, and showing a column put it back next
 * to its hide-time neighbours without regard to a pin or a reorder made
 * since. Both could break the assumptions, one of them only for the length of
 * a notification.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import { UndoManager } from '@/core/UndoManager';
import type { ColumnSchema } from '@/core/types';
import { TableContainer } from '@/table/TableContainer';

import { rowsFor } from '../helpers/rowFetchBridge';
import { HARNESS_COLUMNS, MockResizeObserver, setupTableBody } from '../helpers/tableBodyHarness';

const SCHEMA: ColumnSchema[] = ['a', 'b', 'c', 'd', 'e'].map((name) => ({
  name,
  type: 'integer',
  nullable: false,
  originalType: 'INTEGER',
}));

function mockBridge() {
  return {
    query: vi.fn().mockResolvedValue([]),
    clearQueryCache: vi.fn(),
  } as unknown as ConstructorParameters<typeof StateActions>[1];
}

/** Whether `sub` appears in `seq` in the same relative order. */
function isSubsequence(sub: readonly string[], seq: readonly string[]): boolean {
  let i = 0;
  for (const item of seq) if (item === sub[i]) i++;
  return i === sub.length;
}

function leadingPinned(visible: readonly string[], pinned: readonly string[]): number {
  let n = 0;
  while (n < visible.length && pinned.includes(visible[n]!)) n++;
  return n;
}

describe('pinned columns stay first', () => {
  let state: TableState;
  let actions: StateActions;

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, mockBridge());
    initializeColumnsFromSchema(state, SCHEMA);
  });

  it('pinning notifies with the order already updated', () => {
    const seen: { visible: string[]; order: string[] }[] = [];
    state.pinnedColumns.subscribe(() => {
      seen.push({ visible: state.visibleColumns.get(), order: state.columnOrder.get() });
    });

    actions.toggleColumnPin('c');

    expect(seen).toEqual([
      { visible: ['c', 'a', 'b', 'd', 'e'], order: ['c', 'a', 'b', 'd', 'e'] },
    ]);
  });

  it('unpinning notifies with the order already updated', () => {
    actions.toggleColumnPin('a');
    actions.toggleColumnPin('b');
    const seen: string[][] = [];
    state.pinnedColumns.subscribe(() => seen.push(state.visibleColumns.get()));

    actions.toggleColumnPin('a');

    expect(state.pinnedColumns.get()).toEqual(['b']);
    expect(seen).toEqual([['b', 'a', 'c', 'd', 'e']]);
  });

  it('ignores a column the table does not have', () => {
    const before = { order: state.columnOrder.get(), pinned: state.pinnedColumns.get() };

    actions.toggleColumnPin('nope');

    expect(state.columnOrder.get()).toBe(before.order);
    expect(state.pinnedColumns.get()).toBe(before.pinned);
  });

  it('unpins a stale pinned name without adding it to columnOrder', () => {
    state.pinnedColumns.set(['gone', 'a']);
    const order = state.columnOrder.get();

    actions.toggleColumnPin('gone');

    expect(state.pinnedColumns.get()).toEqual(['a']);
    expect(state.columnOrder.get()).toBe(order);
  });

  it('showing a column keeps it out of a pinned block formed while it was hidden', () => {
    // `a`'s right neighbour at hide time was `b`, which is pinned since.
    actions.hideColumn('a');
    actions.toggleColumnPin('b');

    actions.showColumn('a');

    expect(state.visibleColumns.get()).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(isSubsequence(state.visibleColumns.get(), state.columnOrder.get())).toBe(true);
  });

  it('showing a pinned column puts it back in pin order', () => {
    // `a`'s neighbours at hide time say "before b", which would put it after
    // `c`, pinned since. Pin order says first.
    actions.toggleColumnPin('a');
    actions.hideColumn('a');
    actions.toggleColumnPin('c');
    const order = state.columnOrder.get();

    actions.showColumn('a');

    expect(state.pinnedColumns.get()).toEqual(['a', 'c']);
    expect(state.visibleColumns.get()).toEqual(['a', 'c', 'b', 'd', 'e']);
    expect(state.columnOrder.get()).toBe(order);
  });

  it('never moves a column into the pinned columns at the front of columnOrder', () => {
    // `b` is pinned and hidden, so `columnOrder` starts with a, b while only
    // `a` shows. Showing `c` right after `a` must not file it before `b`:
    // `toggleColumnPin` and `showAllColumns` both take the pinned columns to
    // lead `columnOrder`.
    actions.toggleColumnPin('a');
    actions.toggleColumnPin('b');
    actions.hideColumn('c');
    actions.hideColumn('b');
    actions.toggleColumnPin('d');
    actions.toggleColumnPin('d');

    actions.showColumn('c');
    expect(state.visibleColumns.get()).toEqual(['a', 'c', 'd', 'e']);
    expect(state.columnOrder.get().slice(0, 2)).toEqual(['a', 'b']);

    actions.toggleColumnPin('e');
    expect(leadingPinned(state.visibleColumns.get(), state.pinnedColumns.get())).toBe(2);
    actions.showAllColumns();
    expect(state.visibleColumns.get()).toEqual(['a', 'b', 'e', 'c', 'd']);
  });

  it('setColumnOrder keeps the pinned columns first, in the order given', () => {
    actions.toggleColumnPin('b');
    actions.toggleColumnPin('d');
    // Pinned b, d; an order that puts both after unpinned columns, d first.
    actions.setColumnOrder(['a', 'd', 'c', 'b', 'e']);

    expect(state.columnOrder.get()).toEqual(['d', 'b', 'a', 'c', 'e']);
    expect(state.visibleColumns.get()).toEqual(['d', 'b', 'a', 'c', 'e']);
    expect(leadingPinned(state.visibleColumns.get(), state.pinnedColumns.get())).toBe(2);
  });

  it('setColumnOrder keeps a hidden pinned column in the pinned block of columnOrder', () => {
    actions.toggleColumnPin('c');
    actions.hideColumn('c');
    actions.setColumnOrder(['e', 'd', 'b', 'a']);

    expect(state.columnOrder.get()).toEqual(['c', 'e', 'd', 'b', 'a']);
    expect(state.visibleColumns.get()).toEqual(['e', 'd', 'b', 'a']);
    actions.showColumn('c');
    expect(state.visibleColumns.get()[0]).toBe('c');
  });

  it('setColumnOrder keeps a hidden pinned column in the block when a drag passes it', () => {
    // Pin a and b, hide b, and drag e to the front, which the drop clamps to
    // after the visible pinned block: what the drag hands setColumnOrder.
    actions.toggleColumnPin('a');
    actions.toggleColumnPin('b');
    actions.hideColumn('b');
    actions.setColumnOrder(['a', 'e', 'c', 'd']);
    expect(state.columnOrder.get()).toEqual(['a', 'b', 'e', 'c', 'd']);

    // Pinning another column then puts it in the block, not after `e`.
    actions.toggleColumnPin('c');
    expect(leadingPinned(state.visibleColumns.get(), state.pinnedColumns.get())).toBe(2);
    expect(state.visibleColumns.get()).toEqual(['a', 'c', 'e', 'd']);
  });

  it("setColumnOrder gives pinnedColumns the pinned block's new order, which a hide and show keeps", () => {
    actions.toggleColumnPin('b');
    actions.toggleColumnPin('d');
    actions.setColumnOrder(['d', 'b', 'a', 'c', 'e']);
    expect(state.pinnedColumns.get()).toEqual(['d', 'b']);

    actions.hideColumn('d');
    actions.showColumn('d');
    expect(state.visibleColumns.get()).toEqual(['d', 'b', 'a', 'c', 'e']);
  });

  it('setColumnOrder writes columnOrder and visibleColumns in one update', () => {
    const seen: boolean[] = [];
    state.columnOrder.subscribe(() => {
      seen.push(isSubsequence(state.visibleColumns.get(), state.columnOrder.get()));
    });

    actions.setColumnOrder(['e', 'd', 'c', 'b', 'a']);

    expect(seen).toEqual([true]);
  });

  it('showing a column keeps visibleColumns in columnOrder after a reorder', () => {
    // Hide b (neighbours a, c) and c (neighbours a, d), then swap the two
    // columns left showing. setColumnOrder files b and c in front of d.
    actions.hideColumn('b');
    actions.hideColumn('c');
    actions.setColumnOrder(['d', 'a', 'e']);

    actions.showColumn('b');

    // Still next to its left neighbour, and in columnOrder at that place.
    expect(state.visibleColumns.get()).toEqual(['d', 'a', 'b', 'e']);
    expect(isSubsequence(state.visibleColumns.get(), state.columnOrder.get())).toBe(true);
  });

  it('leaves columnOrder alone when the restored column already fits it', () => {
    actions.hideColumn('c');
    const order = state.columnOrder.get();

    actions.showColumn('c');

    expect(state.columnOrder.get()).toBe(order);
  });

  it('undoes a show that moved the column in columnOrder in one step', async () => {
    const undoManager = new UndoManager();
    const undoActions = new StateActions(state, mockBridge(), undoManager);
    undoActions.hideColumn('b');
    undoActions.hideColumn('c');
    undoActions.setColumnOrder(['d', 'a', 'e']);
    const before = { visible: state.visibleColumns.get(), order: state.columnOrder.get() };
    const depth = undoManager.undoDepth;

    undoActions.showColumn('b');
    expect(state.columnOrder.get()).not.toEqual(before.order);
    expect(undoManager.undoDepth).toBe(depth + 1);
    await undoActions.undo();

    expect(state.visibleColumns.get()).toEqual(before.visible);
    expect(state.columnOrder.get()).toEqual(before.order);
  });
});

describe('the table keeps aria-colindex ascending', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('after hide, pin and show', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const state = createTableState();
    const actions = new StateActions(state, mockBridge());
    const container = new TableContainer(host, state, actions);
    state.tableName.set('t');
    initializeColumnsFromSchema(state, SCHEMA);

    actions.hideColumn('a');
    actions.toggleColumnPin('b');
    actions.showColumn('a');

    const indices = Array.from(host.querySelectorAll('[role="columnheader"]'), (h) =>
      Number(h.getAttribute('aria-colindex')),
    );
    expect(indices).toEqual([...indices].sort((x, y) => x - y));
    container.destroy();
  });
});

describe('TableBody on a pin change', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('restyles from the cache instead of fetching the rows again', async () => {
    const harness = setupTableBody();
    const init = harness.body.initialize();
    await harness.drain();
    harness.queries[0]!.deferred.resolve(rowsFor(harness.queries[0]!.sql, HARNESS_COLUMNS));
    await init;
    const fetched = harness.queries.length;

    harness.state.pinnedColumns.set(['id']);

    expect(harness.queries.length).toBe(fetched);
    const cell = harness.container.querySelector<HTMLElement>(
      '.dt-row[data-row-index="0"] .dt-cell[data-column="id"]',
    )!;
    expect(cell.style.position).toBe('sticky');
    expect(cell.textContent).toBe('0');
    harness.body.destroy();
  });
});
