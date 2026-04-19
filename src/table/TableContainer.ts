/**
 * TableContainer - Main container component for the data table
 *
 * Manages the overall DOM structure including:
 * - Header row container (for column headers)
 * - Body container (for data rows with virtual scrolling)
 * - Resize observer for responsive behavior
 */

import type { TableState } from '../core/State';
import type { StateActions } from '../core/Actions';
import type { WorkerBridge } from '../data/WorkerBridge';
import { ColumnHeader } from './ColumnHeader';
import { ColumnReorder } from './ColumnReorder';
import { TableBody } from './TableBody';
import { FilterBar } from '../filters/FilterBar';
import { FilterPanel } from '../filters/FilterPanel';
import { HiddenColumnsGutter } from './HiddenColumnsGutter';
import { DerivedColumnEditPanel } from '../derived/DerivedColumnEditPanel';
import { DerivedColumnModal } from '../derived/DerivedColumnModal';
import { AddColumnButton } from '../derived/AddColumnButton';
import type { ExpressionEditorFactory } from '../derived/ExpressionEditorTypes';
import { SQLFilterModal } from '../filters/SQLFilterModal';
import { FilterPresetPanel } from '../filters/FilterPresetPanel';
import type { FilterPresetManager } from '../filters/FilterPresets';
import { KeyboardNavigator } from './KeyboardNavigator';
import { nextInstanceId } from '../core/instanceId';

/**
 * Screen-reader live-region string templates. Extracted as a single object
 * so Phase 8 (i18n) can swap it for a user-supplied function without
 * touching the announcement logic itself.
 */
const LIVE_REGION_STRINGS = {
  filtersActive: (n: number, shown: number, total: number): string =>
    `${n} ${n === 1 ? 'filter' : 'filters'} active, showing ${shown.toLocaleString()} of ${total.toLocaleString()} rows`,
  noFilters: (total: number): string =>
    `Showing all ${total.toLocaleString()} rows`,
  sortedBy: (descriptions: string[]): string =>
    `sorted by ${descriptions.join(', then ')}`,
  ascending: 'ascending',
  descending: 'descending',
};

/**
 * Light/dark theme selector accepted by {@link TableContainerOptions.colorScheme}
 * and {@link TableContainer.setColorScheme}.
 */
export type ContainerColorScheme = 'light' | 'dark' | 'auto';

/**
 * Options for configuring the TableContainer
 */
export interface TableContainerOptions {
  /** Fixed row height in pixels (default: 32) */
  rowHeight?: number;
  /** Fixed header height in pixels (default: 120 for visualizations) */
  headerHeight?: number;
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string;
  /**
   * Unique per-instance identifier mixed into modal element IDs so two
   * tables on the same page don't collide on `aria-labelledby` targets.
   * Auto-generated if omitted.
   */
  instanceId?: string;
  /** Show filter bar between header and body (default: true) */
  showFilterBar?: boolean;
  /** Called when a filter is removed via filter chip, for clearing visualization state */
  onFilterRemove?: (column: string) => void;
  /** Custom expression editor factory for derived column panel/modal */
  editorFactory?: ExpressionEditorFactory;
  /** Show "+" add column button at right edge (default: true) */
  showAddColumnButton?: boolean;
  /** Show "Expression" filter button in filter bar for SQL WHERE conditions (default: true) */
  showExpressionFilter?: boolean;
  /** FilterPresetManager instance — enables the Presets button and preset panel */
  presetManager?: FilterPresetManager;
  /**
   * Where to mount fixed-position modals (derived column editor, SQL filter
   * modal). Defaults to `document.body`. Pass your app's modal root container
   * to keep the library's modals inside your stacking/portal hierarchy instead
   * of at the top of the document.
   */
  portalTarget?: HTMLElement;
  /**
   * Initial light/dark theme. `'auto'` (default) follows the OS
   * `prefers-color-scheme`; `'light'` / `'dark'` force the theme by writing
   * `data-dt-color-scheme` onto the root element.
   */
  colorScheme?: ContainerColorScheme;
}

/**
 * Resize callback type
 */
export type ResizeCallback = (dimensions: { width: number; height: number }) => void;

/**
 * TableContainer manages the DOM structure and lifecycle for the data table.
 *
 * @example
 * ```typescript
 * const container = document.getElementById('my-table');
 * const state = createTableState();
 * const table = new TableContainer(container, state);
 *
 * // Later, clean up
 * table.destroy();
 * ```
 */
export class TableContainer {
  private element: HTMLElement;
  private headerArea: HTMLElement;
  private headerScroll: HTMLElement;
  private scrollbarGutter: HTMLElement;
  private headerRow: HTMLElement;
  private bodyScroll: HTMLElement;
  private bodyContainer: HTMLElement;
  private resizeObserver: ResizeObserver;
  private unsubscribes: (() => void)[] = [];
  private destroyed = false;
  private resizeCallbacks: Set<ResizeCallback> = new Set();
  private currentDimensions: { width: number; height: number } = { width: 0, height: 0 };
  private columnHeaders: ColumnHeader[] = [];
  private tableBody: TableBody | null = null;
  private columnReorder: ColumnReorder | null = null;
  private filterBar: FilterBar | null = null;
  private filterPanel: FilterPanel | null = null;
  private derivedEditPanel: DerivedColumnEditPanel | null = null;
  private derivedModal: DerivedColumnModal | null = null;
  private sqlFilterModal: SQLFilterModal | null = null;
  private presetPanel: FilterPresetPanel | null = null;
  private addColumnButton: AddColumnButton | null = null;
  private wrapperElement: HTMLElement | null = null;
  private hiddenColumnsGutter: HiddenColumnsGutter | null = null;

  // FLIP animation: saved column positions before pin/unpin reorder
  private savedColumnPositions: Map<string, DOMRect> | null = null;

  // Track previous visible columns for restore-highlight detection
  private previousVisibleColumns: Set<string> = new Set();

  // Continuous demarcation line for pinned column boundary
  private pinnedDemarcation: HTMLElement | null = null;

  // Keyboard navigation / shortcuts
  private keyboardNavigator: KeyboardNavigator | null = null;

