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

import type { AnnotationStore } from '../annotations/AnnotationStore';
import { maxSeverity } from '../annotations/severity';
import type { StateActions } from '../core/Actions';
import type { TableState } from '../core/State';
import { type Strings, defaultStrings } from '../core/Strings';
import type { ColumnSchema, ColumnHeaderTooltipContent } from '../core/types';
import type { AnnotationPopover } from './AnnotationPopover';
import type { ColumnHeaderTooltipPopover } from './ColumnHeaderTooltipPopover';
import { ColumnResizer } from './ColumnResizer';
import { resolveColumnWidth } from './ColumnWindow';

/**
 * Options for configuring the ColumnHeader
 */
export interface ColumnHeaderOptions {
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string | undefined;
  /**
   * DOM `id` for the header cell. `TableContainer` supplies an
   * instance-scoped id so `aria-activedescendant` on `.dt-grid` can name this
   * cell; omit it when mounting a header outside a grid.
   */
  cellId?: string | undefined;
  /** Called when the filter button is clicked, with column name and button element for positioning */
  onFilterClick?: ((column: string, buttonElement: HTMLElement) => void) | undefined;
  /** Called when the f(x) icon on a derived column is clicked */
  onDerivedIconClick?: ((columnName: string, buttonElement: HTMLElement) => void) | undefined;
  /**
   * Show the f(x) edit icon on derived columns (default: true). When `false`,
   * the icon is not mounted and `onDerivedIconClick` is unreachable. Set by
   * the facade via the public `derivedColumns` option.
   */
  showDerivedEditIcon?: boolean | undefined;
  /**
   * 1-based column index in the *presented* order (for `aria-colindex`).
   * Position in `state.columnOrder`, not in the schema — ARIA requires the
   * values to ascend in DOM order within a row, which the schema index stops
   * doing the moment a column is reordered.
   */
  colIndex?: number | undefined;
  /** Resolved i18n strings. Defaults to English. */
  messages?: Strings | undefined;
  /** Shared annotation store for column-scope annotation classes + popover. */
  annotations?: AnnotationStore | undefined;
  /** Shared popover singleton used to display column-scope annotations on hover / focus. */
  annotationPopover?: AnnotationPopover | undefined;
  /** Shared singleton used to display the app-controlled column-name tooltip popover. */
  columnHeaderTooltipPopover?: ColumnHeaderTooltipPopover | undefined;
  /**
   * Write a transient message to a polite live region. Used to announce the
   * final width after a resize drag, which is otherwise silent to a screen
   * reader. `TableContainer.announce` is the wiring.
   */
  announce?: ((message: string) => void) | undefined;
  /**
   * Subscribe to the table's state signals directly (default: `true`).
   *
   * A header self-subscribes to seven of them — sort, row count, pins,
   * filters, visible columns, the annotation store and the tooltip overrides —
   * which is fine for one header and is seven times the mounted-header count
   * when something owns many. `TableContainer` therefore mounts its headers
   * with `false` and fans the same seven out itself, so the subscriber count
   * is a small constant rather than a multiple of the window, and a scroll
   * that mounts and unmounts headers produces no subscribe churn at all.
   *
   * Current values are still pulled in the constructor either way, so a header
   * is correct the moment it exists. What `false` turns off is only the
   * *reaction* to later changes, which the owner then owes it through
   * {@link ColumnHeader.update}, {@link ColumnHeader.refreshStatsLine},
   * {@link ColumnHeader.refreshPinState},
   * {@link ColumnHeader.refreshFilterIndicator},
   * {@link ColumnHeader.refreshHideButtonState},
   * {@link ColumnHeader.refreshAnnotations} and
   * {@link ColumnHeader.refreshTooltip}.
   *
   * Defaults to `true` so a header constructed directly through `/advanced` is
   * self-sufficient, which is what it has always been.
   */
  subscribe?: boolean | undefined;
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
  private hideButton: HTMLElement;
  private filterButton: HTMLElement;
  private dragHandle: HTMLElement;
  private derivedIconBtn: HTMLElement | null = null;
  private statsEl: HTMLElement;
  private nameEl!: HTMLElement;
  private resizer: ColumnResizer;
  private unsubscribes: (() => void)[] = [];
  private destroyed = false;
  private readonly classPrefix: string;
  private readonly options: ColumnHeaderOptions;
  private readonly messages: Strings;

