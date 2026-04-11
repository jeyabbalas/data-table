/**
 * FilterBar - Displays active filter chips with removal controls
 *
 * Subscribes to state.filters and renders a chip for each active filter.
 * Sits between the table header and body, collapsing when no filters are active.
 */

import type { TableState } from '../core/State';
import type { StateActions } from '../core/Actions';
import type { Filter } from './FilterTypes';
import { FilterChip, type FilterChipOptions } from './FilterChip';

/**
 * Options for FilterBar
 */
export interface FilterBarOptions {
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string;
  /** Called when a filter chip is removed, for clearing visualization state */
  onFilterRemove?: (column: string) => void;
  /** Called when a raw-sql filter chip body is clicked (for editing). Receives the filter id. */
  onRawSQLEdit?: (id: string) => void;
}

/**
 * FilterBar renders a horizontal bar of filter chips showing all active filters.
 * It auto-shows when filters are present and collapses when empty.
 */
export class FilterBar {
  private element: HTMLElement;
  private chipsContainer: HTMLElement;
  private clearAllButton: HTMLButtonElement;
  private chips: FilterChip[] = [];
  private unsubscribe: (() => void) | null = null;
  private destroyed = false;
  private readonly prefix: string;

  constructor(
    private state: TableState,
    private actions: StateActions,
    private options: FilterBarOptions = {}
  ) {
    this.prefix = options.classPrefix ?? 'dt';
    this.element = this.createElement();
    this.chipsContainer = this.element.querySelector(
      `.${this.prefix}-filter-chips`
    )!;
    this.clearAllButton = this.element.querySelector(
      `.${this.prefix}-filter-clear-all`
    )! as HTMLButtonElement;

    // Subscribe to filter changes
    this.unsubscribe = this.state.filters.subscribe((filters) => {
      if (!this.destroyed) {
        this.update(filters);
      }
    });

    // Initial render
    this.update(this.state.filters.get());
  }

  private createElement(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = `${this.prefix}-filter-bar ${this.prefix}-filter-bar--hidden`;
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Active filters');

    const chips = document.createElement('div');
    chips.className = `${this.prefix}-filter-chips`;

    const clearAll = document.createElement('button');
    clearAll.className = `${this.prefix}-filter-clear-all`;
    clearAll.type = 'button';
    clearAll.textContent = 'Clear all';
    clearAll.style.display = 'none';
    clearAll.addEventListener('click', () => {
      if (!this.destroyed) {
        this.handleClearAll();
      }
    });

    const label = document.createElement('span');
    label.className = `${this.prefix}-gutter-label`;
    label.textContent = 'Active filters';

    bar.appendChild(label);
    bar.appendChild(chips);
    bar.appendChild(clearAll);

    return bar;
  }

  private update(filters: Filter[]): void {
    // Recreates all chips from scratch. This is O(n) DOM operations but acceptable
    // because n is bounded by the number of table columns (typically < 50) and
    // filter changes are infrequent (user-initiated).

    // Destroy old chips
    for (const chip of this.chips) {
      chip.destroy();
    }
    this.chips = [];
    this.chipsContainer.innerHTML = '';

    if (filters.length === 0) {
      this.element.classList.add(`${this.prefix}-filter-bar--hidden`);
      return;
    }

    this.element.classList.remove(`${this.prefix}-filter-bar--hidden`);

    // Create new chips
    for (const filter of filters) {
      const chipOptions: FilterChipOptions = { classPrefix: this.prefix };

      // For raw-sql filters, pass onEdit callback for modal integration
      if (filter.type === 'raw-sql' && this.options.onRawSQLEdit) {
        const filterId = filter.id;
        chipOptions.onEdit = () => this.options.onRawSQLEdit!(filterId);
      }

      const chip = new FilterChip(
        filter,
        () => this.handleRemove(filter.column),
        chipOptions
      );
      this.chips.push(chip);
      this.chipsContainer.appendChild(chip.getElement());
    }

    // Show "Clear all" only when 2+ filters
    this.clearAllButton.style.display = filters.length >= 2 ? '' : 'none';
  }

  private handleRemove(column: string): void {
    this.actions.removeFilter(column);
    this.options.onFilterRemove?.(column);
  }

  private handleClearAll(): void {
    // Capture columns before clearing
    const columns = this.state.filters.get().map((f) => f.column);
    this.actions.clearFilters();
    for (const col of columns) {
      this.options.onFilterRemove?.(col);
    }
  }

  /**
   * Get the bar's DOM element
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Destroy and clean up
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Unsubscribe from state
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Destroy all chips
    for (const chip of this.chips) {
      chip.destroy();
    }
    this.chips = [];

    // Remove from DOM
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
