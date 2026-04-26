import { describe, it, expect, vi } from 'vitest';
import {
  UndoManager,
  captureSnapshot,
  applySnapshot,
  derivedColumnsEqual,
} from '@/core/UndoManager';
import type { StateSnapshot } from '@/core/UndoManager';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema, Filter, SortColumn } from '@/core/types';
import type { DerivedColumnDef, ExpressionColumnDef, VectorColumnDef } from '@/derived/types';

// --- Test helpers ---

function createTestSnapshot(overrides?: Partial<StateSnapshot>): StateSnapshot {
  return {
    filters: [],
    sortColumns: [],
    visibleColumns: ['id', 'name'],
    columnOrder: ['id', 'name'],
    columnWidths: new Map(),
    pinnedColumns: [],
    hiddenColumnInfo: new Map(),
    derivedColumns: [],
    ...overrides,
  };
}

const sampleSchema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'age', type: 'integer', nullable: true, originalType: 'INTEGER' },
];

function setupState(): TableState {
  const state = createTableState();
  initializeColumnsFromSchema(state, sampleSchema);
  state.totalRows.set(100);
  state.filteredRows.set(100);
  return state;
}

// --- UndoManager tests ---

describe('UndoManager — constructor', () => {
  it('should initialize with empty stacks', () => {
    const manager = new UndoManager();
    expect(manager.canUndo).toBe(false);
    expect(manager.canRedo).toBe(false);
    expect(manager.undoDepth).toBe(0);
    expect(manager.redoDepth).toBe(0);
    expect(manager.canUndoSignal.get()).toBe(false);
    expect(manager.canRedoSignal.get()).toBe(false);
  });

  it('should accept custom maxDepth', () => {
    const manager = new UndoManager(3);
    manager.push(createTestSnapshot({ visibleColumns: ['a'] }));
    manager.push(createTestSnapshot({ visibleColumns: ['b'] }));
    manager.push(createTestSnapshot({ visibleColumns: ['c'] }));
    manager.push(createTestSnapshot({ visibleColumns: ['d'] }));
    expect(manager.undoDepth).toBe(3);
  });
});

describe('UndoManager — push', () => {
  it('should add snapshot to undo stack', () => {
    const manager = new UndoManager();
    manager.push(createTestSnapshot());
    expect(manager.canUndo).toBe(true);
    expect(manager.undoDepth).toBe(1);
  });

  it('should clear redo stack on push', () => {
    const manager = new UndoManager();
    const snapshotA = createTestSnapshot({ visibleColumns: ['a'] });
    const snapshotB = createTestSnapshot({ visibleColumns: ['b'] });
    const current = createTestSnapshot({ visibleColumns: ['current'] });

    manager.push(snapshotA);
    manager.undo(current); // redo stack now has [current]
    expect(manager.canRedo).toBe(true);

    manager.push(snapshotB); // should clear redo
    expect(manager.canRedo).toBe(false);
    expect(manager.redoDepth).toBe(0);
  });

  it('should enforce maxDepth by removing oldest entry', () => {
    const manager = new UndoManager(3);
    const s1 = createTestSnapshot({ visibleColumns: ['s1'] });
    const s2 = createTestSnapshot({ visibleColumns: ['s2'] });
    const s3 = createTestSnapshot({ visibleColumns: ['s3'] });
    const s4 = createTestSnapshot({ visibleColumns: ['s4'] });

    manager.push(s1);
    manager.push(s2);
    manager.push(s3);
    manager.push(s4); // s1 should be evicted
    expect(manager.undoDepth).toBe(3);

    // Undo all — should get s4, s3, s2 (s1 was evicted)
    const current = createTestSnapshot({ visibleColumns: ['current'] });
    const r1 = manager.undo(current);
    expect(r1!.visibleColumns).toEqual(['s4']);
    const r2 = manager.undo(createTestSnapshot());
    expect(r2!.visibleColumns).toEqual(['s3']);
    const r3 = manager.undo(createTestSnapshot());
    expect(r3!.visibleColumns).toEqual(['s2']);
    const r4 = manager.undo(createTestSnapshot());
    expect(r4).toBeNull();
  });

  it('should handle maxDepth of 1', () => {
    const manager = new UndoManager(1);
    const s1 = createTestSnapshot({ visibleColumns: ['s1'] });
    const s2 = createTestSnapshot({ visibleColumns: ['s2'] });

    manager.push(s1);
    manager.push(s2); // s1 evicted
    expect(manager.undoDepth).toBe(1);

    const result = manager.undo(createTestSnapshot());
    expect(result!.visibleColumns).toEqual(['s2']);
    expect(manager.canUndo).toBe(false);
  });
});

