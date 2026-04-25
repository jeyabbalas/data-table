/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableBody } from '@/table/TableBody';
import { AnnotationPopover } from '@/table/AnnotationPopover';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';

// =========================================
// Test harness
// =========================================

class MockResizeObserver implements ResizeObserver {
  private callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) { this.callback = callback; }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  triggerResize(_entries: unknown[]): void { /* no-op */ }
}

const testSchema: ColumnSchema[] = [
  { name: '__rowid__', type: 'integer', nullable: false, originalType: 'INTEGER', system: true, hidden: true },
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'price', type: 'float', nullable: false, originalType: 'DOUBLE' },
];

/** Build a row-dataset of `n` rows matching the test schema. */
function buildFakeRows(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    __rowid__: i,
    id: i,
    name: `row-${i}`,
    price: i * 1.5,
  }));
}

/**
 * Create a mock bridge whose `.query()` resolves to rows parsed from the
 * provided dataset, respecting the LIMIT/OFFSET parsed out of the SQL.
 * Also records every SQL query for assertions.
 */
function createMockBridge(rows: Record<string, unknown>[]) {
  const queries: string[] = [];
  const query = vi.fn(async (sql: string) => {
    queries.push(sql);
    const limitMatch = /LIMIT\s+(\d+)/i.exec(sql);
    const offsetMatch = /OFFSET\s+(\d+)/i.exec(sql);
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : rows.length;
    const offset = offsetMatch ? parseInt(offsetMatch[1], 10) : 0;
    return rows.slice(offset, offset + limit);
  });
  const bridge = {
    query,
    isInitialized: vi.fn().mockReturnValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
    loadData: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
    clearQueryCache: vi.fn(),
  };
  return { bridge, queries };
}

// =========================================
// Tests
// =========================================