  // Scroll synchronization handlers
  private boundBodyScrollHandler: (() => void) | null = null;
  private boundHeaderScrollHandler: (() => void) | null = null;

  // Suppress header→body scroll sync during programmatic smooth scrolling
  private suppressReverseScrollSync = false;

  // ARIA live region for screen reader announcements
  private liveRegion: HTMLElement | null = null;
  private pendingLiveUpdate = false;

  // Resolved options with defaults applied
  private readonly resolvedOptions: Required<TableContainerOptions>;

  constructor(
    private container: HTMLElement,
    private state: TableState,
    private actions?: StateActions,
    private bridge?: WorkerBridge,
    options: TableContainerOptions = {}
  ) {
    // Apply defaults
    this.resolvedOptions = {
      rowHeight: 32,
      headerHeight: 120,
      classPrefix: 'dt',
      instanceId: '',
      showFilterBar: true,
      onFilterRemove: undefined as unknown as (column: string) => void,
      editorFactory: undefined as unknown as ExpressionEditorFactory,
      showAddColumnButton: true,
      showExpressionFilter: true,
      presetManager: undefined as unknown as FilterPresetManager,
      portalTarget: undefined as unknown as HTMLElement,
      colorScheme: 'auto',
      ...options,
    };
    if (!this.resolvedOptions.instanceId) {
      this.resolvedOptions.instanceId = nextInstanceId();
    }

    // Create DOM structure
    this.element = this.createRootElement();
    this.headerArea = this.createHeaderArea();
    this.headerScroll = this.createHeaderScroll();
    this.scrollbarGutter = this.createScrollbarGutter();
    this.headerRow = this.createHeaderRow();
    this.bodyScroll = this.createBodyScroll();
    this.bodyContainer = this.createBodyContainer();

    // Assemble structure:
    // root > headerArea > (headerScroll > headerRow) + scrollbarGutter
    //      > bodyScroll > bodyContainer
    this.headerScroll.appendChild(this.headerRow);
    this.headerArea.appendChild(this.headerScroll);
    this.headerArea.appendChild(this.scrollbarGutter);
    this.bodyScroll.appendChild(this.bodyContainer);
    this.element.appendChild(this.headerArea);

    // Create filter bar between header and body
    if (this.resolvedOptions.showFilterBar && this.actions) {
      this.filterBar = new FilterBar(this.state, this.actions, {
        classPrefix: this.resolvedOptions.classPrefix,
        onFilterRemove: this.resolvedOptions.onFilterRemove,
        alwaysShow: this.resolvedOptions.showExpressionFilter !== false || !!this.resolvedOptions.presetManager,
        onAddSQLFilter: this.resolvedOptions.showExpressionFilter !== false
          ? () => this.openSQLFilterModal()
          : undefined,
        onRawSQLEdit: (id: string) => this.openSQLFilterModalForEdit(id),
        onPresetsClick: this.resolvedOptions.presetManager
          ? () => this.handlePresetsClick()
          : undefined,
      });
      this.element.appendChild(this.filterBar.getElement());
    }

    this.element.appendChild(this.bodyScroll);

    // Create aria-live region for screen reader announcements
    this.liveRegion = document.createElement('div');
    this.liveRegion.setAttribute('role', 'status');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');
    this.liveRegion.className = `${this.resolvedOptions.classPrefix}-sr-only`;
    this.element.appendChild(this.liveRegion);

    // Create hidden columns gutter after body
    if (this.actions) {
      this.hiddenColumnsGutter = new HiddenColumnsGutter(this.state, this.actions, {
        classPrefix: this.resolvedOptions.classPrefix,
      });
      this.element.appendChild(this.hiddenColumnsGutter.getElement());
    }

    // Create add column button in a flex wrapper alongside the table
    if (this.resolvedOptions.showAddColumnButton !== false && this.actions) {
      this.addColumnButton = new AddColumnButton({
        classPrefix: this.resolvedOptions.classPrefix,
        onClick: () => this.handleAddColumnClick(),
      });

      this.wrapperElement = document.createElement('div');
      this.wrapperElement.className = `${this.resolvedOptions.classPrefix}-table-wrapper`;
      // Mirror the color-scheme attribute onto the wrapper so the add-column
      // button (a sibling of `.dt-root`) inherits the attribute-scoped vars.
      this.applyColorSchemeAttribute(
        this.wrapperElement,
        this.resolvedOptions.colorScheme,
      );
      this.wrapperElement.appendChild(this.element);
      this.wrapperElement.appendChild(this.addColumnButton.getElement());
      this.container.appendChild(this.wrapperElement);
    } else {
      this.container.appendChild(this.element);
    }

    // Set up resize observer
    this.resizeObserver = this.setupResizeObserver();

    // Subscribe to state changes
    this.subscribeToState();

    // Create column reorder handler
    if (this.actions) {
      this.columnReorder = new ColumnReorder(
        this.headerRow,
        (newOrder) => this.actions?.setColumnOrder(newOrder),
        { classPrefix: this.resolvedOptions.classPrefix }
      );
    }

    // Set up scroll synchronization between header and body
    this.setupScrollSync();

    // Install keyboard navigation + shortcuts on the grid root
    if (this.actions) {
      this.keyboardNavigator = new KeyboardNavigator({
        rootElement: this.element,
        bodyScroll: this.bodyScroll,
        state: this.state,
        actions: this.actions,
        getTableBody: () => this.tableBody,
        getBridge: () => this.bridge,
      });
    }

    // Initial render
    this.render();
  }

  // =========================================
  // DOM Creation Methods
  // =========================================

