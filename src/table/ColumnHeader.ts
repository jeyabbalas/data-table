/**
 * ColumnHeader - Interactive column header component
 *
 * Renders a column header with:
 * - Column name
 * - Type label
 * - Stats line (placeholder for future implementation)
 * - Visualization container (placeholder for Phase 4)
 * - Sort indicator with multi-sort badges
 *
 * Supports click to sort and Shift+click for multi-column sort.
 */

import type { ColumnSchema } from '../core/types';
import type { TableState } from '../core/State';
import type { StateActions } from '../core/Actions';
import { ColumnResizer } from './ColumnResizer';

/**
 * Options for configuring the ColumnHeader
 */
export interface ColumnHeaderOptions {
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string;
}

/**
 * ColumnHeader component renders an interactive column header.
 *
 * @example
 * ```typescript
 * const header = new ColumnHeader(column, state, actions);
 * container.appendChild(header.getElement());
 *
 * // Later, clean up
 * header.destroy();
 * ```
 */
export class ColumnHeader {
  private element: HTMLElement;
  private sortButton: HTMLElement;
  private sortBadge: HTMLElement;
  private pinButton: HTMLElement;
  private dragHandle: HTMLElement;
  private statsEl: HTMLElement;
  private resizer: ColumnResizer;
  private unsubscribes: (() => void)[] = [];
  private destroyed = false;
  private readonly classPrefix: string;

  constructor(
    private column: ColumnSchema,
    private state: TableState,
    private actions: StateActions,
    options: ColumnHeaderOptions = {}
  ) {
    this.classPrefix = options.classPrefix ?? 'dt';
    this.element = this.createElement();
    this.sortButton = this.element.querySelector(`.${this.classPrefix}-col-sort-btn`)!;
    this.sortBadge = this.element.querySelector(`.${this.classPrefix}-col-sort-badge`)!;
    this.pinButton = this.element.querySelector(`.${this.classPrefix}-col-pin-btn`)!;
    this.dragHandle = this.element.querySelector(`.${this.classPrefix}-col-drag-handle`)!;
    this.statsEl = this.element.querySelector(`.${this.classPrefix}-col-stats`)!;

    // Create resizer for column width adjustment
    this.resizer = new ColumnResizer(
      this.element,
      (width) => this.actions.setColumnWidth(this.column.name, width),
      () => this.actions.resetColumnWidth(this.column.name),
      () => this.getColumnCells(),
      { classPrefix: this.classPrefix }
    );

    this.attachEventListeners();
    this.subscribeToState();
    this.update();
  }

  // =========================================
  // DOM Creation
  // =========================================

