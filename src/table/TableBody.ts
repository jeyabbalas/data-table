/**
 * TableBody - Renders data rows with virtual scrolling
 *
 * Integrates with VirtualScroller to efficiently render only visible rows,
 * fetches data from DuckDB via WorkerBridge, and handles row hover/selection.
 */

import { VirtualScroller, type VisibleRange } from './VirtualScroller';
import type { TableState } from '../core/State';
import type { StateActions } from '../core/Actions';
import type { WorkerBridge } from '../data/WorkerBridge';
import type { ColumnSchema, SortColumn } from '../core/types';

/**
 * Options for configuring the TableBody
 */
export interface TableBodyOptions {
  /** Fixed height per row in pixels (default: 32) */
  rowHeight?: number;
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string;
  /**
   * External scroll container for unified scrolling.
   * When provided, VirtualScroller will use this container for scroll events
   * instead of creating its own scroll container.
   */
  scrollContainer?: HTMLElement;
  /**
   * Height of the header in pixels (used with scrollContainer).
   * Needed to calculate visible body area correctly.
   */
  headerHeight?: number;
}

/**
 * Row data from query results
 */
export type RowData = Record<string, unknown>;

/**
 * TableBody renders data rows using virtual scrolling.
 *
 * @example
 * ```typescript
 * const body = new TableBody(container, state, bridge, actions);
 * await body.initialize();
 *
 * // Later, clean up
 * body.destroy();
 * ```
 */
export class TableBody {
  private virtualScroller: VirtualScroller;
  private rowDataCache: Map<number, RowData> = new Map();
  private currentRange: VisibleRange = { start: 0, end: 0, offsetY: 0 };
  private unsubscribes: (() => void)[] = [];
  private destroyed = false;
  private fetchInProgress = false;
  private pendingFetch: { start: number; end: number } | null = null;

  // DOM element pooling for efficient rendering
  private rowPool: HTMLElement[] = [];
  private rowElementMap: Map<number, HTMLElement> = new Map();
  private previousHoveredRow: number | null = null;

  private readonly rowHeight: number;
  private readonly classPrefix: string;

  constructor(
    container: HTMLElement,
    private state: TableState,
    private bridge: WorkerBridge,
    private actions?: StateActions,
    options: TableBodyOptions = {}
  ) {
    this.rowHeight = options.rowHeight ?? 32;
    this.classPrefix = options.classPrefix ?? 'dt';

    // Create virtual scroller
    this.virtualScroller = new VirtualScroller(container, {
      rowHeight: this.rowHeight,
      classPrefix: this.classPrefix,
      externalScrollContainer: options.scrollContainer,
      headerHeight: options.headerHeight,
    });
  }

  // =========================================
  // Initialization
  // =========================================

  /**
   * Initialize the table body
   *
   * Sets up virtual scroller, subscribes to state changes, and performs
   * initial render.
   */
  async initialize(): Promise<void> {
    if (this.destroyed) return;

    // Set total rows
    const totalRows = this.state.totalRows.get();
    this.virtualScroller.setTotalRows(totalRows);

    // Subscribe to scroll events
    const unsubScroll = this.virtualScroller.onScroll((range) => {
      this.handleScroll(range);
    });
    this.unsubscribes.push(unsubScroll);

    // Subscribe to state changes
    this.subscribeToState();

    // Perform initial render if we have data
    if (totalRows > 0) {
      const range = this.virtualScroller.getVisibleRange();
      await this.handleScroll(range);
    }
  }

  // =========================================
  // State Subscriptions
  // =========================================

  /**
   * Subscribe to state signals that require re-render
   */
  private subscribeToState(): void {
    // Re-fetch when visible columns change
    const unsubVisibleCols = this.state.visibleColumns.subscribe(() => {
      if (!this.destroyed) {
        this.invalidateCacheAndRefresh();
      }
    });
    this.unsubscribes.push(unsubVisibleCols);

    // Re-fetch when sort changes
    const unsubSort = this.state.sortColumns.subscribe(() => {
      if (!this.destroyed) {
        this.invalidateCacheAndRefresh();
      }
    });
    this.unsubscribes.push(unsubSort);

    // Update total rows when it changes
    const unsubTotalRows = this.state.totalRows.subscribe((total) => {
      if (!this.destroyed) {
        this.virtualScroller.setTotalRows(total);
        // May need to refetch if rows changed
        this.invalidateCacheAndRefresh();
      }
    });
    this.unsubscribes.push(unsubTotalRows);

    // Update selection styling
    const unsubSelected = this.state.selectedRows.subscribe(() => {
      if (!this.destroyed) {
        this.updateSelectionStyles();
      }
    });
    this.unsubscribes.push(unsubSelected);

    // Update hover styling
    const unsubHover = this.state.hoveredRow.subscribe(() => {
      if (!this.destroyed) {
        this.updateHoverStyles();
      }
    });
    this.unsubscribes.push(unsubHover);
  }