describe('UndoManager — undo', () => {
  it('should return null when stack is empty', () => {
    const manager = new UndoManager();
    const result = manager.undo(createTestSnapshot());
    expect(result).toBeNull();
  });

  it('should pop from undo stack and return snapshot', () => {
    const manager = new UndoManager();
    const snapshot = createTestSnapshot({ visibleColumns: ['a', 'b'] });
    manager.push(snapshot);

    const result = manager.undo(createTestSnapshot());
    expect(result!.visibleColumns).toEqual(['a', 'b']);
    expect(manager.canUndo).toBe(false);
  });

  it('should push currentSnapshot to redo stack', () => {
    const manager = new UndoManager();
    const before = createTestSnapshot({ visibleColumns: ['before'] });
    const current = createTestSnapshot({ visibleColumns: ['current'] });

    manager.push(before);
    manager.undo(current);
    expect(manager.canRedo).toBe(true);

    // Redo should return the current we passed in
    const redone = manager.redo(createTestSnapshot());
    expect(redone!.visibleColumns).toEqual(['current']);
  });

  it('should handle multiple undos', () => {
    const manager = new UndoManager();
    const sA = createTestSnapshot({ visibleColumns: ['A'] });
    const sB = createTestSnapshot({ visibleColumns: ['B'] });
    const sC = createTestSnapshot({ visibleColumns: ['C'] });

    manager.push(sA);
    manager.push(sB);
    manager.push(sC);

    const r1 = manager.undo(createTestSnapshot());
    expect(r1!.visibleColumns).toEqual(['C']);
    const r2 = manager.undo(createTestSnapshot());
    expect(r2!.visibleColumns).toEqual(['B']);
    const r3 = manager.undo(createTestSnapshot());
    expect(r3!.visibleColumns).toEqual(['A']);
    const r4 = manager.undo(createTestSnapshot());
    expect(r4).toBeNull();
  });
});

describe('UndoManager — redo', () => {
  it('should return null when stack is empty', () => {
    const manager = new UndoManager();
    const result = manager.redo(createTestSnapshot());
    expect(result).toBeNull();
  });

  it('should pop from redo stack and return snapshot', () => {
    const manager = new UndoManager();
    const before = createTestSnapshot({ visibleColumns: ['before'] });
    const current = createTestSnapshot({ visibleColumns: ['current'] });

    manager.push(before);
    manager.undo(current); // redo stack: [current]

    const result = manager.redo(createTestSnapshot({ visibleColumns: ['now'] }));
    expect(result!.visibleColumns).toEqual(['current']);
  });

  it('should push currentSnapshot to undo stack', () => {
    const manager = new UndoManager();
    const before = createTestSnapshot({ visibleColumns: ['before'] });

    manager.push(before);
    manager.undo(createTestSnapshot({ visibleColumns: ['after-action'] }));

    // Redo: pass current state, it should land on undo stack
    const now = createTestSnapshot({ visibleColumns: ['now'] });
    manager.redo(now);
    expect(manager.canUndo).toBe(true);

    // Undoing should return 'now'
    const undone = manager.undo(createTestSnapshot());
    expect(undone!.visibleColumns).toEqual(['now']);
  });

  it('should handle multiple redos', () => {
    const manager = new UndoManager();
    const sA = createTestSnapshot({ visibleColumns: ['A'] });
    const sB = createTestSnapshot({ visibleColumns: ['B'] });
    const sC = createTestSnapshot({ visibleColumns: ['C'] });

    manager.push(sA);
    manager.push(sB);
    manager.push(sC);

    // Undo all three
    const c1 = createTestSnapshot({ visibleColumns: ['c1'] });
    const c2 = createTestSnapshot({ visibleColumns: ['c2'] });
    const c3 = createTestSnapshot({ visibleColumns: ['c3'] });
    manager.undo(c1); // redo: [c1]
    manager.undo(c2); // redo: [c1, c2]
    manager.undo(c3); // redo: [c1, c2, c3]

    // Redo all three (LIFO order)
    const r1 = manager.redo(createTestSnapshot());
    expect(r1!.visibleColumns).toEqual(['c3']);
    const r2 = manager.redo(createTestSnapshot());
    expect(r2!.visibleColumns).toEqual(['c2']);
    const r3 = manager.redo(createTestSnapshot());
    expect(r3!.visibleColumns).toEqual(['c1']);
    const r4 = manager.redo(createTestSnapshot());
    expect(r4).toBeNull();
  });
});

