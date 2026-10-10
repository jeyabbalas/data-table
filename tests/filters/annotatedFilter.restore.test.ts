/**
 * The annotated filter through every restore path: a saved session (its
 * filters, and its undo and redo entries), a loaded preset, and a filter
 * added by hand. Its column key names no column, so column validation must
 * keep it; and it names the table it was saved on, which every path points
 * at the table it comes back to, whose annotated rows it then keeps.
 */
import { describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema, Filter } from '@/core/types';
import { UndoManager } from '@/core/UndoManager';
import { filtersToWhereClause } from '@/filters/FilterSQL';
import { restoreStateFromSnapshot, snapshotFromState } from '@/persistence/serialization';
import { SNAPSHOT_VERSION } from '@/persistence/types';
import type { SerializedStateSnapshot, SessionSnapshot } from '@/persistence/types';

import { makeRowFetchBridge } from '../helpers/rowFetchBridge';

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'age', type: 'integer', nullable: true, originalType: 'INTEGER' },
];

function setup(): { state: TableState; actions: StateActions; undo: UndoManager } {
  const state = createTableState();
  state.tableName.set('orders');
  state.baseTableName.set('orders');
  initializeColumnsFromSchema(state, SCHEMA);
  const undo = new UndoManager();
  const { bridge } = makeRowFetchBridge();
  const actions = new StateActions(
    state,
    bridge as unknown as ConstructorParameters<typeof StateActions>[1],
    undo,
  );
  return { state, actions, undo };
}

function snapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    timestamp: 0,
    tableName: 'orders',
    filters: [],
    sortColumns: [],
    visibleColumns: ['id', 'age'],
    columnOrder: ['id', 'age'],
    columnWidths: {},
    pinnedColumns: [],
    hiddenColumnInfo: {},
    derivedColumns: [],
    ...overrides,
  };
}

function entry(filters: Filter[]): SerializedStateSnapshot {
  return {
    filters,
    sortColumns: [],
    visibleColumns: ['id', 'age'],
    columnOrder: ['id', 'age'],
    columnWidths: {},
    pinnedColumns: [],
    hiddenColumnInfo: {},
  };
}

const SAVED_ON_ANOTHER: Filter = {
  type: 'annotated',
  column: '__annotated__',
  severities: ['error'],
  table: 'orders_2025',
};
const ON_THIS_TABLE: Filter = { ...SAVED_ON_ANOTHER, table: 'orders' };

describe('the annotated filter in a saved session', () => {
  it('is saved as it is, table and severities included', () => {
    const { state, actions } = setup();
    actions.showAnnotatedRows({ severities: ['error'] });
    expect(snapshotFromState(state).filters).toEqual([ON_THIS_TABLE]);
  });

  it('is restored though it names no column, keeping the annotated rows of this table', () => {
    const { state } = setup();
    restoreStateFromSnapshot(
      state,
      snapshot({ filters: [SAVED_ON_ANOTHER, { type: 'range', column: 'age', min: 1, max: 9 }] }),
    );
    expect(state.filters.get()).toEqual([
      ON_THIS_TABLE,
      { type: 'range', column: 'age', min: 1, max: 9 },
    ]);
    expect(filtersToWhereClause(state.filters.get())).toContain('FROM "__dt_annot_orders__"');
  });

  it('takes the base table under a derived-column view', () => {
    const { state } = setup();
    state.tableName.set('__dt_view_orders__');
    restoreStateFromSnapshot(state, snapshot({ filters: [SAVED_ON_ANOTHER] }));
    expect(state.filters.get()).toEqual([ON_THIS_TABLE]);
  });

  it('comes back in the undo and redo entries saved with it', async () => {
    const { state, undo, actions } = setup();
    restoreStateFromSnapshot(
      state,
      snapshot({ undoStack: [entry([SAVED_ON_ANOTHER])], redoStack: [entry([])] }),
      undo,
    );
    const { undoStack } = undo.getStacks();
    expect(undoStack[0]!.filters).toEqual([ON_THIS_TABLE]);

    await actions.undo();
    expect(state.filters.get()).toEqual([ON_THIS_TABLE]);
  });
});

describe('the annotated filter in a preset', () => {
  it('keeps the annotated rows of the table it is loaded on', () => {
    const { state, actions } = setup();
    actions.loadFilterPreset([SAVED_ON_ANOTHER]);
    expect(state.filters.get()).toEqual([ON_THIS_TABLE]);
  });
});

describe('the annotated filter added by hand', () => {
  it('is given this table, and the key every annotated filter has', () => {
    const { state, actions } = setup();
    actions.addFilter({ type: 'annotated', column: 'whatever' as '__annotated__' });
    expect(state.filters.get()).toEqual([
      { type: 'annotated', column: '__annotated__', table: 'orders' },
    ]);
    // A second replaces the first.
    actions.addFilter(SAVED_ON_ANOTHER);
    expect(state.filters.get()).toEqual([ON_THIS_TABLE]);
  });

  it('keeps the table it names with no table loaded', () => {
    const state = createTableState();
    const { bridge } = makeRowFetchBridge();
    const actions = new StateActions(
      state,
      bridge as unknown as ConstructorParameters<typeof StateActions>[1],
    );
    actions.addFilter(SAVED_ON_ANOTHER);
    expect(state.filters.get()).toEqual([SAVED_ON_ANOTHER]);
    const spy = vi.fn();
    state.filters.subscribe(spy);
    actions.removeFilter('__annotated__');
    expect(spy).toHaveBeenCalledWith([]);
  });
});
