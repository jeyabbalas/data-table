import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { AutoSave } from '@/persistence/AutoSave';
import type { SessionStore } from '@/persistence/SessionStore';

// --- Test helpers ---

const schema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

function setupState(): TableState {
  const state = createTableState();
  state.tableName.set('test_table');
  state.totalRows.set(100);
  state.filteredRows.set(100);
  initializeColumnsFromSchema(state, schema);
  return state;
}

function createMockStore(): SessionStore {
  return {
    open: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue(undefined),
    saveSync: vi.fn(),
    load: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  } as unknown as SessionStore;
}

// =========================================
// AutoSave
// =========================================

describe('AutoSave', () => {
  let state: TableState;
  let store: SessionStore;

  beforeEach(() => {
    vi.useFakeTimers();
    state = setupState();
    store = createMockStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // --- Debounce behavior ---

  describe('debounce', () => {
    it('saves once after debounce period for a single change', () => {
      const autoSave = new AutoSave(state, store);
      autoSave.enable();

      state.filters.set([{ type: 'null', column: 'name' }]);
      expect(store.save).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      expect(store.save).toHaveBeenCalledTimes(1);

      autoSave.destroy();
    });

    it('coalesces rapid changes into a single save', () => {
      const autoSave = new AutoSave(state, store);
      autoSave.enable();

      state.filters.set([{ type: 'null', column: 'name' }]);
      state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
      state.pinnedColumns.set(['id']);
      state.visibleColumns.set(['id']);
      state.columnOrder.set(['id', 'name']);

      vi.advanceTimersByTime(1000);
      expect(store.save).toHaveBeenCalledTimes(1);

      autoSave.destroy();
    });

    it('resets debounce timer on each change', () => {
      const autoSave = new AutoSave(state, store);
      autoSave.enable();

      state.filters.set([{ type: 'null', column: 'name' }]);
      vi.advanceTimersByTime(800);
      expect(store.save).not.toHaveBeenCalled();

      // Another change resets the timer
      state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
      vi.advanceTimersByTime(800);
      expect(store.save).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);
      expect(store.save).toHaveBeenCalledTimes(1);

      autoSave.destroy();
    });

    it('uses custom debounceMs', () => {
      const autoSave = new AutoSave(state, store, { debounceMs: 500 });
      autoSave.enable();

      state.filters.set([{ type: 'null', column: 'name' }]);

      vi.advanceTimersByTime(499);
      expect(store.save).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(store.save).toHaveBeenCalledTimes(1);

      autoSave.destroy();
    });

    it('triggers separate saves for changes separated by debounce period', () => {
      const autoSave = new AutoSave(state, store);
      autoSave.enable();

      state.filters.set([{ type: 'null', column: 'name' }]);
      vi.advanceTimersByTime(1000);
      expect(store.save).toHaveBeenCalledTimes(1);

      state.sortColumns.set([{ column: 'id', direction: 'desc' }]);
      vi.advanceTimersByTime(1000);
      expect(store.save).toHaveBeenCalledTimes(2);

      autoSave.destroy();
    });
  });

  // --- derivedColumns signal ---

  describe('derivedColumns signal', () => {
    it('triggers save when derivedColumns changes', () => {
      const autoSave = new AutoSave(state, store);
      autoSave.enable();

      state.derivedColumns.set([
        { kind: 'expression', name: 'total', expression: 'id * 2' },
      ]);

      vi.advanceTimersByTime(1000);
      expect(store.save).toHaveBeenCalledTimes(1);

      autoSave.destroy();
    });
  });

  // --- Lifecycle ---

  describe('enable / disable', () => {
    it('does not save before enable', () => {
      const autoSave = new AutoSave(state, store);

      state.filters.set([{ type: 'null', column: 'name' }]);
      vi.advanceTimersByTime(2000);
      expect(store.save).not.toHaveBeenCalled();

      autoSave.destroy();
    });

    it('flushes pending save via saveSync and stops future saves', () => {
      const autoSave = new AutoSave(state, store);
      autoSave.enable();

      state.filters.set([{ type: 'null', column: 'name' }]);
      autoSave.disable();

      // disable() flushes in-flight state — otherwise a reload whose
      // beforeunload handler triggers destroy() before AutoSave's own
      // flush handler would lose the pending change.
      expect(store.saveSync).toHaveBeenCalledTimes(1);

      // No further saves should fire from the debounce timer or new changes.
      vi.advanceTimersByTime(2000);
      expect(store.save).not.toHaveBeenCalled();
      expect(store.saveSync).toHaveBeenCalledTimes(1);
    });

    it('does not flush on disable when no save is pending', () => {
      const autoSave = new AutoSave(state, store);
      autoSave.enable();

      autoSave.disable();
      expect(store.saveSync).not.toHaveBeenCalled();
    });

    it('can re-enable after disable', () => {
      const autoSave = new AutoSave(state, store);
      autoSave.enable();
      autoSave.disable();
      autoSave.enable();

      state.filters.set([{ type: 'null', column: 'name' }]);
      vi.advanceTimersByTime(1000);
      expect(store.save).toHaveBeenCalledTimes(1);

      autoSave.destroy();
    });

    it('enable is idempotent — does not double-subscribe', () => {
      const autoSave = new AutoSave(state, store);
      autoSave.enable();
      autoSave.enable();

      state.filters.set([{ type: 'null', column: 'name' }]);
      vi.advanceTimersByTime(1000);
      // Should still be exactly 1 save, not 2
      expect(store.save).toHaveBeenCalledTimes(1);

      autoSave.destroy();
    });
  });

  describe('destroy', () => {
    it('flushes pending save via saveSync, then stops future saves', () => {
      const autoSave = new AutoSave(state, store);
      autoSave.enable();

      state.filters.set([{ type: 'null', column: 'name' }]);
      autoSave.destroy();

      // destroy() delegates to disable() which flushes in-flight state.
      expect(store.saveSync).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2000);
      expect(store.save).not.toHaveBeenCalled();
      expect(store.saveSync).toHaveBeenCalledTimes(1);
    });

    it('prevents re-enable after destroy', () => {
      const autoSave = new AutoSave(state, store);
      autoSave.destroy();
      autoSave.enable();

      state.filters.set([{ type: 'null', column: 'name' }]);
      vi.advanceTimersByTime(2000);
      expect(store.save).not.toHaveBeenCalled();
    });
  });

  // --- Edge cases ---

  describe('edge cases', () => {
    it('skips save when tableName is null', () => {
      const state = createTableState();
      initializeColumnsFromSchema(state, schema);
      // tableName is null by default

      const autoSave = new AutoSave(state, store);
      autoSave.enable();

      state.filters.set([{ type: 'null', column: 'name' }]);
      vi.advanceTimersByTime(1000);
      expect(store.save).not.toHaveBeenCalled();

      autoSave.destroy();
    });

    it('saves snapshot with current state values', () => {
      const autoSave = new AutoSave(state, store);
      autoSave.enable();

      state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
      state.pinnedColumns.set(['id']);
      vi.advanceTimersByTime(1000);

      expect(store.save).toHaveBeenCalledTimes(1);
      const snapshot = (store.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(snapshot.tableName).toBe('test_table');
      expect(snapshot.sortColumns).toEqual([{ column: 'id', direction: 'asc' }]);
      expect(snapshot.pinnedColumns).toEqual(['id']);

      autoSave.destroy();
    });

    it('responds to columnWidths and hiddenColumnInfo changes', () => {
      const autoSave = new AutoSave(state, store);
      autoSave.enable();

      state.columnWidths.set(new Map([['id', 200]]));
      vi.advanceTimersByTime(1000);
      expect(store.save).toHaveBeenCalledTimes(1);

      state.hiddenColumnInfo.set(
        new Map([
          ['name', { column: 'name', leftNeighbor: 'id', rightNeighbor: null }],
        ]),
      );
      vi.advanceTimersByTime(1000);
      expect(store.save).toHaveBeenCalledTimes(2);

      autoSave.destroy();
    });
  });

  // --- Flush ---

  describe('flushPendingSave', () => {
    it('executes pending save immediately via synchronous saveSync', () => {
      const autoSave = new AutoSave(state, store);
      autoSave.enable();

      state.filters.set([{ type: 'null', column: 'name' }]);
      // Timer is pending but hasn't fired
      expect(store.saveSync).not.toHaveBeenCalled();

      autoSave.flushPendingSave();
      expect(store.saveSync).toHaveBeenCalledTimes(1);

      // Original timer should be cleared — advancing time should not produce another save
      vi.advanceTimersByTime(2000);
      expect(store.saveSync).toHaveBeenCalledTimes(1);

      autoSave.destroy();
    });

    it('is a no-op when no save is pending', () => {
      const autoSave = new AutoSave(state, store);
      autoSave.enable();

      autoSave.flushPendingSave();
      expect(store.saveSync).not.toHaveBeenCalled();

      autoSave.destroy();
    });

    it('is a no-op after save has already fired', () => {
      const autoSave = new AutoSave(state, store);
      autoSave.enable();

      state.filters.set([{ type: 'null', column: 'name' }]);
      vi.advanceTimersByTime(1000);
      expect(store.save).toHaveBeenCalledTimes(1);

      autoSave.flushPendingSave();
      // saveSync should not be called — the async save already handled it
      expect(store.saveSync).not.toHaveBeenCalled();

      autoSave.destroy();
    });
  });
});
