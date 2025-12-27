/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableContainer, type TableContainerOptions } from '@/table/TableContainer';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';

// Mock ResizeObserver
class MockResizeObserver implements ResizeObserver {
  private callback: ResizeObserverCallback;
  private observedElements: Set<Element> = new Set();
  static instances: MockResizeObserver[] = [];

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observedElements.add(element);
  }

  unobserve(element: Element): void {
    this.observedElements.delete(element);
  }

  disconnect(): void {
    this.observedElements.clear();
  }

  // Helper to trigger resize
  triggerResize(entries: Partial<ResizeObserverEntry>[]): void {
    this.callback(entries as ResizeObserverEntry[], this);
  }

  getObservedElements(): Set<Element> {
    return this.observedElements;
  }

  static getLastInstance(): MockResizeObserver | undefined {
    return MockResizeObserver.instances[MockResizeObserver.instances.length - 1];
  }

  static clearInstances(): void {
    MockResizeObserver.instances = [];
  }
}

// Setup mock before tests
beforeEach(() => {
  MockResizeObserver.clearInstances();
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  MockResizeObserver.clearInstances();
});

describe('TableContainer', () => {
  let container: HTMLElement;
  let state: TableState;

  beforeEach(() => {
    container = document.createElement('div');
    state = createTableState();
  });

  describe('constructor', () => {
    it('should create DOM structure with correct elements', () => {
      const tableContainer = new TableContainer(container, state);

      expect(tableContainer.getElement()).toBeDefined();
      expect(tableContainer.getHeaderRow()).toBeDefined();
      expect(tableContainer.getBodyContainer()).toBeDefined();

      tableContainer.destroy();
    });

    it('should apply default options', () => {
      const tableContainer = new TableContainer(container, state);

      const options = tableContainer.getOptions();
      expect(options.rowHeight).toBe(32);
      expect(options.headerHeight).toBe(120);
      expect(options.classPrefix).toBe('dt');

      tableContainer.destroy();
    });

    it('should apply custom options', () => {
      const customOptions: TableContainerOptions = {
        rowHeight: 40,
        headerHeight: 150,
        classPrefix: 'custom',
      };

      const tableContainer = new TableContainer(container, state, undefined, undefined, customOptions);

      const options = tableContainer.getOptions();
      expect(options.rowHeight).toBe(40);
      expect(options.headerHeight).toBe(150);
      expect(options.classPrefix).toBe('custom');

      tableContainer.destroy();
    });

    it('should partially override default options', () => {
      const tableContainer = new TableContainer(container, state, undefined, undefined, {
        rowHeight: 50,
      });

      const options = tableContainer.getOptions();
      expect(options.rowHeight).toBe(50);
      expect(options.headerHeight).toBe(120); // default
      expect(options.classPrefix).toBe('dt'); // default

      tableContainer.destroy();
    });

    it('should set up resize observer', () => {
      const tableContainer = new TableContainer(container, state);
      const mockInstance = MockResizeObserver.getLastInstance();

      expect(mockInstance).toBeDefined();
      expect(mockInstance?.getObservedElements().has(tableContainer.getElement())).toBe(true);

      tableContainer.destroy();
    });

    it('should append element to container', () => {
      const tableContainer = new TableContainer(container, state);

      expect(container.contains(tableContainer.getElement())).toBe(true);

      tableContainer.destroy();
    });
  });

  describe('DOM structure', () => {
    it('should have root element with correct class', () => {
      const tableContainer = new TableContainer(container, state);

      expect(tableContainer.getElement().className).toBe('dt-root');

      tableContainer.destroy();
    });

    it('should have root element with custom class prefix', () => {
      const tableContainer = new TableContainer(container, state, undefined, undefined, {
        classPrefix: 'my-table',
      });

      expect(tableContainer.getElement().className).toBe('my-table-root');

      tableContainer.destroy();
    });

    it('should have header row element with correct class', () => {
      const tableContainer = new TableContainer(container, state);

      expect(tableContainer.getHeaderRow().className).toBe('dt-header');

      tableContainer.destroy();
    });

    it('should have body container element with correct class', () => {
      const tableContainer = new TableContainer(container, state);

      expect(tableContainer.getBodyContainer().className).toBe('dt-body');

      tableContainer.destroy();
    });

    it('should have correct ARIA roles', () => {
      const tableContainer = new TableContainer(container, state);

      expect(tableContainer.getElement().getAttribute('role')).toBe('table');
      expect(tableContainer.getHeaderRow().getAttribute('role')).toBe('rowgroup');
      expect(tableContainer.getBodyContainer().getAttribute('role')).toBe('rowgroup');

      tableContainer.destroy();
    });

    it('should have header and body inside scroll structure', () => {
      const tableContainer = new TableContainer(container, state);
      const root = tableContainer.getElement();

      // New structure: root > scrollContainer > tableInner > (header + body)
      const scrollContainer = root.children[0];
      expect(scrollContainer.className).toContain('scroll-container');

      const tableInner = scrollContainer.children[0];
      expect(tableInner.className).toContain('table-inner');

      expect(tableInner.children[0]).toBe(tableContainer.getHeaderRow());
      expect(tableInner.children[1]).toBe(tableContainer.getBodyContainer());

      tableContainer.destroy();
    });

    it('should set header min-height based on options', () => {
      const tableContainer = new TableContainer(container, state, undefined, undefined, {
        headerHeight: 200,
      });

      expect(tableContainer.getHeaderRow().style.minHeight).toBe('200px');

      tableContainer.destroy();
    });
  });

  describe('resize observer', () => {
    it('should fire callback on size change', () => {
      const tableContainer = new TableContainer(container, state);
      const mockInstance = MockResizeObserver.getLastInstance();
      const resizeCallback = vi.fn();

      tableContainer.onResize(resizeCallback);

      // Trigger resize
      mockInstance?.triggerResize([
        {
          contentRect: { width: 800, height: 600 } as DOMRectReadOnly,
          target: tableContainer.getElement(),
        },
      ]);

      expect(resizeCallback).toHaveBeenCalledWith({ width: 800, height: 600 });

      tableContainer.destroy();
    });

    it('should provide dimensions via getDimensions', () => {
      const tableContainer = new TableContainer(container, state);
      const mockInstance = MockResizeObserver.getLastInstance();

      // Trigger resize
      mockInstance?.triggerResize([
        {
          contentRect: { width: 1024, height: 768 } as DOMRectReadOnly,
          target: tableContainer.getElement(),
        },
      ]);

      expect(tableContainer.getDimensions()).toEqual({ width: 1024, height: 768 });

      tableContainer.destroy();
    });

    it('should not notify if dimensions have not changed', () => {
      const tableContainer = new TableContainer(container, state);
      const mockInstance = MockResizeObserver.getLastInstance();
      const resizeCallback = vi.fn();

      tableContainer.onResize(resizeCallback);

      // First resize
      mockInstance?.triggerResize([
        {
          contentRect: { width: 800, height: 600 } as DOMRectReadOnly,
          target: tableContainer.getElement(),
        },
      ]);

      expect(resizeCallback).toHaveBeenCalledTimes(1);

      // Same dimensions again
      mockInstance?.triggerResize([
        {
          contentRect: { width: 800, height: 600 } as DOMRectReadOnly,
          target: tableContainer.getElement(),
        },
      ]);

      // Should still be 1 (no additional call)
      expect(resizeCallback).toHaveBeenCalledTimes(1);

      tableContainer.destroy();
    });

    it('should call callback immediately with current dimensions if available', () => {
      const tableContainer = new TableContainer(container, state);
      const mockInstance = MockResizeObserver.getLastInstance();

      // Set initial dimensions
      mockInstance?.triggerResize([
        {
          contentRect: { width: 500, height: 400 } as DOMRectReadOnly,
          target: tableContainer.getElement(),
        },
      ]);

      // Subscribe after resize
      const resizeCallback = vi.fn();
      tableContainer.onResize(resizeCallback);

      // Should be called immediately with current dimensions
      expect(resizeCallback).toHaveBeenCalledWith({ width: 500, height: 400 });

      tableContainer.destroy();
    });

    it('should allow unsubscribing from resize events', () => {
      const tableContainer = new TableContainer(container, state);
      const mockInstance = MockResizeObserver.getLastInstance();
      const resizeCallback = vi.fn();

      const unsubscribe = tableContainer.onResize(resizeCallback);

      // First resize should trigger callback
      mockInstance?.triggerResize([
        {
          contentRect: { width: 800, height: 600 } as DOMRectReadOnly,
          target: tableContainer.getElement(),
        },
      ]);

      expect(resizeCallback).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Second resize should not trigger callback
      mockInstance?.triggerResize([
        {
          contentRect: { width: 900, height: 700 } as DOMRectReadOnly,
          target: tableContainer.getElement(),
        },
      ]);

      expect(resizeCallback).toHaveBeenCalledTimes(1); // Still 1

      tableContainer.destroy();
    });
  });

  describe('state subscriptions', () => {
    it('should re-render when schema changes', () => {
      const tableContainer = new TableContainer(container, state);
      const renderSpy = vi.spyOn(tableContainer, 'render');

      const schema: ColumnSchema[] = [
        { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
      ];

      state.schema.set(schema);

      expect(renderSpy).toHaveBeenCalled();

      tableContainer.destroy();
    });

    it('should re-render when visible columns change', () => {
      const tableContainer = new TableContainer(container, state);
      const renderSpy = vi.spyOn(tableContainer, 'render');

      state.visibleColumns.set(['col1', 'col2']);

      expect(renderSpy).toHaveBeenCalled();

      tableContainer.destroy();
    });

    it('should re-render when column widths change', () => {
      const tableContainer = new TableContainer(container, state);
      const renderSpy = vi.spyOn(tableContainer, 'render');

      state.columnWidths.set(new Map([['col1', 100]]));

      expect(renderSpy).toHaveBeenCalled();

      tableContainer.destroy();
    });
  });

  describe('render', () => {
    it('should show placeholder when no data is loaded', () => {
      const tableContainer = new TableContainer(container, state);

      const body = tableContainer.getBodyContainer();
      expect(body.textContent).toContain('Load data to see the table');

      tableContainer.destroy();
    });

    it('should show column info when data is loaded', () => {
      const tableContainer = new TableContainer(container, state);

      // Set up state with data
      state.tableName.set('test_table');
      const schema: ColumnSchema[] = [
        { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
        { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
      ];
      initializeColumnsFromSchema(state, schema);
      state.totalRows.set(1000);

      // Re-render
      tableContainer.render();

      const header = tableContainer.getHeaderRow();
      expect(header.textContent).toContain('id');
      expect(header.textContent).toContain('integer');
      expect(header.textContent).toContain('name');
      expect(header.textContent).toContain('string');

      const body = tableContainer.getBodyContainer();
      expect(body.textContent).toContain('1,000 rows');

      tableContainer.destroy();
    });

    it('should not render if destroyed', () => {
      const tableContainer = new TableContainer(container, state);

      // Get the body container before destroy
      const bodyContainer = tableContainer.getBodyContainer();
      const initialContent = bodyContainer.innerHTML;

      tableContainer.destroy();

      // Verify it's destroyed
      expect(tableContainer.isDestroyed()).toBe(true);

      // Calling render should not throw and should not modify content
      tableContainer.render();

      // Content should remain unchanged (render was skipped)
      expect(bodyContainer.innerHTML).toBe(initialContent);
    });
  });

  describe('destroy', () => {
    it('should remove element from container', () => {
      const tableContainer = new TableContainer(container, state);
      const element = tableContainer.getElement();

      expect(container.contains(element)).toBe(true);

      tableContainer.destroy();

      expect(container.contains(element)).toBe(false);
    });

    it('should disconnect resize observer', () => {
      const tableContainer = new TableContainer(container, state);
      const mockInstance = MockResizeObserver.getLastInstance();

      tableContainer.destroy();

      expect(mockInstance?.getObservedElements().size).toBe(0);
    });

    it('should unsubscribe from state', () => {
      const tableContainer = new TableContainer(container, state);

      // Get subscriber counts before destroy
      const schemaSubsBefore = state.schema.subscriberCount();

      tableContainer.destroy();

      // Subscriber count should decrease
      expect(state.schema.subscriberCount()).toBeLessThan(schemaSubsBefore);
    });

    it('should prevent further renders', () => {
      const tableContainer = new TableContainer(container, state);

      tableContainer.destroy();

      // Changing state should not cause issues
      state.tableName.set('test');
      state.schema.set([
        { name: 'x', type: 'string', nullable: false, originalType: 'VARCHAR' },
      ]);

      // Should not throw and render should be skipped
      expect(tableContainer.isDestroyed()).toBe(true);
    });

    it('should clear resize callbacks', () => {
      const tableContainer = new TableContainer(container, state);
      const mockInstance = MockResizeObserver.getLastInstance();
      const resizeCallback = vi.fn();

      tableContainer.onResize(resizeCallback);

      tableContainer.destroy();

      // Triggering resize after destroy should not call callback
      mockInstance?.triggerResize([
        {
          contentRect: { width: 800, height: 600 } as DOMRectReadOnly,
          target: tableContainer.getElement(),
        },
      ]);

      expect(resizeCallback).not.toHaveBeenCalled();
    });

    it('should be idempotent', () => {
      const tableContainer = new TableContainer(container, state);

      // Call destroy multiple times
      tableContainer.destroy();
      tableContainer.destroy();
      tableContainer.destroy();

      // Should not throw
      expect(tableContainer.isDestroyed()).toBe(true);
    });
  });

  describe('isDestroyed', () => {
    it('should return false before destroy', () => {
      const tableContainer = new TableContainer(container, state);

      expect(tableContainer.isDestroyed()).toBe(false);

      tableContainer.destroy();
    });

    it('should return true after destroy', () => {
      const tableContainer = new TableContainer(container, state);

      tableContainer.destroy();

      expect(tableContainer.isDestroyed()).toBe(true);
    });
  });
});