describe('UndoManager — push/undo/redo cycle', () => {
  it('should clear redo on new push after undo', () => {
    const manager = new UndoManager();
    const sA = createTestSnapshot({ visibleColumns: ['A'] });
    const sB = createTestSnapshot({ visibleColumns: ['B'] });

    manager.push(sA);
    manager.undo(createTestSnapshot({ visibleColumns: ['current'] }));
    expect(manager.canRedo).toBe(true);

    manager.push(sB); // new action after undo
    expect(manager.canRedo).toBe(false);
    expect(manager.canUndo).toBe(true);
    expect(manager.undoDepth).toBe(1);
  });

  it('should handle interleaved push/undo/redo operations', () => {
    const manager = new UndoManager();
    const sA = createTestSnapshot({ visibleColumns: ['A'] });
    const sB = createTestSnapshot({ visibleColumns: ['B'] });

    // Push A, push B
    manager.push(sA);
    manager.push(sB);
    expect(manager.undoDepth).toBe(2);
    expect(manager.redoDepth).toBe(0);

    // Undo once (returns B, redo gets currentC)
    const currentC = createTestSnapshot({ visibleColumns: ['C'] });
    const undone = manager.undo(currentC);
    expect(undone!.visibleColumns).toEqual(['B']);
    expect(manager.undoDepth).toBe(1);
    expect(manager.redoDepth).toBe(1);

    // Redo (returns currentC, undo gets currentD)
    const currentD = createTestSnapshot({ visibleColumns: ['D'] });
    const redone = manager.redo(currentD);
    expect(redone!.visibleColumns).toEqual(['C']);
    expect(manager.undoDepth).toBe(2); // [A, D]
    expect(manager.redoDepth).toBe(0);
  });
});

describe('UndoManager — clear', () => {
  it('should clear both stacks', () => {
    const manager = new UndoManager();
    manager.push(createTestSnapshot());
    manager.push(createTestSnapshot());
    manager.undo(createTestSnapshot());
    expect(manager.canUndo).toBe(true);
    expect(manager.canRedo).toBe(true);

    manager.clear();
    expect(manager.canUndo).toBe(false);
    expect(manager.canRedo).toBe(false);
    expect(manager.undoDepth).toBe(0);
    expect(manager.redoDepth).toBe(0);
  });

  it('should update signals on clear', () => {
    const manager = new UndoManager();
    manager.push(createTestSnapshot());
    expect(manager.canUndoSignal.get()).toBe(true);

    manager.clear();
    expect(manager.canUndoSignal.get()).toBe(false);
    expect(manager.canRedoSignal.get()).toBe(false);
  });
});

