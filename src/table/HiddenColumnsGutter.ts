/**
 * HiddenColumnsGutter - Displays chips for hidden columns with restore controls
 *
 * Sits at the bottom of the table. Collapses when no columns are hidden.
 * Follows the same pattern as FilterBar for collapse/expand animation.
 */

import type { StateActions } from '../core/Actions';
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
 */
export class HiddenColumnsGutter {
  private element: HTMLElement;
  private chipsContainer: HTMLElement;
  private showAllButton: HTMLButtonElement;
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

    const chips = document.createElement('div');
    chips.className = `${this.prefix}-hidden-chips`;

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

    gutter.appendChild(label);
    gutter.appendChild(chips);
    gutter.appendChild(showAll);

    return gutter;
  }

  private update(): void {
    const order = this.state.columnOrder.get();
    const visible = this.state.visibleColumns.get();
    const visibleSet = new Set(visible);
    const hiddenColumns = order.filter((c) => !visibleSet.has(c));

    // Clear existing chips
    this.chipsContainer.innerHTML = '';

    if (hiddenColumns.length === 0) {
      this.element.classList.add(`${this.prefix}-hidden-gutter--hidden`);
      return;
    }

    this.element.classList.remove(`${this.prefix}-hidden-gutter--hidden`);

    for (const colName of hiddenColumns) {
      const chip = this.createChip(colName);
      this.chipsContainer.appendChild(chip);
    }

    // Show "Show all" only when 2+ columns hidden
    this.showAllButton.style.display = hiddenColumns.length >= 2 ? '' : 'none';
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

    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];

    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