describe('TableBody — annotation overlay', () => {
  let container: HTMLElement;
  let state: TableState;
  let actions: StateActions;
  let store: AnnotationStore;
  let popover: AnnotationPopover;
  let portal: HTMLElement;

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    container = document.createElement('div');
    container.style.height = '400px';
    // Root wrapper so annotation styles + popover portal scoping work.
    const root = document.createElement('div');
    root.className = 'dt-root';
    root.appendChild(container);
    document.body.appendChild(root);

    portal = document.createElement('div');
    document.body.appendChild(portal);

    state = createTableState();
    state.tableName.set('test_table');
    initializeColumnsFromSchema(state, testSchema);
    state.totalRows.set(100);

    store = new AnnotationStore();
    popover = new AnnotationPopover({ portalTarget: portal });
  });

  afterEach(() => {
    popover.destroy();
    store.destroy();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('buildRowQuery prepends __rowid__ to every fetch', async () => {
    const rows = buildFakeRows(10);
    const { bridge, queries } = createMockBridge(rows);
    const body = new TableBody(container, state, bridge as never, actions = new StateActions(state, bridge as never), {
      annotations: store,
      annotationPopover: popover,
    });

    // Force a fetch by directly triggering internal rendering.
    await (body as unknown as { fetchRows(s: number, e: number): Promise<void> }).fetchRows(0, 5);
    expect(queries.length).toBe(1);
    expect(queries[0]).toMatch(/SELECT\s+"__rowid__"/);

    body.destroy();
  });

  it('updateRowContent sets data-row-id from __rowid__ and data-column on each cell', () => {
    const rows = buildFakeRows(5);
    const { bridge } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions, {
      annotations: store,
      annotationPopover: popover,
    });

    // Drive the private render path with a seeded row.
    const visibleColumns = state.visibleColumns.get(); // excludes __rowid__ (system)
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
    };
    const rowEl = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowEl, 42, rows[3], visibleColumns, schemaMap);

    expect(rowEl.getAttribute('data-row-id')).toBe('3');
    const cells = Array.from(rowEl.children) as HTMLElement[];
    expect(cells[0].getAttribute('data-column')).toBe(visibleColumns[0]);
    expect(cells[1].getAttribute('data-column')).toBe(visibleColumns[1]);

    body.destroy();
  });

  it('row gains dt-row--annotated + every cell gains dt-cell--row-annotated when a row-scope annotation exists', () => {
    const rows = buildFakeRows(5);
    const { bridge } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions, {
      annotations: store,
      annotationPopover: popover,
    });

    const visibleColumns = state.visibleColumns.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    store.add({ scope: 'row', rowId: 2, severity: 'warning', message: 'row-warn' });

    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
    };
    const rowEl = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowEl, 2, rows[2], visibleColumns, schemaMap);

    // Row-element markers.
    expect(rowEl.classList.contains('dt-row--annotated')).toBe(true);
    expect(rowEl.classList.contains('dt-row--annotation-warning')).toBe(true);
    // Every cell in the row carries the per-cell row family.
    for (const cell of Array.from(rowEl.children) as HTMLElement[]) {
      expect(cell.classList.contains('dt-cell--row-annotated')).toBe(true);
      expect(cell.classList.contains('dt-cell--row-annotation-warning')).toBe(true);
      // Col and cell families stay off (no col or cell scope present).
      expect(cell.classList.contains('dt-cell--col-annotated')).toBe(false);
      expect(cell.classList.contains('dt-cell--annotated')).toBe(false);
    }

    body.destroy();
  });

  it('column annotation applies dt-cell--col-annotated to every cell in the column (not dt-cell--annotated, not row-annotated)', () => {
    const rows = buildFakeRows(5);
    const { bridge } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions, {
      annotations: store,
      annotationPopover: popover,
    });

    const visibleColumns = state.visibleColumns.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    store.add({ scope: 'column', column: 'price', severity: 'error', message: 'col-err' });

    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
    };
    const rowEl = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowEl, 1, rows[1], visibleColumns, schemaMap);

    const priceIdx = visibleColumns.indexOf('price');
    const priceCell = rowEl.children[priceIdx] as HTMLElement;
    expect(priceCell.classList.contains('dt-cell--col-annotated')).toBe(true);
    expect(priceCell.classList.contains('dt-cell--col-annotation-error')).toBe(true);
    // Cell-scope and row-scope classes must NOT leak onto a column-only cell.
    expect(priceCell.classList.contains('dt-cell--annotated')).toBe(false);
    expect(priceCell.classList.contains('dt-cell--row-annotated')).toBe(false);

    // Other columns receive no cell-level class whatsoever.
    const idCell = rowEl.children[visibleColumns.indexOf('id')] as HTMLElement;
    expect(idCell.classList.contains('dt-cell--annotated')).toBe(false);
    expect(idCell.classList.contains('dt-cell--col-annotated')).toBe(false);
    expect(idCell.classList.contains('dt-cell--row-annotated')).toBe(false);

    // Row itself is NOT tinted — column anns don't propagate to rows.
    expect(rowEl.classList.contains('dt-row--annotated')).toBe(false);

    body.destroy();
  });

  it('row annotation does not propagate to dt-cell--annotated or dt-cell--col-annotated (only the row family)', () => {
    const rows = buildFakeRows(5);
    const { bridge } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions, {
      annotations: store,
      annotationPopover: popover,
    });

    const visibleColumns = state.visibleColumns.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    store.add({ scope: 'row', rowId: 4, severity: 'warning', message: 'row-warn' });

    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
    };
    const rowEl = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowEl, 4, rows[4], visibleColumns, schemaMap);

    // Row tint marker set correctly.
    expect(rowEl.classList.contains('dt-row--annotation-warning')).toBe(true);
    // Row family on every cell; col and cell families stay off.
    for (const cell of Array.from(rowEl.children) as HTMLElement[]) {
      expect(cell.classList.contains('dt-cell--row-annotated')).toBe(true);
      expect(cell.classList.contains('dt-cell--row-annotation-warning')).toBe(true);
      expect(cell.classList.contains('dt-cell--annotated')).toBe(false);
      expect(cell.classList.contains('dt-cell--col-annotated')).toBe(false);
    }

    body.destroy();
  });

  it('cell-scope annotation tints only that cell (no row, no column, no row-cell / col-cell propagation)', () => {
    const rows = buildFakeRows(5);
    const { bridge } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions, {
      annotations: store,
      annotationPopover: popover,
    });

    const visibleColumns = state.visibleColumns.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    store.add({
      scope: 'cell',
      rowId: 2,
      column: 'price',
      severity: 'info',
      message: 'one cell',
    });

    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
    };
    const rowEl = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowEl, 2, rows[2], visibleColumns, schemaMap);

    const priceCell = rowEl.children[visibleColumns.indexOf('price')] as HTMLElement;
    expect(priceCell.classList.contains('dt-cell--annotated')).toBe(true);
    expect(priceCell.classList.contains('dt-cell--annotation-info')).toBe(true);
    // Cell scope must not add the col-cell or row-cell class to its own cell.
    expect(priceCell.classList.contains('dt-cell--col-annotated')).toBe(false);
    expect(priceCell.classList.contains('dt-cell--row-annotated')).toBe(false);

    // No other cell in this row carries any annotation class.
    const idCell = rowEl.children[visibleColumns.indexOf('id')] as HTMLElement;
    expect(idCell.classList.contains('dt-cell--annotated')).toBe(false);
    expect(idCell.classList.contains('dt-cell--col-annotated')).toBe(false);
    expect(idCell.classList.contains('dt-cell--row-annotated')).toBe(false);

    // Row is NOT tinted — a cell-scope ann must not create "row coloring".
    expect(rowEl.classList.contains('dt-row--annotated')).toBe(false);

    body.destroy();
  });

  it('intersection of row-scope + column-scope + cell-scope: all three class families on the intersection cell; native title cleared', () => {
    const rows = buildFakeRows(5);
    const { bridge } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions, {
      annotations: store,
      annotationPopover: popover,
    });

    const visibleColumns = state.visibleColumns.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    store.add({ scope: 'row', rowId: 4, severity: 'warning', message: 'row-msg' });
    store.add({ scope: 'column', column: 'price', severity: 'error', message: 'col-msg' });
    store.add({
      scope: 'cell',
      rowId: 4,
      column: 'price',
      severity: 'info',
      message: 'cell-msg',
    });

    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
    };
    const rowEl = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowEl, 4, rows[4], visibleColumns, schemaMap);

    const priceCell = rowEl.children[visibleColumns.indexOf('price')] as HTMLElement;
    // All three class families present at the intersection. CSS cascade
    // order (row → col → cell) gives the cell severity the visible win.
    expect(priceCell.classList.contains('dt-cell--row-annotated')).toBe(true);
    expect(priceCell.classList.contains('dt-cell--row-annotation-warning')).toBe(true);
    expect(priceCell.classList.contains('dt-cell--col-annotated')).toBe(true);
    expect(priceCell.classList.contains('dt-cell--col-annotation-error')).toBe(true);
    expect(priceCell.classList.contains('dt-cell--annotated')).toBe(true);
    expect(priceCell.classList.contains('dt-cell--annotation-info')).toBe(true);
    // Native title cleared — the AnnotationPopover is the sole tooltip.
    expect(priceCell.title).toBe('');
    // Annotation count aggregates all three scopes.
    expect(priceCell.dataset.dtAnnotationCount).toBe('3');

    // Non-price cells in row 4 carry only the row family (col/cell scopes
    // don't touch them).
    const idCell = rowEl.children[visibleColumns.indexOf('id')] as HTMLElement;
    expect(idCell.classList.contains('dt-cell--row-annotated')).toBe(true);
    expect(idCell.classList.contains('dt-cell--row-annotation-warning')).toBe(true);
    expect(idCell.classList.contains('dt-cell--col-annotated')).toBe(false);
    expect(idCell.classList.contains('dt-cell--annotated')).toBe(false);
    expect(rowEl.classList.contains('dt-row--annotation-warning')).toBe(true);

    body.destroy();
  });

  it('intersection of row-scope + column-scope (no cell): cell has row + col families, no cell-scope class', () => {
    const rows = buildFakeRows(5);
    const { bridge } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions, {
      annotations: store,
      annotationPopover: popover,
    });

    const visibleColumns = state.visibleColumns.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'row' });
    store.add({ scope: 'column', column: 'price', severity: 'error', message: 'col' });

    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
    };
    const rowEl = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowEl, 1, rows[1], visibleColumns, schemaMap);

    const priceCell = rowEl.children[visibleColumns.indexOf('price')] as HTMLElement;
    expect(priceCell.classList.contains('dt-cell--row-annotated')).toBe(true);
    expect(priceCell.classList.contains('dt-cell--col-annotated')).toBe(true);
    expect(priceCell.classList.contains('dt-cell--annotated')).toBe(false);

    body.destroy();
  });

  it('intersection of row-scope + cell-scope (no col): intersection cell has row + cell families', () => {
    const rows = buildFakeRows(5);
    const { bridge } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions, {
      annotations: store,
      annotationPopover: popover,
    });

    const visibleColumns = state.visibleColumns.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    store.add({ scope: 'row', rowId: 2, severity: 'warning', message: 'row' });
    store.add({
      scope: 'cell',
      rowId: 2,
      column: 'price',
      severity: 'error',
      message: 'cell',
    });

    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
    };
    const rowEl = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowEl, 2, rows[2], visibleColumns, schemaMap);

    const priceCell = rowEl.children[visibleColumns.indexOf('price')] as HTMLElement;
    expect(priceCell.classList.contains('dt-cell--row-annotated')).toBe(true);
    expect(priceCell.classList.contains('dt-cell--annotated')).toBe(true);
    expect(priceCell.classList.contains('dt-cell--col-annotated')).toBe(false);

    // Non-intersection cells in the row: row family only.
    const idCell = rowEl.children[visibleColumns.indexOf('id')] as HTMLElement;
    expect(idCell.classList.contains('dt-cell--row-annotated')).toBe(true);
    expect(idCell.classList.contains('dt-cell--annotated')).toBe(false);

    body.destroy();
  });

  it('native cell title is cleared on any annotated cell (popover is sole tooltip); restored when annotation is removed', () => {
    const rows = buildFakeRows(5);
    const { bridge } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions, {
      annotations: store,
      annotationPopover: popover,
    });

    const visibleColumns = state.visibleColumns.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
    };
    const rowEl = internal.getOrCreateRow(visibleColumns.length);

    // First render: unannotated cell shows the formatted value as native title.
    internal.updateRowContent(rowEl, 3, rows[3], visibleColumns, schemaMap);
    const priceCell = rowEl.children[visibleColumns.indexOf('price')] as HTMLElement;
    const formattedTitle = priceCell.title;
    expect(formattedTitle.length).toBeGreaterThan(0);
    expect(formattedTitle).not.toMatch(/annotation/i);

    // Add an annotation; re-render; native title is cleared (popover wins).
    const ann = store.add({
      scope: 'cell',
      rowId: 3,
      column: 'price',
      severity: 'error',
      message: 'value exceeds limit',
    });
    internal.updateRowContent(rowEl, 3, rows[3], visibleColumns, schemaMap);
    expect(priceCell.title).toBe('');

    // Remove it; re-render; formatted title restored.
    store.remove(ann.id);
    internal.updateRowContent(rowEl, 3, rows[3], visibleColumns, schemaMap);
    expect(priceCell.title).toBe(formattedTitle);

    body.destroy();
  });

  it('native title is also cleared when only a row-scope or only a column-scope annotation is present', () => {
    const rows = buildFakeRows(5);
    const { bridge } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions, {
      annotations: store,
      annotationPopover: popover,
    });

    const visibleColumns = state.visibleColumns.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
    };

    // Row-only case.
    store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'r' });
    const rowA = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowA, 0, rows[0], visibleColumns, schemaMap);
    for (const cell of Array.from(rowA.children) as HTMLElement[]) {
      expect(cell.title).toBe('');
    }
    // Unannotated row still shows formatted titles.
    const rowB = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowB, 2, rows[2], visibleColumns, schemaMap);
    for (const cell of Array.from(rowB.children) as HTMLElement[]) {
      expect(cell.title.length).toBeGreaterThan(0);
    }

    // Column-only case.
    store.clear('all');
    store.add({ scope: 'column', column: 'price', severity: 'warning', message: 'c' });
    const rowC = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowC, 0, rows[0], visibleColumns, schemaMap);
    const priceCell = rowC.children[visibleColumns.indexOf('price')] as HTMLElement;
    const idCell = rowC.children[visibleColumns.indexOf('id')] as HTMLElement;
    expect(priceCell.title).toBe('');
    expect(idCell.title.length).toBeGreaterThan(0); // unannotated col keeps its formatted title

    body.destroy();
  });

  it('store "change" event triggers reapply on visible rows without a re-fetch', async () => {
    const rows = buildFakeRows(5);
    const { bridge, queries } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions, {
      annotations: store,
      annotationPopover: popover,
    });

    const visibleColumns = state.visibleColumns.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    // Seed the row-data cache + rowElementMap as if rendered.
    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
      rowDataCache: Map<number, Record<string, unknown>>;
      rowElementMap: Map<number, HTMLElement>;
    };
    // Need to subscribe to state first (happens on initialize). Simulate.
    await body.initialize();
    const beforeQueries = queries.length;

    const rowEl = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowEl, 0, rows[0], visibleColumns, schemaMap);
    internal.rowDataCache.set(0, rows[0]);
    internal.rowElementMap.set(0, rowEl);

    // Add a cell annotation — change handler should re-apply classes.
    store.add({ scope: 'cell', rowId: 0, column: 'price', severity: 'info', message: 'i' });

    const priceCell = rowEl.children[visibleColumns.indexOf('price')] as HTMLElement;
    expect(priceCell.classList.contains('dt-cell--annotated')).toBe(true);
    expect(priceCell.classList.contains('dt-cell--annotation-info')).toBe(true);

    // No new SQL should have been issued for the annotation event alone.
    expect(queries.length).toBe(beforeQueries);

    body.destroy();
  });

  it('annotations without a store wired (no options) are a total no-op', () => {
    const rows = buildFakeRows(5);
    const { bridge } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions);

    const visibleColumns = state.visibleColumns.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
    };
    const rowEl = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowEl, 0, rows[0], visibleColumns, schemaMap);
    // data-row-id is set regardless of annotation wiring; data-column too.
    expect(rowEl.getAttribute('data-row-id')).toBe('0');
    expect(rowEl.classList.contains('dt-row--annotated')).toBe(false);

    body.destroy();
  });

  it('pool reuse clears every annotation class family when the row is repurposed for a different rowId', () => {
    const rows = buildFakeRows(5);
    const { bridge } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions, {
      annotations: store,
      annotationPopover: popover,
    });

    const visibleColumns = state.visibleColumns.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    // Seed all three scopes so every class family lands on the first render.
    store.add({ scope: 'row', rowId: 1, severity: 'error', message: 'r' });
    store.add({ scope: 'column', column: 'price', severity: 'error', message: 'c' });
    store.add({ scope: 'cell', rowId: 1, column: 'price', severity: 'info', message: 'x' });

    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
      returnRowToPool(el: HTMLElement): void;
    };

    const rowEl = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowEl, 1, rows[1], visibleColumns, schemaMap);
    expect(rowEl.classList.contains('dt-row--annotation-error')).toBe(true);
    const priceIdx = visibleColumns.indexOf('price');
    const pricedOld = rowEl.children[priceIdx] as HTMLElement;
    expect(pricedOld.classList.contains('dt-cell--row-annotated')).toBe(true);
    expect(pricedOld.classList.contains('dt-cell--col-annotated')).toBe(true);
    expect(pricedOld.classList.contains('dt-cell--annotated')).toBe(true);

    internal.returnRowToPool(rowEl);
    const reused = internal.getOrCreateRow(visibleColumns.length);
    // Clear all seeded anns so the repurposed row has nothing to inherit.
    store.clear('all');
    internal.updateRowContent(reused, 2, rows[2], visibleColumns, schemaMap);
    expect(reused.classList.contains('dt-row--annotated')).toBe(false);
    expect(reused.classList.contains('dt-row--annotation-error')).toBe(false);
    for (const cell of Array.from(reused.children) as HTMLElement[]) {
      expect(cell.classList.contains('dt-cell--annotated')).toBe(false);
      expect(cell.classList.contains('dt-cell--col-annotated')).toBe(false);
      expect(cell.classList.contains('dt-cell--row-annotated')).toBe(false);
      expect(cell.classList.contains('dt-cell--col-annotation-error')).toBe(false);
      expect(cell.classList.contains('dt-cell--annotation-info')).toBe(false);
      expect(cell.classList.contains('dt-cell--row-annotation-error')).toBe(false);
      expect(cell.dataset.dtAnnotationCount).toBeUndefined();
    }

    body.destroy();
  });

  // =========================================
  // Popover — triggered on hover / focus
  // =========================================

  it('popover opens on pointerover of a row-only annotated cell and shows the row annotation only', () => {
    const rows = buildFakeRows(5);
    const { bridge } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions, {
      annotations: store,
      annotationPopover: popover,
    });

    const visibleColumns = state.visibleColumns.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    const rowAnn = store.add({ scope: 'row', rowId: 2, severity: 'info', message: 'row-only' });

    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
    };
    const rowEl = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowEl, 2, rows[2], visibleColumns, schemaMap);
    container.appendChild(rowEl);

    const showSpy = vi.spyOn(popover, 'show');

    const idCell = rowEl.children[visibleColumns.indexOf('id')] as HTMLElement;
    idCell.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, cancelable: true }),
    );

    expect(showSpy).toHaveBeenCalledTimes(1);
    const [, anns] = showSpy.mock.calls[0] as [HTMLElement, typeof rowAnn[]];
    expect(anns.length).toBe(1);
    expect(anns[0].id).toBe(rowAnn.id);
    expect(anns[0].scope).toBe('row');

    body.destroy();
  });

  it('popover on a column-only cell does NOT leak cell-scope annotations from other rows in the same column', () => {
    const rows = buildFakeRows(5);
    const { bridge } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions, {
      annotations: store,
      annotationPopover: popover,
    });

    const visibleColumns = state.visibleColumns.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    // A column-scope ann at 'price' AND a cell-scope ann at (3, 'price').
    // The col-scope ann gets picked up for every cell in the column; the
    // cell-scope ann must stay local to (3, 'price').
    const colAnn = store.add({ scope: 'column', column: 'price', severity: 'warning', message: 'col' });
    const cellAnn = store.add({
      scope: 'cell',
      rowId: 3,
      column: 'price',
      severity: 'info',
      message: 'cell',
    });

    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
    };

    // Render row 1 (col-only — should NOT see the cell-scope ann).
    const rowA = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowA, 1, rows[1], visibleColumns, schemaMap);
    container.appendChild(rowA);
    // Render row 3 (intersection — should see both col and cell).
    const rowB = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowB, 3, rows[3], visibleColumns, schemaMap);
    container.appendChild(rowB);

    const showSpy = vi.spyOn(popover, 'show');

    // Hover row-1 price cell (col-only).
    const colOnlyCell = rowA.children[visibleColumns.indexOf('price')] as HTMLElement;
    colOnlyCell.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, cancelable: true }),
    );
    expect(showSpy).toHaveBeenCalledTimes(1);
    const [, colOnlyAnns] = showSpy.mock.calls[0] as [HTMLElement, typeof colAnn[]];
    expect(colOnlyAnns.map((a) => a.id)).toEqual([colAnn.id]);
    expect(colOnlyAnns.map((a) => a.id)).not.toContain(cellAnn.id);

    // Clear the popover tracking so the next pointerover is recognised as
    // a new anchor. pointerout with relatedTarget outside mimics the
    // real pointer leaving the first cell.
    colOnlyCell.dispatchEvent(
      new PointerEvent('pointerout', { bubbles: true, cancelable: true, relatedTarget: document.body }),
    );

    // Hover row-3 price cell (intersection).
    const intersectionCell = rowB.children[visibleColumns.indexOf('price')] as HTMLElement;
    intersectionCell.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, cancelable: true }),
    );
    expect(showSpy).toHaveBeenCalledTimes(2);
    const [, intersectionAnns] = showSpy.mock.calls[1] as [HTMLElement, typeof colAnn[]];
    const ids = intersectionAnns.map((a) => a.id);
    expect(ids).toContain(colAnn.id);
    expect(ids).toContain(cellAnn.id);
    expect(ids.length).toBe(2);

    body.destroy();
  });

  it('multi-ann at one cell — popover lists all 9 entries grouped Row→Column→Cell', () => {
    const rows = buildFakeRows(10);
    const { bridge } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions, {
      annotations: store,
      annotationPopover: popover,
    });

    const visibleColumns = state.visibleColumns.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    // 3 row anns on row 5, 3 col anns on price, 3 cell anns at (5, price).
    const severities = ['error', 'warning', 'info'] as const;
    for (const sev of severities) {
      store.add({ scope: 'row', rowId: 5, severity: sev, message: `r-${sev}` });
    }
    for (const sev of severities) {
      store.add({ scope: 'column', column: 'price', severity: sev, message: `c-${sev}` });
    }
    for (const sev of severities) {
      store.add({
        scope: 'cell',
        rowId: 5,
        column: 'price',
        severity: sev,
        message: `x-${sev}`,
      });
    }

    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
    };
    const rowEl = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowEl, 5, rows[5], visibleColumns, schemaMap);
    container.appendChild(rowEl);

    // Cell carries all three class families.
    const priceCell = rowEl.children[visibleColumns.indexOf('price')] as HTMLElement;
    expect(priceCell.classList.contains('dt-cell--row-annotated')).toBe(true);
    expect(priceCell.classList.contains('dt-cell--col-annotated')).toBe(true);
    expect(priceCell.classList.contains('dt-cell--annotated')).toBe(true);
    // dtAnnotationCount = 3 row + 3 col + 3 cell = 9.
    expect(priceCell.dataset.dtAnnotationCount).toBe('9');

    // Hover triggers the popover with all 9 anns.
    const showSpy = vi.spyOn(popover, 'show');
    priceCell.dispatchEvent(
      new PointerEvent('pointerover', { bubbles: true, cancelable: true }),
    );
    expect(showSpy).toHaveBeenCalledTimes(1);
    const [anchorEl, anns] = showSpy.mock.calls[0] as [HTMLElement, Array<{ scope: string; message: string }>];
    expect(anchorEl).toBe(priceCell);
    expect(anns.length).toBe(9);
    expect(anns.filter((a) => a.scope === 'row').length).toBe(3);
    expect(anns.filter((a) => a.scope === 'column').length).toBe(3);
    expect(anns.filter((a) => a.scope === 'cell').length).toBe(3);

    // Verify the popover renders 9 list entries across 3 sections.
    popover.show(anchorEl, anns as never);
    const popoverEl = portal.querySelector('.dt-annotation-popover') as HTMLElement;
    expect(popoverEl).toBeTruthy();
    const sections = popoverEl.querySelectorAll('section.dt-annotation-popover__group');
    expect(sections.length).toBe(3);
    expect(popoverEl.querySelectorAll('.dt-annotation-entry').length).toBe(9);
    // Section order: row → column → cell.
    expect(sections[0].classList.contains('dt-annotation-popover__group--row')).toBe(true);
    expect(sections[1].classList.contains('dt-annotation-popover__group--column')).toBe(true);
    expect(sections[2].classList.contains('dt-annotation-popover__group--cell')).toBe(true);
    expect(sections[0].querySelectorAll('.dt-annotation-entry').length).toBe(3);
    expect(sections[1].querySelectorAll('.dt-annotation-entry').length).toBe(3);
    expect(sections[2].querySelectorAll('.dt-annotation-entry').length).toBe(3);

    body.destroy();
  });

  // =========================================
  // Within-scope max-severity hierarchy (regression).
  // When multiple anns of the SAME scope pile on one target with mixed
  // severities, the painted class must be the --error variant (error >
  // warning > info), regardless of insertion order. Guards against any
  // future change that swaps maxSeverity() for anns[0] / anns.at(-1).
  // =========================================

  it('cell-scope multi-ann: highest severity wins regardless of insertion order', () => {
    const rows = buildFakeRows(10);
    const { bridge } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions, {
      annotations: store,
      annotationPopover: popover,
    });

    const visibleColumns = state.visibleColumns.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
    };

    // Phase 1: error added LAST (info → warning → error). Error must win.
    for (const sev of ['info', 'warning', 'error'] as const) {
      store.add({ scope: 'cell', rowId: 5, column: 'price', severity: sev, message: `c-${sev}` });
    }
    const rowA = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowA, 5, rows[5], visibleColumns, schemaMap);
    let priceCell = rowA.children[visibleColumns.indexOf('price')] as HTMLElement;
    expect(priceCell.classList.contains('dt-cell--annotated')).toBe(true);
    expect(priceCell.classList.contains('dt-cell--annotation-error')).toBe(true);
    expect(priceCell.classList.contains('dt-cell--annotation-warning')).toBe(false);
    expect(priceCell.classList.contains('dt-cell--annotation-info')).toBe(false);
    expect(priceCell.dataset.dtAnnotationCount).toBe('3');

    // Phase 2: error added FIRST (error → info → warning). Error must STILL win.
    store.clear('all');
    for (const sev of ['error', 'info', 'warning'] as const) {
      store.add({ scope: 'cell', rowId: 5, column: 'price', severity: sev, message: `c-${sev}` });
    }
    const rowB = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowB, 5, rows[5], visibleColumns, schemaMap);
    priceCell = rowB.children[visibleColumns.indexOf('price')] as HTMLElement;
    expect(priceCell.classList.contains('dt-cell--annotation-error')).toBe(true);
    expect(priceCell.classList.contains('dt-cell--annotation-warning')).toBe(false);
    expect(priceCell.classList.contains('dt-cell--annotation-info')).toBe(false);
    expect(priceCell.dataset.dtAnnotationCount).toBe('3');

    body.destroy();
  });

  it('row-scope multi-ann: row + every cell carry the error class with mixed insertion order', () => {
    const rows = buildFakeRows(10);
    const { bridge } = createMockBridge(rows);
    actions = new StateActions(state, bridge as never);
    const body = new TableBody(container, state, bridge as never, actions, {
      annotations: store,
      annotationPopover: popover,
    });

    const visibleColumns = state.visibleColumns.get();
    const schemaMap = new Map<string, ColumnSchema>();
    for (const c of testSchema) schemaMap.set(c.name, c);

    const internal = body as unknown as {
      getOrCreateRow(n: number): HTMLElement;
      updateRowContent(
        rowEl: HTMLElement,
        index: number,
        data: Record<string, unknown>,
        columns: string[],
        schemaMap: Map<string, ColumnSchema>,
      ): void;
    };

    // Error sandwiched between warning and info — every position covered.
    for (const sev of ['warning', 'error', 'info'] as const) {
      store.add({ scope: 'row', rowId: 4, severity: sev, message: `r-${sev}` });
    }
    const rowEl = internal.getOrCreateRow(visibleColumns.length);
    internal.updateRowContent(rowEl, 4, rows[4], visibleColumns, schemaMap);

    expect(rowEl.classList.contains('dt-row--annotated')).toBe(true);
    expect(rowEl.classList.contains('dt-row--annotation-error')).toBe(true);
    expect(rowEl.classList.contains('dt-row--annotation-warning')).toBe(false);
    expect(rowEl.classList.contains('dt-row--annotation-info')).toBe(false);
    for (const cell of Array.from(rowEl.children) as HTMLElement[]) {
      expect(cell.classList.contains('dt-cell--row-annotated')).toBe(true);
      expect(cell.classList.contains('dt-cell--row-annotation-error')).toBe(true);
      expect(cell.classList.contains('dt-cell--row-annotation-warning')).toBe(false);
      expect(cell.classList.contains('dt-cell--row-annotation-info')).toBe(false);
    }

    body.destroy();
  });
});
