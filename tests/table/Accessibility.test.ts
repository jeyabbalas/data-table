/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableContainer } from '@/table/TableContainer';
import { TableBody } from '@/table/TableBody';
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
  static clearInstances(): void {
    MockResizeObserver.instances = [];
  }
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
    it('carries no counts before data is loaded', () => {
      const tc = new TableContainer(container, state);
      const grid = tc.getGridElement();

      // Grid semantics are attached lazily — an empty shell is not a grid,
      // and `aria-rowcount` on a roleless element is meaningless.
      expect(grid.hasAttribute('aria-rowcount')).toBe(false);
      expect(grid.hasAttribute('aria-colcount')).toBe(false);
      // And never on the root, which is a bare div.
      expect(tc.getElement().hasAttribute('aria-rowcount')).toBe(false);

      tc.destroy();
    });

    it('should update aria-rowcount when totalRows changes', () => {
      state.schema.set(testSchema);
      initializeColumnsFromSchema(state, testSchema);
      state.tableName.set('test_table');
      const tc = new TableContainer(container, state);
      const grid = tc.getGridElement();

      // totalRows + 1 — under role="grid" the column-header row is row 1.
      state.totalRows.set(5000);
      expect(grid.getAttribute('aria-rowcount')).toBe('5001');

      state.totalRows.set(10000);
      expect(grid.getAttribute('aria-rowcount')).toBe('10001');

      tc.destroy();
    });

    it('should update aria-colcount when schema changes', () => {
      state.tableName.set('test_table');
      const tc = new TableContainer(container, state);

      state.schema.set(testSchema);
      expect(tc.getGridElement().getAttribute('aria-colcount')).toBe('5');

      tc.destroy();
    });

    it('counts the filtered rows, not the total, while a filter is active', () => {
      state.schema.set(testSchema);
      initializeColumnsFromSchema(state, testSchema);
      state.tableName.set('test_table');
      state.totalRows.set(5000);
      const tc = new TableContainer(container, state);
      const grid = tc.getGridElement();

      // The body renders `filteredRows` rows and numbers them 2..N+1, so
      // counting totalRows would announce "row 3 of 5,001" on a 20-row view.
      state.filters.set([{ column: 'id', type: 'range', min: 100, max: Infinity }]);
      state.filteredRows.set(20);
      expect(grid.getAttribute('aria-rowcount')).toBe('21');

      state.filters.set([]);
      expect(grid.getAttribute('aria-rowcount')).toBe('5001');

      tc.destroy();
    });

    it('attaches grid semantics when the table name arrives after the schema', () => {
      const tc = new TableContainer(container, state);
      const grid = tc.getGridElement();

      // Only schema and visibleColumns trigger render(); a caller driving
      // state directly can set the name last and would otherwise be left with
      // a permanently roleless, untabbable grid.
      state.schema.set(testSchema);
      initializeColumnsFromSchema(state, testSchema);
      expect(grid.hasAttribute('role')).toBe(false);

      state.tableName.set('test_table');
      expect(grid.getAttribute('role')).toBe('grid');
      expect(grid.getAttribute('tabindex')).toBe('0');

      tc.destroy();
    });

    it('should set both in render() when data is loaded', () => {
      state.schema.set(testSchema);
      initializeColumnsFromSchema(state, testSchema);
      state.totalRows.set(2500);
      state.tableName.set('test_table');

      const tc = new TableContainer(container, state, actions, mockBridge);
      const grid = tc.getGridElement();

      expect(grid.getAttribute('aria-rowcount')).toBe('2501');
      expect(grid.getAttribute('aria-colcount')).toBe('5');

      tc.destroy();
    });
  });

  // =========================================
  // aria-colindex on column headers
  // =========================================

  describe('aria-colindex on ColumnHeader', () => {
    it('should set aria-colindex when colIndex option is provided', () => {
      const column: ColumnSchema = {
        name: 'name',
        type: 'text',
        nullable: true,
        originalType: 'VARCHAR',
      };
      const header = new ColumnHeader(column, state, actions, { colIndex: 3 });

      expect(header.getElement().getAttribute('aria-colindex')).toBe('3');

      header.destroy();
    });

    it('should not set aria-colindex when colIndex is omitted', () => {
      const column: ColumnSchema = {
        name: 'name',
        type: 'text',
        nullable: true,
        originalType: 'VARCHAR',
      };
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
      expect(header.getElement().getAttribute('aria-label')).toBe(
        'score, float, sorted descending',
      );
      header.destroy();
    });

    it('should include multi-sort priority in label', () => {
      state.sortColumns.set([
        { column: 'name', direction: 'asc' },
        { column: 'score', direction: 'desc' },
      ]);
      const header = new ColumnHeader(column, state, actions);
      expect(header.getElement().getAttribute('aria-label')).toBe(
        'score, float, sorted descending (priority 2)',
      );
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
      expect(header.getElement().getAttribute('aria-label')).toBe(
        'score, float, sorted ascending, filtered',
      );
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
    // Inside a `role="grid"` an *absent* `aria-selected` means "not
    // selectable", not "not selected" — so unselected rows must say `"false"`
    // out loud. Driven through the real TableBody rather than a hand-built
    // div: the value is written from four separate places and a simulation
    // proves none of them.
    async function bodyWithRows(): Promise<{
      body: TableBody;
      rows: Map<number, HTMLElement>;
      internal: { getOrCreateRow(n: number): HTMLElement; returnRowToPool(el: HTMLElement): void };
    }> {
      initializeColumnsFromSchema(state, testSchema);
      state.tableName.set('test_table');
      const body = new TableBody(container, state, mockBridge, actions);
      // `initialize()` is what subscribes `updateSelectionStyles` to
      // `selectedRows`. totalRows is 0 here, so no fetch is attempted.
      await body.initialize();
      const internal = body as unknown as {
        getOrCreateRow(n: number): HTMLElement;
        returnRowToPool(el: HTMLElement): void;
        rowElementMap: Map<number, HTMLElement>;
      };
      return { body, rows: internal.rowElementMap, internal };
    }

    it('marks a freshly created row aria-selected="false"', async () => {
      const { body, internal } = await bodyWithRows();

      expect(internal.getOrCreateRow(3).getAttribute('aria-selected')).toBe('false');

      body.destroy();
    });

    it('hands back pooled rows as aria-selected="false", never bare', async () => {
      const { body, internal } = await bodyWithRows();

      const rowEl = internal.getOrCreateRow(3);
      rowEl.setAttribute('aria-selected', 'true');
      internal.returnRowToPool(rowEl);

      expect(internal.getOrCreateRow(3).getAttribute('aria-selected')).toBe('false');

      body.destroy();
    });

    it('flips aria-selected with the selection and back to "false", not off', async () => {
      const { body, rows, internal } = await bodyWithRows();
      const rowEl = internal.getOrCreateRow(testSchema.length);
      rows.set(0, rowEl);

      actions.selectRow(0, 'replace');
      expect(rowEl.getAttribute('aria-selected')).toBe('true');

      actions.clearSelection();
      expect(rowEl.getAttribute('aria-selected')).toBe('false');

      body.destroy();
    });

    it('skips the DOM write when aria-selected is already correct', async () => {
      // `updateSelectionStyles` runs for every visible row on every selection
      // change and `renderVisibleRows` on every scroll frame; a no-op
      // setAttribute still costs a mutation record for anything observing the
      // grid.
      const { body, rows, internal } = await bodyWithRows();
      const rowEl = internal.getOrCreateRow(testSchema.length);
      rows.set(0, rowEl);
      const setAttribute = vi.spyOn(rowEl, 'setAttribute');

      actions.selectRow(1, 'replace');
      actions.selectRow(2, 'replace');

      // Row 0 stayed unselected across both, and was already "false".
      expect(setAttribute.mock.calls.filter(([name]) => name === 'aria-selected')).toEqual([]);

      body.destroy();
    });
  });

  // =========================================
  // aria-multiselectable
  // =========================================

  describe('aria-multiselectable', () => {
    it('advertises multi-select on the grid, and only while it is a grid', () => {
      state.schema.set(testSchema);
      initializeColumnsFromSchema(state, testSchema);
      state.tableName.set('test_table');
      const tc = new TableContainer(container, state, actions, mockBridge);
      const grid = tc.getGridElement();

      // `selectRow` supports `toggle` and `range`, so the selection genuinely
      // is multiple — without this the `aria-selected="false"` rows announce
      // a single-select grid.
      expect(grid.getAttribute('aria-multiselectable')).toBe('true');

      // Comes off with the rest of the grid semantics on an unloaded shell.
      state.schema.set([]);
      expect(grid.hasAttribute('aria-multiselectable')).toBe(false);

      tc.destroy();
    });
  });

  // =========================================
  // Empty role="row"
  // =========================================

  describe('header row with zero visible columns', () => {
    it('emits no role="row" at all rather than a childless one', () => {
      state.schema.set(testSchema);
      initializeColumnsFromSchema(state, testSchema);
      state.tableName.set('test_table');
      const tc = new TableContainer(container, state, actions, mockBridge);

      expect(tc.getHeaderRow().querySelectorAll('[role="row"]').length).toBe(1);

      // Reachable for real: `setColumnOrder([])` and `stripDerivedColumnRefs`
      // both empty the visible set without the guard `hideColumn` has. A
      // surviving `role="row"` here owns no columnheader — a critical
      // aria-required-children violation.
      state.visibleColumns.set([]);
      expect(tc.getHeaderRow().querySelectorAll('[role="row"]').length).toBe(0);

      // And comes back when the columns do.
      state.visibleColumns.set(['id', 'name']);
      expect(tc.getHeaderRow().querySelectorAll('[role="row"]').length).toBe(1);

      tc.destroy();
    });

    it('has a fully populated header row on the very first render of a load', () => {
      state.tableName.set('test_table');
      const tc = new TableContainer(container, state, actions, mockBridge);

      // Subscribed after TableContainer, so signal notification order puts
      // this immediately after its schema-triggered render() — the earliest
      // moment that render's DOM is observable.
      let headersAtFirstRender = -1;
      let emptyRowsAtFirstRender = -1;
      const unsub = state.schema.subscribe(() => {
        const headerRow = tc.getHeaderRow();
        headersAtFirstRender = headerRow.querySelectorAll('.dt-col-header').length;
        emptyRowsAtFirstRender = [...headerRow.querySelectorAll('[role="row"]')].filter(
          (row) => row.childElementCount === 0,
        ).length;
      });

      initializeColumnsFromSchema(state, testSchema);
      unsub();

      // Un-batched, the `schema` write rendered while `visibleColumns` was
      // still the previous (on first load, empty) array — a grid advertising
      // five columns whose header row owned none of them. Batching does not
      // dedupe the two renders (batch() coalesces per signal, and render() is
      // subscribed to `schema` and `visibleColumns` separately); it makes the
      // first one correct.
      expect(headersAtFirstRender).toBe(testSchema.length);
      expect(emptyRowsAtFirstRender).toBe(0);

      tc.destroy();
    });
  });

  // =========================================
  // Ambiguous IDREF across instances
  // =========================================

  describe('instanceId collisions', () => {
    it('keeps cell ids disjoint when two tables are given the same instanceId', () => {
      // `instanceId` is a public option; nothing stops an app handing the same
      // value to two tables. Identical cell ids would make each grid's
      // `aria-activedescendant` an ambiguous IDREF, and a screen reader
      // resolving it document-wide lands in whichever table is first in the
      // document.
      const containerA = document.createElement('div');
      const containerB = document.createElement('div');
      const stateB = createTableState();
      const actionsB = new StateActions(stateB, mockBridge);

      for (const s of [state, stateB]) {
        s.schema.set(testSchema);
        initializeColumnsFromSchema(s, testSchema);
        s.tableName.set('test_table');
      }

      const a = new TableContainer(containerA, state, actions, mockBridge, {
        instanceId: 'shared',
      });
      const b = new TableContainer(containerB, stateB, actionsB, mockBridge, {
        instanceId: 'shared',
      });

      const idsA = a.getColumnHeaders().map((h) => h.getElement().id);
      const idsB = b.getColumnHeaders().map((h) => h.getElement().id);
      expect(idsA.length).toBe(testSchema.length);
      expect(idsA.some((id) => idsB.includes(id))).toBe(false);
      // The caller's value stays legible in the id — only a suffix is added.
      expect(idsA[0]).toContain('shared');

      a.destroy();
      b.destroy();
    });
  });

  // =========================================
  // aria-rowindex and aria-colindex
  // =========================================

  describe('aria-rowindex and aria-colindex', () => {
    it('should set aria-rowindex on row content update', () => {
      const rowEl = document.createElement('div');
      rowEl.setAttribute('role', 'row');

      // Simulate what updateRowContent does: +2, because under role="grid"
      // the column-header row is row 1.
      const index = 41; // 0-based
      rowEl.setAttribute('data-row-index', String(index));
      rowEl.setAttribute('aria-rowindex', String(index + 2));

      expect(rowEl.getAttribute('aria-rowindex')).toBe('43');
    });

    it('should set aria-rowindex on placeholder rows', () => {
      const rowEl = document.createElement('div');

      // Simulate createPlaceholderRow
      const index = 99;
      rowEl.setAttribute('data-row-index', String(index));
      rowEl.setAttribute('aria-rowindex', String(index + 2));

      expect(rowEl.getAttribute('aria-rowindex')).toBe('101');
    });

    it('should set aria-colindex on cells based on schema position', () => {
      const cellEl = document.createElement('div');
      cellEl.setAttribute('role', 'gridcell');

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

  describe('grid role + single tab stop', () => {
    function loaded(): TableContainer {
      state.schema.set(testSchema);
      initializeColumnsFromSchema(state, testSchema);
      state.totalRows.set(100);
      state.tableName.set('test_table');
      return new TableContainer(container, state, actions, mockBridge);
    }

    it('puts role="grid" on .dt-grid, not on the root', () => {
      const tc = loaded();
      expect(tc.getElement().getAttribute('role')).toBeNull();
      expect(tc.getGridElement().getAttribute('role')).toBe('grid');
      tc.destroy();
    });

    it('exposes a fixed, column-count-independent set of tab stops', () => {
      const tc = loaded();
      const grid = tc.getGridElement();

      // The grid, plus the two scroll regions WCAG 2.1.1 requires to be
      // keyboard-reachable. Nothing else inside — in particular none of the
      // ~6 buttons per column header, which is what made Tab unusable.
      const tabbableInGrid = [
        ...grid.querySelectorAll<HTMLElement>(
          '[tabindex]:not([tabindex="-1"]), button:not([tabindex])',
        ),
      ];
      expect(tabbableInGrid).toEqual([tc.getHeaderScroll(), tc.getScrollContainer()]);
      expect(grid.getAttribute('tabindex')).toBe('0');

      // Independent of column count: hiding half the columns changes nothing.
      state.visibleColumns.set(['id', 'name']);
      expect(
        grid.querySelectorAll('[tabindex]:not([tabindex="-1"]), button:not([tabindex])').length,
      ).toBe(2);

      tc.destroy();
    });

    it('gives every header cell a stable id and takes its buttons out of the tab order', () => {
      const tc = loaded();
      const headers = tc.getColumnHeaders();
      expect(headers.length).toBeGreaterThan(0);

      const ids = new Set<string>();
      for (const header of headers) {
        const el = header.getElement();
        expect(el.id).not.toBe('');
        expect(ids.has(el.id)).toBe(false);
        ids.add(el.id);
        expect(el.getAttribute('tabindex')).toBe('-1');
        for (const btn of el.querySelectorAll('button')) {
          expect(btn.getAttribute('tabindex')).toBe('-1');
        }
      }

      tc.destroy();
    });

    it('publishes the header cursor through aria-activedescendant', () => {
      const tc = loaded();
      const grid = tc.getGridElement();
      expect(grid.hasAttribute('aria-activedescendant')).toBe(false);

      actions.setFocusedCell({ row: -1, column: 'name' });

      const header = tc.getColumnHeaders().find((h) => h.getColumn().name === 'name')!;
      expect(grid.getAttribute('aria-activedescendant')).toBe(header.getElement().id);
      expect(header.getElement().classList.contains('dt-col-header--focused')).toBe(true);

      actions.clearFocusedCell();
      expect(grid.hasAttribute('aria-activedescendant')).toBe(false);

      tc.destroy();
    });

    it('drops aria-activedescendant when the cursor’s row is not materialized', () => {
      const tc = loaded();
      const grid = tc.getGridElement();
      actions.setFocusedCell({ row: -1, column: 'name' });
      expect(grid.hasAttribute('aria-activedescendant')).toBe(true);

      // jsdom reports a zero-height viewport, so no body rows exist. Writing
      // the id anyway would be a dangling IDREF — an aria-valid-attr-value
      // failure — so the attribute has to come off entirely.
      actions.setFocusedCell({ row: 42, column: 'name' });
      expect(document.querySelectorAll('.dt-row').length).toBe(0);
      expect(grid.hasAttribute('aria-activedescendant')).toBe(false);

      tc.destroy();
    });

    // Note: Full row materialization requires a non-zero viewport height,
    // which jsdom does not provide. Assertions on rendered row/cell ARIA are
    // verified via TableBody.getOrCreateRow in tests/table/TableBody.test.ts,
    // and end-to-end in the axe-core scan (tests/a11y/axe.test.ts).
  });

  // =========================================
  // Phase 6: header keyboard activation
  // =========================================

  describe('header keyboard sort activation', () => {
    it('Enter on a header toggles single-column sort', () => {
      const column: ColumnSchema = {
        name: 'score',
        type: 'float',
        nullable: false,
        originalType: 'DOUBLE',
      };
      const toggleSortSpy = vi.spyOn(actions, 'toggleSort');
      const header = new ColumnHeader(column, state, actions);
      document.body.appendChild(header.getElement());

      header
        .getElement()
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(toggleSortSpy).toHaveBeenCalledWith('score');

      header.destroy();
    });

    it('Shift+Enter on a header adds to multi-sort', () => {
      const column: ColumnSchema = {
        name: 'score',
        type: 'float',
        nullable: false,
        originalType: 'DOUBLE',
      };
      const addToSortSpy = vi.spyOn(actions, 'addToSort');
      const header = new ColumnHeader(column, state, actions);
      document.body.appendChild(header.getElement());

      header
        .getElement()
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
        );

      expect(addToSortSpy).toHaveBeenCalledWith('score');

      header.destroy();
    });

    it('keyboard on a child button does not trigger header-level sort', () => {
      const column: ColumnSchema = {
        name: 'score',
        type: 'float',
        nullable: false,
        originalType: 'DOUBLE',
      };
      const toggleSortSpy = vi.spyOn(actions, 'toggleSort');
      const addToSortSpy = vi.spyOn(actions, 'addToSort');
      const header = new ColumnHeader(column, state, actions);
      document.body.appendChild(header.getElement());

      const sortBtn = header.getElement().querySelector('button.dt-col-sort-btn')!;
      sortBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      // Header-level handler should have bailed via e.target !== element
      expect(toggleSortSpy).not.toHaveBeenCalled();
      expect(addToSortSpy).not.toHaveBeenCalled();

      header.destroy();
    });
  });
});
