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
    this.statsEl = this.element.querySelector(`.${this.classPrefix}-col-stats`)!;

    // Create resizer for column width adjustment
    this.resizer = new ColumnResizer(
      this.element,
      (width) => this.actions.setColumnWidth(this.column.name, width),
      () => this.actions.resetColumnWidth(this.column.name),
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

    // Column name
    const nameEl = document.createElement('div');
    nameEl.className = `${this.classPrefix}-col-name`;
    nameEl.textContent = this.column.name;
    el.appendChild(nameEl);

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

    // Sort button container
    const sortContainer = document.createElement('div');
    sortContainer.className = `${this.classPrefix}-col-sort`;
    el.appendChild(sortContainer);

    // Sort button with SVG arrows
    const sortBtn = document.createElement('button');
    sortBtn.className = `${this.classPrefix}-col-sort-btn`;
    sortBtn.setAttribute('type', 'button');
    sortBtn.setAttribute('aria-label', `Sort by ${this.column.name}`);
    sortBtn.innerHTML = `
      <svg viewBox="0 0 10 14" aria-hidden="true">
        <path d="M5 0 L10 5 L0 5 Z" class="arrow-up" />
        <path d="M5 14 L10 9 L0 9 Z" class="arrow-down" />
      </svg>
    `;
    sortContainer.appendChild(sortBtn);

    // Sort badge for multi-sort (hidden by default)
    const sortBadge = document.createElement('span');
    sortBadge.className = `${this.classPrefix}-col-sort-badge`;
    sortBadge.style.display = 'none';
    sortContainer.appendChild(sortBadge);

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
  }

  /**
   * Handle click events for sorting
   */
  private handleSortClick = (event: MouseEvent): void => {
    if (this.destroyed) return;

    // Stop propagation to prevent any parent handlers
    event.stopPropagation();

    if (event.shiftKey) {
      // Shift+click: add to multi-sort
      this.actions.addToSort(this.column.name);
    } else {
      // Regular click: single column sort
      this.actions.toggleSort(this.column.name);
    }
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

    // Set initial stats value (subscription only fires on changes, not initial value)
    this.updateStatsLine(this.state.totalRows.get());
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
   * Destroy the column header and clean up resources
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Detach column resizer
    this.resizer.detach();

    // Remove event listeners
    this.sortButton.removeEventListener('click', this.handleSortClick);

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