  /**
   * Invalidate cache and refresh visible rows
   */
  private invalidateCacheAndRefresh(): void {
    // Clear data cache
    this.rowDataCache.clear();

    // Clear row element map and return all rows to pool
    for (const [, element] of this.rowElementMap) {
      element.remove();
      this.returnRowToPool(element);
    }
    this.rowElementMap.clear();

    // Re-fetch and render
    const range = this.virtualScroller.getVisibleRange();
    this.handleScroll(range);
  }

  // =========================================
  // Scroll Handling
  // =========================================

  /**
   * Handle scroll event from VirtualScroller
   */
  private async handleScroll(range: VisibleRange): Promise<void> {
    if (this.destroyed) return;

    this.currentRange = range;

    // Check if we need to fetch data
    const needsFetch = this.checkNeedsFetch(range.start, range.end);

    if (needsFetch) {
      if (this.fetchInProgress) {
        // Queue this fetch for later
        this.pendingFetch = { start: range.start, end: range.end };
      } else {
        await this.fetchAndRender(range.start, range.end);
      }
    } else {
      // Data already cached, just render
      this.renderVisibleRows();
    }
  }

  /**
   * Check if we need to fetch data for the given range
   */
  private checkNeedsFetch(start: number, end: number): boolean {
    for (let i = start; i < end; i++) {
      if (!this.rowDataCache.has(i)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Fetch data and render visible rows
   */
  private async fetchAndRender(start: number, end: number): Promise<void> {
    this.fetchInProgress = true;

    try {
      await this.fetchRows(start, end);
      this.renderVisibleRows();
    } finally {
      this.fetchInProgress = false;

      // Process pending fetch if any
      if (this.pendingFetch) {
        const pending = this.pendingFetch;
        this.pendingFetch = null;
        await this.handleScroll({
          start: pending.start,
          end: pending.end,
          offsetY: pending.start * this.rowHeight,
        });
      }
    }
  }

  // =========================================
  // Data Fetching
  // =========================================

  /**
   * Fetch rows from DuckDB for the given range
   */
  private async fetchRows(start: number, end: number): Promise<void> {
    const tableName = this.state.tableName.get();
    if (!tableName) return;

    const visibleColumns = this.state.visibleColumns.get();
    const sortColumns = this.state.sortColumns.get();

    if (visibleColumns.length === 0) return;

    // Build SQL query
    const sql = this.buildRowQuery(tableName, visibleColumns, sortColumns, start, end - start);

    try {
      const rows = await this.bridge.query<RowData>(sql);

      // Cache the fetched rows
      rows.forEach((row, index) => {
        this.rowDataCache.set(start + index, row);
      });
    } catch (error) {
      console.error('Error fetching rows:', error);
    }
  }

  /**
   * Build SQL query for fetching rows
   */
  private buildRowQuery(
    tableName: string,
    columns: string[],
    sortColumns: SortColumn[],
    offset: number,
    limit: number
  ): string {
    // Quote column names to handle special characters
    const columnList = columns.map((col) => `"${col}"`).join(', ');

    let sql = `SELECT ${columnList} FROM "${tableName}"`;

    // Add ORDER BY if sorting is active
    if (sortColumns.length > 0) {
      const orderBy = sortColumns
        .map((s) => `"${s.column}" ${s.direction.toUpperCase()}`)
        .join(', ');
      sql += ` ORDER BY ${orderBy}`;
    }

    sql += ` LIMIT ${limit} OFFSET ${offset}`;

    return sql;
  }

  // =========================================
  // Rendering
  // =========================================

  /**
   * Render visible rows in the viewport using DOM element pooling.
   *
   * This method uses incremental updates instead of clearing and rebuilding
   * all rows on every scroll. Rows that leave the viewport are returned to
   * a pool for reuse, and rows that enter are either taken from the pool
   * or created if the pool is empty.
   */
  private renderVisibleRows(): void {
    if (this.destroyed) return;

    const viewport = this.virtualScroller.getViewportContainer();
    const schema = this.state.schema.get();
    const visibleColumns = this.state.visibleColumns.get();
    const selectedRows = this.state.selectedRows.get();
    const hoveredRow = this.state.hoveredRow.get();

    const newStart = this.currentRange.start;
    const newEnd = this.currentRange.end;

    // Build schema map for quick lookup
    const schemaMap = new Map<string, ColumnSchema>();
    for (const col of schema) {
      schemaMap.set(col.name, col);
    }

    // 1. Remove rows no longer visible (return to pool)
    for (const [index, element] of this.rowElementMap) {
      if (index < newStart || index >= newEnd) {
        element.remove();
        this.rowElementMap.delete(index);
        this.returnRowToPool(element);
      }
    }

    // 2. Add/update rows in new range
    for (let i = newStart; i < newEnd; i++) {
      let rowEl = this.rowElementMap.get(i);
      const rowData = this.rowDataCache.get(i);

      if (!rowEl) {
        // Need a new row - get from pool or create
        if (rowData) {
          rowEl = this.getOrCreateRow(visibleColumns.length);
          this.updateRowContent(rowEl, i, rowData, visibleColumns, schemaMap);
          this.attachRowEventListeners(rowEl, i);
        } else {
          // Data not yet loaded - create placeholder
          rowEl = this.createPlaceholderRow(i);
        }
        this.rowElementMap.set(i, rowEl);
        this.insertRowInOrder(viewport, rowEl, i);
      } else if (rowData) {
        // Row exists, update content if needed (e.g., after sort)
        this.updateRowContent(rowEl, i, rowData, visibleColumns, schemaMap);
      }

      // Apply selection/hover styles
      if (rowEl) {
        const selectedClass = `${this.classPrefix}-row--selected`;
        const hoverClass = `${this.classPrefix}-row--hover`;

        if (selectedRows.has(i)) {
          rowEl.classList.add(selectedClass);
        } else {
          rowEl.classList.remove(selectedClass);
        }

        if (hoveredRow === i) {
          rowEl.classList.add(hoverClass);
        } else {
          rowEl.classList.remove(hoverClass);
        }
      }
    }

    // Set width for horizontal scrolling
    // Uses a width spacer element in normal flow to force correct scrollWidth
    const totalWidth = visibleColumns.length * 150; // 150px per column (matches CSS)
    this.virtualScroller.setContentWidth(totalWidth);

    // Also set header row width to match for scroll synchronization
    const scrollContainer = this.virtualScroller.getScrollContainer();
    const headerRow = scrollContainer.closest('.dt-root')?.querySelector('.dt-header-row') as HTMLElement;
    if (headerRow) {
      headerRow.style.minWidth = `${totalWidth}px`;
    }
  }

  /**
   * Insert a row element in the correct position within the viewport
   */
  private insertRowInOrder(viewport: HTMLElement, rowEl: HTMLElement, index: number): void {
    // Find the correct position by looking at existing rows
    const children = Array.from(viewport.children) as HTMLElement[];
    let insertBefore: HTMLElement | null = null;

    for (const child of children) {
      const childIndex = parseInt(child.getAttribute('data-row-index') ?? '-1', 10);
      if (childIndex > index) {
        insertBefore = child;
        break;
      }
    }

    if (insertBefore) {
      viewport.insertBefore(rowEl, insertBefore);
    } else {
      viewport.appendChild(rowEl);
    }
  }

  /**
   * Get a row element from the pool or create a new one
   */
  private getOrCreateRow(columnCount: number): HTMLElement {
    let rowEl = this.rowPool.pop();

    if (rowEl) {
      // Reuse pooled row - ensure it has the right number of cells
      const currentCells = rowEl.children.length;
      if (currentCells < columnCount) {
        // Add missing cells
        for (let i = currentCells; i < columnCount; i++) {
          const cellEl = document.createElement('div');
          cellEl.className = `${this.classPrefix}-cell`;
          cellEl.setAttribute('role', 'cell');
          rowEl.appendChild(cellEl);
        }
      } else if (currentCells > columnCount) {
        // Remove extra cells
        while (rowEl.children.length > columnCount) {
          rowEl.removeChild(rowEl.lastChild!);
        }
      }

      // Clear any stale classes
      rowEl.classList.remove(
        `${this.classPrefix}-row--selected`,
        `${this.classPrefix}-row--hover`,
        `${this.classPrefix}-row--loading`
      );
    } else {
      // Create new row
      rowEl = document.createElement('div');
      rowEl.className = `${this.classPrefix}-row`;
      rowEl.setAttribute('role', 'row');
      rowEl.style.height = `${this.rowHeight}px`;

      // Create cells
      for (let i = 0; i < columnCount; i++) {
        const cellEl = document.createElement('div');
        cellEl.className = `${this.classPrefix}-cell`;
        cellEl.setAttribute('role', 'cell');
        rowEl.appendChild(cellEl);
      }
    }

    return rowEl;
  }

  /**
   * Return a row element to the pool for reuse
   */
  private returnRowToPool(rowEl: HTMLElement): void {
    // Clone the element to remove all event listeners
    // When reused, new listeners will be attached via attachRowEventListeners
    const cleanEl = rowEl.cloneNode(true) as HTMLElement;

    // Clear stale state
    cleanEl.classList.remove(
      `${this.classPrefix}-row--selected`,
      `${this.classPrefix}-row--hover`,
      `${this.classPrefix}-row--loading`
    );

    // Limit pool size to prevent memory bloat
    if (this.rowPool.length < 100) {
      this.rowPool.push(cleanEl);
    }
  }

  /**
   * Update the content of an existing row element
   */
  private updateRowContent(
    rowEl: HTMLElement,
    index: number,
    data: RowData,
    columns: string[],
    schemaMap: Map<string, ColumnSchema>
  ): void {
    rowEl.setAttribute('data-row-index', String(index));
    rowEl.classList.remove(`${this.classPrefix}-row--loading`);

    const cells = rowEl.children;
    for (let i = 0; i < columns.length && i < cells.length; i++) {
      const colName = columns[i];
      const colSchema = schemaMap.get(colName);
      const value = data[colName];
      this.updateCellContent(cells[i] as HTMLElement, value, colSchema);
    }
  }

  /**
   * Update the content of a cell element
   */
  private updateCellContent(
    cellEl: HTMLElement,
    value: unknown,
    schema?: ColumnSchema
  ): void {
    const nullClass = `${this.classPrefix}-cell--null`;
    const numberClass = `${this.classPrefix}-cell--number`;

    if (value === null || value === undefined) {
      cellEl.textContent = 'null';
      cellEl.classList.add(nullClass);
      cellEl.classList.remove(numberClass);
    } else {
      const formatted = this.formatCellValue(value, schema);
      cellEl.textContent = formatted;
      cellEl.classList.remove(nullClass);

      if (schema && ['integer', 'float', 'decimal'].includes(schema.type)) {
        cellEl.classList.add(numberClass);
      } else {
        cellEl.classList.remove(numberClass);
      }
    }
  }

  /**
   * Format a cell value based on its type
   */
  private formatCellValue(value: unknown, schema?: ColumnSchema): string {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (!schema) {
      return String(value);
    }

    switch (schema.type) {
      case 'integer':
        return typeof value === 'number' ? value.toLocaleString() : String(value);

      case 'float':
      case 'decimal':
        if (typeof value === 'number') {
          // Show up to 4 decimal places, remove trailing zeros
          return value.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4,
          });
        }
        return String(value);

      case 'boolean':
        return value ? 'true' : 'false';

      case 'date':
        if (value instanceof Date) {
          return value.toISOString().split('T')[0];
        }
        // DuckDB may return date as string
        return String(value);

      case 'timestamp':
        if (value instanceof Date) {
          return value.toLocaleString();
        }
        // Try to parse as date
        try {
          const date = new Date(String(value));
          if (!isNaN(date.getTime())) {
            return date.toLocaleString();
          }
        } catch {
          // Fall through to string
        }
        return String(value);

      case 'time':
        return String(value);

      case 'interval':
        return String(value);

      case 'string':
      default:
        return String(value);
    }
  }

  /**
   * Create a placeholder row for loading state
   */
  private createPlaceholderRow(index: number): HTMLElement {
    const rowEl = document.createElement('div');
    rowEl.className = `${this.classPrefix}-row ${this.classPrefix}-row--loading`;
    rowEl.style.height = `${this.rowHeight}px`;
    rowEl.setAttribute('data-row-index', String(index));

    const placeholderCell = document.createElement('div');
    placeholderCell.className = `${this.classPrefix}-cell`;
    placeholderCell.style.color = '#9ca3af';
    placeholderCell.textContent = `Loading row ${index + 1}...`;
    rowEl.appendChild(placeholderCell);

    return rowEl;
  }

  /**
   * Attach event listeners to a row element
   */
  private attachRowEventListeners(rowEl: HTMLElement, index: number): void {
    // Mouse enter (hover)
    rowEl.addEventListener('mouseenter', () => {
      if (this.actions && !this.destroyed) {
        this.actions.setHoveredRow(index);
      }
    });

    // Mouse leave (un-hover)
    rowEl.addEventListener('mouseleave', () => {
      if (this.actions && !this.destroyed) {
        this.actions.setHoveredRow(null);
      }
    });

    // Click (selection)
    rowEl.addEventListener('click', (event) => {
      this.handleRowClick(index, event);
    });
  }

  /**
   * Handle row click for selection
   */
  private handleRowClick(index: number, event: MouseEvent): void {
    if (!this.actions || this.destroyed) return;

    // Determine selection mode based on modifier keys
    let mode: 'replace' | 'toggle' | 'range' = 'replace';

    if (event.shiftKey) {
      mode = 'range';
    } else if (event.ctrlKey || event.metaKey) {
      mode = 'toggle';
    }

    this.actions.selectRow(index, mode);
  }

  // =========================================
  // Style Updates
  // =========================================

  /**
   * Update selection styles on visible rows using O(1) element lookup
   */
  private updateSelectionStyles(): void {
    const selectedRows = this.state.selectedRows.get();
    const selectedClass = `${this.classPrefix}-row--selected`;

    // Use rowElementMap for O(1) lookups instead of querySelectorAll
    for (const [index, rowEl] of this.rowElementMap) {
      if (selectedRows.has(index)) {
        rowEl.classList.add(selectedClass);
      } else {
        rowEl.classList.remove(selectedClass);
      }
    }
  }

  /**
   * Update hover styles using O(1) element lookup
   */
  private updateHoverStyles(): void {
    const hoveredRow = this.state.hoveredRow.get();
    const hoverClass = `${this.classPrefix}-row--hover`;

    // Remove hover from previously hovered row (O(1) lookup)
    if (this.previousHoveredRow !== null && this.previousHoveredRow !== hoveredRow) {
      const prevRowEl = this.rowElementMap.get(this.previousHoveredRow);
      if (prevRowEl) {
        prevRowEl.classList.remove(hoverClass);
      }
    }

    // Add hover to newly hovered row (O(1) lookup)
    if (hoveredRow !== null) {
      const rowEl = this.rowElementMap.get(hoveredRow);
      if (rowEl) {
        rowEl.classList.add(hoverClass);
      }
    }

    this.previousHoveredRow = hoveredRow;
  }

  // =========================================
  // Public API
  // =========================================

  /**
   * Get the virtual scroller instance
   */
  getVirtualScroller(): VirtualScroller {
    return this.virtualScroller;
  }

  /**
   * Get current visible range
   */
  getVisibleRange(): VisibleRange {
    return this.currentRange;
  }

  /**
   * Force a refresh of the table body
   */
  refresh(): void {
    if (this.destroyed) return;
    this.invalidateCacheAndRefresh();
  }

  /**
   * Scroll to a specific row
   */
  scrollToRow(index: number, align: 'start' | 'center' | 'end' = 'start'): void {
    this.virtualScroller.scrollToRow(index, align);
  }

  /**
   * Check if the table body has been destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Destroy the table body and clean up resources
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Unsubscribe from all state subscriptions
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];

    // Clear caches and pools
    this.rowDataCache.clear();
    this.rowElementMap.clear();
    this.rowPool = [];

    // Destroy virtual scroller
    this.virtualScroller.destroy();
  }
}