  constructor(
    private column: ColumnSchema,
    private state: TableState,
    private actions: StateActions,
    options: ColumnHeaderOptions = {},
  ) {
    this.options = options;
    this.classPrefix = options.classPrefix ?? 'dt';
    this.messages = options.messages ?? defaultStrings;
    this.element = this.createElement();
    this.sortButton = this.element.querySelector(`.${this.classPrefix}-col-sort-btn`)!;
    this.sortBadge = this.element.querySelector(`.${this.classPrefix}-col-sort-badge`)!;
    this.pinButton = this.element.querySelector(`.${this.classPrefix}-col-pin-btn`)!;
    this.hideButton = this.element.querySelector(`.${this.classPrefix}-col-hide-btn`)!;
    this.filterButton = this.element.querySelector(`.${this.classPrefix}-col-filter-btn`)!;
    this.dragHandle = this.element.querySelector(`.${this.classPrefix}-col-drag-handle`)!;
    this.statsEl = this.element.querySelector(`.${this.classPrefix}-col-stats`)!;

    // Create resizer for column width adjustment
    this.resizer = new ColumnResizer(
      this.element,
      (width) => this.actions.setColumnWidth(this.column.name, width),
      () => this.actions.resetColumnWidth(this.column.name),
      () => this.getColumnCells(),
      {
        classPrefix: this.classPrefix,
        onDragStart: () => this.actions.beginColumnWidthChange(),
        onDragEnd: () => {
          this.actions.endColumnWidthChange();
          // Announced once at drag end, not on every mousemove — a live
          // region fired at pointer rate is noise, not information.
          this.options.announce?.(
            this.messages.a11y.columnWidthAnnouncement(this.column.name, this.getWidth()),
          );
        },
        messages: this.messages,
      },
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
    if (this.column.isDerived) {
      el.classList.add(`${this.classPrefix}-col-header--derived`);
    }
    el.setAttribute('role', 'columnheader');
    el.setAttribute('aria-label', this.buildAriaLabel());
    // Programmatically focusable but never a tab stop: the cursor lives on
    // `.dt-grid`, which names this cell via `aria-activedescendant` — an
    // attribute whose target has to be focusable.
    el.setAttribute('tabindex', '-1');
    // Resize and reorder have no focus stop of their own — they live behind a
    // modal gesture on the header cursor. Advertising the entry key here is
    // what makes it discoverable to a screen-reader user who never sees the
    // drag handle or the resize separator.
    el.setAttribute('aria-keyshortcuts', 'Shift+F2');
    if (this.options.cellId) {
      el.id = this.options.cellId;
    }
    if (this.options.colIndex !== undefined) {
      el.setAttribute('aria-colindex', String(this.options.colIndex));
    }
    el.setAttribute('data-column', this.column.name);

    // Name row container
    const nameRow = document.createElement('div');
    nameRow.className = `${this.classPrefix}-col-name-row`;

    // Drag handle
    const dragHandle = document.createElement('button');
    dragHandle.className = `${this.classPrefix}-col-drag-handle`;
    dragHandle.setAttribute('type', 'button');
    dragHandle.setAttribute('aria-label', this.messages.a11y.dragHandleLabel(this.column.name));
    dragHandle.setAttribute('title', this.messages.a11y.dragHandleTitle);
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
    // Derived column f(x) edit icon. Gated by `showDerivedEditIcon` so consumers
    // with `derivedColumns: false` can fully skip the CodeMirror-bound edit
    // panel (the icon is the only entry point to it).
    if (this.column.isDerived && this.options.showDerivedEditIcon !== false) {
      const iconBtn = document.createElement('button');
      iconBtn.className = `${this.classPrefix}-derived-icon-btn`;
      iconBtn.setAttribute('type', 'button');
      iconBtn.setAttribute('aria-label', this.messages.a11y.editDerivedColumnLabel);
      iconBtn.setAttribute('title', this.messages.a11y.editDerivedColumnTitle);
      iconBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" stroke-width="2"/>
        <text x="12" y="16" class="${this.classPrefix}-derived-fx-glyph" fill="currentColor" text-anchor="middle">f</text>
      </svg>`;
      nameRow.appendChild(iconBtn);
      this.derivedIconBtn = iconBtn;
    }

    // Column name. Tooltip is rendered as a styled popover anchored on this
    // span (see attachEventListeners), not the native `title` attribute.
    // applyTooltipReactivity() applies tabindex when an override exists so
    // keyboard users can reach the popover.
    const nameEl = document.createElement('div');
    nameEl.className = `${this.classPrefix}-col-name`;
    nameEl.textContent = this.column.name;
    this.nameEl = nameEl;
    if (this.column.isDerived) {
      nameEl.classList.add(`${this.classPrefix}-col-name--derived`);
    }
    nameRow.appendChild(nameEl);
    this.applyTooltipReactivity();

    // Sort button with SVG arrows
    const sortBtn = document.createElement('button');
    sortBtn.className = `${this.classPrefix}-col-sort-btn`;
    sortBtn.setAttribute('type', 'button');
    sortBtn.setAttribute('aria-label', this.messages.a11y.sortButtonLabel(this.column.name));
    sortBtn.setAttribute('title', this.messages.a11y.sortAscendingTitle);
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

    el.appendChild(nameRow);

    // Action panel (pin, hide, filter, sort, drag-to-reorder buttons)
    const actionPanel = document.createElement('div');
    actionPanel.className = `${this.classPrefix}-col-action-panel`;

    // Pin button (thumbtack icon)
    const pinBtn = document.createElement('button');
    pinBtn.className = `${this.classPrefix}-col-action-btn ${this.classPrefix}-col-pin-btn`;
    pinBtn.setAttribute('type', 'button');
    pinBtn.setAttribute('aria-label', this.messages.a11y.pinButtonLabel(this.column.name));
    pinBtn.setAttribute('title', this.messages.a11y.pinColumnTitle);
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
    hideBtn.setAttribute('aria-label', this.messages.a11y.hideButtonLabel(this.column.name));
    hideBtn.setAttribute('title', this.messages.a11y.hideColumnTitle);
    hideBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M2 8s2.5-4.5 6-4.5S14 8 14 8s-2.5 4.5-6 4.5S2 8 2 8z" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
        <line x1="3.5" y1="12.5" x2="12.5" y2="3.5" fill="none" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    `;

    // Filter button (funnel icon — placeholder, no handler yet)
    const filterBtn = document.createElement('button');
    filterBtn.className = `${this.classPrefix}-col-action-btn ${this.classPrefix}-col-filter-btn`;
    filterBtn.setAttribute('type', 'button');
    filterBtn.setAttribute('aria-label', this.messages.a11y.filterButtonLabel(this.column.name));
    filterBtn.setAttribute('title', this.messages.a11y.filterColumnTitle);
    filterBtn.innerHTML = `
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 3h12L9.5 8.5v4L6.5 14V8.5L2 3z" />
      </svg>
    `;

    // Type label
    const typeEl = document.createElement('div');
    typeEl.className = `${this.classPrefix}-col-type`;
    typeEl.textContent = this.column.type;
    el.appendChild(typeEl);

    // Divider — thin horizontal bar separating header info from data display
    const divider1 = document.createElement('div');
    divider1.className = `${this.classPrefix}-col-divider`;
    el.appendChild(divider1);

    // Stats line (shows row count, updated via subscription)
    const statsEl = document.createElement('div');
    statsEl.className = `${this.classPrefix}-col-stats`;
    // Initially empty - will be updated when subscribed to totalRows
    el.appendChild(statsEl);

    // Visualization container
    const vizEl = document.createElement('div');
    vizEl.className = `${this.classPrefix}-col-viz`;
    el.appendChild(vizEl);

    // Divider — thin horizontal bar separating data display from actions
    const divider2 = document.createElement('div');
    divider2.className = `${this.classPrefix}-col-divider`;
    el.appendChild(divider2);

    // Action panel (pin, hide, filter, sort, drag-to-reorder buttons)
    actionPanel.appendChild(pinBtn);
    actionPanel.appendChild(hideBtn);
    actionPanel.appendChild(filterBtn);
    actionPanel.appendChild(sortBtn);
    actionPanel.appendChild(dragHandle);
    el.appendChild(actionPanel);

    // Take every per-column control out of the native tab order. A 266-column
    // table renders ~1,600 of these; leaving them tabbable would make Tab-ing
    // past the grid take over a thousand presses. They stay reachable through
    // F2 controls mode (see KeyboardNavigator), which is what keeps this
    // WCAG 2.1.1-conformant rather than merely quiet.
    for (const btn of el.querySelectorAll('button')) {
      btn.setAttribute('tabindex', '-1');
    }

    // Apply annotation classes + popover wiring on initial render. The
    // store subscription in subscribeToState() re-applies on every
    // annotation change.
    this.applyAnnotationClasses(el);

    return el;
  }

  /**
   * Resolve the structured tooltip content for this column, or `null` if no
   * override is set.
   */
  private resolveTooltipContent(): ColumnHeaderTooltipContent | null {
    return this.state.columnHeaderTooltips.get().get(this.column.name) ?? null;
  }

  /**
   * Re-sync nameEl `tabindex` with the override state and refresh / hide an
   * already-displayed popover. Called from the `columnHeaderTooltips` signal
   * subscription so the rendered popover stays in sync with app updates
   * without rebuilding the header DOM.
   */
  private applyTooltipReactivity(): void {
    if (this.destroyed || !this.nameEl) return;
    const content = this.resolveTooltipContent();
    if (content) {
      // `-1`, not `0`: the name span becomes a controls-mode stop (F2 →
      // arrows), not a tab stop. One tab stop per column is exactly the
      // column-count-proportional tab order this model exists to avoid.
      this.nameEl.setAttribute('tabindex', '-1');
    } else {
      this.nameEl.removeAttribute('tabindex');
    }
    const popover = this.options.columnHeaderTooltipPopover;
    if (popover && popover.isOpenFor(this.nameEl)) {
      if (content) popover.refresh(this.nameEl, content);
      else popover.hide();
    }
  }

  /**
   * Show the shared tooltip popover anchored on the name span. No-op when
   * no override is set or no popover singleton is wired.
   */
  private showColumnTooltip = (): void => {
    if (this.destroyed) return;
    const popover = this.options.columnHeaderTooltipPopover;
    if (!popover) return;
    const content = this.resolveTooltipContent();
    if (!content) return;
    popover.show(this.nameEl, content);
  };

  /**
   * Start the tooltip popover's grace-period dismissal. Called on
   * `pointerleave` / `focusout` of the name span.
   */
  private scheduleColumnTooltipHide = (): void => {
    if (this.destroyed) return;
    this.options.columnHeaderTooltipPopover?.scheduleGraceHide();
  };

  /**
   * Read column-scope annotations from the store and rewrite the header's
   * annotation CSS classes + data attributes. `getByColumn` also surfaces
   * cell-scope annotations (every cell ann lands in byRow/byColumn/byCell),
   * so we filter to `scope === 'column'` — a pure cell annotation must not
   * tint the header.
   */
  private applyAnnotationClasses(el: HTMLElement): void {
    const p = this.classPrefix;
    const annotations = this.options.annotations;
    el.classList.remove(
      `${p}-col-header--annotated`,
      `${p}-col-header--annotation-error`,
      `${p}-col-header--annotation-warning`,
      `${p}-col-header--annotation-info`,
    );
    delete el.dataset['dtAnnotationCount'];
    if (!annotations) return;
    const anns = annotations.getByColumn(this.column.name).filter((a) => a.scope === 'column');
    if (anns.length === 0) return;
    // Marker class + count track unfiltered presence so the popover stays
    // reachable even when every visible severity is hidden; the severity
    // class falls back through error → warning → info per the filter.
    el.classList.add(`${p}-col-header--annotated`);
    el.dataset['dtAnnotationCount'] = String(anns.length);
    const filter = annotations.getSeverityFilter();
    const sev = maxSeverity(anns.filter((a) => filter[a.severity]));
    if (sev) el.classList.add(`${p}-col-header--annotation-${sev}`);
  }

  /**
   * Show the shared popover anchored on the header root, populated with the
   * current column-scope annotations. No-op when no popover / store is
   * wired or when the column has no column-scope annotations (cell-scope
   * annotations at cells in this column don't open the header popover —
   * they open the cell's own popover).
   */
  private showAnnotationPopover = (): void => {
    if (this.destroyed) return;
    const popover = this.options.annotationPopover;
    const store = this.options.annotations;
    if (!popover || !store) return;
    const anns = store.getByColumn(this.column.name).filter((a) => a.scope === 'column');
    if (anns.length === 0) return;
    popover.show(this.element, anns);
  };

  /**
   * Start the popover's grace-period dismissal. Called on `pointerleave` /
   * `focusout` of the header. The popover cancels the timer if the user
   * moves into the popover itself.
   */
  private scheduleAnnotationHide = (): void => {
    if (this.destroyed) return;
    this.options.annotationPopover?.scheduleGraceHide();
  };

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

    // Hide button
    this.hideButton.addEventListener('click', this.handleHideClick);

    // Filter button
    this.filterButton.addEventListener('click', this.handleFilterClick);

    // Derived column icon button
    if (this.derivedIconBtn) {
      this.derivedIconBtn.addEventListener('click', this.handleDerivedIconClick);
    }

    // Keyboard: Enter / Space on the header cell itself toggles sort.
    // Scoped to e.target === element so descendant buttons (sort, pin, hide,
    // filter) still get their own native button activation without double-firing.
    this.element.addEventListener('keydown', this.handleHeaderKeyDown);

    // Annotation popover — show on pointerenter/focusin, schedule hide on
    // pointerleave/focusout. The popover itself cancels the pending hide
    // when the user moves onto its DOM.
    this.element.addEventListener('pointerenter', this.showAnnotationPopover);
    this.element.addEventListener('pointerleave', this.scheduleAnnotationHide);
    this.element.addEventListener('focusin', this.showAnnotationPopover);
    this.element.addEventListener('focusout', this.scheduleAnnotationHide);

    // Column-header tooltip popover — anchored on the name span (different
    // DOM node from the annotation popover so they coexist on a column
    // that has both an annotation and a tooltip override).
    this.nameEl.addEventListener('pointerenter', this.showColumnTooltip);
    this.nameEl.addEventListener('pointerleave', this.scheduleColumnTooltipHide);
    this.nameEl.addEventListener('focusin', this.showColumnTooltip);
    this.nameEl.addEventListener('focusout', this.scheduleColumnTooltipHide);
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
   * Keyboard sort activation on the header cell. Fires only when the header
   * itself is the event target, so focused buttons inside the header (sort,
   * pin, hide, filter) keep their own native Enter/Space handling.
   *
   * Shift/Ctrl/Meta + Enter or Space adds to multi-sort (mirrors mouse).
   */
  private handleHeaderKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed) return;
    if (event.target !== this.element) return;

    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;

    event.preventDefault();
    event.stopPropagation();

    this.activateSort(event.shiftKey || event.metaKey || event.ctrlKey);
  };

