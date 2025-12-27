import { describe, it, expect, vi } from 'vitest';
import {
  createTableState,
  resetTableState,
  initializeColumnsFromSchema,
  type TableState,
} from '@/core/State';
import type { ColumnSchema, Filter, SortColumn } from '@/core/types';

describe('State', () => {
  describe('createTableState', () => {
    it('should create a TableState with all signals initialized', () => {
      const state = createTableState();

      // Check that all properties exist and are signals
      expect(state.tableName).toBeDefined();
      expect(state.schema).toBeDefined();
      expect(state.totalRows).toBeDefined();
      expect(state.filters).toBeDefined();
      expect(state.filteredRows).toBeDefined();
      expect(state.sortColumns).toBeDefined();
      expect(state.visibleColumns).toBeDefined();
      expect(state.columnOrder).toBeDefined();
      expect(state.columnWidths).toBeDefined();
      expect(state.pinnedColumns).toBeDefined();
      expect(state.selectedRows).toBeDefined();
      expect(state.hoveredRow).toBeDefined();
      expect(state.hoveredColumn).toBeDefined();
    });

    it('should initialize tableName to null', () => {
      const state = createTableState();
      expect(state.tableName.get()).toBeNull();
    });

    it('should initialize schema to empty array', () => {
      const state = createTableState();
      expect(state.schema.get()).toEqual([]);
    });

    it('should initialize totalRows to 0', () => {
      const state = createTableState();
      expect(state.totalRows.get()).toBe(0);
    });

    it('should initialize filters to empty array', () => {
      const state = createTableState();
      expect(state.filters.get()).toEqual([]);
    });

    it('should initialize filteredRows to 0', () => {
      const state = createTableState();
      expect(state.filteredRows.get()).toBe(0);
    });

    it('should initialize sortColumns to empty array', () => {
      const state = createTableState();
      expect(state.sortColumns.get()).toEqual([]);
    });

    it('should initialize visibleColumns to empty array', () => {
      const state = createTableState();
      expect(state.visibleColumns.get()).toEqual([]);
    });

    it('should initialize columnOrder to empty array', () => {
      const state = createTableState();
      expect(state.columnOrder.get()).toEqual([]);
    });

    it('should initialize columnWidths to empty Map', () => {
      const state = createTableState();
      expect(state.columnWidths.get()).toBeInstanceOf(Map);
      expect(state.columnWidths.get().size).toBe(0);
    });

    it('should initialize pinnedColumns to empty array', () => {
      const state = createTableState();
      expect(state.pinnedColumns.get()).toEqual([]);
    });

    it('should initialize selectedRows to empty Set', () => {
      const state = createTableState();
      expect(state.selectedRows.get()).toBeInstanceOf(Set);
      expect(state.selectedRows.get().size).toBe(0);
    });

    it('should initialize hoveredRow to null', () => {
      const state = createTableState();
      expect(state.hoveredRow.get()).toBeNull();
    });

    it('should initialize hoveredColumn to null', () => {
      const state = createTableState();
      expect(state.hoveredColumn.get()).toBeNull();
    });
  });

  describe('signal updates', () => {
    it('should update tableName and notify subscribers', () => {
      const state = createTableState();
      const callback = vi.fn();

      state.tableName.subscribe(callback);
      state.tableName.set('test_table');

      expect(callback).toHaveBeenCalledWith('test_table');
      expect(state.tableName.get()).toBe('test_table');
    });

    it('should update schema and notify subscribers', () => {
      const state = createTableState();
      const callback = vi.fn();
      const schema: ColumnSchema[] = [
        { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
        { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
      ];

      state.schema.subscribe(callback);
      state.schema.set(schema);

      expect(callback).toHaveBeenCalledWith(schema);
      expect(state.schema.get()).toEqual(schema);
    });

    it('should update totalRows and notify subscribers', () => {
      const state = createTableState();
      const callback = vi.fn();

      state.totalRows.subscribe(callback);
      state.totalRows.set(1000);

      expect(callback).toHaveBeenCalledWith(1000);
      expect(state.totalRows.get()).toBe(1000);
    });

    it('should update filters and notify subscribers', () => {
      const state = createTableState();
      const callback = vi.fn();
      const filters: Filter[] = [
        { column: 'age', type: 'range', value: { min: 18, max: 65 } },
      ];

      state.filters.subscribe(callback);
      state.filters.set(filters);

      expect(callback).toHaveBeenCalledWith(filters);
      expect(state.filters.get()).toEqual(filters);
    });

    it('should update sortColumns and notify subscribers', () => {
      const state = createTableState();
      const callback = vi.fn();
      const sortColumns: SortColumn[] = [
        { column: 'name', direction: 'asc' },
        { column: 'age', direction: 'desc' },
      ];

      state.sortColumns.subscribe(callback);
      state.sortColumns.set(sortColumns);

      expect(callback).toHaveBeenCalledWith(sortColumns);
      expect(state.sortColumns.get()).toEqual(sortColumns);
    });

    it('should update columnWidths with new Map', () => {
      const state = createTableState();
      const callback = vi.fn();
      const widths = new Map<string, number>([
        ['name', 200],
        ['age', 100],
      ]);

      state.columnWidths.subscribe(callback);
      state.columnWidths.set(widths);

      expect(callback).toHaveBeenCalledWith(widths);
      expect(state.columnWidths.get().get('name')).toBe(200);
      expect(state.columnWidths.get().get('age')).toBe(100);
    });

    it('should update selectedRows with new Set', () => {
      const state = createTableState();
      const callback = vi.fn();
      const selected = new Set([1, 5, 10]);

      state.selectedRows.subscribe(callback);
      state.selectedRows.set(selected);

      expect(callback).toHaveBeenCalledWith(selected);
      expect(state.selectedRows.get().has(1)).toBe(true);
      expect(state.selectedRows.get().has(5)).toBe(true);
      expect(state.selectedRows.get().has(10)).toBe(true);
    });

    it('should update hoveredRow and notify subscribers', () => {
      const state = createTableState();
      const callback = vi.fn();

      state.hoveredRow.subscribe(callback);
      state.hoveredRow.set(42);

      expect(callback).toHaveBeenCalledWith(42);
      expect(state.hoveredRow.get()).toBe(42);
    });

    it('should update hoveredColumn and notify subscribers', () => {
      const state = createTableState();
      const callback = vi.fn();

      state.hoveredColumn.subscribe(callback);
      state.hoveredColumn.set('email');

      expect(callback).toHaveBeenCalledWith('email');
      expect(state.hoveredColumn.get()).toBe('email');
    });
  });

  describe('signal independence', () => {
    it('should not affect other signals when one is updated', () => {
      const state = createTableState();
      const tableNameCallback = vi.fn();
      const totalRowsCallback = vi.fn();

      state.tableName.subscribe(tableNameCallback);
      state.totalRows.subscribe(totalRowsCallback);

      state.tableName.set('test');

      expect(tableNameCallback).toHaveBeenCalledWith('test');
      expect(totalRowsCallback).not.toHaveBeenCalled();
    });
  });

  describe('resetTableState', () => {
    it('should reset all signals to initial values', () => {
      const state = createTableState();

      // Set various values
      state.tableName.set('my_table');
      state.totalRows.set(1000);
      state.filters.set([{ column: 'x', type: 'null', value: null }]);
      state.filteredRows.set(500);
      state.sortColumns.set([{ column: 'id', direction: 'asc' }]);
      state.visibleColumns.set(['a', 'b', 'c']);
      state.columnOrder.set(['c', 'b', 'a']);
      state.columnWidths.set(new Map([['a', 100]]));
      state.pinnedColumns.set(['a']);
      state.selectedRows.set(new Set([1, 2, 3]));
      state.hoveredRow.set(5);
      state.hoveredColumn.set('x');

      // Reset
      resetTableState(state);

      // Verify all reset
      expect(state.tableName.get()).toBeNull();
      expect(state.schema.get()).toEqual([]);
      expect(state.totalRows.get()).toBe(0);
      expect(state.filters.get()).toEqual([]);
      expect(state.filteredRows.get()).toBe(0);
      expect(state.sortColumns.get()).toEqual([]);
      expect(state.visibleColumns.get()).toEqual([]);
      expect(state.columnOrder.get()).toEqual([]);
      expect(state.columnWidths.get().size).toBe(0);
      expect(state.pinnedColumns.get()).toEqual([]);
      expect(state.selectedRows.get().size).toBe(0);
      expect(state.hoveredRow.get()).toBeNull();
      expect(state.hoveredColumn.get()).toBeNull();
    });

    it('should notify subscribers when resetting', () => {
      const state = createTableState();
      const callback = vi.fn();

      state.tableName.set('test');
      state.tableName.subscribe(callback);

      resetTableState(state);

      expect(callback).toHaveBeenCalledWith(null);
    });
  });

  describe('initializeColumnsFromSchema', () => {
    it('should set schema, visibleColumns, and columnOrder from schema', () => {
      const state = createTableState();
      const schema: ColumnSchema[] = [
        { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
        { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
        { name: 'email', type: 'string', nullable: true, originalType: 'VARCHAR' },
      ];

      initializeColumnsFromSchema(state, schema);

      expect(state.schema.get()).toEqual(schema);
      expect(state.visibleColumns.get()).toEqual(['id', 'name', 'email']);
      expect(state.columnOrder.get()).toEqual(['id', 'name', 'email']);
    });

    it('should reset columnWidths to empty Map', () => {
      const state = createTableState();
      state.columnWidths.set(new Map([['old', 100]]));

      const schema: ColumnSchema[] = [
        { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
      ];

      initializeColumnsFromSchema(state, schema);

      expect(state.columnWidths.get().size).toBe(0);
    });

    it('should reset pinnedColumns to empty array', () => {
      const state = createTableState();
      state.pinnedColumns.set(['old_column']);

      const schema: ColumnSchema[] = [
        { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
      ];

      initializeColumnsFromSchema(state, schema);

      expect(state.pinnedColumns.get()).toEqual([]);
    });

    it('should handle empty schema', () => {
      const state = createTableState();

      initializeColumnsFromSchema(state, []);

      expect(state.schema.get()).toEqual([]);
      expect(state.visibleColumns.get()).toEqual([]);
      expect(state.columnOrder.get()).toEqual([]);
    });

    it('should notify subscribers when initializing', () => {
      const state = createTableState();
      const schemaCallback = vi.fn();
      const visibleCallback = vi.fn();

      state.schema.subscribe(schemaCallback);
      state.visibleColumns.subscribe(visibleCallback);

      const schema: ColumnSchema[] = [
        { name: 'test', type: 'string', nullable: false, originalType: 'VARCHAR' },
      ];

      initializeColumnsFromSchema(state, schema);

      expect(schemaCallback).toHaveBeenCalledWith(schema);
      expect(visibleCallback).toHaveBeenCalledWith(['test']);
    });
  });

  describe('Map and Set reference equality', () => {
    it('should not notify if same Map reference is set', () => {
      const state = createTableState();
      const callback = vi.fn();
      const widths = new Map<string, number>();

      state.columnWidths.set(widths);
      state.columnWidths.subscribe(callback);
      state.columnWidths.set(widths); // Same reference

      expect(callback).not.toHaveBeenCalled();
    });

    it('should notify if new Map with same content is set', () => {
      const state = createTableState();
      const callback = vi.fn();

      state.columnWidths.set(new Map([['a', 100]]));
      state.columnWidths.subscribe(callback);
      state.columnWidths.set(new Map([['a', 100]])); // New reference

      expect(callback).toHaveBeenCalled();
    });

    it('should not notify if same Set reference is set', () => {
      const state = createTableState();
      const callback = vi.fn();
      const selected = new Set<number>();

      state.selectedRows.set(selected);
      state.selectedRows.subscribe(callback);
      state.selectedRows.set(selected); // Same reference

      expect(callback).not.toHaveBeenCalled();
    });

    it('should notify if new Set with same content is set', () => {
      const state = createTableState();
      const callback = vi.fn();

      state.selectedRows.set(new Set([1, 2, 3]));
      state.selectedRows.subscribe(callback);
      state.selectedRows.set(new Set([1, 2, 3])); // New reference

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('multiple state instances', () => {
    it('should create independent state instances', () => {
      const state1 = createTableState();
      const state2 = createTableState();

      state1.tableName.set('table1');
      state2.tableName.set('table2');

      expect(state1.tableName.get()).toBe('table1');
      expect(state2.tableName.get()).toBe('table2');
    });
  });
});
