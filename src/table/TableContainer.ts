/**
 * TableContainer - Main container component for the data table
 *
 * Manages the overall DOM structure including:
 * - Header row container (for column headers)
 * - Body container (for data rows with virtual scrolling)
 * - Resize observer for responsive behavior
 */

import type { TableState } from '../core/State';
import type { StateActions } from '../core/Actions';
import type { WorkerBridge } from '../data/WorkerBridge';
import { ColumnHeader } from './ColumnHeader';
import { ColumnReorder } from './ColumnReorder';
import { TableBody } from './TableBody';

/**
 * Options for configuring the TableContainer
 */
export interface TableContainerOptions {
  /** Fixed row height in pixels (default: 32) */
  rowHeight?: number;
  /** Fixed header height in pixels (default: 120 for visualizations) */
  headerHeight?: number;
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string;
}

/**
 * Resize callback type
 */
export type ResizeCallback = (dimensions: { width: number; height: number }) => void;

/**
 * TableContainer manages the DOM structure and lifecycle for the data table.
 *
 * @example
 * ```typescript
 * const container = document.getElementById('my-table');
 * const state = createTableState();
 * const table = new TableContainer(container, state);
 *
 * // Later, clean up
 * table.destroy();
 * ```
 */
export class TableContainer {
  private element: HTMLElement;
  private headerArea: HTMLElement;
  private headerScroll: HTMLElement;
  private scrollbarGutter: HTMLElement;
  private headerRow: HTMLElement;
  private bodyScroll: HTMLElement;
  private bodyContainer: HTMLElement;
  private resizeObserver: ResizeObserver;
  private unsubscribes: (() => void)[] = [];
  private destroyed = false;
  private resizeCallbacks: Set<ResizeCallback> = new Set();
  private currentDimensions: { width: number; height: number } = { width: 0, height: 0 };
  private columnHeaders: ColumnHeader[] = [];
  private tableBody: TableBody | null = null;
  private columnReorder: ColumnReorder | null = null;

  // Scroll synchronization handlers
  private boundBodyScrollHandler: (() => void) | null = null;
  private boundHeaderScrollHandler: (() => void) | null = null;

  // Resolved options with defaults applied
  private readonly resolvedOptions: Required<TableContainerOptions>;

  constructor(
    private container: HTMLElement,
    private state: TableState,
    private actions?: StateActions,
    private bridge?: WorkerBridge,
    options: TableContainerOptions = {}
  ) {
    // Apply defaults
    this.resolvedOptions = {
      rowHeight: 32,
      headerHeight: 120,
      classPrefix: 'dt',
      ...options,
    };

    // Create DOM structure
    this.element = this.createRootElement();
    this.headerArea = this.createHeaderArea();
    this.headerScroll = this.createHeaderScroll();
    this.scrollbarGutter = this.createScrollbarGutter();
    this.headerRow = this.createHeaderRow();
    this.bodyScroll = this.createBodyScroll();
    this.bodyContainer = this.createBodyContainer();

    // Assemble structure:
    // root > headerArea > (headerScroll > headerRow) + scrollbarGutter
    //      > bodyScroll > bodyContainer
    this.headerScroll.appendChild(this.headerRow);
    this.headerArea.appendChild(this.headerScroll);
    this.headerArea.appendChild(this.scrollbarGutter);
    this.bodyScroll.appendChild(this.bodyContainer);
    this.element.appendChild(this.headerArea);
    this.element.appendChild(this.bodyScroll);
    this.container.appendChild(this.element);

    // Set up resize observer
    this.resizeObserver = this.setupResizeObserver();

    // Subscribe to state changes
    this.subscribeToState();

    // Create column reorder handler
    if (this.actions) {
      this.columnReorder = new ColumnReorder(
        this.headerRow,
        (newOrder) => this.actions?.setColumnOrder(newOrder),
        { classPrefix: this.resolvedOptions.classPrefix }
      );
    }

    // Set up scroll synchronization between header and body
    this.setupScrollSync();

    // Initial render
    this.render();
  }

