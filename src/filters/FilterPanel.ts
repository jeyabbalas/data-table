/**
 * FilterPanel - Floating panel for creating column filters manually
 *
 * Appears when the user clicks a filter button on a column header.
 * Shows filter controls for only the clicked column.
 * One instance per table, created lazily by TableContainer.
 */

import type { TableState } from '../core/State';
import type { StateActions } from '../core/Actions';
import { ModalHost } from '../core/ModalHost';
import { FilterPanelField } from './FilterPanelField';
import { type Strings, defaultStrings } from '../core/Strings';

/**
 * Options for FilterPanel
 */
export interface FilterPanelOptions {
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string;
  /**
   * Element to mirror `data-dt-color-scheme` from (typically the owning
   * table's `.dt-root`). Keeps the panel's theming in sync when the table's
   * color scheme changes at runtime via {@link DataTable.setColorScheme}.
   */
  colorSchemeSource?: HTMLElement;
  /** Resolved i18n strings. Defaults to English. */
  messages?: Strings;
}

/**
 * FilterPanel renders a floating panel with filter controls for a single column.
 */
export class FilterPanel {
  private element: HTMLElement;
  private body: HTMLElement;
  private titleEl: HTMLElement;
  private typeBadgeEl: HTMLElement;
  private clearBtn: HTMLElement;
  private currentField: FilterPanelField | null = null;
  private currentColumn: string | null = null;
  private isOpen = false;
  private destroyed = false;
  private readonly prefix: string;
  private readonly colorSchemeSource?: HTMLElement;
  private readonly messages: Strings;

  // Focus trap / Escape / outside-click delegated to ModalHost.
  private modalHost = new ModalHost();

  // State subscription for external sync
  private unsubscribe: (() => void) | null = null;

  constructor(
    private state: TableState,
    private actions: StateActions,
    options: FilterPanelOptions = {}
  ) {
    this.prefix = options.classPrefix ?? 'dt';
    this.colorSchemeSource = options.colorSchemeSource;
    this.messages = options.messages ?? defaultStrings;
    this.element = this.createElement();
    this.body = this.element.querySelector(`.${this.prefix}-filter-panel-body`)!;
    this.titleEl = this.element.querySelector(`.${this.prefix}-filter-panel-title`)!;
    this.typeBadgeEl = this.element.querySelector(`.${this.prefix}-filter-panel-type`)!;
    this.clearBtn = this.element.querySelector(`.${this.prefix}-filter-panel-clear`)!;

    // Subscribe to filter changes for external sync
    this.unsubscribe = this.state.filtersByColumn.subscribe(() => {
      if (!this.destroyed && this.isOpen) {
        if (this.currentField && !this.currentField.isSelfUpdate) {
          this.currentField.syncFromState();
        }
        // Update clear button visibility
        const hasFilter = this.currentColumn
          ? this.state.filtersByColumn.get().has(this.currentColumn)
          : false;
        this.updatePanelClearButton(hasFilter);
      }
    });
  }

  // =========================================
  // DOM Creation
  // =========================================

