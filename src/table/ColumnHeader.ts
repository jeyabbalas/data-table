/**
 * ColumnHeader - Interactive column header component
 *
 * Renders a column header with:
 * - Column name
 * - Type label
 * - Stats line, and the slot a column's chart draws in
 * - Pin, hide, filter and sort buttons, with multi-sort badges
 * - A drag handle and a resize handle
 *
 * The buttons and the two handles are the header's controls, and can be left
 * out: a header without them is a shell, which is what `TableContainer` keeps
 * for a column far from the view (see {@link ColumnHeader.setControlsMounted}).
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
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, resolveColumnWidth } from './ColumnLayout';
import { ColumnResizer } from './ColumnResizer';

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
   * Keep the column mounted until the returned release is called. A resize
   * drag holds its column, so a wheel mid-drag cannot take the handle away.
   * `TableContainer` passes its column window controller's.
   *
   * @internal
   */
  holdColumn?: ((column: string) => () => void) | undefined;
  /**
   * Build the controls now (default `true`). `false` makes a shell: the cell,
   * its name and type, the stats and chart slots, the derived-column icon, and
   * none of the pin, hide, filter and sort buttons or the drag and resize
   * handles, until {@link ColumnHeader.setControlsMounted} builds them.
   *
   * @internal
   */
  controls?: boolean | undefined;
}

/** The parts of a header a shell does without. */
interface HeaderControls {
  pinButton: HTMLElement;
  hideButton: HTMLElement;
  filterButton: HTMLElement;
  sortButton: HTMLElement;
  sortBadge: HTMLElement;
  dragHandle: HTMLElement;
  resizer: ColumnResizer;
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
  private actionPanel!: HTMLElement;
  private derivedIconBtn: HTMLElement | null = null;
  private statsEl: HTMLElement;
  private nameEl!: HTMLElement;
  /** The controls, while they are built (see {@link setControlsMounted}). */
  private controls: HeaderControls | null = null;
  /** Whether column layout mode is on, for controls built while it is. */
  private layoutMode = false;
  /** Releases the hold a resize drag keeps on the column, while one runs. */
  private releaseResizeHold: (() => void) | null = null;
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
    this.statsEl = this.element.querySelector(`.${this.classPrefix}-col-stats`)!;

    this.attachEventListeners();
    this.subscribeToState();
    if (options.controls !== false) this.mountControls();
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

    // Derived column f(x) edit icon. Gated by `showDerivedEditIcon` so consumers
    // with `derivedColumns: false` can fully skip the CodeMirror-bound edit
    // panel (the icon is the only entry point to it). Part of a shell too: the
    // name row is as tall as the icon, and would change height without it.
    if (this.column.isDerived && this.options.showDerivedEditIcon !== false) {
      const iconBtn = document.createElement('button');
      iconBtn.className = `${this.classPrefix}-derived-icon-btn`;
      iconBtn.setAttribute('type', 'button');
      iconBtn.setAttribute('aria-label', this.messages.a11y.editDerivedColumnLabel);
      iconBtn.setAttribute('title', this.messages.a11y.editDerivedColumnTitle);
      iconBtn.setAttribute('tabindex', '-1');
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

    el.appendChild(nameRow);

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

    // Action panel, for the pin, hide, filter and sort buttons and the drag
    // handle (see mountControls). The last box in the header, so nothing
    // moves when they come or go.
    const actionPanel = document.createElement('div');
    actionPanel.className = `${this.classPrefix}-col-action-panel`;
    el.appendChild(actionPanel);
    this.actionPanel = actionPanel;

    // Apply annotation classes + popover wiring on initial render. The
    // store subscription in subscribeToState() re-applies on every
    // annotation change.
    this.applyAnnotationClasses(el);

    return el;
  }

