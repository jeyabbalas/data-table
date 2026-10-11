/**
 * FilterBar - Displays active filter chips with removal controls
 *
 * Subscribes to state.filters and renders a chip for each active filter.
 * Sits between the table header and body, collapsing when no filters are active.
 */

import type { StateActions } from '../core/Actions';
import { ChipStrip, nearestSurvivingKey } from '../core/ChipStrip';
import { RovingTabindex } from '../core/RovingTabindex';
import type { TableState } from '../core/State';
import { type Strings, defaultStrings } from '../core/Strings';
import { FilterChip, type FilterChipOptions } from './FilterChip';
import type { Filter } from './FilterTypes';

/**
 * Options for FilterBar
 */
export interface FilterBarOptions {
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string | undefined;
  /** Called when a filter chip is removed, for clearing visualization state */
  onFilterRemove?: ((column: string) => void) | undefined;
  /** Called when a raw-sql filter chip body is clicked (for editing). Receives the filter id. */
  onRawSQLEdit?: ((id: string) => void) | undefined;
  /** When true, the filter bar is always visible (shows expression filter button even with no filters). Default: false. */
  alwaysShow?: boolean | undefined;
  /** Callback when the "Expression" filter button is clicked */
  onAddSQLFilter?: (() => void) | undefined;
  /** Callback when the "Presets" button is clicked */
  onPresetsClick?: (() => void) | undefined;
  /** Resolved i18n strings. Defaults to English. */
  messages?: Strings | undefined;
}

/**
 * FilterBar renders a horizontal bar of filter chips showing all active filters.
 * It auto-shows when filters are present and collapses when empty.
 *
 * The chips sit in one row, in the order the filters were added, which
 * scrolls sideways once it is wider than the table, with "Clear all",
 * "Expression" and "Presets" pinned at its end. A chip that adding a filter
 * puts out of view is scrolled into view, smoothly; changing or removing a
 * filter scrolls nothing.
 *
 * The bar is a `role="toolbar"` with the APG roving-tabindex treatment, so it
 * is a single tab stop however many chips it holds: `←` / `→` move between the
 * chips' remove buttons, "Clear all", "Expression" and "Presets", `Home` /
 * `End` jump to the ends, and the movement wraps. Removing a filter with its
 * chip's own button leaves the stop, and focus, on the chip next to it.
 *
 * @example
 * import { FilterBar } from '@jeyabbalas/data-table/advanced';
 *
 * const bar = new FilterBar(state, actions, {
 *   classPrefix: 'dt',
 *   alwaysShow: false,
 *   onFilterRemove: (column) => console.log('cleared', column),
 * });
 * parentEl.appendChild(bar.getElement());
 * // unmount:
 * bar.destroy();
 *
 * @see FilterChip
 * @see FilterPanel
 * @see FilterPanelField
 * @see SQLFilterModal
 * @see FilterPresetPanel
 */
export class FilterBar {
  private element: HTMLElement;
  private chipsContainer: HTMLElement;
  private clearAllButton: HTMLButtonElement;
  private gutterLabel!: HTMLElement;
  private expressionBtn!: HTMLButtonElement;
  private presetsBtn!: HTMLButtonElement;
  private chips: FilterChip[] = [];
  private readonly strip: ChipStrip;
  private readonly roving: RovingTabindex;
  /** The filtered columns the chips show, in order; `null` before the first render. */
  private columns: string[] | null = null;
  private chipsByColumn = new Map<string, HTMLElement>();
  private unsubscribe: (() => void) | null = null;
  private destroyed = false;
  private readonly prefix: string;
  private readonly messages: Strings;

