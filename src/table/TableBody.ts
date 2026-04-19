/**
 * TableBody - Renders data rows with virtual scrolling
 *
 * Integrates with VirtualScroller to efficiently render only visible rows,
 * fetches data from DuckDB via WorkerBridge, and handles row hover/selection.
 */

import { VirtualScroller, type VisibleRange } from './VirtualScroller';
import { CellRenderer } from './Cell';
import type { TableState } from '../core/State';
import type { StateActions } from '../core/Actions';
import type { WorkerBridge } from '../data/WorkerBridge';
import type { ColumnSchema, SortColumn, Filter } from '../core/types';
import { filtersToWhereClause, quoteIdentifier } from '../filters/FilterSQL';

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
  private isAnimatingScroll = false;
  private scrollAnimationId: number | null = null;

  // DOM element pooling for efficient rendering
  private rowPool: HTMLElement[] = [];
  private rowElementMap: Map<number, HTMLElement> = new Map();
  private readonly MAX_ROW_CACHE = 500;
  private previousHoveredRow: number | null = null;
  private previousFocusedCell: { row: number; column: string } | null = null;

  // Cached column name -> 1-based schema index for aria-colindex
  private colIndexMap: Map<string, number> = new Map();

  private readonly rowHeight: number;
  private readonly classPrefix: string;
  private readonly cellRenderer: CellRenderer;
  private readonly container: HTMLElement;

  constructor(
    container: HTMLElement,
    private state: TableState,
    private bridge: WorkerBridge,
    private actions?: StateActions,
    options: TableBodyOptions = {}
  ) {
    this.container = container;
    this.rowHeight = options.rowHeight ?? 32;
    this.classPrefix = options.classPrefix ?? 'dt';
    this.cellRenderer = new CellRenderer({ classPrefix: this.classPrefix });

    // Create virtual scroller
    this.virtualScroller = new VirtualScroller(container, {
      rowHeight: this.rowHeight,
      classPrefix: this.classPrefix,
      externalScrollContainer: options.scrollContainer,
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

    // Build initial column index map for aria-colindex
    this.rebuildColIndexMap();

    // Set total rows (use filteredRows when filters are active)
    const filters = this.state.filters.get();
    const effectiveTotal = filters.length > 0
      ? this.state.filteredRows.get()
      : this.state.totalRows.get();
    this.virtualScroller.setTotalRows(effectiveTotal);

    // Subscribe to scroll events
    const unsubScroll = this.virtualScroller.onScroll((range) => {
      if (this.isAnimatingScroll) {
        // During scroll animation: update range and re-render with cached data
        // but don't trigger data fetches for intermediate positions
        this.currentRange = range;
        this.renderVisibleRows();
        return;
      }
      this.handleScroll(range);
    });
    this.unsubscribes.push(unsubScroll);

    // Subscribe to state changes
    this.subscribeToState();

    // Perform initial render if we have data
    if (effectiveTotal > 0) {
      const range = this.virtualScroller.getVisibleRange();
      await this.handleScroll(range);
    }
  }

  // =========================================
  // State Subscriptions
  // =========================================

  /**
   * Rebuild the column name -> 1-based schema index map.
   */
  private rebuildColIndexMap(): void {
    this.colIndexMap.clear();
    const schema = this.state.schema.get();
    for (let i = 0; i < schema.length; i++) {
      this.colIndexMap.set(schema[i].name, i + 1);
    }
  }

  /**
   * Subscribe to state signals that require re-render
   */
  private subscribeToState(): void {
    // Rebuild column index map when schema changes
    const unsubSchema = this.state.schema.subscribe(() => {
      if (!this.destroyed) {
        this.rebuildColIndexMap();
      }
    });
    this.unsubscribes.push(unsubSchema);

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

    // Re-fetch and scroll to top when filters change
    const unsubFilters = this.state.filters.subscribe((filters) => {
      if (!this.destroyed) {
        this.state.focusedCell.set(null);
        if (filters.length === 0) {
          this.virtualScroller.setTotalRows(this.state.totalRows.get());
        }

        const scrollTop = this.virtualScroller.getScrollTop();
        if (scrollTop === 0) {
          // Already at top — refresh data instantly
          this.invalidateCacheAndRefresh();
        } else {
          // Animate scroll to top, then refresh data
          this.smoothScrollToTopAndRefresh(scrollTop);
        }
      }
    });
    this.unsubscribes.push(unsubFilters);

    // Update scroller total when filteredRows changes (only when filters active)
    const unsubFilteredRows = this.state.filteredRows.subscribe((count) => {
      if (!this.destroyed) {
        if (this.state.filters.get().length > 0) {
          this.virtualScroller.setTotalRows(count);
        }
      }
    });
    this.unsubscribes.push(unsubFilteredRows);

    // Update total rows when it changes (only when no filters active)
    const unsubTotalRows = this.state.totalRows.subscribe((total) => {
      if (!this.destroyed) {
        if (this.state.filters.get().length === 0) {
          this.virtualScroller.setTotalRows(total);
        }
        this.invalidateCacheAndRefresh();
      }
    });
    this.unsubscribes.push(unsubTotalRows);

    // Re-render when pinned columns change (to update sticky styles)
    const unsubPinned = this.state.pinnedColumns.subscribe(() => {
      if (!this.destroyed) {
        this.invalidateCacheAndRefresh();
      }
    });
    this.unsubscribes.push(unsubPinned);

    // Update cell widths when column widths change
    const unsubWidths = this.state.columnWidths.subscribe(() => {
      if (!this.destroyed) {
        this.updateCellWidths();
      }
    });
    this.unsubscribes.push(unsubWidths);

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

    // Update focus styling
    const unsubFocus = this.state.focusedCell.subscribe(() => {
      if (!this.destroyed) {
        this.updateFocusStyles();
      }
    });
    this.unsubscribes.push(unsubFocus);

    // Re-fetch when table name changes (e.g., derived column VIEW creation/removal)
    const unsubTableName = this.state.tableName.subscribe(() => {
      if (!this.destroyed) {
        this.invalidateCacheAndRefresh();
      }
    });
    this.unsubscribes.push(unsubTableName);
  }

  /**
   * Animate scroll to the top of the table, then invalidate cache and refresh.
   * Old data scrolls away during animation, then fresh data loads at position 0.
   */
  private smoothScrollToTopAndRefresh(startScrollTop: number): void {
    // Cancel any ongoing animation
    if (this.scrollAnimationId !== null) {
      cancelAnimationFrame(this.scrollAnimationId);
    }

    const scrollContainer = this.virtualScroller.getScrollContainer();
    const duration = 300;
    const startTime = performance.now();
    this.isAnimatingScroll = true;

    const animate = (now: number) => {
      if (this.destroyed) {
        this.isAnimatingScroll = false;
        this.scrollAnimationId = null;
        return;
      }

      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      scrollContainer.scrollTop = Math.round(startScrollTop * (1 - eased));

      if (scrollContainer.scrollTop === 0 || progress >= 1) {
        // Animation complete — refresh data at position 0
        this.scrollAnimationId = null;
        this.isAnimatingScroll = false;
        this.virtualScroller.scrollToRow(0, 'start');
        this.invalidateCacheAndRefresh();
      } else {
        this.scrollAnimationId = requestAnimationFrame(animate);
      }
    };

    this.scrollAnimationId = requestAnimationFrame(animate);
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
    const filters = this.state.filters.get();
    const schema = this.state.schema.get();

    if (visibleColumns.length === 0) return;

    // Build SQL query
    const sql = this.buildRowQuery(tableName, visibleColumns, sortColumns, filters, start, end - start, schema);

    try {
      const rows = await this.bridge.query<RowData>(sql);

      // Cache the fetched rows
      rows.forEach((row, index) => {
        this.rowDataCache.set(start + index, row);
      });

      // Evict distant rows to bound memory usage
      this.evictDistantRows(start, end);
    } catch (error) {
      console.error('Error fetching rows:', error);
    }
  }

  /**
   * Evict cached rows furthest from the visible range to bound memory.
   */
  private evictDistantRows(visibleStart: number, visibleEnd: number): void {
    if (this.rowDataCache.size <= this.MAX_ROW_CACHE) return;

    const indices = [...this.rowDataCache.keys()];
    indices.sort((a, b) => {
      const distA = Math.min(Math.abs(a - visibleStart), Math.abs(a - visibleEnd));
      const distB = Math.min(Math.abs(b - visibleStart), Math.abs(b - visibleEnd));
      return distB - distA; // Most distant first
    });

    const toRemove = indices.slice(0, this.rowDataCache.size - this.MAX_ROW_CACHE);
    for (const idx of toRemove) {
      this.rowDataCache.delete(idx);
    }
  }

  /**
   * Build SQL query for fetching rows
   */
  private buildRowQuery(
    tableName: string,
    columns: string[],
    sortColumns: SortColumn[],
    filters: Filter[],
    offset: number,
    limit: number,
    schema?: ColumnSchema[]
  ): string {
    // Build schema lookup for type-aware column selection
    const schemaMap = new Map<string, ColumnSchema>();
    if (schema) {
      for (const col of schema) schemaMap.set(col.name, col);
    }

    // Quote column names; cast INTERVAL columns to VARCHAR so DuckDB
    // returns strings instead of Arrow MonthDayNano objects
    const columnList = columns.map(col => {
      const quoted = quoteIdentifier(col);
      if (schemaMap.get(col)?.type === 'interval') {
        return `CAST(${quoted} AS VARCHAR) AS ${quoted}`;
      }
      return quoted;
    }).join(', ');

    let sql = `SELECT ${columnList} FROM ${quoteIdentifier(tableName)}`;

    // Add WHERE clause if filters are active
    if (filters.length > 0) {
      const whereClause = filtersToWhereClause(filters);
      if (whereClause) {
        sql += ` WHERE ${whereClause}`;
      }
    }

    // Add ORDER BY if sorting is active
    if (sortColumns.length > 0) {
      const orderBy = sortColumns
        .map((s) => `${quoteIdentifier(s.column)} ${s.direction.toUpperCase()}`)
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
    const focusedCell = this.state.focusedCell.get();

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
          rowEl.setAttribute('aria-selected', 'true');
        } else {
          rowEl.classList.remove(selectedClass);
          rowEl.removeAttribute('aria-selected');
        }

        if (hoveredRow === i) {
          rowEl.classList.add(hoverClass);
        } else {
          rowEl.classList.remove(hoverClass);
        }

        // Apply focus style + roving tabindex
        const focusClass = `${this.classPrefix}-cell--focused`;
        if (focusedCell && focusedCell.row === i) {
          const focusColIdx = visibleColumns.indexOf(focusedCell.column);
          for (let c = 0; c < rowEl.children.length; c++) {
            const cell = rowEl.children[c] as HTMLElement;
            if (c === focusColIdx) {
              cell.classList.add(focusClass);
              cell.setAttribute('tabindex', '0');
            } else {
              cell.classList.remove(focusClass);
              cell.setAttribute('tabindex', '-1');
            }
          }
        } else {
          for (let c = 0; c < rowEl.children.length; c++) {
            const cell = rowEl.children[c] as HTMLElement;
            cell.classList.remove(focusClass);
            cell.setAttribute('tabindex', '-1');
          }
        }
      }
    }

    // Keep previousFocusedCell in sync so updateFocusStyles() knows
    // which DOM element currently has the focus class after a rebuild.
    this.previousFocusedCell = focusedCell ? { ...focusedCell } : null;

    // Calculate total width from actual column widths
    const columnWidths = this.state.columnWidths.get();
    let totalWidth = 0;
    for (const colName of visibleColumns) {
      const width = columnWidths.get(colName) ?? 150;
      totalWidth += width;
    }

    // Set width for horizontal scrolling
    // Uses a width spacer element in normal flow to force correct scrollWidth
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
          cellEl.setAttribute('tabindex', '-1');
          rowEl.appendChild(cellEl);
        }
      } else if (currentCells > columnCount) {
        // Remove extra cells
        while (rowEl.children.length > columnCount) {
          rowEl.removeChild(rowEl.lastChild!);
        }
      }

      // Clear any stale classes and ARIA attributes
      rowEl.classList.remove(
        `${this.classPrefix}-row--selected`,
        `${this.classPrefix}-row--hover`,
        `${this.classPrefix}-row--loading`
      );
      rowEl.removeAttribute('aria-selected');
      rowEl.removeAttribute('aria-rowindex');
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
        cellEl.setAttribute('tabindex', '-1');
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

    // Clear stale state and ARIA attributes
    cleanEl.classList.remove(
      `${this.classPrefix}-row--selected`,
      `${this.classPrefix}-row--hover`,
      `${this.classPrefix}-row--loading`
    );
    cleanEl.removeAttribute('aria-rowindex');
    cleanEl.removeAttribute('aria-selected');

    // Clear cell-level focus class and reset roving tabindex
    const focusClass = `${this.classPrefix}-cell--focused`;
    for (let i = 0; i < cleanEl.children.length; i++) {
      const cell = cleanEl.children[i] as HTMLElement;
      cell.classList.remove(focusClass);
      cell.setAttribute('tabindex', '-1');
    }

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
    rowEl.setAttribute('aria-rowindex', String(index + 1));
    rowEl.classList.remove(`${this.classPrefix}-row--loading`);

    const columnWidths = this.state.columnWidths.get();
    const pinnedColumns = this.state.pinnedColumns.get();

    const root = this.container.closest<HTMLElement>('.' + this.classPrefix + '-root') ?? this.container;
    const baseZ = Number(
      getComputedStyle(root).getPropertyValue('--dt-z-pinned-col').trim()
    ) || 20;

    // Compute pinned offsets
    const pinnedOffsets = new Map<string, { left: number; zIndex: number }>();
    let cumulativeLeft = 0;
    for (let i = 0; i < pinnedColumns.length; i++) {
      const pCol = pinnedColumns[i];
      pinnedOffsets.set(pCol, {
        left: cumulativeLeft,
        zIndex: baseZ + (pinnedColumns.length - i),
      });
      cumulativeLeft += (columnWidths.get(pCol) ?? 150);
    }

    const cells = rowEl.children;
    for (let i = 0; i < columns.length && i < cells.length; i++) {
      const colName = columns[i];
      const colSchema = schemaMap.get(colName);
      const value = data[colName];
      const cellEl = cells[i] as HTMLElement;

      // ARIA: 1-based column index in full schema
      const ariaColIdx = this.colIndexMap.get(colName);
      if (ariaColIdx !== undefined) {
        cellEl.setAttribute('aria-colindex', String(ariaColIdx));
      }

      // Apply dynamic width
      const width = columnWidths.get(colName) ?? 150;
      cellEl.style.width = `${width}px`;

      // Apply pinned cell styles
      const offset = pinnedOffsets.get(colName);
      if (offset) {
        cellEl.style.position = 'sticky';
        cellEl.style.left = `${offset.left}px`;
        cellEl.style.zIndex = String(offset.zIndex);
        cellEl.classList.add(`${this.classPrefix}-cell--pinned`);
      } else {
        cellEl.style.position = '';
        cellEl.style.left = '';
        cellEl.style.zIndex = '';
        cellEl.classList.remove(`${this.classPrefix}-cell--pinned`);
      }

      // Apply derived cell styling (after pinned logic so both classes can coexist)
      if (colSchema?.isDerived) {
        cellEl.classList.add(`${this.classPrefix}-cell--derived`);
      } else {
        cellEl.classList.remove(`${this.classPrefix}-cell--derived`);
      }

      this.cellRenderer.render(cellEl, value, colSchema);
    }
  }

  /**
   * Create a placeholder row for loading state
   */
  private createPlaceholderRow(index: number): HTMLElement {
    const rowEl = document.createElement('div');
    rowEl.className = `${this.classPrefix}-row ${this.classPrefix}-row--loading`;
    rowEl.setAttribute('role', 'row');
    rowEl.style.height = `${this.rowHeight}px`;
    rowEl.setAttribute('data-row-index', String(index));
    rowEl.setAttribute('aria-rowindex', String(index + 1));

    const placeholderCell = document.createElement('div');
    placeholderCell.className = `${this.classPrefix}-cell ${this.classPrefix}-cell--placeholder`;
    placeholderCell.setAttribute('role', 'cell');
    placeholderCell.setAttribute('tabindex', '-1');
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

    // Click (selection + focus)
    rowEl.addEventListener('click', (event) => {
      this.handleRowClick(index, event);

      // Set focused cell from clicked cell
      if (this.actions && !this.destroyed) {
        const cellEl = (event.target as HTMLElement).closest(
          `.${this.classPrefix}-cell`
        ) as HTMLElement | null;
        if (cellEl && rowEl.contains(cellEl)) {
          const cellIndex = Array.from(rowEl.children).indexOf(cellEl);
          const visibleColumns = this.state.visibleColumns.get();
          if (cellIndex >= 0 && cellIndex < visibleColumns.length) {
            this.actions.setFocusedCell({
              row: index,
              column: visibleColumns[cellIndex],
            });
          }
        }
      }
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
        rowEl.setAttribute('aria-selected', 'true');
      } else {
        rowEl.classList.remove(selectedClass);
        rowEl.removeAttribute('aria-selected');
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

  /**
   * Update focus styles using O(1) element lookup.
   * Removes dt-cell--focused from the previously focused cell (if visible)
   * and adds it to the newly focused cell (if visible).
   */
  private updateFocusStyles(): void {
    const focusedCell = this.state.focusedCell.get();
    const focusClass = `${this.classPrefix}-cell--focused`;
    const visibleColumns = this.state.visibleColumns.get();

    // Remove from previous
    if (this.previousFocusedCell) {
      const prevRowEl = this.rowElementMap.get(this.previousFocusedCell.row);
      if (prevRowEl) {
        const prevColIdx = visibleColumns.indexOf(this.previousFocusedCell.column);
        if (prevColIdx >= 0 && prevColIdx < prevRowEl.children.length) {
          const prevCell = prevRowEl.children[prevColIdx] as HTMLElement;
          prevCell.classList.remove(focusClass);
          prevCell.setAttribute('tabindex', '-1');
        }
      }
    }

    // Add to current
    if (focusedCell) {
      const rowEl = this.rowElementMap.get(focusedCell.row);
      if (rowEl) {
        const colIdx = visibleColumns.indexOf(focusedCell.column);
        if (colIdx >= 0 && colIdx < rowEl.children.length) {
          const cell = rowEl.children[colIdx] as HTMLElement;
          cell.classList.add(focusClass);
          cell.setAttribute('tabindex', '0');
        }
      }
    }

    this.previousFocusedCell = focusedCell ? { ...focusedCell } : null;
  }

  /**
   * Update cell widths when column widths change
   */
  private updateCellWidths(): void {
    const visibleColumns = this.state.visibleColumns.get();
    const columnWidths = this.state.columnWidths.get();

    // Update cell widths for all visible rows
    for (const [, rowEl] of this.rowElementMap) {
      const cells = rowEl.children;
      for (let i = 0; i < visibleColumns.length && i < cells.length; i++) {
        const colName = visibleColumns[i];
        const width = columnWidths.get(colName) ?? 150;
        (cells[i] as HTMLElement).style.width = `${width}px`;
      }
    }

    // Update total content width
    let totalWidth = 0;
    for (const colName of visibleColumns) {
      const width = columnWidths.get(colName) ?? 150;
      totalWidth += width;
    }
    this.virtualScroller.setContentWidth(totalWidth);

    // Update header row width
    const scrollContainer = this.virtualScroller.getScrollContainer();
    const headerRow = scrollContainer.closest('.dt-root')?.querySelector('.dt-header-row') as HTMLElement;
    if (headerRow) {
      headerRow.style.minWidth = `${totalWidth}px`;
    }
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

    // Cancel any ongoing scroll animation
    if (this.scrollAnimationId !== null) {
      cancelAnimationFrame(this.scrollAnimationId);
    }

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
