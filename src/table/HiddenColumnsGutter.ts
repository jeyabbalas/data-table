/**
 * HiddenColumnsGutter - Displays chips for hidden columns with restore controls
 *
 * Sits at the bottom of the table. Collapses when no columns are hidden.
 * Follows the same pattern as FilterBar for collapse/expand animation.
 */

import type { StateActions } from '../core/Actions';
import { ChipStrip, nearestSurvivingKey } from '../core/ChipStrip';
import { RovingTabindex } from '../core/RovingTabindex';
import type { TableState } from '../core/State';
import { type Strings, defaultStrings } from '../core/Strings';

/**
 * Options for HiddenColumnsGutter
 */
export interface HiddenColumnsGutterOptions {
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string | undefined;
  /** Resolved i18n strings. Defaults to English. */
  messages?: Strings | undefined;
}

/**
 * HiddenColumnsGutter renders a horizontal bar of chips for hidden columns.
 * It auto-shows when columns are hidden and collapses when all are visible.
 *
 * The chips sit in one row, in the table's column order, which scrolls
 * sideways once it is wider than the table, with "Show all" pinned at its end.
 * A chip that hiding a column adds is scrolled into view, smoothly; hiding
 * several at once scrolls to the right-most of them.
 *
 * The gutter is a `role="toolbar"` with the APG roving-tabindex treatment, so
 * it is a single tab stop no matter how many columns are hidden — hiding 250
 * of a 266-column table used to put 251 tab stops in front of the rest of the
 * page. `←` / `→` move the stop, `Home` / `End` jump to the ends, and the
 * movement wraps. Restoring a column with its chip's own button leaves the
 * stop, and focus, on the chip next to it.
 */
export class HiddenColumnsGutter {
  private element: HTMLElement;
  private chipsContainer: HTMLElement;
  private showAllButton: HTMLButtonElement;
  private readonly strip: ChipStrip;
  private readonly roving: RovingTabindex;
  /** The hidden columns the chips show, in order; `null` before the first render. */
  private hidden: string[] | null = null;
  private chipsByColumn = new Map<string, HTMLElement>();
  private unsubscribes: (() => void)[] = [];
  private destroyed = false;
  private readonly prefix: string;
  private readonly messages: Strings;

  constructor(
    private state: TableState,
    private actions: StateActions,
    options: HiddenColumnsGutterOptions = {},
  ) {
    this.prefix = options.classPrefix ?? 'dt';
    this.messages = options.messages ?? defaultStrings;
    this.element = this.createElement();
    this.chipsContainer = this.element.querySelector(`.${this.prefix}-hidden-chips`)!;
    this.showAllButton = this.element.querySelector(`.${this.prefix}-hidden-show-all`)!;

    this.strip = new ChipStrip({
      scroller: this.element.querySelector(`.${this.prefix}-hidden-scroll`)!,
      end: this.element.querySelector(`.${this.prefix}-hidden-actions`)!,
      chipFor: (column) => this.chipsByColumn.get(column),
      chipOf: (el) => this.chipOf(el),
    });

    // One row, so only the horizontal arrows move the stop, as in the filter
    // bar. A restore button sits at its chip's end: the strip reveals the
    // whole chip, name and all, clear of the sticky "Show all".
    this.roving = new RovingTabindex(this.element, {
      orientation: 'horizontal',
      reveal: (control) => this.strip.reveal(control),
    });

    // Subscribe to visible columns and column order to derive hidden columns
    const unsubVisible = this.state.visibleColumns.subscribe(() => {
      if (!this.destroyed) this.update();
    });
    this.unsubscribes.push(unsubVisible);

    const unsubOrder = this.state.columnOrder.subscribe(() => {
      if (!this.destroyed) this.update();
    });
    this.unsubscribes.push(unsubOrder);

    // Initial render
    this.update();
  }