  constructor(
    private state: TableState,
    private actions: StateActions,
    private options: FilterBarOptions = {},
  ) {
    this.prefix = options.classPrefix ?? 'dt';
    this.messages = options.messages ?? defaultStrings;
    this.element = this.createElement();
    this.chipsContainer = this.element.querySelector(`.${this.prefix}-filter-chips`)!;
    this.clearAllButton = this.element.querySelector(`.${this.prefix}-filter-clear-all`)!;

    this.strip = new ChipStrip({
      scroller: this.element.querySelector(`.${this.prefix}-filter-scroll`)!,
      end: this.element.querySelector(`.${this.prefix}-filter-actions`)!,
      chipFor: (column) => this.chipsByColumn.get(column),
      chipOf: (el) => this.chipOf(el),
    });

    // The bar is a single row, so only the horizontal arrows move the stop.
    // A remove button sits at its chip's end: the strip reveals the whole
    // chip, clear of the sticky buttons at the row's end.
    this.roving = new RovingTabindex(this.element, {
      orientation: 'horizontal',
      reveal: (control) => this.strip.reveal(control),
    });

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
    bar.setAttribute('aria-label', this.messages.filters.activeFiltersLabel);

    // The row that scrolls holds the bar's buttons as well as the chips, so
    // that the toolbar's one tab stop is always inside it (see ChipStrip).
    const scroll = document.createElement('div');
    scroll.className = `${this.prefix}-filter-scroll`;

    const chips = document.createElement('div');
    chips.className = `${this.prefix}-filter-chips`;

    const actions = document.createElement('div');
    actions.className = `${this.prefix}-filter-actions`;

    const clearAll = document.createElement('button');
    clearAll.className = `${this.prefix}-filter-clear-all`;
    clearAll.type = 'button';
    clearAll.textContent = this.messages.filters.clearAllButton;
    clearAll.style.display = 'none';
    clearAll.addEventListener('click', () => {
      if (!this.destroyed) {
        this.handleClearAll();
      }
    });

    const label = document.createElement('span');
    label.className = `${this.prefix}-gutter-label`;
    label.textContent = this.messages.filters.activeFiltersLabel;
    this.gutterLabel = label;

    // Expression filter button
    this.expressionBtn = document.createElement('button');
    this.expressionBtn.className = `${this.prefix}-filter-expression-btn`;
    this.expressionBtn.type = 'button';
    this.expressionBtn.title = this.messages.filters.expressionFilterTooltip;
    this.expressionBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 2L1.5 7L5 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M9 2L12.5 7L9 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg><span>${this.messages.filters.expressionFilterLabel}</span>`;
    if (!this.options.onAddSQLFilter) {
      this.expressionBtn.style.display = 'none';
    }
    this.expressionBtn.addEventListener('click', () => {
      if (!this.destroyed) this.options.onAddSQLFilter?.();
    });

    // Presets button (bookmark icon, shown when onPresetsClick is provided)
    this.presetsBtn = document.createElement('button');
    this.presetsBtn.className = `${this.prefix}-filter-presets-btn`;
    this.presetsBtn.type = 'button';
    this.presetsBtn.title = this.messages.filters.presetsButtonTooltip;
    this.presetsBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 1h8a1 1 0 0 1 1 1v10.5a.5.5 0 0 1-.8.4L7 10l-4.2 2.9a.5.5 0 0 1-.8-.4V2a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.3" fill="none"/>
    </svg><span>${this.messages.filters.presetsButtonLabel}</span>`;
    if (!this.options.onPresetsClick) {
      this.presetsBtn.style.display = 'none';
    }
    this.presetsBtn.addEventListener('click', () => {
      if (!this.destroyed) this.options.onPresetsClick?.();
    });

    actions.appendChild(clearAll);
    actions.appendChild(this.expressionBtn);
    actions.appendChild(this.presetsBtn);
    scroll.appendChild(chips);
    scroll.appendChild(actions);
    bar.appendChild(label);
    bar.appendChild(scroll);

    return bar;
  }

