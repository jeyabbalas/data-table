/**
 * `setOnFilterRemove` fires for every path that can drop a filter.
 *
 * It used to fire only for undo, redo, `resetToInitial` and the derived-column
 * paths — never for `removeFilter` or `clearFilters`, which is to say never
 * for anything a user does. The documented contract ("called when a filter
 * chip is removed") was the intended one; the code implemented a narrower one,
 * and anything keyed to a filter — a chart's brush, most visibly — went stale.
 *
 * The re-entrancy tests are the load-bearing ones. Clearing a chart's brush
 * routes back through `removeFilter` while the removal that triggered it is
 * still unwinding, so the callback re-enters the very method that called it.
 * That is safe only because removals are idempotent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateActions } from '@/core/Actions';
import { UndoManager } from '@/core/UndoManager';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { Filter, ColumnSchema } from '@/core/types';

const createMockBridge = () => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue([]),
  loadData: vi.fn().mockResolvedValue(undefined),
  terminate: vi.fn(),
  isInitialized: vi.fn().mockReturnValue(true),
  clearQueryCache: vi.fn(),
});

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'age', type: 'integer', nullable: true, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

const ageFilter: Filter = { column: 'age', type: 'range', min: 18, max: 65 };
const nameFilter: Filter = { column: 'name', type: 'pattern', pattern: 'a', mode: 'contains' };

describe('setOnFilterRemove', () => {
  let state: TableState;
  let actions: StateActions;
  let removed: string[];

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, createMockBridge() as never);
    initializeColumnsFromSchema(state, SCHEMA);
    state.totalRows.set(100);
    state.filteredRows.set(100);
    removed = [];
    actions.setOnFilterRemove((column) => removed.push(column));
  });

  describe('removeFilter', () => {
    it('fires for the column that lost its filter', () => {
      actions.addFilter(ageFilter);
      actions.addFilter(nameFilter);

      actions.removeFilter('age');

      expect(removed).toEqual(['age']);
    });

    it('does not fire when the column keeps another filter of a different type', () => {
      // Only reachable by writing the signal directly: addFilter replaces by
      // column, so it cannot produce two filters on one column.
      state.filters.set([ageFilter, { column: 'age', type: 'not-null' }]);

      actions.removeFilter('age', 'range');

      expect(state.filters.get()).toEqual([{ column: 'age', type: 'not-null' }]);
      expect(removed).toEqual([]);
    });

    it('fires when the last filter of a typed removal leaves the column bare', () => {
      actions.addFilter(ageFilter);

      actions.removeFilter('age', 'range');

      expect(removed).toEqual(['age']);
    });

    it('is a no-op for a column that has no filter', () => {
      actions.addFilter(ageFilter);
      const before = state.filters.get();
      const seen = vi.fn();
      state.filters.subscribe(seen);

      actions.removeFilter('name');

      expect(removed).toEqual([]);
      // Same array identity: subscribers must not see a write at all, or every
      // stray removal costs a full filter cycle.
      expect(state.filters.get()).toBe(before);
      expect(seen).not.toHaveBeenCalled();
    });

    it('does not fire for a filter that was replaced rather than removed', () => {
      actions.addFilter(ageFilter);
      actions.addFilter({ column: 'age', type: 'not-null' });

      expect(state.filters.get()).toEqual([{ column: 'age', type: 'not-null' }]);
      expect(removed).toEqual([]);
    });

    it('sees the post-removal filter list from inside the callback', () => {
      let observed: Filter[] | null = null;
      actions.setOnFilterRemove(() => {
        observed = [...state.filters.get()];
      });
      actions.addFilter(ageFilter);
      actions.addFilter(nameFilter);

      actions.removeFilter('age');

      expect(observed).toEqual([nameFilter]);
    });
  });

  describe('clearFilters', () => {
    it('fires once per filtered column', () => {
      actions.addFilter(ageFilter);
      actions.addFilter(nameFilter);

      actions.clearFilters();

      expect(removed.sort()).toEqual(['age', 'name']);
    });

    it('fires nothing when there was nothing to clear, but still repairs the count', () => {
      state.filteredRows.set(50);
      const before = state.filters.get();

      actions.clearFilters();

      expect(removed).toEqual([]);
      expect(state.filters.get()).toBe(before);
      expect(state.filteredRows.get()).toBe(100);
    });
  });

  describe('loadFilterPreset', () => {
    it('fires only for the columns the preset drops', () => {
      actions.addFilter(ageFilter);
      actions.addFilter(nameFilter);

      actions.loadFilterPreset([{ column: 'age', type: 'not-null' }]);

      // 'age' is carried forward with a different filter — not a loss.
      expect(removed).toEqual(['name']);
    });

    it('fires for every column when the preset is empty', () => {
      actions.addFilter(ageFilter);
      actions.addFilter(nameFilter);

      actions.loadFilterPreset([]);

      expect(removed.sort()).toEqual(['age', 'name']);
    });
  });

  describe('re-entrancy', () => {
    it('a callback that removes the same filter again does not loop or re-notify', () => {
      // Exactly what a chart does: clearing its brush calls onFilterChange(null),
      // which the coordinator routes to removeFilter for the same column.
      actions.setOnFilterRemove((column) => {
        removed.push(column);
        actions.removeFilter(column);
      });
      actions.addFilter(ageFilter);

      actions.removeFilter('age');

      expect(removed).toEqual(['age']);
      expect(state.filters.get()).toEqual([]);
    });

    it('the re-entrant removal adds no second undo entry', () => {
      const undoManager = new UndoManager();
      const undoable = new StateActions(state, createMockBridge() as never, undoManager);
      undoable.setOnFilterRemove((column) => undoable.removeFilter(column));
      undoable.addFilter(ageFilter);
      const depthAfterAdd = undoManager.undoDepth;

      undoable.removeFilter('age');

      // One entry for the removal itself. A second would make Ctrl+Z a no-op
      // the first time the user pressed it.
      expect(undoManager.undoDepth).toBe(depthAfterAdd + 1);
      expect(undoManager.canUndo).toBe(true);
    });

    it('clearFilters with N filters runs one filter-list write, not N', () => {
      actions.setOnFilterRemove((column) => {
        removed.push(column);
        actions.removeFilter(column);
      });
      actions.addFilter(ageFilter);
      actions.addFilter(nameFilter);
      const writes = vi.fn();
      state.filters.subscribe(writes);

      actions.clearFilters();

      expect(removed.sort()).toEqual(['age', 'name']);
      expect(writes).toHaveBeenCalledTimes(1);
    });
  });

  describe('paths that already fired keep firing', () => {
    it('undo restores a filter and reports the removal it undid', async () => {
      const undoManager = new UndoManager();
      const undoable = new StateActions(state, createMockBridge() as never, undoManager);
      const seen: string[] = [];
      undoable.setOnFilterRemove((c) => seen.push(c));

      undoable.addFilter(ageFilter);
      undoable.removeFilter('age');
      expect(seen).toEqual(['age']);

      // Undo puts it back — nothing lost, nothing reported.
      await undoable.undo();
      expect(state.filters.get()).toEqual([ageFilter]);
      expect(seen).toEqual(['age']);

      // Redo drops it again.
      await undoable.redo();
      expect(seen).toEqual(['age', 'age']);
    });
  });
});