  /**
   * Build the controls: the pin, hide, filter and sort buttons, the drag
   * handle and the resize handle.
   *
   * Every button is out of the native tab order. A 266-column table rendered
   * ~1,600 of them when every header had its controls; leaving them tabbable
   * would make Tab-ing past the grid take over a thousand presses. They stay
   * reachable through F2 controls mode (see KeyboardNavigator), which is what
   * keeps this WCAG 2.1.1-conformant rather than merely quiet.
   */
  private mountControls(): void {
    if (this.controls) return;
    const p = this.classPrefix;
    const a = this.messages.a11y;

    // Pin button (thumbtack icon)
    const pinBtn = document.createElement('button');
    pinBtn.className = `${p}-col-action-btn ${p}-col-pin-btn`;
    pinBtn.setAttribute('type', 'button');
    pinBtn.setAttribute('aria-label', a.pinButtonLabel(this.column.name));
    pinBtn.setAttribute('title', a.pinColumnTitle);
    pinBtn.innerHTML = `
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="4.5" r="2.5" />
        <rect x="7.25" y="6.5" width="1.5" height="7" rx="0.75" />
      </svg>
    `;

    // Hide button (eye-slash icon)
    const hideBtn = document.createElement('button');
    hideBtn.className = `${p}-col-action-btn ${p}-col-hide-btn`;
    hideBtn.setAttribute('type', 'button');
    hideBtn.setAttribute('aria-label', a.hideButtonLabel(this.column.name));
    hideBtn.setAttribute('title', a.hideColumnTitle);
    hideBtn.innerHTML = `
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M2 8s2.5-4.5 6-4.5S14 8 14 8s-2.5 4.5-6 4.5S2 8 2 8z" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
        <line x1="3.5" y1="12.5" x2="12.5" y2="3.5" fill="none" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    `;

    // Filter button (funnel icon)
    const filterBtn = document.createElement('button');
    filterBtn.className = `${p}-col-action-btn ${p}-col-filter-btn`;
    filterBtn.setAttribute('type', 'button');
    filterBtn.setAttribute('aria-label', a.filterButtonLabel(this.column.name));
    filterBtn.setAttribute('title', a.filterColumnTitle);
    filterBtn.innerHTML = `
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 3h12L9.5 8.5v4L6.5 14V8.5L2 3z" />
      </svg>
    `;

    // Sort button with SVG arrows
    const sortBtn = document.createElement('button');
    sortBtn.className = `${p}-col-sort-btn`;
    sortBtn.setAttribute('type', 'button');
    sortBtn.setAttribute('aria-label', a.sortButtonLabel(this.column.name));
    sortBtn.setAttribute('title', a.sortAscendingTitle);
    sortBtn.innerHTML = `
      <svg viewBox="0 0 10 14" aria-hidden="true">
        <path d="M5 0 L10 5 L0 5 Z" class="arrow-up" />
        <path d="M5 14 L10 9 L0 9 Z" class="arrow-down" />
      </svg>
    `;

    // Sort badge for multi-sort (inside button, positioned absolutely)
    const sortBadge = document.createElement('span');
    sortBadge.className = `${p}-col-sort-badge`;
    sortBadge.style.display = 'none';
    sortBtn.appendChild(sortBadge);

    // Drag handle
    const dragHandle = document.createElement('button');
    dragHandle.className = `${p}-col-drag-handle`;
    dragHandle.setAttribute('type', 'button');
    dragHandle.setAttribute('aria-label', a.dragHandleLabel(this.column.name));
    dragHandle.setAttribute('title', a.dragHandleTitle);
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

    for (const btn of [pinBtn, hideBtn, filterBtn, sortBtn, dragHandle]) {
      btn.setAttribute('tabindex', '-1');
    }
    this.actionPanel.append(pinBtn, hideBtn, filterBtn, sortBtn, dragHandle);

    // Only the sort button sorts, NOT the whole header: a resize handle's
    // release would trigger it otherwise.
    sortBtn.addEventListener('click', this.handleSortClick);
    pinBtn.addEventListener('click', this.handlePinClick);
    hideBtn.addEventListener('click', this.handleHideClick);
    filterBtn.addEventListener('click', this.handleFilterClick);

    // Create resizer for column width adjustment
    const resizer = new ColumnResizer(
      this.element,
      (width) => this.actions.setColumnWidth(this.column.name, width),
      () => this.actions.resetColumnWidth(this.column.name),
      () => this.getColumnCells(),
      {
        classPrefix: p,
        onDragStart: () => {
          this.actions.beginColumnWidthChange();
          this.releaseResizeHold?.();
          this.releaseResizeHold = this.options.holdColumn?.(this.column.name) ?? null;
        },
        onDragEnd: () => {
          this.actions.endColumnWidthChange();
          // Announced once at drag end, not on every mousemove — a live
          // region fired at pointer rate is noise, not information.
          this.options.announce?.(
            this.messages.a11y.columnWidthAnnouncement(this.column.name, this.getWidth()),
          );
          this.releaseResizeHold?.();
          this.releaseResizeHold = null;
        },
        messages: this.messages,
      },
    );

    this.controls = {
      pinButton: pinBtn,
      hideButton: hideBtn,
      filterButton: filterBtn,
      sortButton: sortBtn,
      sortBadge,
      dragHandle,
      resizer,
    };
    this.update();
    this.updateFilterIndicator();
    this.updatePinState();
    this.updateHideButtonState(this.state.visibleColumns.get());
    resizer.setActive(this.layoutMode);
  }