describe('UndoManager — reactive signals', () => {
  it('canUndoSignal should update on push', () => {
    const manager = new UndoManager();
    const callback = vi.fn();
    manager.canUndoSignal.subscribe(callback);

    manager.push(createTestSnapshot());
    expect(callback).toHaveBeenCalledWith(true);
  });

  it('canRedoSignal should update on undo', () => {
    const manager = new UndoManager();
    const callback = vi.fn();
    manager.push(createTestSnapshot());

    manager.canRedoSignal.subscribe(callback);
    manager.undo(createTestSnapshot());
    expect(callback).toHaveBeenCalledWith(true);
  });

  it('signals should not notify on redundant updates', () => {
    const manager = new UndoManager();
    const callback = vi.fn();
    manager.canUndoSignal.subscribe(callback);

    manager.push(createTestSnapshot()); // false → true: notify
    manager.push(createTestSnapshot()); // true → true: no notify (shallow eq)
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('signals should update on clear', () => {
    const manager = new UndoManager();
    manager.push(createTestSnapshot());

    const undoCallback = vi.fn();
    const redoCallback = vi.fn();
    manager.canUndoSignal.subscribe(undoCallback);
    manager.canRedoSignal.subscribe(redoCallback);

    manager.clear();
    expect(undoCallback).toHaveBeenCalledWith(false);
    // canRedoSignal was already false, so no notification
    expect(redoCallback).not.toHaveBeenCalled();
  });
});

// --- captureSnapshot tests ---

describe('captureSnapshot', () => {
  it('should capture all undoable state fields', () => {
    const state = setupState();

    const rangeFilter: Filter = {
      type: 'range',
      column: 'age',
      min: 10,
      max: 50,
    };
    state.filters.set([rangeFilter]);
    state.sortColumns.set([{ column: 'name', direction: 'asc' }]);
    state.visibleColumns.set(['id', 'name']);
    state.columnOrder.set(['name', 'id', 'age']);
    state.columnWidths.set(
      new Map([
        ['id', 100],
        ['name', 200],
      ]),
    );
    state.pinnedColumns.set(['id']);
    state.hiddenColumnInfo.set(
      new Map([['age', { column: 'age', leftNeighbor: 'name', rightNeighbor: null }]]),
    );

    const snapshot = captureSnapshot(state);

    expect(snapshot.filters).toHaveLength(1);
    expect(snapshot.filters[0]).toEqual(rangeFilter);
    expect(snapshot.sortColumns).toEqual([{ column: 'name', direction: 'asc' }]);
    expect(snapshot.visibleColumns).toEqual(['id', 'name']);
    expect(snapshot.columnOrder).toEqual(['name', 'id', 'age']);
    expect(snapshot.columnWidths).toEqual(
      new Map([
        ['id', 100],
        ['name', 200],
      ]),
    );
    expect(snapshot.pinnedColumns).toEqual(['id']);
    expect(snapshot.hiddenColumnInfo.get('age')).toEqual({
      column: 'age',
      leftNeighbor: 'name',
      rightNeighbor: null,
    });
  });

  it('should create independent copies (mutations do not affect snapshot)', () => {
    const state = setupState();
    state.filters.set([{ type: 'null', column: 'name', isNull: true }]);
    state.sortColumns.set([{ column: 'id', direction: 'desc' }]);
    state.pinnedColumns.set(['id']);

    const snapshot = captureSnapshot(state);

    // Mutate state after capture
    state.filters.set([]);
    state.sortColumns.set([]);
    state.pinnedColumns.set([]);
    state.visibleColumns.set(['age']);

    // Snapshot should be unaffected
    expect(snapshot.filters).toHaveLength(1);
    expect(snapshot.sortColumns).toHaveLength(1);
    expect(snapshot.pinnedColumns).toEqual(['id']);
    expect(snapshot.visibleColumns).toEqual(['id', 'name', 'age']);
  });

  it('should handle empty state', () => {
    const state = setupState();
    const snapshot = captureSnapshot(state);

    expect(snapshot.filters).toEqual([]);
    expect(snapshot.sortColumns).toEqual([]);
    expect(snapshot.visibleColumns).toEqual(['id', 'name', 'age']);
    expect(snapshot.columnOrder).toEqual(['id', 'name', 'age']);
    expect(snapshot.columnWidths.size).toBe(0);
    expect(snapshot.pinnedColumns).toEqual([]);
    expect(snapshot.hiddenColumnInfo.size).toBe(0);
  });

  it('should shallow-copy filter objects', () => {
    const state = setupState();
    const dateFilter: Filter = {
      type: 'range',
      column: 'age',
      min: new Date('2020-01-01'),
      max: new Date('2024-12-31'),
    };
    state.filters.set([dateFilter]);

    const snapshot = captureSnapshot(state);

    // Different object reference
    expect(snapshot.filters[0]).not.toBe(dateFilter);
    // But same Date instances (shallow copy)
    expect((snapshot.filters[0] as any).min).toBeInstanceOf(Date);
    expect((snapshot.filters[0] as any).min.getTime()).toBe(new Date('2020-01-01').getTime());
  });
});

// --- applySnapshot tests ---

describe('applySnapshot', () => {
  it('should set all undoable signals from snapshot', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      filters: [{ type: 'null', column: 'name', isNull: true }],
      sortColumns: [{ column: 'id', direction: 'desc' }],
      visibleColumns: ['id', 'name'],
      columnOrder: ['name', 'id'],
      columnWidths: new Map([['id', 150]]),
      pinnedColumns: ['name'],
      hiddenColumnInfo: new Map([
        ['age', { column: 'age', leftNeighbor: 'name', rightNeighbor: null }],
      ]),
    });

    applySnapshot(state, snapshot);

    expect(state.filters.get()).toHaveLength(1);
    expect(state.filters.get()[0].type).toBe('null');
    expect(state.sortColumns.get()).toEqual([{ column: 'id', direction: 'desc' }]);
    expect(state.visibleColumns.get()).toEqual(['id', 'name']);
    expect(state.columnOrder.get()).toEqual(['name', 'id']);
    expect(state.columnWidths.get().get('id')).toBe(150);
    expect(state.pinnedColumns.get()).toEqual(['name']);
    expect(state.hiddenColumnInfo.get().get('age')).toEqual({
      column: 'age',
      leftNeighbor: 'name',
      rightNeighbor: null,
    });
  });

  it('should not modify non-undoable state', () => {
    const state = setupState();
    state.tableName.set('my_table');
    state.selectedRows.set(new Set([1, 2, 3]));
    state.hoveredRow.set(5);
    state.hoveredColumn.set('name');

    applySnapshot(state, createTestSnapshot());

    expect(state.tableName.get()).toBe('my_table');
    expect(state.schema.get()).toEqual(sampleSchema);
    expect(state.totalRows.get()).toBe(100);
    expect(state.filteredRows.get()).toBe(100);
    expect(state.selectedRows.get()).toEqual(new Set([1, 2, 3]));
    expect(state.hoveredRow.get()).toBe(5);
    expect(state.hoveredColumn.get()).toBe('name');
  });

  it('should create independent copies from snapshot', () => {
    const state = setupState();
    const snapshot = createTestSnapshot({
      filters: [{ type: 'null', column: 'name', isNull: true }],
      pinnedColumns: ['id'],
    });

    applySnapshot(state, snapshot);

    // Mutate state — snapshot should be unaffected
    state.filters.set([]);
    state.pinnedColumns.set([]);

    expect(snapshot.filters).toHaveLength(1);
    expect(snapshot.pinnedColumns).toEqual(['id']);
  });
});

