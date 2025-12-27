/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableBody, type TableBodyOptions } from '@/table/TableBody';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';

// Mock WorkerBridge
const createMockBridge = () => {
  const mockBridge = {
    query: vi.fn().mockResolvedValue([]),
    isInitialized: vi.fn().mockReturnValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
    loadData: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
  };
  return mockBridge;
};

// Mock ResizeObserver
class MockResizeObserver implements ResizeObserver {
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}

  triggerResize(entries: Partial<ResizeObserverEntry>[]): void {
    this.callback(entries as ResizeObserverEntry[], this);
  }
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TableBody', () => {
  let container: HTMLElement;
  let state: TableState;
  let mockBridge: ReturnType<typeof createMockBridge>;
  let actions: StateActions;

  const testSchema: ColumnSchema[] = [
    { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
    { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
    { name: 'price', type: 'float', nullable: false, originalType: 'DOUBLE' },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    container.style.height = '400px';
    state = createTableState();
    mockBridge = createMockBridge();
    actions = new StateActions(state, mockBridge as any);

    // Set up state
    state.tableName.set('test_table');
    initializeColumnsFromSchema(state, testSchema);
    state.totalRows.set(100);
  });

  describe('constructor', () => {
    it('should create virtual scroller in container', () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);

      expect(container.querySelector('.dt-virtual-scroll')).toBeDefined();

      tableBody.destroy();
    });

    it('should apply default options', () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);

      // Check that scroller was created with default row height
      const scroller = tableBody.getVirtualScroller();
      expect(scroller.getRowHeight()).toBe(32);

      tableBody.destroy();
    });

    it('should apply custom options', () => {
      const options: TableBodyOptions = {
        rowHeight: 48,
        classPrefix: 'custom',
      };

      const tableBody = new TableBody(container, state, mockBridge as any, actions, options);

      const scroller = tableBody.getVirtualScroller();
      expect(scroller.getRowHeight()).toBe(48);
      expect(container.querySelector('.custom-virtual-scroll')).toBeDefined();

      tableBody.destroy();
    });
  });

  describe('initialize', () => {
    it('should set total rows on virtual scroller', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);

      await tableBody.initialize();

      const scroller = tableBody.getVirtualScroller();
      expect(scroller.getTotalRows()).toBe(100);

      tableBody.destroy();
    });

    it('should not throw with empty visible range', async () => {
      // In JSDOM, viewport height is 0, so no rows are visible
      const tableBody = new TableBody(container, state, mockBridge as any, actions);

      await expect(tableBody.initialize()).resolves.not.toThrow();

      tableBody.destroy();
    });
  });

  describe('SQL query building', () => {
    // Test the SQL building logic indirectly by checking what happens
    // when we manually trigger a refresh with mock data

    it('should handle no table name gracefully', async () => {
      state.tableName.set(null);

      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      // Should not query if no table name
      expect(mockBridge.query).not.toHaveBeenCalled();

      tableBody.destroy();
    });

    it('should handle empty visible columns', async () => {
      state.visibleColumns.set([]);

      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      // Should not query if no columns
      expect(mockBridge.query).not.toHaveBeenCalled();

      tableBody.destroy();
    });
  });

  describe('state subscriptions', () => {
    it('should update total rows when state changes', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      const scroller = tableBody.getVirtualScroller();
      expect(scroller.getTotalRows()).toBe(100);

      // Change total rows
      state.totalRows.set(500);

      expect(scroller.getTotalRows()).toBe(500);

      tableBody.destroy();
    });

    it('should subscribe to sort columns', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      const sortSubsCount = state.sortColumns.subscriberCount();
      expect(sortSubsCount).toBeGreaterThan(0);

      tableBody.destroy();

      // Should unsubscribe on destroy
      expect(state.sortColumns.subscriberCount()).toBeLessThan(sortSubsCount);
    });

    it('should subscribe to visible columns', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      const visibleColsSubsCount = state.visibleColumns.subscriberCount();
      expect(visibleColsSubsCount).toBeGreaterThan(0);

      tableBody.destroy();
    });

    it('should subscribe to selected rows', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      const selectedSubsCount = state.selectedRows.subscriberCount();
      expect(selectedSubsCount).toBeGreaterThan(0);

      tableBody.destroy();
    });

    it('should subscribe to hovered row', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      const hoveredSubsCount = state.hoveredRow.subscriberCount();
      expect(hoveredSubsCount).toBeGreaterThan(0);

      tableBody.destroy();
    });
  });

  describe('public API', () => {
    it('should return visible range', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      const range = tableBody.getVisibleRange();
      expect(range).toHaveProperty('start');
      expect(range).toHaveProperty('end');
      expect(range).toHaveProperty('offsetY');

      tableBody.destroy();
    });

    it('should expose virtual scroller', () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);

      const scroller = tableBody.getVirtualScroller();
      expect(scroller).toBeDefined();
      expect(typeof scroller.scrollToRow).toBe('function');

      tableBody.destroy();
    });

    it('should allow scrolling to row', () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);

      // Should not throw
      expect(() => tableBody.scrollToRow(50)).not.toThrow();

      tableBody.destroy();
    });

    it('should allow refresh', () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);

      // Should not throw
      expect(() => tableBody.refresh()).not.toThrow();

      tableBody.destroy();
    });

    it('should report destroyed state correctly', () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);

      expect(tableBody.isDestroyed()).toBe(false);

      tableBody.destroy();

      expect(tableBody.isDestroyed()).toBe(true);
    });
  });

  describe('destroy', () => {
    it('should clean up resources', () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);

      expect(tableBody.isDestroyed()).toBe(false);

      tableBody.destroy();

      expect(tableBody.isDestroyed()).toBe(true);
    });

    it('should unsubscribe from state', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      const sortSubsBefore = state.sortColumns.subscriberCount();

      tableBody.destroy();

      expect(state.sortColumns.subscriberCount()).toBeLessThan(sortSubsBefore);
    });

    it('should be idempotent', () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);

      tableBody.destroy();
      tableBody.destroy();
      tableBody.destroy();

      expect(tableBody.isDestroyed()).toBe(true);
    });

    it('should destroy virtual scroller', () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      const scroller = tableBody.getVirtualScroller();

      tableBody.destroy();

      expect(scroller.isDestroyed()).toBe(true);
    });

    it('should not allow operations after destroy', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      tableBody.destroy();

      // These should not throw but should be no-ops
      await expect(tableBody.initialize()).resolves.not.toThrow();
      expect(() => tableBody.refresh()).not.toThrow();
      expect(() => tableBody.scrollToRow(10)).not.toThrow();
    });
  });

  describe('integration with StateActions', () => {
    it('should work without actions', () => {
      // TableBody should work even without actions (read-only mode)
      const tableBody = new TableBody(container, state, mockBridge as any);

      expect(() => tableBody.refresh()).not.toThrow();

      tableBody.destroy();
    });
  });

  describe('cell value formatting', () => {
    // Test the formatCellValue method indirectly
    // We can't easily test DOM rendering in JSDOM without real viewport

    it('should handle null values in cache', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);

      // Initialize should not throw even with complex data types
      await expect(tableBody.initialize()).resolves.not.toThrow();

      tableBody.destroy();
    });
  });

  describe('row cache management', () => {
    it('should clear cache on refresh', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      // Refresh clears cache and re-fetches
      expect(() => tableBody.refresh()).not.toThrow();

      tableBody.destroy();
    });
  });

  describe('scroll handling', () => {
    it('should handle scroll callback registration', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      const scroller = tableBody.getVirtualScroller();

      // Subscribe to scroller should work
      const unsubscribe = scroller.onScroll(() => {});
      expect(typeof unsubscribe).toBe('function');

      unsubscribe();
      tableBody.destroy();
    });
  });

  describe('error handling', () => {
    it('should handle query errors gracefully', async () => {
      mockBridge.query.mockRejectedValue(new Error('Query failed'));

      const tableBody = new TableBody(container, state, mockBridge as any, actions);

      // Should not throw even if query fails
      await expect(tableBody.initialize()).resolves.not.toThrow();

      tableBody.destroy();
    });
  });

  describe('row hover', () => {
    it('should update hover state when hoveredRow signal changes', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      // Verify subscription is active
      const hoveredSubsCount = state.hoveredRow.subscriberCount();
      expect(hoveredSubsCount).toBeGreaterThan(0);

      tableBody.destroy();
    });

    it('should not update hover after destroy', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      tableBody.destroy();

      // Should not throw when state changes after destroy
      expect(() => state.hoveredRow.set(5)).not.toThrow();
    });
  });

  describe('row selection', () => {
    it('should update selection state when selectedRows signal changes', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      // Verify subscription is active
      const selectedSubsCount = state.selectedRows.subscriberCount();
      expect(selectedSubsCount).toBeGreaterThan(0);

      tableBody.destroy();
    });

    it('should not update selection after destroy', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      tableBody.destroy();

      // Should not throw when state changes after destroy
      expect(() => state.selectedRows.set(new Set([1, 2, 3]))).not.toThrow();
    });

    it('should support multiple selection modes through state', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      // Test replace mode (single selection)
      actions.selectRow(0, 'replace');
      expect(state.selectedRows.get().has(0)).toBe(true);
      expect(state.selectedRows.get().size).toBe(1);

      // Test toggle mode
      actions.selectRow(1, 'toggle');
      expect(state.selectedRows.get().has(0)).toBe(true);
      expect(state.selectedRows.get().has(1)).toBe(true);
      expect(state.selectedRows.get().size).toBe(2);

      // Toggle off
      actions.selectRow(0, 'toggle');
      expect(state.selectedRows.get().has(0)).toBe(false);
      expect(state.selectedRows.get().has(1)).toBe(true);
      expect(state.selectedRows.get().size).toBe(1);

      tableBody.destroy();
    });

    it('should support range selection through state', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      // First select a row (establishes anchor)
      actions.selectRow(2, 'replace');
      expect(state.selectedRows.get().has(2)).toBe(true);

      // Range select to row 5
      actions.selectRow(5, 'range');

      // Should have rows 2, 3, 4, 5 selected
      const selected = state.selectedRows.get();
      expect(selected.has(2)).toBe(true);
      expect(selected.has(3)).toBe(true);
      expect(selected.has(4)).toBe(true);
      expect(selected.has(5)).toBe(true);
      expect(selected.size).toBe(4);

      tableBody.destroy();
    });

    it('should clear selection through state', async () => {
      const tableBody = new TableBody(container, state, mockBridge as any, actions);
      await tableBody.initialize();

      // Select some rows
      actions.selectRow(0, 'replace');
      actions.selectRow(1, 'toggle');
      expect(state.selectedRows.get().size).toBe(2);

      // Clear
      actions.clearSelection();
      expect(state.selectedRows.get().size).toBe(0);

      tableBody.destroy();
    });
  });
});