  /** Take the controls down, leaving a shell. */
  private unmountControls(): void {
    const controls = this.controls;
    if (!controls) return;
    this.controls = null;
    // Ends a resize drag as its release would. The column window controller
    // holds a column while its drag runs, so only destroy() gets here then.
    controls.resizer.detach();
    controls.sortButton.removeEventListener('click', this.handleSortClick);
    controls.pinButton.removeEventListener('click', this.handlePinClick);
    controls.hideButton.removeEventListener('click', this.handleHideClick);
    controls.filterButton.removeEventListener('click', this.handleFilterClick);
    this.actionPanel.replaceChildren();
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
    // The controls' own listeners come and go with them (see mountControls).

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
    this.options.onFilterClick?.(this.column.name, event.currentTarget as HTMLElement);
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

    // Subscribe to visible columns to disable hide button when only one column visible
    const unsubVisible = this.state.visibleColumns.subscribe((visible) => {
      if (!this.destroyed) {
        this.updateHideButtonState(visible);
      }
    });
    this.unsubscribes.push(unsubVisible);

    // Set initial filter indicator state
    this.updateFilterIndicator();

    // Set initial pin state
    this.updatePinState();

    // Set initial hide button state
    this.updateHideButtonState(this.state.visibleColumns.get());

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
    this.controls?.filterButton.classList.toggle(
      `${this.classPrefix}-col-action-btn--active`,
      hasFilter,
    );

    // Update aria-label to reflect current sort/filter state
    this.element.setAttribute('aria-label', this.buildAriaLabel());
  }

  /**
   * Update pin button active state based on pinned columns
   */
  private updatePinState(): void {
    const controls = this.controls;
    if (!controls) return;
    const isPinned = this.state.pinnedColumns.get().includes(this.column.name);
    controls.pinButton.classList.toggle(`${this.classPrefix}-col-action-btn--active`, isPinned);
    controls.pinButton.setAttribute(
      'title',
      isPinned ? this.messages.a11y.unpinColumnTitle : this.messages.a11y.pinColumnTitle,
    );
    controls.pinButton.setAttribute(
      'aria-label',
      isPinned
        ? this.messages.a11y.unpinButtonLabel(this.column.name)
        : this.messages.a11y.pinButtonLabel(this.column.name),
    );

    // Disable drag-to-reorder for pinned columns
    controls.dragHandle.classList.toggle(`${this.classPrefix}-col-drag-handle--disabled`, isPinned);
    controls.dragHandle.setAttribute('aria-disabled', String(isPinned));
  }

  /**
   * Update hide button disabled state when only one column is visible
   */
  private updateHideButtonState(visibleColumns: string[]): void {
    const hideButton = this.controls?.hideButton;
    if (!hideButton) return;
    const isLastColumn = visibleColumns.length <= 1;
    if (isLastColumn) {
      hideButton.setAttribute('disabled', '');
      hideButton.setAttribute('title', this.messages.a11y.cannotHideLastColumn);
      hideButton.classList.add(`${this.classPrefix}-col-action-btn--disabled`);
    } else {
      hideButton.removeAttribute('disabled');
      hideButton.setAttribute('title', this.messages.a11y.hideColumnTitle);
      hideButton.classList.remove(`${this.classPrefix}-col-action-btn--disabled`);
    }
  }

