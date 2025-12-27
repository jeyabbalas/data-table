import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { Filter, ColumnSchema } from '@/core/types';

// Mock WorkerBridge
const createMockBridge = () => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue([]),
  loadData: vi.fn().mockResolvedValue(undefined),
  terminate: vi.fn(),
  isInitialized: vi.fn().mockReturnValue(true),
});

describe('StateActions', () => {
  let state: TableState;
  let mockBridge: ReturnType<typeof createMockBridge>;
  let actions: StateActions;

  // Sample schema for testing
  const sampleSchema: ColumnSchema[] = [
    { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
    { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
    { name: 'age', type: 'integer', nullable: true, originalType: 'INTEGER' },
    { name: 'email', type: 'string', nullable: true, originalType: 'VARCHAR' },
  ];

  beforeEach(() => {
    state = createTableState();
    mockBridge = createMockBridge();
    actions = new StateActions(state, mockBridge as any);

    // Initialize with sample schema for most tests
    initializeColumnsFromSchema(state, sampleSchema);
    state.totalRows.set(100);
    state.filteredRows.set(100);
  });

  describe('Filter Actions', () => {
    it('addFilter() should add filter to empty list', () => {
      const filter: Filter = { column: 'age', type: 'range', value: { min: 18, max: 65 } };

      actions.addFilter(filter);

      expect(state.filters.get()).toEqual([filter]);
    });

    it('addFilter() should add multiple filters for different columns', () => {
      const filter1: Filter = { column: 'age', type: 'range', value: { min: 18, max: 65 } };
      const filter2: Filter = { column: 'name', type: 'pattern', value: 'John' };

      actions.addFilter(filter1);
      actions.addFilter(filter2);

      expect(state.filters.get()).toEqual([filter1, filter2]);
    });

    it('addFilter() should replace existing filter for same column/type', () => {
      const filter1: Filter = { column: 'age', type: 'range', value: { min: 18, max: 65 } };
      const filter2: Filter = { column: 'age', type: 'range', value: { min: 21, max: 50 } };

      actions.addFilter(filter1);
      actions.addFilter(filter2);

      expect(state.filters.get()).toEqual([filter2]);
    });

    it('addFilter() should allow different filter types for same column', () => {
      const filter1: Filter = { column: 'age', type: 'range', value: { min: 18 } };
      const filter2: Filter = { column: 'age', type: 'not-null', value: null };

      actions.addFilter(filter1);
      actions.addFilter(filter2);

      expect(state.filters.get()).toEqual([filter1, filter2]);
    });

    it('removeFilter(column) should remove all filters for column', () => {
      actions.addFilter({ column: 'age', type: 'range', value: {} });
      actions.addFilter({ column: 'age', type: 'not-null', value: null });
      actions.addFilter({ column: 'name', type: 'pattern', value: 'test' });

      actions.removeFilter('age');

      expect(state.filters.get()).toEqual([
        { column: 'name', type: 'pattern', value: 'test' },
      ]);
    });

    it('removeFilter(column, type) should remove specific filter type', () => {
      actions.addFilter({ column: 'age', type: 'range', value: {} });
      actions.addFilter({ column: 'age', type: 'not-null', value: null });

      actions.removeFilter('age', 'range');

      expect(state.filters.get()).toEqual([
        { column: 'age', type: 'not-null', value: null },
      ]);
    });

    it('clearFilters() should remove all filters', () => {
      actions.addFilter({ column: 'age', type: 'range', value: {} });
      actions.addFilter({ column: 'name', type: 'pattern', value: 'test' });

      actions.clearFilters();

      expect(state.filters.get()).toEqual([]);
    });

    it('clearFilters() should reset filteredRows to totalRows', () => {
      state.filteredRows.set(50);

      actions.clearFilters();

      expect(state.filteredRows.get()).toBe(100);
    });
  });

  describe('Sort Actions', () => {
    it('setSort() should set sort columns directly', () => {
      const sortColumns = [
        { column: 'name', direction: 'asc' as const },
        { column: 'age', direction: 'desc' as const },
      ];

      actions.setSort(sortColumns);

      expect(state.sortColumns.get()).toEqual(sortColumns);
    });

    it('toggleSort() should cycle: none → asc', () => {
      actions.toggleSort('name');

      expect(state.sortColumns.get()).toEqual([
        { column: 'name', direction: 'asc' },
      ]);
    });

    it('toggleSort() should cycle: asc → desc', () => {
      state.sortColumns.set([{ column: 'name', direction: 'asc' }]);

      actions.toggleSort('name');

      expect(state.sortColumns.get()).toEqual([
        { column: 'name', direction: 'desc' },
      ]);
    });

    it('toggleSort() should cycle: desc → none', () => {
      state.sortColumns.set([{ column: 'name', direction: 'desc' }]);

      actions.toggleSort('name');

      expect(state.sortColumns.get()).toEqual([]);
    });

    it('toggleSort() should replace existing sort with new column', () => {
      state.sortColumns.set([{ column: 'name', direction: 'asc' }]);

      actions.toggleSort('age');

      expect(state.sortColumns.get()).toEqual([
        { column: 'age', direction: 'asc' },
      ]);
    });

    it('addToSort() should add column to multi-sort', () => {
      state.sortColumns.set([{ column: 'name', direction: 'asc' }]);

      actions.addToSort('age');

      expect(state.sortColumns.get()).toEqual([
        { column: 'name', direction: 'asc' },
        { column: 'age', direction: 'asc' },
      ]);
    });

    it('addToSort() should toggle existing column: asc → desc', () => {
      state.sortColumns.set([
        { column: 'name', direction: 'asc' },
        { column: 'age', direction: 'asc' },
      ]);

      actions.addToSort('age');

      expect(state.sortColumns.get()).toEqual([
        { column: 'name', direction: 'asc' },
        { column: 'age', direction: 'desc' },
      ]);
    });

    it('addToSort() should remove column: desc → remove', () => {
      state.sortColumns.set([
        { column: 'name', direction: 'asc' },
        { column: 'age', direction: 'desc' },
      ]);

      actions.addToSort('age');

      expect(state.sortColumns.get()).toEqual([
        { column: 'name', direction: 'asc' },
      ]);
    });

    it('clearSort() should clear all sorting', () => {
      state.sortColumns.set([
        { column: 'name', direction: 'asc' },
        { column: 'age', direction: 'desc' },
      ]);

      actions.clearSort();

      expect(state.sortColumns.get()).toEqual([]);
    });
  });

  describe('Column Visibility Actions', () => {
    it('hideColumn() should remove from visibleColumns', () => {
      actions.hideColumn('name');

      expect(state.visibleColumns.get()).toEqual(['id', 'age', 'email']);
    });

    it('hideColumn() should do nothing if column already hidden', () => {
      state.visibleColumns.set(['id', 'age']);

      actions.hideColumn('name');

      expect(state.visibleColumns.get()).toEqual(['id', 'age']);
    });

    it('showColumn() should add to visibleColumns at correct position', () => {
      state.visibleColumns.set(['id', 'age', 'email']);

      actions.showColumn('name');

      expect(state.visibleColumns.get()).toEqual(['id', 'name', 'age', 'email']);
    });

    it('showColumn() should do nothing if column already visible', () => {
      const callback = vi.fn();
      state.visibleColumns.subscribe(callback);

      actions.showColumn('name');

      expect(callback).not.toHaveBeenCalled();
    });

    it('showColumn() should handle first position correctly', () => {
      state.visibleColumns.set(['name', 'age', 'email']);

      actions.showColumn('id');

      expect(state.visibleColumns.get()).toEqual(['id', 'name', 'age', 'email']);
    });

    it('showColumn() should handle last position correctly', () => {
      state.visibleColumns.set(['id', 'name', 'age']);

      actions.showColumn('email');

      expect(state.visibleColumns.get()).toEqual(['id', 'name', 'age', 'email']);
    });

    it('setColumnOrder() should update order', () => {
      actions.setColumnOrder(['email', 'age', 'name', 'id']);

      expect(state.columnOrder.get()).toEqual(['email', 'age', 'name', 'id']);
    });

    it('setColumnOrder() should reorder visible columns', () => {
      actions.setColumnOrder(['email', 'age', 'name', 'id']);

      expect(state.visibleColumns.get()).toEqual(['email', 'age', 'name', 'id']);
    });

    it('setColumnOrder() should maintain hidden columns as hidden', () => {
      state.visibleColumns.set(['id', 'age']);

      actions.setColumnOrder(['email', 'age', 'name', 'id']);

      expect(state.visibleColumns.get()).toEqual(['age', 'id']);
    });

    it('toggleColumnPin() should pin unpinned column', () => {
      actions.toggleColumnPin('id');

      expect(state.pinnedColumns.get()).toEqual(['id']);
    });

    it('toggleColumnPin() should unpin pinned column', () => {
      state.pinnedColumns.set(['id', 'name']);

      actions.toggleColumnPin('id');

      expect(state.pinnedColumns.get()).toEqual(['name']);
    });

    it('setColumnWidth() should set width for column', () => {
      actions.setColumnWidth('name', 200);

      expect(state.columnWidths.get().get('name')).toBe(200);
    });

    it('setColumnWidth() should update existing width', () => {
      actions.setColumnWidth('name', 100);
      actions.setColumnWidth('name', 200);

      expect(state.columnWidths.get().get('name')).toBe(200);
    });
  });

  describe('Row Selection Actions', () => {
    it('selectRow(i, "replace") should replace selection', () => {
      state.selectedRows.set(new Set([1, 2, 3]));

      actions.selectRow(5, 'replace');

      expect(state.selectedRows.get()).toEqual(new Set([5]));
    });

    it('selectRow(i, "toggle") should add to selection', () => {
      state.selectedRows.set(new Set([1, 2]));

      actions.selectRow(3, 'toggle');

      expect(state.selectedRows.get()).toEqual(new Set([1, 2, 3]));
    });

    it('selectRow(i, "toggle") should remove from selection', () => {
      state.selectedRows.set(new Set([1, 2, 3]));

      actions.selectRow(2, 'toggle');

      expect(state.selectedRows.get()).toEqual(new Set([1, 3]));
    });

    it('selectRow(i, "range") should select range from last', () => {
      actions.selectRow(2, 'replace');
      actions.selectRow(5, 'range');

      expect(state.selectedRows.get()).toEqual(new Set([2, 3, 4, 5]));
    });

    it('selectRow(i, "range") should work backwards', () => {
      actions.selectRow(5, 'replace');
      actions.selectRow(2, 'range');

      expect(state.selectedRows.get()).toEqual(new Set([2, 3, 4, 5]));
    });

    it('selectRow(i, "range") should treat as replace if no previous selection', () => {
      actions.selectRow(5, 'range');

      expect(state.selectedRows.get()).toEqual(new Set([5]));
    });

    it('clearSelection() should clear all selection', () => {
      state.selectedRows.set(new Set([1, 2, 3, 4, 5]));

      actions.clearSelection();

      expect(state.selectedRows.get().size).toBe(0);
    });

    it('selectAll() should select all rows', () => {
      state.totalRows.set(5);

      actions.selectAll();

      expect(state.selectedRows.get()).toEqual(new Set([0, 1, 2, 3, 4]));
    });

    it('default mode should be replace', () => {
      state.selectedRows.set(new Set([1, 2, 3]));

      actions.selectRow(5);

      expect(state.selectedRows.get()).toEqual(new Set([5]));
    });
  });

  describe('UI State Actions', () => {
    it('setHoveredRow() should set hovered row', () => {
      actions.setHoveredRow(5);

      expect(state.hoveredRow.get()).toBe(5);
    });

    it('setHoveredRow(null) should clear hovered row', () => {
      state.hoveredRow.set(5);

      actions.setHoveredRow(null);

      expect(state.hoveredRow.get()).toBeNull();
    });

    it('setHoveredColumn() should set hovered column', () => {
      actions.setHoveredColumn('name');

      expect(state.hoveredColumn.get()).toBe('name');
    });

    it('setHoveredColumn(null) should clear hovered column', () => {
      state.hoveredColumn.set('name');

      actions.setHoveredColumn(null);

      expect(state.hoveredColumn.get()).toBeNull();
    });
  });

  describe('State change notifications', () => {
    it('should notify subscribers on filter change', () => {
      const callback = vi.fn();
      state.filters.subscribe(callback);

      actions.addFilter({ column: 'age', type: 'range', value: {} });

      expect(callback).toHaveBeenCalled();
    });

    it('should notify subscribers on sort change', () => {
      const callback = vi.fn();
      state.sortColumns.subscribe(callback);

      actions.toggleSort('name');

      expect(callback).toHaveBeenCalled();
    });

    it('should notify subscribers on visibility change', () => {
      const callback = vi.fn();
      state.visibleColumns.subscribe(callback);

      actions.hideColumn('name');

      expect(callback).toHaveBeenCalled();
    });

    it('should notify subscribers on selection change', () => {
      const callback = vi.fn();
      state.selectedRows.subscribe(callback);

      actions.selectRow(5);

      expect(callback).toHaveBeenCalled();
    });
  });
});
