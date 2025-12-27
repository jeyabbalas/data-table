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
  private sortIndicator: HTMLElement;
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
    this.sortIndicator = this.element.querySelector(`.${this.classPrefix}-col-sort`)!;
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

    // Stats line (placeholder)
    const statsEl = document.createElement('div');
    statsEl.className = `${this.classPrefix}-col-stats`;
    statsEl.textContent = 'Stats coming...';
    el.appendChild(statsEl);

    // Visualization container (placeholder for Phase 4)
    const vizEl = document.createElement('div');
    vizEl.className = `${this.classPrefix}-col-viz`;
    el.appendChild(vizEl);

    // Sort indicator
    const sortEl = document.createElement('div');
    sortEl.className = `${this.classPrefix}-col-sort`;
    el.appendChild(sortEl);

    return el;
  }

  // =========================================
  // Event Handling
  // =========================================

  /**
   * Attach click event listeners for sorting
   */
  private attachEventListeners(): void {
    this.element.addEventListener('click', this.handleClick);
  }

  /**
   * Handle click events for sorting
   */
  private handleClick = (event: MouseEvent): void => {
    if (this.destroyed) return;

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
   * Subscribe to state changes for sort updates
   */
  private subscribeToState(): void {
    const unsubSort = this.state.sortColumns.subscribe(() => {
      if (!this.destroyed) {
        this.update();
      }
    });
    this.unsubscribes.push(unsubSort);
  }

  // =========================================
  // Public API
  // =========================================

  /**
   * Update the sort indicator based on current state
   */
  update(): void {
    if (this.destroyed) return;

    const sortColumns = this.state.sortColumns.get();
    const sortIndex = sortColumns.findIndex((s) => s.column === this.column.name);

    if (sortIndex === -1) {
      // Not sorted
      this.sortIndicator.innerHTML = '';
      this.element.setAttribute('aria-sort', 'none');
    } else {
      const sortConfig = sortColumns[sortIndex];
      const isAsc = sortConfig.direction === 'asc';
      const arrow = isAsc ? '\u25B2' : '\u25BC'; // ▲ or ▼

      // For multi-sort, show position badge
      if (sortColumns.length > 1) {
        const badge = `<span class="${this.classPrefix}-col-sort-badge">${sortIndex + 1}</span>`;
        this.sortIndicator.innerHTML = `${arrow}${badge}`;
      } else {
        this.sortIndicator.textContent = arrow;
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

    // Remove event listeners
    this.element.removeEventListener('click', this.handleClick);

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