  private createElement(): HTMLElement {
    const gutter = document.createElement('div');
    gutter.className = `${this.prefix}-hidden-gutter ${this.prefix}-hidden-gutter--hidden`;
    gutter.setAttribute('role', 'toolbar');
    gutter.setAttribute('aria-label', this.messages.a11y.hiddenColumnsLabel);

    const label = document.createElement('span');
    label.className = `${this.prefix}-gutter-label`;
    label.textContent = this.messages.a11y.hiddenColumnsLabel;

    // The row that scrolls holds "Show all" as well as the chips, so that the
    // toolbar's one tab stop is always inside it (see ChipStrip).
    const scroll = document.createElement('div');
    scroll.className = `${this.prefix}-hidden-scroll`;

    const chips = document.createElement('div');
    chips.className = `${this.prefix}-hidden-chips`;

    const actions = document.createElement('div');
    actions.className = `${this.prefix}-hidden-actions`;

    const showAll = document.createElement('button');
    showAll.className = `${this.prefix}-hidden-show-all`;
    showAll.type = 'button';
    showAll.textContent = this.messages.common.showAll;
    showAll.style.display = 'none';
    showAll.addEventListener('click', () => {
      if (!this.destroyed) {
        this.actions.showAllColumns();
      }
    });

    actions.appendChild(showAll);
    scroll.appendChild(chips);
    scroll.appendChild(actions);
    gutter.appendChild(label);
    gutter.appendChild(scroll);

    return gutter;
  }

  private update(): void {
    // Read the focus state before the chips are torn down: a restore button
    // that removes its own chip leaves `document.activeElement` on `<body>`,
    // and only this side of the rebuild can tell that apart from focus having
    // been elsewhere all along.
    const hadFocus =
      document.activeElement instanceof Node && this.element.contains(document.activeElement);
    // Likewise which chip holds the stop: every chip is rebuilt below.
    const stopColumn = this.columnOf(this.roving.getActiveControl());
    const before = this.hidden;

    this.render();

    const after = this.hidden ?? [];
    const afterSet = new Set(after);
    const heir =
      stopColumn !== null && before ? nearestSurvivingKey(before, stopColumn, afterSet) : null;
    const fallback = heir !== null ? this.restoreButtonOf(heir) : null;
    this.roving.refresh({ restoreFocus: hadFocus, fallback });

    // The first render shows what is there; only later ones add chips.
    if (before) {
      const shown = new Set(before);
      this.strip.revealAdded(after.filter((column) => !shown.has(column)));
    }
  }

  private render(): void {
    const order = this.state.columnOrder.get();
    const visible = this.state.visibleColumns.get();
    const visibleSet = new Set(visible);
    const hiddenColumns = order.filter((c) => !visibleSet.has(c));
    this.hidden = hiddenColumns;

    // Clear existing chips
    this.chipsContainer.innerHTML = '';
    this.chipsByColumn.clear();

    if (hiddenColumns.length === 0) {
      this.element.classList.add(`${this.prefix}-hidden-gutter--hidden`);
      // The collapsed gutter is `max-height: 0; overflow: hidden`, which clips
      // its children without making them unfocusable. Hiding "Show all" as
      // well is what keeps a collapsed gutter out of the tab order entirely.
      this.showAllButton.style.display = 'none';
      return;
    }

    this.element.classList.remove(`${this.prefix}-hidden-gutter--hidden`);

    for (const colName of hiddenColumns) {
      const chip = this.createChip(colName);
      this.chipsContainer.appendChild(chip);
      this.chipsByColumn.set(colName, chip);
    }

    // Show "Show all" only when 2+ columns hidden
    this.showAllButton.style.display = hiddenColumns.length >= 2 ? '' : 'none';
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

  private restoreButtonOf(column: string): HTMLElement | null {
    return (
      this.chipsByColumn
        .get(column)
        ?.querySelector<HTMLElement>(`.${this.prefix}-hidden-chip-restore`) ?? null
    );
  }

  private createChip(colName: string): HTMLElement {
    const chip = document.createElement('span');
    chip.className = `${this.prefix}-hidden-chip`;
    chip.title = this.messages.a11y.showColumn(colName);

    const nameEl = document.createElement('span');
    nameEl.className = `${this.prefix}-hidden-chip-name`;
    nameEl.textContent = colName;

    const restoreBtn = document.createElement('button');
    restoreBtn.className = `${this.prefix}-hidden-chip-restore`;
    restoreBtn.setAttribute('aria-label', this.messages.a11y.showColumn(colName));
    restoreBtn.type = 'button';
    // Eye icon (without slash) — inverse of the hide button's eye-slash icon
    restoreBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M2 8s2.5-4.5 6-4.5S14 8 14 8s-2.5 4.5-6 4.5S2 8 2 8z" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
    </svg>`;
    restoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.destroyed) {
        this.actions.showColumn(colName);
      }
    });

    chip.appendChild(nameEl);
    chip.appendChild(restoreBtn);
    return chip;
  }

  /**
   * Get the gutter's DOM element
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

    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];

    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