  private createElement(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.prefix}-filter-panel`;
    el.style.display = 'none';
    // role="dialog" is set here so assistive tech identifies the panel
    // regardless of open state; aria-modal is intentionally omitted (the
    // panel does not trap page interaction the way a modal does).
    el.setAttribute('role', 'dialog');

    // Header
    const header = document.createElement('div');
    header.className = `${this.prefix}-filter-panel-header`;

    const title = document.createElement('span');
    title.className = `${this.prefix}-filter-panel-title`;
    title.textContent = this.messages.filters.panelTitle;

    const typeBadge = document.createElement('span');
    typeBadge.className = `${this.prefix}-filter-panel-type`;

    const clearBtn = document.createElement('button');
    clearBtn.className = `${this.prefix}-filter-panel-clear ${this.prefix}-filter-panel-clear--hidden`;
    clearBtn.type = 'button';
    clearBtn.textContent = this.messages.filters.clearButton;
    clearBtn.addEventListener('click', () => {
      this.currentField?.clear();
      this.updatePanelClearButton(false);
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = `${this.prefix}-filter-panel-close`;
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', this.messages.filters.closePanelLabel);
    closeBtn.innerHTML = `
      <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/>
      </svg>
    `;
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(title);
    header.appendChild(typeBadge);
    header.appendChild(clearBtn);
    header.appendChild(closeBtn);
    el.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = `${this.prefix}-filter-panel-body`;
    el.appendChild(body);

    return el;
  }

  // =========================================
  // Positioning
  // =========================================

  private position(anchorElement: HTMLElement): void {
    const rootEl = this.element.parentElement;
    if (!rootEl) return;

    const rootRect = rootEl.getBoundingClientRect();
    const anchorRect = anchorElement.getBoundingClientRect();

    let left = anchorRect.left - rootRect.left;
    const top = anchorRect.bottom - rootRect.top + 4; // 4px gap

    // Read the live width after the panel is visible so the --dt-panel-width
    // CSS variable (if overridden by the host app) drives edge clamping.
    const panelWidth = this.element.offsetWidth || 320;

    // Clamp left so panel doesn't overflow right edge
    if (left + panelWidth > rootRect.width) {
      left = Math.max(0, rootRect.width - panelWidth);
    }

    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
  }

  // =========================================
  // Open / Close / Toggle
  // =========================================

  /**
   * Toggle the panel open/closed for the given column
   */
  toggle(column: string, anchorElement: HTMLElement): void {
    if (this.isOpen && this.currentColumn === column) {
      this.close();
    } else {
      this.open(column, anchorElement);
    }
  }

  /**
   * Open the panel for the given column
   */
  open(column: string, anchorElement: HTMLElement): void {
    if (this.destroyed) return;

    // Find the column schema
    const schema = this.state.schema.get();
    const colSchema = schema.find((s) => s.name === column);
    if (!colSchema) return;

    // If switching columns, destroy the old field
    if (this.currentField && this.currentColumn !== column) {
      this.currentField.destroy();
      this.currentField = null;
      this.body.innerHTML = '';
    }

    // Create field for the target column (if not already showing it)
    if (!this.currentField) {
      this.currentField = new FilterPanelField(colSchema, this.state, this.actions, {
        classPrefix: this.prefix,
        messages: this.messages,
      });
      this.body.appendChild(this.currentField.getElement());
    }

    this.currentColumn = column;
    this.isOpen = true;
    this.element.style.display = '';

    // Update header: title, type badge, clear button
    this.titleEl.textContent = this.messages.filters.panelTitleForColumn(column);
    this.typeBadgeEl.textContent = colSchema.type;
    const hasFilter = this.state.filtersByColumn.get().has(column);
    this.updatePanelClearButton(hasFilter);

    // Position below the anchor (reads offsetWidth — must run after
    // style.display = '').
    this.position(anchorElement);

    this.modalHost.open({
      mode: 'panel',
      element: this.element,
      outsideClickIgnore: [`.${this.prefix}-col-filter-btn`],
      onClose: () => this.handleHostClose(),
      colorSchemeSource: this.colorSchemeSource,
    });
  }

  /**
   * Close the panel
   *
   * Note: close() does NOT destroy currentField. This is intentional:
   * it preserves user input so re-opening the same column shows previous values.
   * The field is destroyed when switching columns (open with different column)
   * or when the panel itself is destroyed.
   */
  close(): void {
    if (!this.isOpen) return;
    // ModalHost.close() invokes handleHostClose() below for the DOM cleanup.
    this.modalHost.close();
  }

  private handleHostClose(): void {
    this.isOpen = false;
    this.element.style.display = 'none';
  }

  // =========================================
  // Clear Button
  // =========================================

  private updatePanelClearButton(hasFilter: boolean): void {
    this.clearBtn.classList.toggle(
      `${this.prefix}-filter-panel-clear--hidden`,
      !hasFilter
    );
  }

  // =========================================
  // Public API
  // =========================================

  /**
   * Get the panel's DOM element
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Check if the panel is currently open
   */
  getIsOpen(): boolean {
    return this.isOpen;
  }

  /**
   * Get the currently focused column (if panel is open)
   */
  getCurrentColumn(): string | null {
    return this.isOpen ? this.currentColumn : null;
  }

  /**
   * Destroy and clean up
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.close();
    this.modalHost.destroy();

    // Unsubscribe from state
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Destroy current field
    if (this.currentField) {
      this.currentField.destroy();
      this.currentField = null;
    }

    // Remove from DOM
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