  /**
   * Handle pin button click
   */
  private handlePinClick = (event: MouseEvent): void => {
    if (this.destroyed) return;
    event.stopPropagation();
    this.actions.toggleColumnPin(this.column.name);
  };

  /**
   * Handle hide button click
   */
  private handleHideClick = (event: MouseEvent): void => {
    if (this.destroyed) return;
    event.stopPropagation();
    this.actions.hideColumn(this.column.name);
  };

  /**
   * Handle click events for filter button
   */
  private handleFilterClick = (event: MouseEvent): void => {
    if (this.destroyed) return;
    event.stopPropagation();
    this.options.onFilterClick?.(this.column.name, this.filterButton);
  };

  private handleDerivedIconClick = (event: MouseEvent): void => {
    if (this.destroyed) return;
    event.stopPropagation();
    this.options.onDerivedIconClick?.(this.column.name, this.derivedIconBtn!);
  };

  // =========================================
  // State Subscription
  // =========================================

  /**
   * Subscribe to state changes for sort and stats updates
   */
  private subscribeToState(): void {
    // Pull current values first, and unconditionally: a signal fires only on
    // change, so a header that subscribed and nothing else would render blank
    // until the first write — and a header mounted with `subscribe: false`
    // has to be correct on arrival, since that is the whole basis of the
    // owner-driven arrangement.
    this.updateStatsLine(this.state.totalRows.get());
    this.updateFilterIndicator();
    this.updatePinState();
    this.updateHideButtonState(this.state.visibleColumns.get());

    // Everything below is what `subscribe: false` turns off. Kept together and
    // in one branch so the set the owner owes back cannot drift from the set
    // that is skipped here.
    if (this.options.subscribe === false) return;

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

    // Subscribe to visible columns to disable hide button when only one column visible
    const unsubVisible = this.state.visibleColumns.subscribe((visible) => {
      if (!this.destroyed) {
        this.updateHideButtonState(visible);
      }
    });
    this.unsubscribes.push(unsubVisible);

    // Annotation store — re-apply classes whenever any mutation lands.
    // Coarse re-read (one getByColumn call per change) is cheaper than
    // filtering payload.ids through `store.get(id)?.scope === 'column' && …`.
    if (this.options.annotations) {
      const unsubAnn = this.options.annotations.on('change', () => {
        if (!this.destroyed) {
          this.applyAnnotationClasses(this.element);
        }
      });
      this.unsubscribes.push(unsubAnn);
    }

    // Column-header tooltip override — re-apply on every signal change so
    // the nameEl tabindex stays in sync and a currently-displayed popover
    // refreshes in place. Idempotent when unrelated columns change.
    const unsubTooltip = this.state.columnHeaderTooltips.subscribe(() => {
      if (!this.destroyed) this.applyTooltipReactivity();
    });
    this.unsubscribes.push(unsubTooltip);
  }