  /**
   * Create the root container element
   */
  private createRootElement(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-root`;
    // role="table" — valid ARIA for a data-table wrapper that also hosts
    // sibling chrome (toolbar filter bar, status live region, toolbar hidden-
    // columns gutter). Using role="grid" would require all owned children to
    // be role="row"/"rowgroup"; restructuring the DOM to host chrome outside
    // the grid is deferred. Interactive cell navigation (arrow keys, roving
    // tabindex, Enter row-select) still works under role="table".
    el.setAttribute('role', 'table');
    el.setAttribute('aria-label', 'Data table');
    el.setAttribute('aria-rowcount', '0');
    el.setAttribute('aria-colcount', '0');
    el.setAttribute('tabindex', '0');
    this.applyColorSchemeAttribute(el, this.resolvedOptions.colorScheme);
    return el;
  }

  /**
   * Write (or clear) the `data-dt-color-scheme` attribute for a given scheme.
   * `'auto'` removes the attribute so CSS `prefers-color-scheme` governs;
   * `'light'` / `'dark'` set it to force the theme regardless of OS preference.
   */
  private applyColorSchemeAttribute(el: HTMLElement, scheme: ContainerColorScheme): void {
    if (scheme === 'auto') {
      el.removeAttribute('data-dt-color-scheme');
    } else {
      el.setAttribute('data-dt-color-scheme', scheme);
    }
  }

  /**
   * Apply the color-scheme attribute to `.dt-root` and, when present, the
   * flex wrapper that hosts the add-column button as a sibling. The wrapper
   * copy exists so the `+` button inherits the attribute-scoped CSS
   * variables — without it the sibling stays on the light defaults.
   */
  private applyColorSchemeToTargets(scheme: ContainerColorScheme): void {
    this.applyColorSchemeAttribute(this.element, scheme);
    if (this.wrapperElement) {
      this.applyColorSchemeAttribute(this.wrapperElement, scheme);
    }
  }

  /**
   * Switch the light/dark theme for this container at runtime. Updates the
   * `data-dt-color-scheme` attribute on the root element; open body-portalled
   * modals observe the attribute via MutationObserver (installed by ModalHost
   * when they were opened) and re-sync automatically.
   */
  setColorScheme(scheme: ContainerColorScheme): void {
    if (this.destroyed) return;
    this.resolvedOptions.colorScheme = scheme;
    this.applyColorSchemeToTargets(scheme);
  }

  /** Returns the currently-applied color scheme. */
  getColorScheme(): ContainerColorScheme {
    return this.resolvedOptions.colorScheme;
  }

  /**
   * Create the header area container (holds header scroll + scrollbar gutter)
   */
  private createHeaderArea(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-header-area`;
    return el;
  }

  /**
   * Create the header scroll container (hidden scrollbar, synced with body)
   */
  private createHeaderScroll(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-header-scroll`;
    return el;
  }

  /**
   * Create the scrollbar gutter (aligns with body's vertical scrollbar)
   */
  private createScrollbarGutter(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-scrollbar-gutter`;
    return el;
  }

  /**
   * Create the header row container
   */
  private createHeaderRow(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-header`;
    // role="rowgroup" wraps the real row (class "dt-header-row") created
    // during render(). That inner element carries role="row" and the
    // columnheader cells — the ARIA tree ends up grid > rowgroup > row >
    // columnheader, which satisfies aria-required-children / -parent.
    el.setAttribute('role', 'rowgroup');
    el.style.minHeight = `${this.resolvedOptions.headerHeight}px`;
    return el;
  }

  /**
   * Create the body scroll container (handles both horizontal and vertical scrolling)
   */
  private createBodyScroll(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-body-scroll`;
    return el;
  }