// --- Round-trip tests ---

describe('captureSnapshot / applySnapshot round-trip', () => {
  it('should round-trip all state fields', () => {
    const state = setupState();
    state.filters.set([
      { type: 'range', column: 'age', min: 10, max: 50 },
      { type: 'null', column: 'name', isNull: false },
    ]);
    state.sortColumns.set([
      { column: 'age', direction: 'asc' },
      { column: 'name', direction: 'desc' },
    ]);
    state.visibleColumns.set(['id', 'age']);
    state.columnOrder.set(['age', 'id', 'name']);
    state.columnWidths.set(
      new Map([
        ['id', 80],
        ['age', 120],
      ]),
    );
    state.pinnedColumns.set(['age']);
    state.hiddenColumnInfo.set(
      new Map([['name', { column: 'name', leftNeighbor: 'id', rightNeighbor: null }]]),
    );

    const snapshot = captureSnapshot(state);

    // Modify state to something completely different
    state.filters.set([]);
    state.sortColumns.set([]);
    state.visibleColumns.set(['id', 'name', 'age']);
    state.columnOrder.set(['id', 'name', 'age']);
    state.columnWidths.set(new Map());
    state.pinnedColumns.set([]);
    state.hiddenColumnInfo.set(new Map());

    // Apply the captured snapshot
    applySnapshot(state, snapshot);

    expect(state.filters.get()).toHaveLength(2);
    expect(state.filters.get()[0]).toEqual({ type: 'range', column: 'age', min: 10, max: 50 });
    expect(state.sortColumns.get()).toEqual([
      { column: 'age', direction: 'asc' },
      { column: 'name', direction: 'desc' },
    ]);
    expect(state.visibleColumns.get()).toEqual(['id', 'age']);
    expect(state.columnOrder.get()).toEqual(['age', 'id', 'name']);
    expect(state.columnWidths.get()).toEqual(
      new Map([
        ['id', 80],
        ['age', 120],
      ]),
    );
    expect(state.pinnedColumns.get()).toEqual(['age']);
    expect(state.hiddenColumnInfo.get().get('name')).toEqual({
      column: 'name',
      leftNeighbor: 'id',
      rightNeighbor: null,
    });
  });

  it('should round-trip filters with Date values', () => {
    const state = setupState();
    const minDate = new Date('2020-01-15T00:00:00.000Z');
    const maxDate = new Date('2024-06-30T23:59:59.999Z');
    state.filters.set([{ type: 'range', column: 'age', min: minDate, max: maxDate }]);

    const snapshot = captureSnapshot(state);
    state.filters.set([]);
    applySnapshot(state, snapshot);

    const restored = state.filters.get()[0] as any;
    expect(restored.min).toBeInstanceOf(Date);
    expect(restored.max).toBeInstanceOf(Date);
    expect(restored.min.getTime()).toBe(minDate.getTime());
    expect(restored.max.getTime()).toBe(maxDate.getTime());
  });

  it('should round-trip Map-based fields', () => {
    const state = setupState();
    state.columnWidths.set(
      new Map([
        ['id', 75],
        ['name', 250],
        ['age', 100],
      ]),
    );
    state.hiddenColumnInfo.set(
      new Map([['name', { column: 'name', leftNeighbor: 'id', rightNeighbor: 'age' }]]),
    );

    const snapshot = captureSnapshot(state);
    state.columnWidths.set(new Map());
    state.hiddenColumnInfo.set(new Map());
    applySnapshot(state, snapshot);

    expect(state.columnWidths.get().size).toBe(3);
    expect(state.columnWidths.get().get('name')).toBe(250);
    expect(state.hiddenColumnInfo.get().size).toBe(1);
    expect(state.hiddenColumnInfo.get().get('name')!.leftNeighbor).toBe('id');
    expect(state.hiddenColumnInfo.get().get('name')!.rightNeighbor).toBe('age');
  });
});

// --- Equality-guarded applySnapshot tests ---

