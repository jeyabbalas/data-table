/**
 * @vitest-environment jsdom
 *
 * Where the cursor goes when its column stops being shown: to the column that
 * took its place, not back to the first column.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableContainer } from '@/table/TableContainer';
import { StateActions } from '@/core/Actions';
import { HEADER_ROW_INDEX } from '@/table/KeyboardNavigator';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';

class MockResizeObserver implements ResizeObserver {
  constructor(_: ResizeObserverCallback) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const mockBridge = {
  initialize: vi.fn(),
  query: vi.fn().mockResolvedValue([]),
  terminate: vi.fn(),
  clearQueryCache: vi.fn(),
} as unknown as WorkerBridge;

const SCHEMA: ColumnSchema[] = ['a', 'b', 'c', 'd'].map((name) => ({
  name,
  type: 'integer',
  nullable: false,
  originalType: 'INTEGER',
}));

let state: TableState;
let actions: StateActions;
let table: TableContainer;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  const container = document.createElement('div');
  document.body.appendChild(container);
  state = createTableState();
  actions = new StateActions(state, mockBridge);
  state.schema.set(SCHEMA);
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(100);
  state.tableName.set('test_table');
  table = new TableContainer(container, state, actions, mockBridge);
});

afterEach(() => {
  table.destroy();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('the cursor when its column is hidden', () => {
  it('moves to the next column shown', () => {
    actions.setFocusedCell({ row: 5, column: 'b' });
    actions.hideColumn('b');
    expect(state.focusedCell.get()).toEqual({ row: 5, column: 'c' });
  });

  it('moves to the column before when the last one is hidden', () => {
    actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'd' });
    actions.hideColumn('d');
    expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'c' });
  });

  it('skips columns hidden with it', () => {
    actions.setFocusedCell({ row: 2, column: 'b' });
    state.visibleColumns.set(['a', 'd']);
    expect(state.focusedCell.get()).toEqual({ row: 2, column: 'd' });
  });

  it('follows the order the columns were shown in', () => {
    actions.setColumnOrder(['d', 'c', 'b', 'a']);
    actions.setFocusedCell({ row: 0, column: 'c' });
    actions.hideColumn('c');
    expect(state.focusedCell.get()).toEqual({ row: 0, column: 'b' });
  });

  it('stays in the pinned block when a pinned column is hidden', () => {
    actions.toggleColumnPin('a');
    actions.toggleColumnPin('b');
    actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });
    actions.hideColumn('b');
    expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'a' });

    actions.showColumn('b');
    actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'a' });
    actions.hideColumn('a');
    expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'b' });
  });

  it('goes to the first column in view when the last pinned column is hidden', () => {
    actions.toggleColumnPin('a');
    // Scrolled so that `c`, at 150–300 once `a` is gone, is the first
    // column at the left of the view; `b` is out of it.
    table.getElement().querySelector<HTMLElement>('.dt-body-scroll')!.scrollLeft = 200;
    actions.setFocusedCell({ row: 1, column: 'a' });
    actions.hideColumn('a');
    expect(state.focusedCell.get()).toEqual({ row: 1, column: 'c' });
  });

  it('stays on a column renamed in place', () => {
    actions.setFocusedCell({ row: 3, column: 'b' });
    state.visibleColumns.set(['a', 'b2', 'c', 'd']);
    expect(state.focusedCell.get()).toEqual({ row: 3, column: 'b2' });
  });
});