  /**
   * Update the stats line with row count
   */
  private updateStatsLine(count: number): void {
    if (count > 0) {
      this.statsEl.textContent = this.messages.statistics.rowCount(count);
    } else {
      this.statsEl.textContent = '';
    }
  }

  /**
   * Update the filter indicator based on active filters for this column
   */
  private updateFilterIndicator(): void {
    const hasFilter = this.state.filtersByColumn.get().has(this.column.name);
    this.element.classList.toggle(`${this.classPrefix}-col-header--filtered`, hasFilter);
    // Toggle active class on the filter button itself
    this.filterButton.classList.toggle(`${this.classPrefix}-col-action-btn--active`, hasFilter);

    // Update aria-label to reflect current sort/filter state
    this.element.setAttribute('aria-label', this.buildAriaLabel());
  }

  /**
   * Update pin button active state based on pinned columns
   */
  private updatePinState(): void {
    const isPinned = this.state.pinnedColumns.get().includes(this.column.name);
    this.pinButton.classList.toggle(`${this.classPrefix}-col-action-btn--active`, isPinned);
    this.pinButton.setAttribute(
      'title',
      isPinned ? this.messages.a11y.unpinColumnTitle : this.messages.a11y.pinColumnTitle,
    );
    this.pinButton.setAttribute(
      'aria-label',
      isPinned
        ? this.messages.a11y.unpinButtonLabel(this.column.name)
        : this.messages.a11y.pinButtonLabel(this.column.name),
    );

    // Disable drag-to-reorder for pinned columns
    this.dragHandle.classList.toggle(`${this.classPrefix}-col-drag-handle--disabled`, isPinned);
    this.dragHandle.setAttribute('aria-disabled', String(isPinned));
  }