describe('applySnapshot — equality-guarded signal updates', () => {
  it('should not notify any signal when snapshot matches current state', () => {
    const state = setupState();
    state.filters.set([{ type: 'range', column: 'age', min: 10, max: 50 }]);
    state.sortColumns.set([{ column: 'age', direction: 'asc' }]);
    state.pinnedColumns.set(['id']);
    state.columnWidths.set(new Map([['id', 80]]));

    const snapshot = captureSnapshot(state);

    // Subscribe to all signals AFTER capture
    const callbacks = {
      filters: vi.fn(),
      sortColumns: vi.fn(),
      visibleColumns: vi.fn(),
      columnOrder: vi.fn(),
      columnWidths: vi.fn(),
      pinnedColumns: vi.fn(),
      hiddenColumnInfo: vi.fn(),
    };
    state.filters.subscribe(callbacks.filters);
    state.sortColumns.subscribe(callbacks.sortColumns);
    state.visibleColumns.subscribe(callbacks.visibleColumns);
    state.columnOrder.subscribe(callbacks.columnOrder);
    state.columnWidths.subscribe(callbacks.columnWidths);
    state.pinnedColumns.subscribe(callbacks.pinnedColumns);
    state.hiddenColumnInfo.subscribe(callbacks.hiddenColumnInfo);

    // Apply same state back
    applySnapshot(state, snapshot);

    // No signal should have been notified
    expect(callbacks.filters).not.toHaveBeenCalled();
    expect(callbacks.sortColumns).not.toHaveBeenCalled();
    expect(callbacks.visibleColumns).not.toHaveBeenCalled();
    expect(callbacks.columnOrder).not.toHaveBeenCalled();
    expect(callbacks.columnWidths).not.toHaveBeenCalled();
    expect(callbacks.pinnedColumns).not.toHaveBeenCalled();
    expect(callbacks.hiddenColumnInfo).not.toHaveBeenCalled();
  });

  it('should only notify filters signal when only filters changed', () => {
    const state = setupState();
    state.pinnedColumns.set(['id']);
    state.columnWidths.set(new Map([['id', 80]]));
    const snapshot = captureSnapshot(state);

    // Now change only filters
    state.filters.set([{ type: 'range', column: 'age', min: 10, max: 50 }]);

    const callbacks = {
      filters: vi.fn(),
      visibleColumns: vi.fn(),
      columnOrder: vi.fn(),
      columnWidths: vi.fn(),
      pinnedColumns: vi.fn(),
      hiddenColumnInfo: vi.fn(),
    };
    state.filters.subscribe(callbacks.filters);
    state.visibleColumns.subscribe(callbacks.visibleColumns);
    state.columnOrder.subscribe(callbacks.columnOrder);
    state.columnWidths.subscribe(callbacks.columnWidths);
    state.pinnedColumns.subscribe(callbacks.pinnedColumns);
    state.hiddenColumnInfo.subscribe(callbacks.hiddenColumnInfo);

    applySnapshot(state, snapshot);

    // Only filters should fire
    expect(callbacks.filters).toHaveBeenCalledTimes(1);
    expect(callbacks.visibleColumns).not.toHaveBeenCalled();
    expect(callbacks.columnOrder).not.toHaveBeenCalled();
    expect(callbacks.columnWidths).not.toHaveBeenCalled();
    expect(callbacks.pinnedColumns).not.toHaveBeenCalled();
    expect(callbacks.hiddenColumnInfo).not.toHaveBeenCalled();
  });

  it('should detect Date equality in range filters', () => {
    const state = setupState();
    const d1 = new Date('2020-01-01T00:00:00Z');
    const d2 = new Date('2024-12-31T00:00:00Z');
    state.filters.set([{ type: 'range', column: 'age', min: d1, max: d2 }]);

    const snapshot = captureSnapshot(state);

    // Replace with new Date objects that have the same timestamp
    state.filters.set([
      {
        type: 'range',
        column: 'age',
        min: new Date(d1.getTime()),
        max: new Date(d2.getTime()),
      },
    ]);

    const cb = vi.fn();
    state.filters.subscribe(cb);

    applySnapshot(state, snapshot);

    // Dates are structurally equal → no notification
    expect(cb).not.toHaveBeenCalled();
  });

  it('should detect changes in set filter values', () => {
    const state = setupState();
    state.filters.set([{ type: 'set', column: 'name', values: ['Alice', 'Bob'] }]);

    const snapshot = captureSnapshot(state);

    // Change values
    state.filters.set([{ type: 'set', column: 'name', values: ['Alice', 'Charlie'] }]);

    const cb = vi.fn();
    state.filters.subscribe(cb);

    applySnapshot(state, snapshot);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('should detect change when optional filter booleans differ', () => {
    const state = setupState();
    state.filters.set([{ type: 'range', column: 'age', min: 0, max: 100, maxInclusive: true }]);

    const snapshot = captureSnapshot(state);

    // Remove the optional flag
    state.filters.set([{ type: 'range', column: 'age', min: 0, max: 100 }]);

    const cb = vi.fn();
    state.filters.subscribe(cb);

    applySnapshot(state, snapshot);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('should detect changes in each signal type independently', () => {
    const state = setupState();
    const snapshot = captureSnapshot(state);

    // Change only pinnedColumns
    state.pinnedColumns.set(['id']);

    const cbPinned = vi.fn();
    const cbVisible = vi.fn();
    state.pinnedColumns.subscribe(cbPinned);
    state.visibleColumns.subscribe(cbVisible);

    applySnapshot(state, snapshot);

    expect(cbPinned).toHaveBeenCalledTimes(1);
    expect(cbVisible).not.toHaveBeenCalled();
  });

  it('should handle empty arrays and maps correctly', () => {
    const state = setupState();
    // State already has empty filters, sortColumns, pinnedColumns, columnWidths, hiddenColumnInfo
    const snapshot = captureSnapshot(state);

    const callbacks = {
      filters: vi.fn(),
      sortColumns: vi.fn(),
      pinnedColumns: vi.fn(),
      columnWidths: vi.fn(),
      hiddenColumnInfo: vi.fn(),
    };
    state.filters.subscribe(callbacks.filters);
    state.sortColumns.subscribe(callbacks.sortColumns);
    state.pinnedColumns.subscribe(callbacks.pinnedColumns);
    state.columnWidths.subscribe(callbacks.columnWidths);
    state.hiddenColumnInfo.subscribe(callbacks.hiddenColumnInfo);

    applySnapshot(state, snapshot);

    expect(callbacks.filters).not.toHaveBeenCalled();
    expect(callbacks.sortColumns).not.toHaveBeenCalled();
    expect(callbacks.pinnedColumns).not.toHaveBeenCalled();
    expect(callbacks.columnWidths).not.toHaveBeenCalled();
    expect(callbacks.hiddenColumnInfo).not.toHaveBeenCalled();
  });
});

// --- derivedColumnsEqual tests ---

describe('derivedColumnsEqual', () => {
  it('returns true for two empty arrays', () => {
    expect(derivedColumnsEqual([], [])).toBe(true);
  });

  it('returns false for different lengths', () => {
    const a: DerivedColumnDef[] = [{ kind: 'expression', name: 'x', expression: '1+1' }];
    expect(derivedColumnsEqual(a, [])).toBe(false);
  });

  it('returns true for identical expression columns', () => {
    const a: DerivedColumnDef[] = [{ kind: 'expression', name: 'total', expression: 'a * b' }];
    const b: DerivedColumnDef[] = [{ kind: 'expression', name: 'total', expression: 'a * b' }];
    expect(derivedColumnsEqual(a, b)).toBe(true);
  });

  it('returns false when names differ', () => {
    const a: DerivedColumnDef[] = [{ kind: 'expression', name: 'total', expression: 'a * b' }];
    const b: DerivedColumnDef[] = [{ kind: 'expression', name: 'sum', expression: 'a * b' }];
    expect(derivedColumnsEqual(a, b)).toBe(false);
  });

  it('returns false when expressions differ', () => {
    const a: DerivedColumnDef[] = [{ kind: 'expression', name: 'x', expression: 'a + b' }];
    const b: DerivedColumnDef[] = [{ kind: 'expression', name: 'x', expression: 'a - b' }];
    expect(derivedColumnsEqual(a, b)).toBe(false);
  });

  it('returns false when kinds differ', () => {
    const a: DerivedColumnDef[] = [{ kind: 'expression', name: 'x', expression: '1' }];
    const b: DerivedColumnDef[] = [
      { kind: 'vector', name: 'x', vectorType: 'integer', values: [1] },
    ];
    expect(derivedColumnsEqual(a, b)).toBe(false);
  });

  it('returns true for vector columns with identical values', () => {
    const a: DerivedColumnDef[] = [
      { kind: 'vector', name: 'v', vectorType: 'float', values: [1, 2, 3] },
    ];
    const b: DerivedColumnDef[] = [
      { kind: 'vector', name: 'v', vectorType: 'float', values: [1, 2, 3] },
    ];
    expect(derivedColumnsEqual(a, b)).toBe(true);
  });

  it('returns false for vector columns with different first values', () => {
    const a: DerivedColumnDef[] = [
      { kind: 'vector', name: 'v', vectorType: 'float', values: [1, 2, 3] },
    ];
    const b: DerivedColumnDef[] = [
      { kind: 'vector', name: 'v', vectorType: 'float', values: [4, 2, 3] },
    ];
    expect(derivedColumnsEqual(a, b)).toBe(false);
  });

  it('returns false for vector columns with different last values', () => {
    const a: DerivedColumnDef[] = [
      { kind: 'vector', name: 'v', vectorType: 'float', values: [1, 2, 3] },
    ];
    const b: DerivedColumnDef[] = [
      { kind: 'vector', name: 'v', vectorType: 'float', values: [1, 2, 9] },
    ];
    expect(derivedColumnsEqual(a, b)).toBe(false);
  });

  it('returns false for vector columns with different middle values', () => {
    const a: DerivedColumnDef[] = [
      { kind: 'vector', name: 'v', vectorType: 'float', values: [1, 2, 3, 4, 5] },
    ];
    const b: DerivedColumnDef[] = [
      { kind: 'vector', name: 'v', vectorType: 'float', values: [1, 2, 9, 4, 5] },
    ];
    expect(derivedColumnsEqual(a, b)).toBe(false);
  });

  it('returns false for vector columns with different lengths', () => {
    const a: DerivedColumnDef[] = [
      { kind: 'vector', name: 'v', vectorType: 'float', values: [1, 2] },
    ];
    const b: DerivedColumnDef[] = [
      { kind: 'vector', name: 'v', vectorType: 'float', values: [1, 2, 3] },
    ];
    expect(derivedColumnsEqual(a, b)).toBe(false);
  });

  it('returns false for vector columns with different vectorType', () => {
    const a: DerivedColumnDef[] = [
      { kind: 'vector', name: 'v', vectorType: 'integer', values: [1, 2, 3] },
    ];
    const b: DerivedColumnDef[] = [
      { kind: 'vector', name: 'v', vectorType: 'float', values: [1, 2, 3] },
    ];
    expect(derivedColumnsEqual(a, b)).toBe(false);
  });

  it('returns true for empty vector columns with same type', () => {
    const a: DerivedColumnDef[] = [{ kind: 'vector', name: 'v', vectorType: 'float', values: [] }];
    const b: DerivedColumnDef[] = [{ kind: 'vector', name: 'v', vectorType: 'float', values: [] }];
    expect(derivedColumnsEqual(a, b)).toBe(true);
  });

  it('handles multiple columns in order', () => {
    const a: DerivedColumnDef[] = [
      { kind: 'expression', name: 'x', expression: '1' },
      { kind: 'vector', name: 'y', vectorType: 'integer', values: [1, 2] },
    ];
    const b: DerivedColumnDef[] = [
      { kind: 'expression', name: 'x', expression: '1' },
      { kind: 'vector', name: 'y', vectorType: 'integer', values: [1, 2] },
    ];
    expect(derivedColumnsEqual(a, b)).toBe(true);
  });

  it('handles multiple columns with differing vector values', () => {
    const a: DerivedColumnDef[] = [
      { kind: 'expression', name: 'x', expression: '1' },
      { kind: 'vector', name: 'y', vectorType: 'integer', values: [1, 2] },
    ];
    const b: DerivedColumnDef[] = [
      { kind: 'expression', name: 'x', expression: '1' },
      { kind: 'vector', name: 'y', vectorType: 'integer', values: [3, 4] },
    ];
    expect(derivedColumnsEqual(a, b)).toBe(false);
  });
});

// --- captureSnapshot with derivedColumns ---

describe('captureSnapshot — derivedColumns', () => {
  it('captures empty derivedColumns by default', () => {
    const state = setupState();
    const snapshot = captureSnapshot(state);
    expect(snapshot.derivedColumns).toEqual([]);
  });

  it('captures expression derived columns', () => {
    const state = setupState();
    state.derivedColumns.set([{ kind: 'expression', name: 'total', expression: 'id * 2' }]);
    const snapshot = captureSnapshot(state);
    expect(snapshot.derivedColumns).toHaveLength(1);
    expect(snapshot.derivedColumns[0]).toEqual({
      kind: 'expression',
      name: 'total',
      expression: 'id * 2',
    });
  });

  it('captures vector derived columns', () => {
    const state = setupState();
    state.derivedColumns.set([
      { kind: 'vector', name: 'scores', vectorType: 'float', values: [1, 2, 3] },
    ]);
    const snapshot = captureSnapshot(state);
    expect(snapshot.derivedColumns).toHaveLength(1);
    expect(snapshot.derivedColumns[0].kind).toBe('vector');
  });

  it('creates independent copies of derived column defs', () => {
    const state = setupState();
    const exprDef: ExpressionColumnDef = { kind: 'expression', name: 'x', expression: 'a+b' };
    state.derivedColumns.set([exprDef]);

    const snapshot = captureSnapshot(state);

    // Different object reference
    expect(snapshot.derivedColumns[0]).not.toBe(exprDef);
    expect(snapshot.derivedColumns[0]).toEqual(exprDef);
  });
});
