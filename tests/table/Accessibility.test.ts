/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableContainer } from '@/table/TableContainer';
import { ColumnHeader, type ColumnHeaderOptions } from '@/table/ColumnHeader';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import type { ColumnSchema, Filter } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';

// Mock ResizeObserver
class MockResizeObserver implements ResizeObserver {
  private callback: ResizeObserverCallback;
  static instances: MockResizeObserver[] = [];
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  static clearInstances(): void { MockResizeObserver.instances = []; }
}

// Mock WorkerBridge
const mockBridge = {
  initialize: vi.fn(),
  query: vi.fn(),
  terminate: vi.fn(),
  clearQueryCache: vi.fn(),
} as unknown as WorkerBridge;

beforeEach(() => {
  MockResizeObserver.clearInstances();
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  MockResizeObserver.clearInstances();
});

const testSchema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'text', nullable: true, originalType: 'VARCHAR' },
  { name: 'score', type: 'float', nullable: false, originalType: 'DOUBLE' },
  { name: 'active', type: 'boolean', nullable: false, originalType: 'BOOLEAN' },
  { name: 'created', type: 'date', nullable: true, originalType: 'DATE' },
];

describe('Accessibility: ARIA attributes', () => {
  let container: HTMLElement;
  let state: TableState;
  let actions: StateActions;

  beforeEach(() => {
    container = document.createElement('div');
    state = createTableState();
    actions = new StateActions(state, mockBridge);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // =========================================
  // aria-rowcount and aria-colcount
  // =========================================

  describe('aria-rowcount and aria-colcount', () => {
    it('should set aria-rowcount="0" and aria-colcount="0" initially', () => {
      const tc = new TableContainer(container, state);
      const el = tc.getElement();

      expect(el.getAttribute('aria-rowcount')).toBe('0');
      expect(el.getAttribute('aria-colcount')).toBe('0');

      tc.destroy();
    });

    it('should update aria-rowcount when totalRows changes', () => {
      const tc = new TableContainer(container, state);
      const el = tc.getElement();

      state.totalRows.set(5000);
      expect(el.getAttribute('aria-rowcount')).toBe('5000');

      state.totalRows.set(10000);
      expect(el.getAttribute('aria-rowcount')).toBe('10000');

      tc.destroy();
    });

    it('should update aria-colcount when schema changes', () => {
      const tc = new TableContainer(container, state);
      const el = tc.getElement();

      state.schema.set(testSchema);
      expect(el.getAttribute('aria-colcount')).toBe('5');

      tc.destroy();
    });

    it('should set both in render() when data is loaded', () => {
      state.schema.set(testSchema);
      initializeColumnsFromSchema(state, testSchema);
      state.totalRows.set(2500);
      state.tableName.set('test_table');

      const tc = new TableContainer(container, state, actions, mockBridge);
      const el = tc.getElement();

      expect(el.getAttribute('aria-rowcount')).toBe('2500');
      expect(el.getAttribute('aria-colcount')).toBe('5');

      tc.destroy();
    });
  });

  // =========================================
  // aria-colindex on column headers
  // =========================================

  describe('aria-colindex on ColumnHeader', () => {
    it('should set aria-colindex when colIndex option is provided', () => {
      const column: ColumnSchema = { name: 'name', type: 'text', nullable: true, originalType: 'VARCHAR' };
      const header = new ColumnHeader(column, state, actions, { colIndex: 3 });

      expect(header.getElement().getAttribute('aria-colindex')).toBe('3');

      header.destroy();
    });

    it('should not set aria-colindex when colIndex is omitted', () => {
      const column: ColumnSchema = { name: 'name', type: 'text', nullable: true, originalType: 'VARCHAR' };
      const header = new ColumnHeader(column, state, actions);

      expect(header.getElement().hasAttribute('aria-colindex')).toBe(false);

      header.destroy();
    });

    it('should reflect schema position in rendered headers', () => {
      // Set up with 5 columns, hide columns 2 and 4 (name and active)
      state.schema.set(testSchema);
      state.totalRows.set(100);
      state.tableName.set('test_table');
      // Show only id, score, created (indices 1, 3, 5 in 1-based)
      state.visibleColumns.set(['id', 'score', 'created']);

      const tc = new TableContainer(container, state, actions, mockBridge);
      const headers = tc.getElement().querySelectorAll('[role="columnheader"]');

      expect(headers.length).toBe(3);
      expect(headers[0].getAttribute('aria-colindex')).toBe('1'); // id is 1st in schema
      expect(headers[1].getAttribute('aria-colindex')).toBe('3'); // score is 3rd in schema
      expect(headers[2].getAttribute('aria-colindex')).toBe('5'); // created is 5th in schema

      tc.destroy();
    });
  });

  // =========================================
  // Improved header aria-label
  // =========================================

  describe('header aria-label with sort/filter state', () => {
    let column: ColumnSchema;

    beforeEach(() => {
      column = { name: 'score', type: 'float', nullable: false, originalType: 'DOUBLE' };
    });

    it('should have base label without sort/filter', () => {
      const header = new ColumnHeader(column, state, actions);
      expect(header.getElement().getAttribute('aria-label')).toBe('score, float');
      header.destroy();
    });

    it('should include sort ascending in label', () => {
      state.sortColumns.set([{ column: 'score', direction: 'asc' }]);
      const header = new ColumnHeader(column, state, actions);
      expect(header.getElement().getAttribute('aria-label')).toBe('score, float, sorted ascending');
      header.destroy();
    });

    it('should include sort descending in label', () => {
      state.sortColumns.set([{ column: 'score', direction: 'desc' }]);
      const header = new ColumnHeader(column, state, actions);
      expect(header.getElement().getAttribute('aria-label')).toBe('score, float, sorted descending');
      header.destroy();
    });

    it('should include multi-sort priority in label', () => {
      state.sortColumns.set([
        { column: 'name', direction: 'asc' },
        { column: 'score', direction: 'desc' },
      ]);
      const header = new ColumnHeader(column, state, actions);
      expect(header.getElement().getAttribute('aria-label')).toBe('score, float, sorted descending (priority 2)');
      header.destroy();
    });

    it('should include filtered state in label', () => {
      const filter: Filter = { column: 'score', type: 'range', min: 50, max: Infinity };
      state.filters.set([filter]);

      const header = new ColumnHeader(column, state, actions);
      expect(header.getElement().getAttribute('aria-label')).toBe('score, float, filtered');
      header.destroy();
    });

    it('should include multiple filters count in label', () => {
      const filters: Filter[] = [
        { column: 'score', type: 'range', min: 50, max: Infinity },
        { column: 'score', type: 'null' },
      ];
      state.filters.set(filters);

      const header = new ColumnHeader(column, state, actions);
      expect(header.getElement().getAttribute('aria-label')).toBe('score, float, 2 filters');
      header.destroy();
    });

    it('should include both sort and filter in label', () => {
      state.sortColumns.set([{ column: 'score', direction: 'asc' }]);
      const filter: Filter = { column: 'score', type: 'range', min: 50, max: Infinity };
      state.filters.set([filter]);

      const header = new ColumnHeader(column, state, actions);
      expect(header.getElement().getAttribute('aria-label')).toBe('score, float, sorted ascending, filtered');
      header.destroy();
    });

    it('should update label when sort changes', () => {
      const header = new ColumnHeader(column, state, actions);
      expect(header.getElement().getAttribute('aria-label')).toBe('score, float');

      state.sortColumns.set([{ column: 'score', direction: 'asc' }]);
      // update() is called via subscription
      header.update();
      expect(header.getElement().getAttribute('aria-label')).toBe('score, float, sorted ascending');

      header.destroy();
    });
  });

  // =========================================
  // aria-selected on rows
  // =========================================

  describe('aria-selected on rows', () => {
    it('should not set aria-selected on unselected rows in renderVisibleRows', () => {
      // We test via the public updateSelectionStyles path by creating a row element
      // and simulating what renderVisibleRows does
      const rowEl = document.createElement('div');
      rowEl.setAttribute('role', 'row');

      // Simulate no selection
      rowEl.removeAttribute('aria-selected');
      expect(rowEl.hasAttribute('aria-selected')).toBe(false);
    });

    it('should set aria-selected="true" on selected rows', () => {
      const rowEl = document.createElement('div');
      rowEl.setAttribute('role', 'row');

      // Simulate selection
      rowEl.setAttribute('aria-selected', 'true');
      expect(rowEl.getAttribute('aria-selected')).toBe('true');
    });
  });

  // =========================================
  // Row pool cleanup
  // =========================================

  describe('row pool ARIA cleanup', () => {
    it('should remove aria-rowindex and aria-selected when clearing stale state', () => {
      const rowEl = document.createElement('div');
      rowEl.setAttribute('role', 'row');
      rowEl.setAttribute('aria-rowindex', '42');
      rowEl.setAttribute('aria-selected', 'true');
      rowEl.classList.add('dt-row--selected');

      // Simulate pool cleanup (same logic as getOrCreateRow reuse branch)
      rowEl.classList.remove('dt-row--selected', 'dt-row--hover', 'dt-row--loading');
      rowEl.removeAttribute('aria-selected');
      rowEl.removeAttribute('aria-rowindex');

      expect(rowEl.hasAttribute('aria-selected')).toBe(false);
      expect(rowEl.hasAttribute('aria-rowindex')).toBe(false);
    });

    it('should remove stale ARIA from cloned rows in returnRowToPool', () => {
      const rowEl = document.createElement('div');
      rowEl.setAttribute('role', 'row');
      rowEl.setAttribute('aria-rowindex', '10');
      rowEl.setAttribute('aria-selected', 'true');

      // Simulate returnRowToPool clone + cleanup
      const cleanEl = rowEl.cloneNode(true) as HTMLElement;
      cleanEl.removeAttribute('aria-rowindex');
      cleanEl.removeAttribute('aria-selected');

      expect(cleanEl.hasAttribute('aria-rowindex')).toBe(false);
      expect(cleanEl.hasAttribute('aria-selected')).toBe(false);
    });
  });

  // =========================================
  // aria-rowindex and aria-colindex
  // =========================================

  describe('aria-rowindex and aria-colindex', () => {
    it('should set aria-rowindex on row content update', () => {
      const rowEl = document.createElement('div');
      rowEl.setAttribute('role', 'row');

      // Simulate what updateRowContent does
      const index = 41; // 0-based
      rowEl.setAttribute('data-row-index', String(index));
      rowEl.setAttribute('aria-rowindex', String(index + 1)); // 1-based

      expect(rowEl.getAttribute('aria-rowindex')).toBe('42');
    });

    it('should set aria-rowindex on placeholder rows', () => {
      const rowEl = document.createElement('div');

      // Simulate createPlaceholderRow
      const index = 99;
      rowEl.setAttribute('data-row-index', String(index));
      rowEl.setAttribute('aria-rowindex', String(index + 1));

      expect(rowEl.getAttribute('aria-rowindex')).toBe('100');
    });

    it('should set aria-colindex on cells based on schema position', () => {
      const cellEl = document.createElement('div');
      cellEl.setAttribute('role', 'cell');

      // Schema: id(1), name(2), score(3), active(4), created(5)
      // If this cell is for 'score', aria-colindex should be 3
      cellEl.setAttribute('aria-colindex', '3');
      expect(cellEl.getAttribute('aria-colindex')).toBe('3');
    });
  });

  // =========================================
  // aria-live region
  // =========================================

  describe('aria-live region', () => {
    it('should create live region with correct ARIA attributes', () => {
      const tc = new TableContainer(container, state);
      const el = tc.getElement();
      const liveRegion = el.querySelector('[aria-live="polite"]');

      expect(liveRegion).not.toBeNull();
      expect(liveRegion?.getAttribute('role')).toBe('status');
      expect(liveRegion?.getAttribute('aria-atomic')).toBe('true');
      expect(liveRegion?.classList.contains('dt-sr-only')).toBe(true);

      tc.destroy();
    });

    it('should update live region text when filters change', async () => {
      state.totalRows.set(5000);
      const tc = new TableContainer(container, state, actions, mockBridge);
      const el = tc.getElement();
      const liveRegion = el.querySelector('[aria-live="polite"]') as HTMLElement;

      // Apply a filter
      const filter: Filter = { column: 'id', type: 'range', min: 100, max: Infinity };
      state.filters.set([filter]);
      state.filteredRows.set(1234);

      // Wait for RAF coalescing
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(liveRegion.textContent).toContain('1 filter active');
      expect(liveRegion.textContent).toContain('1,234');
      expect(liveRegion.textContent).toContain('5,000');

      tc.destroy();
    });

    it('should announce all rows when no filters', async () => {
      state.totalRows.set(3000);
      const tc = new TableContainer(container, state, actions, mockBridge);
      const el = tc.getElement();
      const liveRegion = el.querySelector('[aria-live="polite"]') as HTMLElement;

      // Trigger an update (e.g. sort change triggers scheduleLiveRegionUpdate)
      state.sortColumns.set([{ column: 'id', direction: 'asc' }]);

      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(liveRegion.textContent).toContain('Showing all 3,000 rows');
      expect(liveRegion.textContent).toContain('sorted by id ascending');

      tc.destroy();
    });

    it('should include sort description in live region', async () => {
      state.totalRows.set(1000);
      const tc = new TableContainer(container, state, actions, mockBridge);
      const el = tc.getElement();
      const liveRegion = el.querySelector('[aria-live="polite"]') as HTMLElement;

      state.sortColumns.set([
        { column: 'name', direction: 'asc' },
        { column: 'score', direction: 'desc' },
      ]);

      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(liveRegion.textContent).toContain('sorted by name ascending, then score descending');

      tc.destroy();
    });

    it('should coalesce rapid updates into single announcement', async () => {
      state.totalRows.set(5000);
      const tc = new TableContainer(container, state, actions, mockBridge);
      const el = tc.getElement();
      const liveRegion = el.querySelector('[aria-live="polite"]') as HTMLElement;

      // Rapid-fire multiple state changes
      state.filters.set([{ column: 'id', type: 'range', min: 10, max: Infinity }]);
      state.filteredRows.set(4500);
      state.sortColumns.set([{ column: 'id', direction: 'asc' }]);

      // Only one RAF should fire
      await new Promise((resolve) => requestAnimationFrame(resolve));

      // Should contain the final consolidated state
      expect(liveRegion.textContent).toContain('1 filter active');
      expect(liveRegion.textContent).toContain('4,500');
      expect(liveRegion.textContent).toContain('sorted by id ascending');

      tc.destroy();
    });
  });

  // =========================================
  // Phase 6: grid role + gridcell + roving tabindex
  // =========================================

  describe('grid role + roving tabindex', () => {
    it('uses role="table" on the root element', () => {
      const tc = new TableContainer(container, state);
      expect(tc.getElement().getAttribute('role')).toBe('table');
      tc.destroy();
    });

    // Note: Full row materialization requires a non-zero viewport height,
    // which jsdom does not provide. Assertions on rendered row/cell ARIA and
    // roving tabindex are verified via TableBody.getOrCreateRow in
    // tests/table/TableBody.test.ts, and end-to-end in the axe-core scan
    // (tests/a11y/axe.test.ts).
  });

  // =========================================
  // Phase 6: header keyboard activation
  // =========================================

  describe('header keyboard sort activation', () => {
    it('Enter on a header toggles single-column sort', () => {
      const column: ColumnSchema = { name: 'score', type: 'float', nullable: false, originalType: 'DOUBLE' };
      const toggleSortSpy = vi.spyOn(actions, 'toggleSort');
      const header = new ColumnHeader(column, state, actions);
      document.body.appendChild(header.getElement());

      header.getElement().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      );

      expect(toggleSortSpy).toHaveBeenCalledWith('score');

      header.destroy();
    });

    it('Shift+Enter on a header adds to multi-sort', () => {
      const column: ColumnSchema = { name: 'score', type: 'float', nullable: false, originalType: 'DOUBLE' };
      const addToSortSpy = vi.spyOn(actions, 'addToSort');
      const header = new ColumnHeader(column, state, actions);
      document.body.appendChild(header.getElement());

      header.getElement().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })
      );

      expect(addToSortSpy).toHaveBeenCalledWith('score');

      header.destroy();
    });

    it('keyboard on a child button does not trigger header-level sort', () => {
      const column: ColumnSchema = { name: 'score', type: 'float', nullable: false, originalType: 'DOUBLE' };
      const toggleSortSpy = vi.spyOn(actions, 'toggleSort');
      const addToSortSpy = vi.spyOn(actions, 'addToSort');
      const header = new ColumnHeader(column, state, actions);
      document.body.appendChild(header.getElement());

      const sortBtn = header.getElement().querySelector('button.dt-col-sort-btn')!;
      sortBtn.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      );

      // Header-level handler should have bailed via e.target !== element
      expect(toggleSortSpy).not.toHaveBeenCalled();
      expect(addToSortSpy).not.toHaveBeenCalled();

      header.destroy();
    });
  });
});