  /**
   * Update hide button disabled state when only one column is visible
   */
  private updateHideButtonState(visibleColumns: string[]): void {
    const isLastColumn = visibleColumns.length <= 1;
    if (isLastColumn) {
      this.hideButton.setAttribute('disabled', '');
      this.hideButton.setAttribute('title', this.messages.a11y.cannotHideLastColumn);
      this.hideButton.classList.add(`${this.classPrefix}-col-action-btn--disabled`);
    } else {
      this.hideButton.removeAttribute('disabled');
      this.hideButton.setAttribute('title', this.messages.a11y.hideColumnTitle);
      this.hideButton.classList.remove(`${this.classPrefix}-col-action-btn--disabled`);
    }
  }

  /**
   * Get all rendered body cells in this column, for transition animations.
   *
   * By `data-column`, not by `:nth-child`. A body row is
   * `[P pinned cells][left spacer][W window cells][right spacer]`, so the
   * n-th child is not the n-th visible column — at any scrolled position it
   * is a cell for some other column, or a spacer, or nothing at all. The
   * double-click width reset used to tag whichever elements that formula
   * landed on: at 1,000 columns scrolled to column 400 it tagged none and the
   * body snapped while the header glided, and at `scrollLeft = 0` it tagged
   * the *previous* column's cells, which then carried a live width transition
   * into the row pool.
   *
   * Returns only the cells that exist. That is the correct set: a column
   * outside the window has nothing to animate.
   */
  private getColumnCells(): HTMLElement[] {
    const root = this.element.closest(`.${this.classPrefix}-root`);
    if (!root) return [];

    // Matched in JS rather than interpolated into the selector: column names
    // come from user data and a quote or a bracket in one would break — or
    // reshape — an attribute selector. At most a few hundred cells exist, and
    // this runs once per double-click.
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        `.${this.classPrefix}-row > .${this.classPrefix}-cell[data-column]`,
      ),
    ).filter((cell) => cell.getAttribute('data-column') === this.column.name);
  }

  // =========================================
  // ARIA
  // =========================================

  /**
   * Build a descriptive aria-label including sort and filter state.
   */
  private buildAriaLabel(): string {
    const a = this.messages.a11y;
    const parts: string[] = [`${this.column.name}, ${this.column.type}`];

    const sortColumns = this.state.sortColumns.get();
    const sortIndex = sortColumns.findIndex((s) => s.column === this.column.name);
    if (sortIndex !== -1) {
      const direction = sortColumns[sortIndex]!.direction === 'asc' ? a.ascending : a.descending;
      if (sortColumns.length > 1) {
        parts.push(a.sortedMultiSuffix(direction, sortIndex + 1));
      } else {
        parts.push(a.sortedSuffix(direction));
      }
    }

    const filtersByCol = this.state.filtersByColumn.get();
    const colFilters = filtersByCol.get(this.column.name);
    if (colFilters && colFilters.length > 0) {
      if (colFilters.length === 1) {
        parts.push(a.filteredSuffix);
      } else {
        parts.push(a.multiFilteredSuffix(colFilters.length));
      }
    }

    return parts.join(', ');
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
      `${this.classPrefix}-col-sort-btn--desc`,
    );

    if (sortIndex === -1) {
      // Not sorted - hide badge
      this.sortBadge.style.display = 'none';
      this.element.setAttribute('aria-sort', 'none');
      this.sortButton.setAttribute('title', this.messages.a11y.sortAscendingTitle);
    } else {
      const sortConfig = sortColumns[sortIndex]!;
      const isAsc = sortConfig.direction === 'asc';

      // Add appropriate class for arrow styling
      this.sortButton.classList.add(`${this.classPrefix}-col-sort-btn--${isAsc ? 'asc' : 'desc'}`);

      // For multi-sort, show position badge
      if (sortColumns.length > 1) {
        this.sortBadge.textContent = String(sortIndex + 1);
        this.sortBadge.style.display = '';
      } else {
        this.sortBadge.style.display = 'none';
      }

      this.element.setAttribute('aria-sort', isAsc ? 'ascending' : 'descending');
      this.sortButton.setAttribute(
        'title',
        isAsc ? this.messages.a11y.sortDescendingTitle : this.messages.a11y.sortRemoveTitle,
      );
    }

    // Update aria-label to reflect current sort/filter state
    this.element.setAttribute('aria-label', this.buildAriaLabel());
  }

  /**
   * Toggle this column's sort, or push it onto the multi-sort stack.
   *
   * The keyboard entry point for sorting. `KeyboardNavigator` calls it when
   * the grid cursor sits on this header and the user presses Enter or Space;
   * the header's own keydown listener calls it when the header cell itself is
   * the event target. Mirrors click (plain) and Cmd/Ctrl+click (multi).
   *
   * @param addToMultiSort - Append to the sort stack instead of replacing it.
   *
   * @example
   * ```typescript
   * header.activateSort(false); // sort by this column alone
   * header.activateSort(true);  // add as the next sort key
   * ```
   */
  activateSort(addToMultiSort: boolean): void {
    if (this.destroyed) return;
    if (addToMultiSort) {
      this.actions.addToSort(this.column.name);
    } else {
      this.actions.toggleSort(this.column.name);
    }
  }

  /**
   * Show or hide this header's column-layout-mode affordance.
   *
   * Column layout mode (`Shift+F2` from the header cursor) moves no DOM focus,
   * so nothing in the default rendering would tell a sighted keyboard user
   * which column the arrow keys are about to resize or move. This puts a
   * dashed outline on the header and lights the resize handle.
   *
   * @example
   * ```typescript
   * header.setLayoutMode(true);
   * ```
   */
  setLayoutMode(active: boolean): void {
    if (this.destroyed) return;
    this.element.classList.toggle(`${this.classPrefix}-col-header--layout`, active);
    this.resizer.setActive(active);
  }

  // -----------------------------------------------------------------------
  // Owner-driven refreshes
  //
  // One entry point per signal a header would otherwise subscribe to, for an
  // owner that mounts it with {@link ColumnHeaderOptions.subscribe} `false`
  // and fans the signals out itself. Each is exactly what that header's own
  // subscription callback did, so the two arrangements cannot diverge in
  // behaviour — only in how many subscribers the signal ends up with.
  //
  // All are no-ops after `destroy()`: a fan-out walks a set the owner
  // maintains, and one that lags a teardown by a tick must not throw.
  // -----------------------------------------------------------------------

  /** Re-read `totalRows` into the stats line. See {@link update} for sort. */
  refreshStatsLine(totalRows: number): void {
    if (this.destroyed) return;
    this.updateStatsLine(totalRows);
  }

  /** Re-read `pinnedColumns` into the pin button. */
  refreshPinState(): void {
    if (this.destroyed) return;
    this.updatePinState();
  }

  /** Re-read `filtersByColumn` into the filter indicator. */
  refreshFilterIndicator(): void {
    if (this.destroyed) return;
    this.updateFilterIndicator();
  }

  /**
   * Re-read the visible set into the hide button, which is disabled while it
   * would take the last visible column away.
   */
  refreshHideButtonState(visibleColumns: string[]): void {
    if (this.destroyed) return;
    this.updateHideButtonState(visibleColumns);
  }

  /** Re-apply this column's annotation classes from the shared store. */
  refreshAnnotations(): void {
    if (this.destroyed) return;
    this.applyAnnotationClasses(this.element);
  }

  /** Re-apply the app-set column-header tooltip override. */
  refreshTooltip(): void {
    if (this.destroyed) return;
    this.applyTooltipReactivity();
  }

  /**
   * Re-key the header's cell identity after the column set or order changed.
   *
   * Both values are positions, not properties of the column: `cellId` encodes
   * the column's index in `visibleColumns`, which is what
   * `aria-activedescendant` is published against, and `colIndex` is its
   * position in the presented table. Hiding, showing or moving *another*
   * column shifts both without this column changing at all.
   *
   * Exists because the header row is reconciled rather than rebuilt. A
   * surviving header keeps its element — and with it its chart, its listeners
   * and any popover anchored inside it — so the two positional attributes have
   * to be patched on the node instead of arriving with a new one.
   *
   * @param cellId - the element `id`, from `TableContainer`'s id scheme.
   * @param colIndex - 1-based `aria-colindex`; omit to remove the attribute.
   *
   * @example
   * ```typescript
   * header.setCellIdentity('dt-t1-a1b2-colheader-4', 7);
   * ```
   */
  setCellIdentity(cellId: string, colIndex?: number | undefined): void {
    if (this.destroyed) return;
    this.element.id = cellId;
    if (colIndex === undefined) this.element.removeAttribute('aria-colindex');
    else this.element.setAttribute('aria-colindex', String(colIndex));
  }

  /**
   * The current width of this column, in pixels.
   *
   * Reads `columnWidths` rather than the element, so it reports the state the
   * next resize step will build on even before layout has flushed. Resolved
   * through the renderer's own helper, so an unsized column reports the
   * default the renderer will draw and a width the renderer refuses
   * (non-finite, non-positive) does not become the base of the next step —
   * `Math.max(min, Math.min(max, NaN))` is `NaN`, which would make every
   * subsequent resize a no-op.
   */
  getWidth(): number {
    return resolveColumnWidth(this.state.columnWidths.get().get(this.column.name));
  }

  /**
   * The clamp bounds a width change is held to — the resizer's own
   * `minWidth` / `maxWidth` (50 / 500 by default).
   *
   * Exposed so a caller can tell "the step was applied" from "the step was
   * refused because we are already at the edge" without duplicating the
   * bounds.
   *
   * @example
   * ```typescript
   * const { min, max } = header.getWidthBounds(); // { min: 50, max: 500 }
   * ```
   */
  getWidthBounds(): { min: number; max: number } {
    return { min: this.resizer.getMinWidth(), max: this.resizer.getMaxWidth() };
  }

  /**
   * Set this column's width, clamped to {@link ColumnHeader.getWidthBounds}.
   *
   * The keyboard entry point for `Home` / `End` in column layout mode, and the
   * counterpart to {@link ColumnHeader.activateSort} for sizing.
   * `KeyboardNavigator` goes through here rather than calling
   * `actions.setColumnWidth` directly so the clamp stays in exactly one place
   * — the mouse drag applies the same bounds from the same resizer instance.
   *
   * @param px - Desired width in pixels, before clamping.
   * @returns The width actually applied.
   *
   * @example
   * ```typescript
   * header.setWidth(9999); // → 500, the maximum
   * ```
   */
  setWidth(px: number): number {
    if (this.destroyed) return this.getWidth();
    const { min, max } = this.getWidthBounds();
    const clamped = Math.max(min, Math.min(max, Math.round(px)));
    this.actions.setColumnWidth(this.column.name, clamped);
    return clamped;
  }

  /**
   * Grow or shrink this column by `deltaPx`, clamped to
   * {@link ColumnHeader.getWidthBounds}.
   *
   * The keyboard entry point for the arrow keys in column layout mode.
   *
   * @param deltaPx - Signed pixel delta; negative shrinks.
   * @returns The width actually applied.
   *
   * @example
   * ```typescript
   * header.resizeBy(-16); // one Left-arrow step
   * ```
   */
  resizeBy(deltaPx: number): number {
    if (this.destroyed) return this.getWidth();
    return this.setWidth(this.getWidth() + deltaPx);
  }

  /**
   * The header's interactive controls, in visual order, filtered to the ones
   * a user could actually operate right now.
   *
   * Drives F2 controls mode: `KeyboardNavigator` focuses `[0]` on entry and
   * cycles the list with the arrow keys. Three kinds of element are left out:
   * disabled ones (the hide button on the last visible column), ones the
   * responsive container queries have hidden at narrow widths — focusing a
   * `display: none` element silently does nothing, which would strand the
   * cycle — and the two layout affordances, the drag handle and the resize
   * separator.
   *
   * Those two stay out by design rather than by omission. They are operated
   * from the header cursor with `Shift+F2` (column layout mode), a modal
   * gesture that costs no tab stop and no focus stop — see
   * {@link ColumnHeader.resizeBy} and `KeyboardNavigator`. Adding them here
   * instead would make the separator a focusable widget, which ARIA then
   * requires to carry `aria-valuenow` / `min` / `max`.
   *
   * @example
   * ```typescript
   * header.getControls()[0]?.focus();
   * ```
   */
  getControls(): HTMLElement[] {
    if (this.destroyed) return [];
    const candidates: (HTMLElement | null)[] = [
      this.derivedIconBtn,
      this.nameEl.hasAttribute('tabindex') ? this.nameEl : null,
      this.pinButton,
      this.hideButton,
      this.filterButton,
      this.sortButton,
    ];
    return candidates.filter((el): el is HTMLElement => el !== null && this.isControlActive(el));
  }

  /**
   * Whether a control can take focus and do something. Uses computed style
   * rather than `offsetParent` because jsdom implements the former and always
   * reports `null` for the latter.
   */
  private isControlActive(el: HTMLElement): boolean {
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-disabled') === 'true') return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
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
   * Get the derived column icon button (null for non-derived columns).
   */
  getDerivedIconBtn(): HTMLElement | null {
    return this.derivedIconBtn;
  }

  /**
   * Destroy the column header and clean up resources
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Dismiss any popover still anchored inside this header.
    //
    // Both singletons are shared and outlive the header, and both position
    // themselves against an anchor element they hold a reference to. Destroying
    // the header without this leaves a popover floating over the table,
    // describing a column that is no longer there, anchored to a detached node
    // it will keep measuring on the next reposition — and, for the tooltip,
    // holding an `aria-describedby` target that resolves to nothing.
    //
    // Scroll used to hide this for free: both install capture-phase `scroll`
    // and `resize` listeners that dismiss. What that never covered is a
    // dismissal with no scroll behind it — hiding the column, reordering it,
    // a filter that drops it — and, now that the header row is windowed, an
    // unmount at the edge of the window, which is itself scroll-driven but
    // resolves *before* the listener would have fired.
    const annotationPopover = this.options.annotationPopover;
    if (annotationPopover?.isOpenFor(this.element)) annotationPopover.hide();
    const tooltipPopover = this.options.columnHeaderTooltipPopover;
    if (tooltipPopover?.isOpenFor(this.nameEl)) tooltipPopover.hide();

    // Detach column resizer
    this.resizer.detach();

    // Remove event listeners
    this.sortButton.removeEventListener('click', this.handleSortClick);
    this.pinButton.removeEventListener('click', this.handlePinClick);
    this.hideButton.removeEventListener('click', this.handleHideClick);
    this.filterButton.removeEventListener('click', this.handleFilterClick);
    this.element.removeEventListener('keydown', this.handleHeaderKeyDown);
    this.element.removeEventListener('pointerenter', this.showAnnotationPopover);
    this.element.removeEventListener('pointerleave', this.scheduleAnnotationHide);
    this.element.removeEventListener('focusin', this.showAnnotationPopover);
    this.element.removeEventListener('focusout', this.scheduleAnnotationHide);
    this.nameEl.removeEventListener('pointerenter', this.showColumnTooltip);
    this.nameEl.removeEventListener('pointerleave', this.scheduleColumnTooltipHide);
    this.nameEl.removeEventListener('focusin', this.showColumnTooltip);
    this.nameEl.removeEventListener('focusout', this.scheduleColumnTooltipHide);

    // Unsubscribe from state
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];

    // Clean up derived icon button
    if (this.derivedIconBtn) {
      this.derivedIconBtn.removeEventListener('click', this.handleDerivedIconClick);
      this.derivedIconBtn = null;
    }

    // Remove element from DOM
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