  /**
   * Get all cells in this column for transition animations
   */
  private getColumnCells(): HTMLElement[] {
    const root = this.element.closest(`.${this.classPrefix}-root`);
    if (!root) return [];

    // By `data-column`, not by position: a cell's index in its row is not a
    // column identity. Compared as an attribute rather than interpolated
    // into the selector, so a column name needs no escaping.
    const cells = root.querySelectorAll<HTMLElement>(
      `.${this.classPrefix}-row > .${this.classPrefix}-cell[data-column]`,
    );
    return Array.from(cells).filter(
      (cell) => cell.getAttribute('data-column') === this.column.name,
    );
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
    const sortConfig = sortIndex === -1 ? null : sortColumns[sortIndex]!;
    const isAsc = sortConfig?.direction === 'asc';
    this.element.setAttribute(
      'aria-sort',
      sortConfig ? (isAsc ? 'ascending' : 'descending') : 'none',
    );

    const controls = this.controls;
    if (controls) {
      const { sortButton, sortBadge } = controls;
      // Remove existing state classes
      sortButton.classList.remove(
        `${this.classPrefix}-col-sort-btn--asc`,
        `${this.classPrefix}-col-sort-btn--desc`,
      );
      if (!sortConfig) {
        // Not sorted - hide badge
        sortBadge.style.display = 'none';
        sortButton.setAttribute('title', this.messages.a11y.sortAscendingTitle);
      } else {
        // Add appropriate class for arrow styling
        sortButton.classList.add(`${this.classPrefix}-col-sort-btn--${isAsc ? 'asc' : 'desc'}`);

        // For multi-sort, show position badge
        if (sortColumns.length > 1) {
          sortBadge.textContent = String(sortIndex + 1);
          sortBadge.style.display = '';
        } else {
          sortBadge.style.display = 'none';
        }

        sortButton.setAttribute(
          'title',
          isAsc ? this.messages.a11y.sortDescendingTitle : this.messages.a11y.sortRemoveTitle,
        );
      }
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
    this.layoutMode = active;
    this.element.classList.toggle(`${this.classPrefix}-col-header--layout`, active);
    this.controls?.resizer.setActive(active);
  }

  /**
   * Build the header's controls, or take them down to leave a shell.
   *
   * `TableContainer` builds them for the columns its column window controller
   * mounts, which the body renders cells for, and takes them from the rest. A
   * shell keeps everything but the pin, hide, filter and sort buttons and the
   * drag and resize handles. The controller keeps a column mounted while
   * anything uses those: DOM focus on one, the cursor, a resize or reorder
   * drag, an open panel.
   *
   * @internal
   */
  setControlsMounted(mounted: boolean): void {
    if (this.destroyed) return;
    if (mounted) this.mountControls();
    else this.unmountControls();
  }

  /**
   * Whether the controls are built (see {@link ColumnHeader.setControlsMounted}).
   *
   * @internal
   */
  hasControls(): boolean {
    return this.controls !== null;
  }

  /**
   * The current width of this column, in pixels.
   *
   * Reads `columnWidths` rather than the element, so it reports the state the
   * next resize step will build on even before layout has flushed. Resolved
   * the way the renderer resolves it: rounded to a whole pixel, and 150px when
   * the column has never been sized or its stored width is not a finite,
   * non-negative number.
   */
  getWidth(): number {
    return resolveColumnWidth(this.state.columnWidths.get().get(this.column.name));
  }

  /**
   * The clamp bounds a width change is held to: 50 / 500, the range the
   * resize handle drags within.
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
    return { min: MIN_COLUMN_WIDTH, max: MAX_COLUMN_WIDTH };
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
    const controls = this.controls;
    const candidates: (HTMLElement | null)[] = [
      this.derivedIconBtn,
      this.nameEl.hasAttribute('tabindex') ? this.nameEl : null,
      controls?.pinButton ?? null,
      controls?.hideButton ?? null,
      controls?.filterButton ?? null,
      controls?.sortButton ?? null,
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

    // Detach the resizer and the controls' listeners
    this.unmountControls();

    // Remove event listeners
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