  private update(filters: Filter[]): void {
    // Whether focus sat on a control that the render below is about to
    // destroy can only be answered from here — by the time the roving
    // controller is told about the rebuild, the focused chip is detached and
    // `document.activeElement` has already fallen back to `<body>`.
    const hadFocus =
      document.activeElement instanceof Node && this.element.contains(document.activeElement);
    // Likewise which chip holds the stop: every chip is rebuilt below.
    const stopColumn = this.columnOf(this.roving.getActiveControl());
    const before = this.columns;

    this.render(filters);

    const after = this.columns ?? [];
    const heir =
      stopColumn !== null && before
        ? nearestSurvivingKey(before, stopColumn, new Set(after))
        : null;
    const fallback = heir !== null ? this.removeButtonOf(heir) : null;
    this.roving.refresh({ restoreFocus: hadFocus, fallback });

    // The first render shows what is there; only later ones add chips.
    if (before) {
      const shown = new Set(before);
      this.strip.revealAdded(after.filter((column) => !shown.has(column)));
    }
  }

  private render(filters: Filter[]): void {
    // Recreates all chips from scratch. This is O(n) DOM operations but acceptable
    // because n is bounded by the number of table columns (typically < 50) and
    // filter changes are infrequent (user-initiated).

    // Destroy old chips
    for (const chip of this.chips) {
      chip.destroy();
    }
    this.chips = [];
    this.chipsContainer.innerHTML = '';
    this.chipsByColumn.clear();
    // A filter is keyed by its column: adding one on a filtered column
    // replaces the filter in its place, which is a change, not an addition.
    this.columns = filters.map((filter) => filter.column);

    if (filters.length === 0) {
      if (this.options.alwaysShow) {
        // Bar stays visible but hide gutter label and clear-all
        this.element.classList.remove(`${this.prefix}-filter-bar--hidden`);
        this.gutterLabel.style.display = 'none';
        this.clearAllButton.style.display = 'none';
        return;
      }
      this.element.classList.add(`${this.prefix}-filter-bar--hidden`);
      // A collapsed bar is `max-height: 0; overflow: hidden`, which clips its
      // children without making them unfocusable — leaving "Clear all" at
      // `display: ''` would keep an invisible tab stop alive.
      this.clearAllButton.style.display = 'none';
      return;
    }

    this.element.classList.remove(`${this.prefix}-filter-bar--hidden`);
    this.gutterLabel.style.display = '';

    // Create new chips
    for (const filter of filters) {
      const chipOptions: FilterChipOptions = {
        classPrefix: this.prefix,
        messages: this.messages,
      };

      // For raw-sql filters, pass onEdit callback for modal integration
      if (filter.type === 'raw-sql' && this.options.onRawSQLEdit) {
        const filterId = filter.id;
        chipOptions.onEdit = () => this.options.onRawSQLEdit!(filterId);
      }

      const chip = new FilterChip(filter, () => this.handleRemove(filter.column), chipOptions);
      this.chips.push(chip);
      this.chipsContainer.appendChild(chip.getElement());
      this.chipsByColumn.set(filter.column, chip.getElement());
    }

    // Show "Clear all" only when 2+ filters
    this.clearAllButton.style.display = filters.length >= 2 ? '' : 'none';
  }

  /** The column whose chip holds `control`, or `null` for any other control. */
  private columnOf(control: HTMLElement | null): string | null {
    if (!control) return null;
    for (const [column, chip] of this.chipsByColumn) {
      if (chip.contains(control)) return column;
    }
    return null;
  }

  /** The chip that holds `control`, or `null` for any other control. */
  private chipOf(control: HTMLElement): HTMLElement | null {
    const column = this.columnOf(control);
    return column === null ? null : (this.chipsByColumn.get(column) ?? null);
  }

  private removeButtonOf(column: string): HTMLElement | null {
    return (
      this.chipsByColumn
        .get(column)
        ?.querySelector<HTMLElement>(`.${this.prefix}-filter-chip-remove`) ?? null
    );
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

    this.roving.destroy();
    this.strip.destroy();

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