  /**
   * Create the body container for data rows
   */
  private createBodyContainer(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-body`;
    el.setAttribute('role', 'rowgroup');
    return el;
  }

  // =========================================
  // Resize Handling
  // =========================================

  /**
   * Set up ResizeObserver to track container size changes
   */
  private setupResizeObserver(): ResizeObserver {
    const observer = new ResizeObserver((entries) => {
      this.handleResize(entries);
    });

    observer.observe(this.element);
    return observer;
  }

  /**
   * Handle resize events
   */
  private handleResize(entries: ResizeObserverEntry[]): void {
    if (this.destroyed) return;

    for (const entry of entries) {
      const { width, height } = entry.contentRect;

      // Only notify if dimensions actually changed
      if (width !== this.currentDimensions.width || height !== this.currentDimensions.height) {
        this.currentDimensions = { width, height };

        // Notify all resize callbacks
        for (const callback of this.resizeCallbacks) {
          callback(this.currentDimensions);
        }
      }
    }
  }

  /**
   * Subscribe to resize events
   *
   * @param callback - Function to call when container resizes
   * @returns Unsubscribe function
   */
  onResize(callback: ResizeCallback): () => void {
    this.resizeCallbacks.add(callback);

    // Immediately call with current dimensions
    if (this.currentDimensions.width > 0 || this.currentDimensions.height > 0) {
      callback(this.currentDimensions);
    }

    return () => {
      this.resizeCallbacks.delete(callback);
    };
  }

  // =========================================
  // Scroll Synchronization
  // =========================================

  /**
   * Set up bidirectional scroll synchronization between header and body
   *
   * This ensures the header stays aligned with the body when scrolling horizontally.
   * Uses a flag to prevent infinite scroll loops.
   */
  private setupScrollSync(): void {
    let isScrolling = false;

    this.boundBodyScrollHandler = () => {
      if (isScrolling) return;
      isScrolling = true;
      this.headerScroll.scrollLeft = this.bodyScroll.scrollLeft;
      isScrolling = false;
    };

    this.boundHeaderScrollHandler = () => {
      if (isScrolling || this.suppressReverseScrollSync) return;
      isScrolling = true;
      this.bodyScroll.scrollLeft = this.headerScroll.scrollLeft;
      isScrolling = false;
    };

    this.bodyScroll.addEventListener('scroll', this.boundBodyScrollHandler, { passive: true });
    this.headerScroll.addEventListener('scroll', this.boundHeaderScrollHandler, { passive: true });
  }

  // =========================================
  // ARIA Live Region
  // =========================================

  /**
   * Schedule a live region update, coalescing rapid-fire signal changes
   * into a single announcement per animation frame.
   */
  private scheduleLiveRegionUpdate(): void {
    if (this.pendingLiveUpdate) return;
    this.pendingLiveUpdate = true;
    requestAnimationFrame(() => {
      this.pendingLiveUpdate = false;
      if (!this.destroyed) {
        this.updateLiveRegion();
      }
    });
  }

  /**
   * Update the aria-live region text to announce current table state.
   */
  private updateLiveRegion(): void {
    if (!this.liveRegion) return;

    const filters = this.state.filters.get();
    const totalRows = this.state.totalRows.get();
    const filteredRows = this.state.filteredRows.get();
    const sortColumns = this.state.sortColumns.get();

    const parts: string[] = [];

    if (filters.length > 0) {
      parts.push(LIVE_REGION_STRINGS.filtersActive(filters.length, filteredRows, totalRows));
    } else {
      parts.push(LIVE_REGION_STRINGS.noFilters(totalRows));
    }

    if (sortColumns.length > 0) {
      const sortDescriptions = sortColumns.map(
        (s) => `${s.column} ${s.direction === 'asc' ? LIVE_REGION_STRINGS.ascending : LIVE_REGION_STRINGS.descending}`
      );
      parts.push(LIVE_REGION_STRINGS.sortedBy(sortDescriptions));
    }

    this.liveRegion.textContent = parts.join(', ');
  }

  // =========================================
  // State Subscriptions
  // =========================================

  /**
   * Subscribe to relevant state changes
   */
  private subscribeToState(): void {
    // Subscribe to schema changes to update header structure
    const unsubSchema = this.state.schema.subscribe(() => {
      if (!this.destroyed) {
        // Close modals that live on document.body — render() won't reach them
        if (this.derivedModal) {
          this.derivedModal.close();
        }
        if (this.sqlFilterModal?.getIsOpen()) {
          this.sqlFilterModal.close();
        }
        this.render();
      }
    });
    this.unsubscribes.push(unsubSchema);

    // Subscribe to visible columns changes
    const unsubVisible = this.state.visibleColumns.subscribe(() => {
      if (!this.destroyed) {
        this.render();
      }
    });
    this.unsubscribes.push(unsubVisible);

    // Subscribe to column widths for sizing updates
    // NOTE: We call updateColumnWidths() instead of render() to avoid
    // destroying ColumnHeaders mid-drag (which would kill the resize operation)
    const unsubWidths = this.state.columnWidths.subscribe(() => {
      if (!this.destroyed) {
        this.updateColumnWidths();
      }
    });
    this.unsubscribes.push(unsubWidths);

    // Subscribe to sort columns for sort indicator updates
    // (ColumnHeaders subscribe individually, but this ensures render is called)
    const unsubSort = this.state.sortColumns.subscribe(() => {
      if (!this.destroyed) {
        // Individual column headers will update their own sort indicators
        // No need to full re-render here
      }
    });
    this.unsubscribes.push(unsubSort);

    // Subscribe to pinned columns for sticky positioning updates
    // This fires before visibleColumns (which triggers render()),
    // so we capture header positions here for FLIP animation.
    const unsubPinned = this.state.pinnedColumns.subscribe(() => {
      if (!this.destroyed) {
        // Capture current header positions for FLIP animation
        if (this.columnHeaders.length > 0) {
          this.savedColumnPositions = new Map();
          for (const header of this.columnHeaders) {
            this.savedColumnPositions.set(
              header.getColumn().name,
              header.getElement().getBoundingClientRect()
            );
          }
        }
        this.updatePinnedColumnStyles();
      }
    });
    this.unsubscribes.push(unsubPinned);

    // Update aria-rowcount when total rows change
    const unsubAriaRows = this.state.totalRows.subscribe((total) => {
      if (!this.destroyed) {
        this.element.setAttribute('aria-rowcount', String(total));
      }
    });
    this.unsubscribes.push(unsubAriaRows);

    // Update aria-colcount when schema changes
    const unsubAriaCols = this.state.schema.subscribe((schema) => {
      if (!this.destroyed) {
        this.element.setAttribute('aria-colcount', String(schema.length));
      }
    });
    this.unsubscribes.push(unsubAriaCols);

    // Update live region on filter/sort/filteredRows changes
    const unsubLiveFilters = this.state.filters.subscribe(() => {
      if (!this.destroyed) this.scheduleLiveRegionUpdate();
    });
    this.unsubscribes.push(unsubLiveFilters);

    const unsubLiveFilteredRows = this.state.filteredRows.subscribe(() => {
      if (!this.destroyed) this.scheduleLiveRegionUpdate();
    });
    this.unsubscribes.push(unsubLiveFilteredRows);

    const unsubLiveSort = this.state.sortColumns.subscribe(() => {
      if (!this.destroyed) this.scheduleLiveRegionUpdate();
    });
    this.unsubscribes.push(unsubLiveSort);

    // Clamp focused cell when row count shrinks
    const unsubFocusClamp = this.state.filteredRows.subscribe(() => {
      if (this.destroyed) return;
      const focusedCell = this.state.focusedCell.get();
      if (!focusedCell) return;
      const rowCount =
        this.state.filters.get().length > 0
          ? this.state.filteredRows.get()
          : this.state.totalRows.get();
      if (focusedCell.row >= rowCount) {
        if (rowCount === 0) {
          this.actions?.clearFocusedCell();
        } else {
          this.actions?.setFocusedCell({
            row: rowCount - 1,
            column: focusedCell.column,
          });
        }
      }
    });
    this.unsubscribes.push(unsubFocusClamp);

    // Snap focus to first visible column if focused column is hidden
    const unsubFocusCol = this.state.visibleColumns.subscribe((cols) => {
      if (this.destroyed) return;
      const focusedCell = this.state.focusedCell.get();
      if (!focusedCell) return;
      if (!cols.includes(focusedCell.column)) {
        if (cols.length === 0) {
          this.actions?.clearFocusedCell();
        } else {
          this.actions?.setFocusedCell({
            row: focusedCell.row,
            column: cols[0],
          });
        }
      }
    });
    this.unsubscribes.push(unsubFocusCol);
  }

  // =========================================
  // Public API
  // =========================================

  /**
   * Destroy all existing column headers
   */
  private destroyColumnHeaders(): void {
    for (const header of this.columnHeaders) {
      header.destroy();
    }
    this.columnHeaders = [];
  }

  /**
   * Update column widths without re-rendering
   *
   * This is called when columnWidths state changes. We update styles in-place
   * rather than calling render() to avoid destroying ColumnHeaders mid-drag
   * (which would kill any active resize operation).
   */
  private updateColumnWidths(): void {
    const columnWidths = this.state.columnWidths.get();

    // Update header widths
    for (const header of this.columnHeaders) {
      const col = header.getColumn();
      const width = columnWidths.get(col.name) ?? 150;
      header.getElement().style.width = `${width}px`;
    }
  }

  /**
   * Update sticky positioning for pinned columns (freeze pane effect)
   *
   * Applies position:sticky and computed left offsets to both header and body
   * cells for pinned columns. Called after render and when pinned/width state changes.
   */
  private updatePinnedColumnStyles(): void {
    const pinnedColumns = this.state.pinnedColumns.get();
    const visibleColumns = this.state.visibleColumns.get();
    const columnWidths = this.state.columnWidths.get();
    const prefix = this.resolvedOptions.classPrefix;

    const baseZ = Number(
      getComputedStyle(this.element).getPropertyValue('--dt-z-pinned-col').trim()
    ) || 20;

    // Compute cumulative left offsets for pinned columns
    const pinnedOffsets = new Map<string, { left: number; zIndex: number }>();
    let cumulativeLeft = 0;

    for (let i = 0; i < pinnedColumns.length; i++) {
      const colName = pinnedColumns[i];
      pinnedOffsets.set(colName, {
        left: cumulativeLeft,
        zIndex: baseZ + (pinnedColumns.length - i),
      });
      const width = columnWidths.get(colName) ?? 150;
      cumulativeLeft += width;
    }

    // Apply to header elements
    for (const header of this.columnHeaders) {
      const colName = header.getColumn().name;
      const el = header.getElement();
      const offset = pinnedOffsets.get(colName);

      if (offset) {
        el.style.position = 'sticky';
        el.style.left = `${offset.left}px`;
        el.style.zIndex = String(offset.zIndex);
        el.classList.add(`${prefix}-col-header--pinned`);
      } else {
        el.style.position = '';
        el.style.left = '';
        el.style.zIndex = '';
        el.classList.remove(`${prefix}-col-header--pinned`);
      }
    }

    // Apply to body cells
    const bodyContainer = this.bodyContainer;
    const rows = bodyContainer.querySelectorAll(`.${prefix}-row`);
    for (const row of rows) {
      const cells = row.children;
      for (let i = 0; i < visibleColumns.length && i < cells.length; i++) {
        const colName = visibleColumns[i];
        const cell = cells[i] as HTMLElement;
        const offset = pinnedOffsets.get(colName);

        if (offset) {
          cell.style.position = 'sticky';
          cell.style.left = `${offset.left}px`;
          cell.style.zIndex = String(offset.zIndex);
          cell.classList.add(`${prefix}-cell--pinned`);
        } else {
          cell.style.position = '';
          cell.style.left = '';
          cell.style.zIndex = '';
          cell.classList.remove(`${prefix}-cell--pinned`);
        }
      }
    }

    // Manage the continuous demarcation line overlay
    if (pinnedColumns.length > 0) {
      if (!this.pinnedDemarcation) {
        this.pinnedDemarcation = document.createElement('div');
        this.pinnedDemarcation.className = `${prefix}-pinned-demarcation`;
        this.element.appendChild(this.pinnedDemarcation);
      }
      this.pinnedDemarcation.style.left = `${cumulativeLeft}px`;
      this.pinnedDemarcation.style.display = '';
    } else if (this.pinnedDemarcation) {
      this.pinnedDemarcation.style.display = 'none';
    }
  }

  /**
   * Render the table container
   *
   * Creates ColumnHeader components for each visible column and renders
   * placeholder content for the body (to be implemented in Task 3.4).
   */
  render(): void {
    if (this.destroyed) return;

    const prevVisible = this.previousVisibleColumns;

    // Save scroll positions before re-rendering (both containers for robustness)
    const savedBodyScrollLeft = this.bodyScroll.scrollLeft;
    const savedBodyScrollTop = this.bodyScroll.scrollTop;
    const savedHeaderScrollLeft = this.headerScroll.scrollLeft;

    // Track whether focus is within the table before render destroys DOM elements.
    // Actions like pin/hide remove the focused button, causing focus to fall to document.body.
    const hadFocus = this.element.contains(document.activeElement);

    const schema = this.state.schema.get();
    const visibleColumns = this.state.visibleColumns.get();
    const tableName = this.state.tableName.get();
    const columnWidths = this.state.columnWidths.get();

    // Update ARIA table dimensions
    this.element.setAttribute('aria-rowcount', String(this.state.totalRows.get()));
    this.element.setAttribute('aria-colcount', String(schema.length));

    // Destroy filter panel (will be recreated lazily on next filter click)
    if (this.filterPanel) {
      this.filterPanel.destroy();
      this.filterPanel = null;
    }

    // Destroy preset panel (will be recreated lazily on next presets click)
    if (this.presetPanel) {
      this.presetPanel.destroy();
      this.presetPanel = null;
    }

    // Destroy derived edit panel (will be recreated lazily on next f(x) click)
    if (this.derivedEditPanel) {
      this.derivedEditPanel.destroy();
      this.derivedEditPanel = null;
    }

    // Clear existing column headers
    this.destroyColumnHeaders();
    this.headerRow.innerHTML = '';
    this.bodyContainer.innerHTML = '';

    if (schema.length === 0 || !tableName) {
      // No data loaded - show placeholder
      const placeholder = document.createElement('div');
      placeholder.className = `${this.resolvedOptions.classPrefix}-placeholder`;
      placeholder.textContent = 'Load data to see the table';
      this.bodyContainer.appendChild(placeholder);
    } else {
      // Create header row container
      const headerRowEl = document.createElement('div');
      headerRowEl.className = `${this.resolvedOptions.classPrefix}-header-row`;
      headerRowEl.setAttribute('role', 'row');

      // Create column headers
      if (this.actions) {
        for (const colName of visibleColumns) {
          const colSchema = schema.find((s) => s.name === colName);
          if (colSchema) {
            const schemaIndex = schema.findIndex((s) => s.name === colName);
            const columnHeader = new ColumnHeader(
              colSchema,
              this.state,
              this.actions,
              {
                classPrefix: this.resolvedOptions.classPrefix,
                onFilterClick: (column, buttonEl) => this.handleFilterClick(column, buttonEl),
                onDerivedIconClick: (column, buttonEl) => this.handleDerivedIconClick(column, buttonEl),
                colIndex: schemaIndex >= 0 ? schemaIndex + 1 : undefined,
              }
            );
            this.columnHeaders.push(columnHeader);

            // Apply dynamic width from state (default to 150px)
            const headerEl = columnHeader.getElement();
            const width = columnWidths.get(colName) ?? 150;
            headerEl.style.width = `${width}px`;

            headerRowEl.appendChild(headerEl);
          }
        }
      } else {
        // Fallback if no actions provided - show simple placeholders
        for (const colName of visibleColumns) {
          const colSchema = schema.find((s) => s.name === colName);
          if (colSchema) {
            const colEl = document.createElement('div');
            colEl.className = `${this.resolvedOptions.classPrefix}-col-header`;
            colEl.style.padding = '0.5rem';

            // Apply dynamic width from state (default to 150px)
            const width = columnWidths.get(colName) ?? 150;
            colEl.style.width = `${width}px`;

            colEl.innerHTML = `<strong>${colSchema.name}</strong><br><small>${colSchema.type}</small>`;
            headerRowEl.appendChild(colEl);
          }
        }
      }

      this.headerRow.appendChild(headerRowEl);

      // Refresh column reorder handlers for new headers
      this.columnReorder?.refresh();

      // Create or update TableBody
      if (this.bridge && this.actions) {
        // Destroy existing table body if present
        if (this.tableBody) {
          this.tableBody.destroy();
          this.tableBody = null;
        }

        // Create new table body
        this.tableBody = new TableBody(
          this.bodyContainer,
          this.state,
          this.bridge,
          this.actions,
          {
            rowHeight: this.resolvedOptions.rowHeight,
            classPrefix: this.resolvedOptions.classPrefix,
            scrollContainer: this.bodyScroll,
            // headerHeight no longer needed - body scroll only contains body
          }
        );

        // Eagerly set content width so scrollWidth is correct for auto-scroll.
        // initialize() sets this later via async DuckDB fetch, but scrollToRightEnd()
        // may fire before that completes.
        {
          let totalWidth = 0;
          for (const colName of visibleColumns) {
            totalWidth += columnWidths.get(colName) ?? 150;
          }
          this.tableBody.getVirtualScroller().setContentWidth(totalWidth);
        }

        // Initialize table body asynchronously
        this.tableBody.initialize().catch((error) => {
          console.error('Error initializing table body:', error);
        });
      } else {
        // Fallback: show row count if no bridge/actions
        const bodyPlaceholder = document.createElement('div');
        bodyPlaceholder.className = `${this.resolvedOptions.classPrefix}-body-placeholder`;
        bodyPlaceholder.textContent = `${this.state.totalRows.get().toLocaleString()} rows`;
        this.bodyContainer.appendChild(bodyPlaceholder);
      }
    }

    // Apply pinned column styles after headers are created
    this.updatePinnedColumnStyles();

    // FLIP animation: if we have saved positions from a pin/unpin, animate columns
    if (this.savedColumnPositions) {
      const firstPositions = this.savedColumnPositions;
      this.savedColumnPositions = null;

      requestAnimationFrame(() => {
        if (this.destroyed) return;

        for (const header of this.columnHeaders) {
          const col = header.getColumn().name;
          const first = firstPositions.get(col);
          if (!first) continue;

          const last = header.getElement().getBoundingClientRect();
          const deltaX = first.left - last.left;
          if (Math.abs(deltaX) < 1) continue;

          const el = header.getElement();
          // Invert: snap to old position
          el.style.transform = `translateX(${deltaX}px)`;
          // Play: animate to new position in next frame
          requestAnimationFrame(() => {
            el.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            el.style.transform = '';
            el.addEventListener('transitionend', function handler() {
              el.style.transition = '';
              el.removeEventListener('transitionend', handler);
            });
          });
        }
      });
    }

    // Track visible columns and highlight newly restored ones
    const newVisibleSet = new Set(visibleColumns);
    if (prevVisible.size > 0) {
      const prefix = this.resolvedOptions.classPrefix;
      for (const header of this.columnHeaders) {
        const col = header.getColumn().name;
        if (!prevVisible.has(col)) {
          const el = header.getElement();
          el.classList.add(`${prefix}-col-header--restored`);
          el.addEventListener('animationend', function handler() {
            el.classList.remove(`${prefix}-col-header--restored`);
            el.removeEventListener('animationend', handler);
          });
        }
      }
    }
    this.previousVisibleColumns = newVisibleSet;

    // Restore scroll positions and focus after DOM updates (both containers for robustness)
    requestAnimationFrame(() => {
      if (!this.destroyed) {
        this.bodyScroll.scrollLeft = savedBodyScrollLeft;
        this.bodyScroll.scrollTop = savedBodyScrollTop;
        this.headerScroll.scrollLeft = savedHeaderScrollLeft;

        // Restore focus if it was lost due to DOM element removal during render.
        // This ensures keyboard shortcuts (Cmd+Z) continue working after
        // actions like pin/hide that destroy the focused button element.
        if (hadFocus && !this.element.contains(document.activeElement)) {
          this.element.focus({ preventScroll: true });
        }
      }
    });
  }

  /**
   * Handle filter button click from a column header.
   * Creates the FilterPanel lazily and toggles it for the clicked column.
   */
  private handleFilterClick(column: string, anchorElement: HTMLElement): void {
    if (!this.actions) return;

    // Mutual exclusion: close other panels/modals if open
    if (this.derivedEditPanel?.getIsOpen()) {
      this.derivedEditPanel.close();
    }
    if (this.sqlFilterModal?.getIsOpen()) {
      this.sqlFilterModal.close();
    }
    if (this.presetPanel?.getIsOpen()) {
      this.presetPanel.close();
    }

    // Create panel lazily on first click
    if (!this.filterPanel) {
      this.filterPanel = new FilterPanel(this.state, this.actions, {
        classPrefix: this.resolvedOptions.classPrefix,
        colorSchemeSource: this.element,
      });
      this.element.appendChild(this.filterPanel.getElement());
    }

    this.filterPanel.toggle(column, anchorElement);
  }

  /**
   * Handle derived column icon click from a column header.
   * Creates the DerivedColumnEditPanel lazily and toggles it.
   */
  private handleDerivedIconClick(columnName: string, anchorElement: HTMLElement): void {
    if (!this.actions) return;

    // Mutual exclusion: close other panels/modals if open
    if (this.filterPanel?.getIsOpen()) {
      this.filterPanel.close();
    }
    if (this.sqlFilterModal?.getIsOpen()) {
      this.sqlFilterModal.close();
    }
    if (this.presetPanel?.getIsOpen()) {
      this.presetPanel.close();
    }

    // Create panel lazily on first click
    if (!this.derivedEditPanel) {
      this.derivedEditPanel = new DerivedColumnEditPanel(this.state, this.actions, {
        classPrefix: this.resolvedOptions.classPrefix,
        editorFactory: this.resolvedOptions.editorFactory,
        colorSchemeSource: this.element,
      });
      this.element.appendChild(this.derivedEditPanel.getElement());
    }

    this.derivedEditPanel.toggle(columnName, anchorElement);
  }

  /**
   * Handle "+" add column button click.
   * Opens the DerivedColumnModal for creating a new derived column.
   */
  private handleAddColumnClick(): void {
    if (!this.actions) return;

    // Close other floating panels/modals (mutual exclusion)
    if (this.filterPanel?.getIsOpen()) this.filterPanel.close();
    if (this.derivedEditPanel?.getIsOpen()) this.derivedEditPanel.close();
    if (this.sqlFilterModal?.getIsOpen()) this.sqlFilterModal.close();
    if (this.presetPanel?.getIsOpen()) this.presetPanel.close();

    // Create modal lazily on first click
    if (!this.derivedModal) {
      this.derivedModal = new DerivedColumnModal(this.state, this.actions, {
        classPrefix: this.resolvedOptions.classPrefix,
        instanceId: this.resolvedOptions.instanceId,
        editorFactory: this.resolvedOptions.editorFactory,
        onCreated: () => this.scrollToRightEnd(),
        colorSchemeSource: this.element,
      });
      // Mount in the configured portal target (defaults to <body>). Fixed-
      // position modals need a root that isn't inside a transformed/filtered
      // ancestor so they can cover the viewport without stacking-context surprises.
      this.getPortalTarget().appendChild(this.derivedModal.getElement());
    }

    this.derivedModal.open();
  }

  /**
   * Open the SQL filter modal in create mode.
   */
  private openSQLFilterModal(): void {
    if (!this.actions) return;

    // Mutual exclusion: close other panels/modals
    if (this.filterPanel?.getIsOpen()) this.filterPanel.close();
    if (this.derivedEditPanel?.getIsOpen()) this.derivedEditPanel.close();
    if (this.derivedModal?.getIsOpen()) this.derivedModal.close();
    if (this.presetPanel?.getIsOpen()) this.presetPanel.close();

    // Lazy creation
    if (!this.sqlFilterModal) {
      this.sqlFilterModal = new SQLFilterModal(this.state, this.actions, {
        classPrefix: this.resolvedOptions.classPrefix,
        instanceId: this.resolvedOptions.instanceId,
        editorFactory: this.resolvedOptions.editorFactory,
        colorSchemeSource: this.element,
      });
      this.getPortalTarget().appendChild(this.sqlFilterModal.getElement());
    }

    this.sqlFilterModal.open();
  }

  /**
   * Open the SQL filter modal in edit mode for the given filter id.
   */
  private openSQLFilterModalForEdit(filterId: string): void {
    if (!this.actions) return;

    // Mutual exclusion
    if (this.filterPanel?.getIsOpen()) this.filterPanel.close();
    if (this.derivedEditPanel?.getIsOpen()) this.derivedEditPanel.close();
    if (this.derivedModal?.getIsOpen()) this.derivedModal.close();
    if (this.presetPanel?.getIsOpen()) this.presetPanel.close();

    // Lazy creation
    if (!this.sqlFilterModal) {
      this.sqlFilterModal = new SQLFilterModal(this.state, this.actions, {
        classPrefix: this.resolvedOptions.classPrefix,
        instanceId: this.resolvedOptions.instanceId,
        editorFactory: this.resolvedOptions.editorFactory,
        colorSchemeSource: this.element,
      });
      this.getPortalTarget().appendChild(this.sqlFilterModal.getElement());
    }

    this.sqlFilterModal.openForEdit(filterId);
  }

  /**
   * Handle "Presets" button click from filter bar.
   * Creates the FilterPresetPanel lazily and toggles it.
   */
  private handlePresetsClick(): void {
    if (!this.actions || !this.resolvedOptions.presetManager) return;

    // Mutual exclusion: close other panels/modals
    if (this.filterPanel?.getIsOpen()) this.filterPanel.close();
    if (this.derivedEditPanel?.getIsOpen()) this.derivedEditPanel.close();
    if (this.sqlFilterModal?.getIsOpen()) this.sqlFilterModal.close();
    if (this.derivedModal?.getIsOpen()) this.derivedModal.close();

    // Lazy creation
    if (!this.presetPanel) {
      this.presetPanel = new FilterPresetPanel(
        this.resolvedOptions.presetManager,
        this.state,
        this.actions,
        {
          classPrefix: this.resolvedOptions.classPrefix,
          colorSchemeSource: this.element,
        }
      );
      this.element.appendChild(this.presetPanel.getElement());
    }

    // Find the presets button as anchor for positioning
    const presetsBtn = this.filterBar?.getElement().querySelector(
      `.${this.resolvedOptions.classPrefix}-filter-presets-btn`
    ) as HTMLElement;

    if (presetsBtn) {
      this.presetPanel.toggle(presetsBtn);
    }
  }

  /**
   * Smooth-scroll the body to the right end so the newly created column is visible.
   * Deferred with requestAnimationFrame to wait for the render cycle to add the column.
   */
  /**
   * Where fixed-position modals owned by this table mount. Returns the
   * `portalTarget` option if supplied, otherwise `document.body`. Exposed
   * as the single source of truth so higher-level wiring (e.g.
   * `createDataTable()`'s export dialog) can honour the same choice
   * without re-implementing the fallback.
   */
  public getPortalTarget(): HTMLElement {
    return this.resolvedOptions.portalTarget ?? document.body;
  }

  private scrollToRightEnd(): void {
    // Wait for the re-render triggered by the new column
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const targetLeft = this.bodyScroll.scrollWidth;

        // Suppress header→body sync so the smooth scroll animation isn't
        // cancelled by stale scrollLeft values bouncing back from headerScroll.
        this.suppressReverseScrollSync = true;

        // Scroll header instantly to the target, then smooth-scroll the body.
        this.headerScroll.scrollLeft = targetLeft;
        this.bodyScroll.scrollTo({
          left: targetLeft,
          behavior: 'smooth',
        });

        // Re-enable sync after the animation settles and align both containers.
        const onEnd = () => {
          this.suppressReverseScrollSync = false;
          this.headerScroll.scrollLeft = this.bodyScroll.scrollLeft;
        };
        this.bodyScroll.addEventListener('scrollend', onEnd, { once: true });
        // Fallback for browsers without scrollend support
        setTimeout(onEnd, 600);
      });
    });
  }

  /**
   * Get the root element
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Get the header row element
   */
  getHeaderRow(): HTMLElement {
    return this.headerRow;
  }

  /**
   * Get the body container element
   */
  getBodyContainer(): HTMLElement {
    return this.bodyContainer;
  }

  /**
   * Get the scroll container element (body scroll)
   *
   * This is the container that handles both horizontal and vertical scrolling for the body.
   */
  getScrollContainer(): HTMLElement {
    return this.bodyScroll;
  }

  /**
   * Get the header scroll element
   *
   * This is the container that handles horizontal scrolling for the header.
   * It should be synced with the body scroll.
   */
  getHeaderScroll(): HTMLElement {
    return this.headerScroll;
  }

  /**
   * Get current container dimensions
   */
  getDimensions(): { width: number; height: number } {
    return { ...this.currentDimensions };
  }

  /**
   * Get the resolved options
   */
  getOptions(): Required<TableContainerOptions> {
    return { ...this.resolvedOptions };
  }

  /**
   * Check if the container has been destroyed
   */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Get the table body instance
   */
  getTableBody(): TableBody | null {
    return this.tableBody;
  }

  /**
   * Get all column header instances.
   * Useful for accessing visualization containers in each header.
   */
  getColumnHeaders(): ColumnHeader[] {
    return [...this.columnHeaders];
  }

  /**
   * Get the filter bar instance
   */
  getFilterBar(): FilterBar | null {
    return this.filterBar;
  }

  /**
   * Get the filter panel instance
   */
  getFilterPanel(): FilterPanel | null {
    return this.filterPanel;
  }

  /**
   * Destroy the table container and clean up resources
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Destroy all column headers
    this.destroyColumnHeaders();

    // Destroy table body
    if (this.tableBody) {
      this.tableBody.destroy();
      this.tableBody = null;
    }

    // Destroy filter bar
    if (this.filterBar) {
      this.filterBar.destroy();
      this.filterBar = null;
    }

    // Destroy filter panel
    if (this.filterPanel) {
      this.filterPanel.destroy();
      this.filterPanel = null;
    }

    // Destroy preset panel
    if (this.presetPanel) {
      this.presetPanel.destroy();
      this.presetPanel = null;
    }

    // Destroy derived column edit panel
    if (this.derivedEditPanel) {
      this.derivedEditPanel.destroy();
      this.derivedEditPanel = null;
    }

    // Destroy add column button
    if (this.addColumnButton) {
      this.addColumnButton.destroy();
      this.addColumnButton = null;
    }

    // Destroy derived column modal
    if (this.derivedModal) {
      this.derivedModal.destroy();
      this.derivedModal = null;
    }

    // Destroy SQL filter modal
    if (this.sqlFilterModal) {
      this.sqlFilterModal.destroy();
      this.sqlFilterModal = null;
    }

    // Destroy hidden columns gutter
    if (this.hiddenColumnsGutter) {
      this.hiddenColumnsGutter.destroy();
      this.hiddenColumnsGutter = null;
    }

    // Destroy column reorder handler
    if (this.columnReorder) {
      this.columnReorder.destroy();
      this.columnReorder = null;
    }

    // Remove pinned demarcation overlay
    if (this.pinnedDemarcation) {
      this.pinnedDemarcation.remove();
      this.pinnedDemarcation = null;
    }

    // Disconnect resize observer
    this.resizeObserver.disconnect();

    // Clear resize callbacks
    this.resizeCallbacks.clear();

    // Tear down keyboard navigator
    if (this.keyboardNavigator) {
      this.keyboardNavigator.destroy();
      this.keyboardNavigator = null;
    }

    // Clean up scroll sync listeners
    if (this.boundBodyScrollHandler) {
      this.bodyScroll.removeEventListener('scroll', this.boundBodyScrollHandler);
      this.boundBodyScrollHandler = null;
    }
    if (this.boundHeaderScrollHandler) {
      this.headerScroll.removeEventListener('scroll', this.boundHeaderScrollHandler);
      this.boundHeaderScrollHandler = null;
    }

    // Unsubscribe from all state subscriptions
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];

    // Remove element from DOM (wrapper or root)
    const topEl = this.wrapperElement ?? this.element;
    if (topEl.parentNode) {
      topEl.parentNode.removeChild(topEl);
    }
  }
}