  /**
   * Create the column header element structure
   */
  private createElement(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.classPrefix}-col-header`;
    el.setAttribute('role', 'columnheader');
    el.setAttribute('aria-label', `${this.column.name}, ${this.column.type}`);
    el.setAttribute('data-column', this.column.name);

    // Name row container (holds drag handle + name inline)
    const nameRow = document.createElement('div');
    nameRow.className = `${this.classPrefix}-col-name-row`;

    // Drag handle (inline with name)
    const dragHandle = document.createElement('button');
    dragHandle.className = `${this.classPrefix}-col-drag-handle`;
    dragHandle.setAttribute('type', 'button');
    dragHandle.setAttribute('aria-label', `Drag to reorder ${this.column.name}`);
    dragHandle.setAttribute('title', 'Reorder column');
    dragHandle.innerHTML = `
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="5" cy="4" r="1.5" />
        <circle cx="11" cy="4" r="1.5" />
        <circle cx="5" cy="8" r="1.5" />
        <circle cx="11" cy="8" r="1.5" />
        <circle cx="5" cy="12" r="1.5" />
        <circle cx="11" cy="12" r="1.5" />
      </svg>
    `;
    // Column name (flex-grow to push sort button to the right)
    const nameEl = document.createElement('div');
    nameEl.className = `${this.classPrefix}-col-name`;
    nameEl.textContent = this.column.name;
    nameEl.setAttribute('title', this.column.name); // Tooltip for truncated names
    nameRow.appendChild(nameEl);

    // Sort button with SVG arrows (in name row, at right end)
    const sortBtn = document.createElement('button');
    sortBtn.className = `${this.classPrefix}-col-sort-btn`;
    sortBtn.setAttribute('type', 'button');
    sortBtn.setAttribute('aria-label', `Sort by ${this.column.name}`);
    sortBtn.setAttribute('title', 'Sort ascending');
    sortBtn.innerHTML = `
      <svg viewBox="0 0 10 14" aria-hidden="true">
        <path d="M5 0 L10 5 L0 5 Z" class="arrow-up" />
        <path d="M5 14 L10 9 L0 9 Z" class="arrow-down" />
      </svg>
    `;

    // Sort badge for multi-sort (inside button, positioned absolutely)
    const sortBadge = document.createElement('span');
    sortBadge.className = `${this.classPrefix}-col-sort-badge`;
    sortBadge.style.display = 'none';
    sortBtn.appendChild(sortBadge);

    nameRow.appendChild(sortBtn);
    nameRow.appendChild(dragHandle);

    el.appendChild(nameRow);

    // Action panel (pin, hide, filter buttons)
    const actionPanel = document.createElement('div');
    actionPanel.className = `${this.classPrefix}-col-action-panel`;

    // Pin button (thumbtack icon)
    const pinBtn = document.createElement('button');
    pinBtn.className = `${this.classPrefix}-col-action-btn ${this.classPrefix}-col-pin-btn`;
    pinBtn.setAttribute('type', 'button');
    pinBtn.setAttribute('aria-label', `Pin ${this.column.name}`);
    pinBtn.setAttribute('title', 'Pin column');
    pinBtn.innerHTML = `
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="4.5" r="2.5" />
        <rect x="7.25" y="6.5" width="1.5" height="7" rx="0.75" />
      </svg>
    `;

    // Hide button (eye-slash icon — placeholder, no handler yet)
    const hideBtn = document.createElement('button');
    hideBtn.className = `${this.classPrefix}-col-action-btn ${this.classPrefix}-col-hide-btn`;
    hideBtn.setAttribute('type', 'button');
    hideBtn.setAttribute('aria-label', `Hide ${this.column.name}`);
    hideBtn.setAttribute('title', 'Hide column');
    hideBtn.innerHTML = `
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path fill-rule="evenodd" d="M8 3.5C4.5 3.5 2 8 2 8s2.5 4.5 6 4.5S14 8 14 8s-2.5-4.5-6-4.5zM8 4.5C5.2 4.5 3.2 7.2 2.9 8c.3.8 2.3 3.5 5.1 3.5s4.8-2.7 5.1-3.5c-.3-.8-2.3-3.5-5.1-3.5z" />
        <circle cx="8" cy="8" r="2" />
        <rect x="7.25" y="1" width="1.5" height="14" rx="0.75" transform="rotate(-45 8 8)" />
      </svg>
    `;

    // Filter button (funnel icon — placeholder, no handler yet)
    const filterBtn = document.createElement('button');
    filterBtn.className = `${this.classPrefix}-col-action-btn ${this.classPrefix}-col-filter-btn`;
    filterBtn.setAttribute('type', 'button');
    filterBtn.setAttribute('aria-label', `Filter ${this.column.name}`);
    filterBtn.setAttribute('title', 'Filter column');
    filterBtn.innerHTML = `
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 3h12L9.5 8.5v4L6.5 14V8.5L2 3z" />
      </svg>
    `;

    actionPanel.appendChild(pinBtn);
    actionPanel.appendChild(hideBtn);
    actionPanel.appendChild(filterBtn);
    el.appendChild(actionPanel);

    // Divider — thin elegant horizontal bar separating controls from data display
    const divider = document.createElement('div');
    divider.className = `${this.classPrefix}-col-divider`;
    el.appendChild(divider);

    // Type label
    const typeEl = document.createElement('div');
    typeEl.className = `${this.classPrefix}-col-type`;
    typeEl.textContent = this.column.type;
    el.appendChild(typeEl);

    // Stats line (shows row count, updated via subscription)
    const statsEl = document.createElement('div');
    statsEl.className = `${this.classPrefix}-col-stats`;
    // Initially empty - will be updated when subscribed to totalRows
    el.appendChild(statsEl);

    // Visualization container (placeholder for Phase 4)
    const vizEl = document.createElement('div');
    vizEl.className = `${this.classPrefix}-col-viz`;
    el.appendChild(vizEl);

    return el;
  }

  // =========================================
  // Event Handling
  // =========================================

  /**
   * Attach click event listeners for sorting (on sort button only)
   */
  private attachEventListeners(): void {
    // Only attach click to sort button, NOT the whole header
    // This prevents resize release from triggering sort
    this.sortButton.addEventListener('click', this.handleSortClick);

    // Pin button
    this.pinButton.addEventListener('click', this.handlePinClick);
  }

  /**
   * Handle click events for sorting
   */
  private handleSortClick = (event: MouseEvent): void => {
    if (this.destroyed) return;

    // Stop propagation to prevent any parent handlers
    event.stopPropagation();

    if (event.metaKey || event.ctrlKey) {
      // Cmd+click (Mac) / Ctrl+click (Win/Linux): add to multi-sort
      this.actions.addToSort(this.column.name);
    } else {
      // Regular click: single column sort
      this.actions.toggleSort(this.column.name);
    }
  };

  /**
   * Handle pin button click
   */
  private handlePinClick = (event: MouseEvent): void => {
    if (this.destroyed) return;
    event.stopPropagation();
    this.actions.toggleColumnPin(this.column.name);
  };

  // =========================================
  // State Subscription
  // =========================================

  /**
   * Subscribe to state changes for sort and stats updates
   */
  private subscribeToState(): void {
    // Subscribe to sort changes
    const unsubSort = this.state.sortColumns.subscribe(() => {
      if (!this.destroyed) {
        this.update();
      }
    });
    this.unsubscribes.push(unsubSort);

    // Subscribe to totalRows to update stats line
    const unsubRows = this.state.totalRows.subscribe((count) => {
      if (!this.destroyed) {
        this.updateStatsLine(count);
      }
    });
    this.unsubscribes.push(unsubRows);

    // Subscribe to pinned columns for pin button state
    const unsubPin = this.state.pinnedColumns.subscribe(() => {
      if (!this.destroyed) {
        this.updatePinState();
      }
    });
    this.unsubscribes.push(unsubPin);

    // Subscribe to filter changes for filter indicator
    const unsubFilter = this.state.filtersByColumn.subscribe(() => {
      if (!this.destroyed) {
        this.updateFilterIndicator();
      }
    });
    this.unsubscribes.push(unsubFilter);

    // Set initial stats value (subscription only fires on changes, not initial value)
    this.updateStatsLine(this.state.totalRows.get());

    // Set initial filter indicator state
    this.updateFilterIndicator();

    // Set initial pin state
    this.updatePinState();
  }

  /**
   * Update the stats line with row count
   */
  private updateStatsLine(count: number): void {
    if (count > 0) {
      this.statsEl.textContent = `${count.toLocaleString()} rows`;
    } else {
      this.statsEl.textContent = '';
    }
  }

  /**
   * Update the filter indicator based on active filters for this column
   */
  private updateFilterIndicator(): void {
    const hasFilter = this.state.filtersByColumn.get().has(this.column.name);
    this.element.classList.toggle(
      `${this.classPrefix}-col-header--filtered`,
      hasFilter
    );
  }

  /**
   * Update pin button active state based on pinned columns
   */
  private updatePinState(): void {
    const isPinned = this.state.pinnedColumns.get().includes(this.column.name);
    this.pinButton.classList.toggle(
      `${this.classPrefix}-col-action-btn--active`,
      isPinned
    );
    this.pinButton.setAttribute('title', isPinned ? 'Unpin column' : 'Pin column');
    this.pinButton.setAttribute(
      'aria-label',
      isPinned ? `Unpin ${this.column.name}` : `Pin ${this.column.name}`
    );

    // Disable drag-to-reorder for pinned columns
    this.dragHandle.classList.toggle(
      `${this.classPrefix}-col-drag-handle--disabled`,
      isPinned
    );
    this.dragHandle.setAttribute('aria-disabled', String(isPinned));
  }

  /**
   * Get all cells in this column for transition animations
   */
  private getColumnCells(): HTMLElement[] {
    const visibleColumns = this.state.visibleColumns.get();
    const columnIndex = visibleColumns.indexOf(this.column.name);
    if (columnIndex === -1) return [];

    const root = this.element.closest(`.${this.classPrefix}-root`);
    if (!root) return [];

    // Query all cells at this column index (nth-child is 1-based)
    const cells = root.querySelectorAll(
      `.${this.classPrefix}-row > .${this.classPrefix}-cell:nth-child(${columnIndex + 1})`
    );
    return Array.from(cells) as HTMLElement[];
  }

  // =========================================
  // Public API
  // =========================================

  /**
   * Update the sort button visual state based on current sort state
   */
  update(): void {
    if (this.destroyed) return;

    const sortColumns = this.state.sortColumns.get();
    const sortIndex = sortColumns.findIndex((s) => s.column === this.column.name);

    // Remove existing state classes
    this.sortButton.classList.remove(
      `${this.classPrefix}-col-sort-btn--asc`,
      `${this.classPrefix}-col-sort-btn--desc`
    );

    if (sortIndex === -1) {
      // Not sorted - hide badge
      this.sortBadge.style.display = 'none';
      this.element.setAttribute('aria-sort', 'none');
      this.sortButton.setAttribute('title', 'Sort ascending');
    } else {
      const sortConfig = sortColumns[sortIndex];
      const isAsc = sortConfig.direction === 'asc';

      // Add appropriate class for arrow styling
      this.sortButton.classList.add(
        `${this.classPrefix}-col-sort-btn--${isAsc ? 'asc' : 'desc'}`
      );

      // For multi-sort, show position badge
      if (sortColumns.length > 1) {
        this.sortBadge.textContent = String(sortIndex + 1);
        this.sortBadge.style.display = '';
      } else {
        this.sortBadge.style.display = 'none';
      }

      this.element.setAttribute('aria-sort', isAsc ? 'ascending' : 'descending');
      this.sortButton.setAttribute('title', isAsc ? 'Sort descending' : 'Remove sort');
    }
  }

  /**
   * Get the DOM element
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Get the column schema
   */
  getColumn(): ColumnSchema {
    return this.column;
  }

  /**
   * Check if the header has been destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Get the visualization container element.
   * This is where Phase 4 visualizations will be rendered.
   */
  getVizContainer(): HTMLElement {
    return this.element.querySelector(`.${this.classPrefix}-col-viz`)!;
  }

  /**
   * Get the stats element for external updates (e.g., histogram hover).
   */
  getStatsElement(): HTMLElement {
    return this.statsEl;
  }

  /**
   * Destroy the column header and clean up resources
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Detach column resizer
    this.resizer.detach();

    // Remove event listeners
    this.sortButton.removeEventListener('click', this.handleSortClick);
    this.pinButton.removeEventListener('click', this.handlePinClick);

    // Unsubscribe from state
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