  // =========================================
  // DOM Creation Methods
  // =========================================

  /**
   * Create the root container element
   */
  private createRootElement(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-root`;
    el.setAttribute('role', 'table');
    el.setAttribute('aria-label', 'Data table');
    return el;
  }

  /**
   * Create the header area container (holds header scroll + scrollbar gutter)
   */
  private createHeaderArea(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-header-area`;
    return el;
  }

  /**
   * Create the header scroll container (hidden scrollbar, synced with body)
   */
  private createHeaderScroll(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-header-scroll`;
    return el;
  }

  /**
   * Create the scrollbar gutter (aligns with body's vertical scrollbar)
   */
  private createScrollbarGutter(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-scrollbar-gutter`;
    return el;
  }

  /**
   * Create the header row container
   */
  private createHeaderRow(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-header`;
    el.setAttribute('role', 'rowgroup');
    el.style.minHeight = `${this.resolvedOptions.headerHeight}px`;
    return el;
  }

  /**
   * Create the body scroll container (handles both horizontal and vertical scrolling)
   */
  private createBodyScroll(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-body-scroll`;
    return el;
  }

  /**
   * Create the body container for data rows
   */
  private createBodyContainer(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-body`;
    el.setAttribute('role', 'rowgroup');
    return el;
  }

  // =========================================
  // Resize Handling
  // =========================================

  /**
   * Set up ResizeObserver to track container size changes
   */
  private setupResizeObserver(): ResizeObserver {
    const observer = new ResizeObserver((entries) => {
      this.handleResize(entries);
    });

    observer.observe(this.element);
    return observer;
  }

  /**
   * Handle resize events
   */
  private handleResize(entries: ResizeObserverEntry[]): void {
    if (this.destroyed) return;

    for (const entry of entries) {
      const { width, height } = entry.contentRect;

      // Only notify if dimensions actually changed
      if (width !== this.currentDimensions.width || height !== this.currentDimensions.height) {
        this.currentDimensions = { width, height };

        // Notify all resize callbacks
        for (const callback of this.resizeCallbacks) {
          callback(this.currentDimensions);
        }
      }
    }
  }

  /**
   * Subscribe to resize events
   *
   * @param callback - Function to call when container resizes
   * @returns Unsubscribe function
   */
  onResize(callback: ResizeCallback): () => void {
    this.resizeCallbacks.add(callback);

    // Immediately call with current dimensions
    if (this.currentDimensions.width > 0 || this.currentDimensions.height > 0) {
      callback(this.currentDimensions);
    }

    return () => {
      this.resizeCallbacks.delete(callback);
    };
  }

  // =========================================
  // Scroll Synchronization
  // =========================================

  /**
   * Set up bidirectional scroll synchronization between header and body
   *
   * This ensures the header stays aligned with the body when scrolling horizontally.
   * Uses a flag to prevent infinite scroll loops.
   */
  private setupScrollSync(): void {
    let isScrolling = false;

    this.boundBodyScrollHandler = () => {
      if (isScrolling) return;
      isScrolling = true;
      this.headerScroll.scrollLeft = this.bodyScroll.scrollLeft;
      isScrolling = false;
    };

    this.boundHeaderScrollHandler = () => {
      if (isScrolling) return;
      isScrolling = true;
      this.bodyScroll.scrollLeft = this.headerScroll.scrollLeft;
      isScrolling = false;
    };

    this.bodyScroll.addEventListener('scroll', this.boundBodyScrollHandler, { passive: true });
    this.headerScroll.addEventListener('scroll', this.boundHeaderScrollHandler, { passive: true });
  }

  // =========================================
  // State Subscriptions
  // =========================================

  /**
   * Subscribe to relevant state changes
   */
  private subscribeToState(): void {
    // Subscribe to schema changes to update header structure
    const unsubSchema = this.state.schema.subscribe(() => {
      if (!this.destroyed) {
        this.render();
      }
    });
    this.unsubscribes.push(unsubSchema);

    // Subscribe to visible columns changes
    const unsubVisible = this.state.visibleColumns.subscribe(() => {
      if (!this.destroyed) {
        this.render();
      }
    });
    this.unsubscribes.push(unsubVisible);

    // Subscribe to column widths for sizing updates
    // NOTE: We call updateColumnWidths() instead of render() to avoid
    // destroying ColumnHeaders mid-drag (which would kill the resize operation)
    const unsubWidths = this.state.columnWidths.subscribe(() => {
      if (!this.destroyed) {
        this.updateColumnWidths();
      }
    });
    this.unsubscribes.push(unsubWidths);

    // Subscribe to sort columns for sort indicator updates
    // (ColumnHeaders subscribe individually, but this ensures render is called)
    const unsubSort = this.state.sortColumns.subscribe(() => {
      if (!this.destroyed) {
        // Individual column headers will update their own sort indicators
        // No need to full re-render here
      }
    });
    this.unsubscribes.push(unsubSort);
  }

  // =========================================
  // Public API
  // =========================================

  /**
   * Destroy all existing column headers
   */
  private destroyColumnHeaders(): void {
    for (const header of this.columnHeaders) {
      header.destroy();
    }
    this.columnHeaders = [];
  }

  /**
   * Update column widths without re-rendering
   *
   * This is called when columnWidths state changes. We update styles in-place
   * rather than calling render() to avoid destroying ColumnHeaders mid-drag
   * (which would kill any active resize operation).
   */
  private updateColumnWidths(): void {
    const columnWidths = this.state.columnWidths.get();

    // Update header widths
    for (const header of this.columnHeaders) {
      const col = header.getColumn();
      const width = columnWidths.get(col.name) ?? 150;
      header.getElement().style.width = `${width}px`;
    }
  }

  /**
   * Render the table container
   *
   * Creates ColumnHeader components for each visible column and renders
   * placeholder content for the body (to be implemented in Task 3.4).
   */
  render(): void {
    if (this.destroyed) return;

    const schema = this.state.schema.get();
    const visibleColumns = this.state.visibleColumns.get();
    const tableName = this.state.tableName.get();
    const columnWidths = this.state.columnWidths.get();

    // Clear existing column headers
    this.destroyColumnHeaders();
    this.headerRow.innerHTML = '';
    this.bodyContainer.innerHTML = '';

    if (schema.length === 0 || !tableName) {
      // No data loaded - show placeholder
      const placeholder = document.createElement('div');
      placeholder.className = `${this.resolvedOptions.classPrefix}-placeholder`;
      placeholder.textContent = 'Load data to see the table';
      placeholder.style.padding = '2rem';
      placeholder.style.textAlign = 'center';
      placeholder.style.color = '#6b7280';
      this.bodyContainer.appendChild(placeholder);
    } else {
      // Create header row container
      const headerRowEl = document.createElement('div');
      headerRowEl.className = `${this.resolvedOptions.classPrefix}-header-row`;
      headerRowEl.setAttribute('role', 'row');

      // Create column headers
      if (this.actions) {
        for (const colName of visibleColumns) {
          const colSchema = schema.find((s) => s.name === colName);
          if (colSchema) {
            const columnHeader = new ColumnHeader(
              colSchema,
              this.state,
              this.actions,
              { classPrefix: this.resolvedOptions.classPrefix }
            );
            this.columnHeaders.push(columnHeader);

            // Apply dynamic width from state (default to 150px)
            const headerEl = columnHeader.getElement();
            const width = columnWidths.get(colName) ?? 150;
            headerEl.style.width = `${width}px`;

            headerRowEl.appendChild(headerEl);
          }
        }
      } else {
        // Fallback if no actions provided - show simple placeholders
        for (const colName of visibleColumns) {
          const colSchema = schema.find((s) => s.name === colName);
          if (colSchema) {
            const colEl = document.createElement('div');
            colEl.className = `${this.resolvedOptions.classPrefix}-col-header`;
            colEl.style.padding = '0.5rem';

            // Apply dynamic width from state (default to 150px)
            const width = columnWidths.get(colName) ?? 150;
            colEl.style.width = `${width}px`;

            colEl.innerHTML = `<strong>${colSchema.name}</strong><br><small>${colSchema.type}</small>`;
            headerRowEl.appendChild(colEl);
          }
        }
      }

      this.headerRow.appendChild(headerRowEl);

      // Refresh column reorder handlers for new headers
      this.columnReorder?.refresh();

      // Create or update TableBody
      if (this.bridge && this.actions) {
        // Destroy existing table body if present
        if (this.tableBody) {
          this.tableBody.destroy();
          this.tableBody = null;
        }

        // Create new table body
        this.tableBody = new TableBody(
          this.bodyContainer,
          this.state,
          this.bridge,
          this.actions,
          {
            rowHeight: this.resolvedOptions.rowHeight,
            classPrefix: this.resolvedOptions.classPrefix,
            scrollContainer: this.bodyScroll,
            // headerHeight no longer needed - body scroll only contains body
          }
        );

        // Initialize table body asynchronously
        this.tableBody.initialize().catch((error) => {
          console.error('Error initializing table body:', error);
        });
      } else {
        // Fallback: show row count if no bridge/actions
        const bodyPlaceholder = document.createElement('div');
        bodyPlaceholder.className = `${this.resolvedOptions.classPrefix}-body-placeholder`;
        bodyPlaceholder.style.padding = '2rem';
        bodyPlaceholder.style.textAlign = 'center';
        bodyPlaceholder.style.color = '#6b7280';
        bodyPlaceholder.textContent = `${this.state.totalRows.get().toLocaleString()} rows`;
        this.bodyContainer.appendChild(bodyPlaceholder);
      }
    }
  }

  /**
   * Get the root element
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Get the header row element
   */
  getHeaderRow(): HTMLElement {
    return this.headerRow;
  }

  /**
   * Get the body container element
   */
  getBodyContainer(): HTMLElement {
    return this.bodyContainer;
  }

  /**
   * Get the scroll container element (body scroll)
   *
   * This is the container that handles both horizontal and vertical scrolling for the body.
   */
  getScrollContainer(): HTMLElement {
    return this.bodyScroll;
  }

  /**
   * Get the header scroll element
   *
   * This is the container that handles horizontal scrolling for the header.
   * It should be synced with the body scroll.
   */
  getHeaderScroll(): HTMLElement {
    return this.headerScroll;
  }

  /**
   * Get current container dimensions
   */
  getDimensions(): { width: number; height: number } {
    return { ...this.currentDimensions };
  }

  /**
   * Get the resolved options
   */
  getOptions(): Required<TableContainerOptions> {
    return { ...this.resolvedOptions };
  }

  /**
   * Check if the container has been destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Get the table body instance
   */
  getTableBody(): TableBody | null {
    return this.tableBody;
  }

  /**
   * Destroy the table container and clean up resources
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Destroy all column headers
    this.destroyColumnHeaders();

    // Destroy table body
    if (this.tableBody) {
      this.tableBody.destroy();
      this.tableBody = null;
    }

    // Destroy column reorder handler
    if (this.columnReorder) {
      this.columnReorder.destroy();
      this.columnReorder = null;
    }

    // Disconnect resize observer
    this.resizeObserver.disconnect();

    // Clear resize callbacks
    this.resizeCallbacks.clear();

    // Clean up scroll sync listeners
    if (this.boundBodyScrollHandler) {
      this.bodyScroll.removeEventListener('scroll', this.boundBodyScrollHandler);
      this.boundBodyScrollHandler = null;
    }
    if (this.boundHeaderScrollHandler) {
      this.headerScroll.removeEventListener('scroll', this.boundHeaderScrollHandler);
      this.boundHeaderScrollHandler = null;
    }

    // Unsubscribe from all state subscriptions
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];

    // Remove element from DOM
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
