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

  it('showing a column keeps it out of a pinned block formed while it was hidden', () => {
    // `a`'s right neighbour at hide time was `b`, which is pinned since.
    actions.hideColumn('a');
    actions.toggleColumnPin('b');

    actions.showColumn('a');

    expect(state.visibleColumns.get()).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(isSubsequence(state.visibleColumns.get(), state.columnOrder.get())).toBe(true);
  });

  it('showing a pinned column keeps it inside the pinned block', () => {
    actions.toggleColumnPin('a');
    actions.hideColumn('a');
    actions.toggleColumnPin('c');

    actions.showColumn('a');

    const visible = state.visibleColumns.get();
    expect(leadingPinned(visible, state.pinnedColumns.get())).toBe(2);
    expect(visible.slice(0, 2).sort()).toEqual(['a', 'c']);
    expect(isSubsequence(visible, state.columnOrder.get())).toBe(true);
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
    undoActions.hideColumn('a');
    undoActions.toggleColumnPin('b');
    const before = { visible: state.visibleColumns.get(), order: state.columnOrder.get() };
    const depth = undoManager.undoDepth;

    undoActions.showColumn('a');
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
