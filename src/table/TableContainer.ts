/**
 * TableContainer - Main container component for the data table.
 *
 * Manages the overall DOM structure including:
 * - Header row container (for column headers)
 * - Body container (for data rows with virtual scrolling)
 * - Resize observer for responsive behavior
 *
 * Most consumers never touch this directly — `createDataTable()` composes it.
 * Reach into `/advanced` for this class only when you need to embed the core
 * table inside a custom shell without the filter bar / modal host.
 *
 * @example
 * import { TableContainer } from '@jeyabbalas/data-table/advanced';
 *
 * const container = new TableContainer(rootEl, state, actions, bridge, {
 *   rowHeight: 28,
 *   headerHeight: 96,
 * });
 * // later:
 * container.destroy();
 *
 * @see ColumnHeader
 * @see VirtualScroller
 * @see TableBody
 * @see CellRenderer
 * @see ColumnReorder
 * @see HiddenColumnsGutter
 * @see KeyboardNavigator
 */

import type { AnnotationStore } from '../annotations/AnnotationStore';
import type { StateActions } from '../core/Actions';
import { resolveInstanceId } from '../core/instanceId';
import type { TableState } from '../core/State';
import { type Strings, defaultStrings } from '../core/Strings';
import type { WorkerBridge } from '../data/WorkerBridge';
import type { ColorScheme } from '../DataTable';
import { AddColumnButton } from '../derived/AddColumnButton';
import type { DerivedColumnEditPanel } from '../derived/DerivedColumnEditPanel';
import type { DerivedColumnModal } from '../derived/DerivedColumnModal';
import type { ExpressionEditorFactory } from '../derived/ExpressionEditorTypes';
import { FilterBar } from '../filters/FilterBar';
import { FilterPanel } from '../filters/FilterPanel';
import type { FilterPresetPanel } from '../filters/FilterPresetPanel';
import type { FilterPresetManager } from '../filters/FilterPresets';
import type { SQLFilterModal } from '../filters/SQLFilterModal';
import type { AnnotationPopover } from './AnnotationPopover';
import { ColumnHeader } from './ColumnHeader';
import type { ColumnHeaderTooltipPopover } from './ColumnHeaderTooltipPopover';
import { ColumnReorder } from './ColumnReorder';
import { pinnedOffsets, resolvePinnedCount } from './ColumnWindow';
import { HiddenColumnsGutter } from './HiddenColumnsGutter';
import { HEADER_ROW_INDEX, KeyboardNavigator } from './KeyboardNavigator';
import { TableBody } from './TableBody';

/**
 * Options for configuring the TableContainer
 */
export interface TableContainerOptions {
  /** Fixed row height in pixels (default: 32) */
  rowHeight?: number | undefined;
  /** Fixed header height in pixels (default: 120 for visualizations) */
  headerHeight?: number | undefined;
  /** CSS class prefix (default: 'dt') */
  classPrefix?: string | undefined;
  /**
   * Unique per-instance identifier mixed into modal and grid-cell element IDs
   * so two tables on the same page don't collide on `aria-labelledby` /
   * `aria-activedescendant` targets. Auto-generated if omitted, and a random
   * suffix is appended even when supplied — see `resolveInstanceId`.
   */
  instanceId?: string | undefined;
  /** Show filter bar between header and body (default: true) */
  showFilterBar?: boolean | undefined;
  /** Called when a filter is removed via filter chip, for clearing visualization state */
  onFilterRemove?: ((column: string) => void) | undefined;
  /** Custom expression editor factory for derived column panel/modal */
  editorFactory?: ExpressionEditorFactory | undefined;
  /** Show "+" add column button at right edge (default: true) */
  showAddColumnButton?: boolean | undefined;
  /**
   * Show the f(x) edit icon on every derived-column header (default: true).
   * Independent of `showAddColumnButton` so `/advanced` callers can mix and
   * match. The facade ties both to the public `derivedColumns` option.
   */
  showDerivedColumnEditIcon?: boolean | undefined;
  /** Show "Expression" filter button in filter bar for SQL WHERE conditions (default: true) */
  showExpressionFilter?: boolean | undefined;
  /** FilterPresetManager instance — enables the Presets button and preset panel */
  presetManager?: FilterPresetManager | undefined;
  /**
   * Where to mount fixed-position modals (derived column editor, SQL filter
   * modal). Defaults to `document.body`. Pass your app's modal root container
   * to keep the library's modals inside your stacking/portal hierarchy instead
   * of at the top of the document.
   */
  portalTarget?: HTMLElement | undefined;
  /**
   * Initial light/dark theme. `'auto'` (default) follows the OS
   * `prefers-color-scheme`; `'light'` / `'dark'` force the theme by writing
   * `data-dt-color-scheme` onto the root element.
   */
  colorScheme?: ColorScheme | undefined;
  /** Resolved i18n strings. Defaults to English. */
  messages?: Strings | undefined;
  /**
   * Shared annotation store. When provided, `TableBody` and every
   * `ColumnHeader` subscribe to it so annotations render inline (tint +
   * popover) without requiring a full `render()`.
   */
  annotations?: AnnotationStore | undefined;
  /**
   * Shared popover singleton used by `TableBody` and `ColumnHeader` to
   * display intersecting annotations on hover / focus. Owned by
   * `createDataTable`; destroyed alongside the container.
   */
  annotationPopover?: AnnotationPopover | undefined;
  /**
   * Shared popover singleton used by `ColumnHeader` to display the app-set
   * column-header tooltip on hover / focus of the column-name span. Owned
   * by `createDataTable`; destroyed alongside the container.
   */
  columnHeaderTooltipPopover?: ColumnHeaderTooltipPopover | undefined;
  /**
   * Rows fetched per scroll block, forwarded to `TableBody`. Default: 128.
   * Clamped to [16, 1024]. See {@link TableBodyOptions.fetchBlockSize}.
   */
  fetchBlockSize?: number | undefined;
  /**
   * Maximum rows kept in the body's row cache, forwarded to `TableBody`.
   * Default: 2048, rounded up to whole blocks (floor 4 blocks). See
   * {@link TableBodyOptions.rowCacheRows}.
   */
  rowCacheRows?: number | undefined;
  /**
   * Speculative one-block-ahead prefetch while scrolling, forwarded to
   * `TableBody`. Default: true. See {@link TableBodyOptions.prefetch}.
   */
  prefetch?: boolean | undefined;
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
  private gridElement: HTMLElement;
  private headerArea: HTMLElement;
  private headerScroll: HTMLElement;
  private scrollbarGutter: HTMLElement;
  private headerRow: HTMLElement;
  private bodyScroll: HTMLElement;
  private bodyContainer: HTMLElement;
  private resizeObserver: ResizeObserver;
  private unsubscribes: (() => void)[] = [];
  private destroyed = false;
  private resizeCallbacks = new Set<ResizeCallback>();
  private currentDimensions: { width: number; height: number } = { width: 0, height: 0 };
  private columnHeaders: ColumnHeader[] = [];
  private tableBody: TableBody | null = null;
  // Tracks the surviving TableBody's `initialize()` so the public
  // `loadDataImpl` can await first paint before resolving. Each `render()`
  // reassigns this; state setters fan out synchronously, so by the time
  // `await actions.loadData(...)` returns, this holds the last body's
  // promise. See `whenBodyReady()` and the comment at the call site below.
  private currentBodyInit: Promise<void> = Promise.resolve();
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
  private previousVisibleColumns = new Set<string>();

  // Continuous demarcation line for pinned column boundary
  private pinnedDemarcation: HTMLElement | null = null;

  // Keyboard navigation / shortcuts
  private keyboardNavigator: KeyboardNavigator | null = null;

  // True while `.dt-grid` carries the ARIA grid semantics. Flipped by
  // `applyGridSemantics()` from render(); read by the aria-rowcount /
  // aria-colcount / aria-activedescendant writers so they never annotate a
  // roleless element (`aria-label` on a bare generic is aria-prohibited-attr,
  // and the counts are meaningless without the role).
  private gridSemanticsActive = false;

  // Scroll synchronization handlers
  private boundBodyScrollHandler: (() => void) | null = null;
  private boundHeaderScrollHandler: (() => void) | null = null;

  // Suppress header→body scroll sync during programmatic smooth scrolling
  private suppressReverseScrollSync = false;

  // ARIA live region for screen reader announcements
  private liveRegion: HTMLElement | null = null;
  private announceRegion: HTMLElement | null = null;
  private pendingLiveUpdate = false;

  // Resolved options with defaults applied. `instanceId` is narrowed past
  // `Required<>`, which keeps the explicit `| undefined` written on the option:
  // the constructor always overwrites it with `resolveInstanceId`, so every
  // reader — id builders, `getInstanceId` — gets a `string`.
  private readonly resolvedOptions: Required<TableContainerOptions> & { instanceId: string };
  private readonly messages: Strings;

  constructor(
    private container: HTMLElement,
    private state: TableState,
    private actions?: StateActions,
    private bridge?: WorkerBridge,
    options: TableContainerOptions = {},
  ) {
    // Apply defaults
    this.resolvedOptions = {
      rowHeight: 32,
      headerHeight: 120,
      classPrefix: 'dt',
      showFilterBar: true,
      onFilterRemove: undefined as unknown as (column: string) => void,
      editorFactory: undefined as unknown as ExpressionEditorFactory,
      showAddColumnButton: true,
      showDerivedColumnEditIcon: true,
      showExpressionFilter: true,
      presetManager: undefined as unknown as FilterPresetManager,
      portalTarget: undefined as unknown as HTMLElement,
      colorScheme: 'auto',
      messages: defaultStrings,
      annotations: undefined as unknown as AnnotationStore,
      annotationPopover: undefined as unknown as AnnotationPopover,
      columnHeaderTooltipPopover: undefined as unknown as ColumnHeaderTooltipPopover,
      // Fetch-pipeline knobs: TableBody owns the real defaults/clamping;
      // undefined here means "let the body decide".
      fetchBlockSize: undefined as unknown as number,
      rowCacheRows: undefined as unknown as number,
      prefetch: undefined as unknown as boolean,
      ...options,
      // Always qualified, never taken verbatim: a caller-supplied `instanceId`
      // reused across two tables would mint identical cell ids and leave both
      // grids publishing an ambiguous `aria-activedescendant`. After the spread
      // deliberately — this is the only value the field can ever hold, which is
      // what lets everything downstream read it back as a plain `string`.
      instanceId: resolveInstanceId(options.instanceId),
    };
    // Spread above writes `undefined` over the defaults if the caller passed
    // `messages: undefined` / `colorScheme: undefined` explicitly. Restore.
    this.resolvedOptions.messages ??= defaultStrings;
    this.resolvedOptions.colorScheme ??= 'auto';
    // Same hazard, and `createDataTable` walks straight into it: it forwards
    // `rowHeight: opts.rowHeight` / `headerHeight: opts.headerHeight`
    // verbatim, so omitting either from the public options spreads an
    // explicit `undefined` over the default here. Both are interpolated into
    // CSS lengths — `${headerHeight}px` on the header's min-height, and the
    // `--dt-row-height` token — where `undefined` yields the invalid
    // "undefinedpx" and the declaration is dropped on the floor.
    this.resolvedOptions.rowHeight ??= 32;
    this.resolvedOptions.headerHeight ??= 120;
    this.messages = this.resolvedOptions.messages;

    // Create DOM structure
    this.element = this.createRootElement();
    this.gridElement = this.createGridElement();
    this.headerArea = this.createHeaderArea();
    this.headerScroll = this.createHeaderScroll();
    this.scrollbarGutter = this.createScrollbarGutter();
    this.headerRow = this.createHeaderRow();
    this.bodyScroll = this.createBodyScroll();
    this.bodyContainer = this.createBodyContainer();

    // Assemble structure:
    // root > [filterBar] > grid > headerArea > (headerScroll > headerRow) + scrollbarGutter
    //                           > bodyScroll > bodyContainer
    //      > liveRegion > [hiddenGutter]
    //
    // The filter bar, live region and hidden-columns gutter sit OUTSIDE
    // `.dt-grid`: `role="grid"` may only own `row` / `rowgroup` children, and
    // a toolbar or status sibling inside it fails `aria-required-children`.
    // That constraint is the whole reason the grid is its own element rather
    // than `.dt-root` — see createGridElement().
    this.headerScroll.appendChild(this.headerRow);
    this.headerArea.appendChild(this.headerScroll);
    this.headerArea.appendChild(this.scrollbarGutter);
    this.bodyScroll.appendChild(this.bodyContainer);
    this.gridElement.appendChild(this.headerArea);
    this.gridElement.appendChild(this.bodyScroll);

    // Create filter bar above the grid
    if (this.resolvedOptions.showFilterBar && this.actions) {
      this.filterBar = new FilterBar(this.state, this.actions, {
        classPrefix: this.resolvedOptions.classPrefix,
        onFilterRemove: this.resolvedOptions.onFilterRemove,
        alwaysShow:
          this.resolvedOptions.showExpressionFilter !== false ||
          !!this.resolvedOptions.presetManager,
        onAddSQLFilter:
          this.resolvedOptions.showExpressionFilter !== false
            ? () => void this.openSQLFilterModal()
            : undefined,
        onRawSQLEdit:
          this.resolvedOptions.showExpressionFilter !== false
            ? (id: string) => void this.openSQLFilterModalForEdit(id)
            : undefined,
        onPresetsClick: this.resolvedOptions.presetManager
          ? () => void this.handlePresetsClick()
          : undefined,
        messages: this.messages,
      });
      this.element.appendChild(this.filterBar.getElement());
    }

    this.element.appendChild(this.gridElement);

    // Create aria-live region for screen reader announcements
    this.liveRegion = document.createElement('div');
    this.liveRegion.setAttribute('role', 'status');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');
    this.liveRegion.className = `${this.resolvedOptions.classPrefix}-sr-only`;
    this.element.appendChild(this.liveRegion);

    // A second region, for transient announcements. It has to be its own node:
    // updateLiveRegion() takes no arguments and rebuilds the whole sentence
    // from filter and sort state, so a message written into that node would be
    // clobbered by the next rAF flush.
    this.announceRegion = document.createElement('div');
    this.announceRegion.setAttribute('role', 'status');
    this.announceRegion.setAttribute('aria-live', 'polite');
    this.announceRegion.setAttribute('aria-atomic', 'true');
    // Second class so the two regions are distinguishable from a test or a
    // consumer's own tooling; `-sr-only` is what actually hides it.
    this.announceRegion.className = `${this.resolvedOptions.classPrefix}-sr-only ${this.resolvedOptions.classPrefix}-announce`;
    this.element.appendChild(this.announceRegion);

    // Create hidden columns gutter after body
    if (this.actions) {
      this.hiddenColumnsGutter = new HiddenColumnsGutter(this.state, this.actions, {
        classPrefix: this.resolvedOptions.classPrefix,
        messages: this.messages,
      });
      this.element.appendChild(this.hiddenColumnsGutter.getElement());
    }

    // Create add column button in a flex wrapper alongside the table
    if (this.resolvedOptions.showAddColumnButton !== false && this.actions) {
      this.addColumnButton = new AddColumnButton({
        classPrefix: this.resolvedOptions.classPrefix,
        onClick: () => void this.handleAddColumnClick(),
        messages: this.messages,
      });

      this.wrapperElement = document.createElement('div');
      this.wrapperElement.className = `${this.resolvedOptions.classPrefix}-table-wrapper`;
      // Mirror the color-scheme attribute onto the wrapper so the add-column
      // button (a sibling of `.dt-root`) inherits the attribute-scoped vars.
      this.applyColorSchemeAttribute(this.wrapperElement, this.resolvedOptions.colorScheme);
      this.wrapperElement.appendChild(this.element);
      this.wrapperElement.appendChild(this.addColumnButton.getElement());
      this.container.appendChild(this.wrapperElement);
    } else {
      this.container.appendChild(this.element);
    }

    // Virtual scrolling measures the mount container's height to decide how
    // many rows to render. If the container is 0-tall at mount, no rows will
    // appear until it grows — a common footgun when the library is dropped
    // into a non-flex parent or a grid cell without a height chain.
    if (this.container.getBoundingClientRect().height === 0) {
      console.warn(
        '[@jeyabbalas/data-table] Mount container has height 0 at initialization. ' +
          'No rows will render until the container has a computed height. ' +
          'Typical fix: make it a flex/grid child with `flex: 1; min-height: 0` ' +
          '(see examples/01-minimal) or set an explicit height.',
      );
    }

    // Set up resize observer
    this.resizeObserver = this.setupResizeObserver();

    // Subscribe to state changes
    this.subscribeToState();

    // Create column reorder handler
    if (this.actions) {
      this.columnReorder = new ColumnReorder(
        this.headerRow,
        (newOrder, movedColumn) => this.applyReorderFromDrag(newOrder, movedColumn),
        {
          classPrefix: this.resolvedOptions.classPrefix,
          getPinnedColumns: () => this.state.pinnedColumns.get(),
        },
      );
    }

    // Set up scroll synchronization between header and body
    this.setupScrollSync();

    // Install keyboard navigation + shortcuts. The listener stays on
    // `.dt-root` so keydowns bubbling out of the grid, the filter bar and the
    // hidden-columns gutter all reach it; `.dt-grid` is where focus lives.
    if (this.actions) {
      this.keyboardNavigator = new KeyboardNavigator({
        rootElement: this.element,
        gridElement: this.gridElement,
        bodyScroll: this.bodyScroll,
        state: this.state,
        actions: this.actions,
        getTableBody: () => this.tableBody,
        getColumnHeaders: () => this.columnHeaders,
        getBridge: () => this.bridge,
        announce: (message) => this.announce(message),
        messages: this.messages,
      });
    }

    // Initial render
    this.render();
  }

  // =========================================
  // DOM Creation Methods
  // =========================================

  /**
   * Create the root container element.
   *
   * Deliberately roleless: it hosts the grid *and* its sibling chrome (the
   * toolbar filter bar, the status live region, the toolbar hidden-columns
   * gutter), which no table/grid role may own. A bare `generic` element also
   * may not carry `aria-label` (`aria-prohibited-attr`), so the accessible
   * name lives on `.dt-grid` instead. `getElement()` still returns this
   * element, so the public surface is unchanged.
   */
  private createRootElement(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-root`;
    this.applyColorSchemeAttribute(el, this.resolvedOptions.colorScheme ?? 'auto');
    this.applySizingCustomProperties(el);
    return el;
  }

  /**
   * Publish `rowHeight` / `headerHeight` as the `--dt-row-height` and
   * `--dt-header-height` custom properties on `.dt-root`.
   *
   * The stylesheet derives real geometry from `--dt-row-height`: `.dt-row`'s
   * height, and the `line-height` that re-centres text in any cell using
   * `align-self: stretch` (`.dt-cell--focused`, `.dt-cell--derived`, and every
   * annotation-tinted cell — see `05-data-grid.css` and `03-columns.css`).
   * Those cells opt out of the row's `align-items: center`, so their
   * `line-height` is the only thing centring them and it has to equal the row
   * height the scroller actually uses. Writing the option here is what keeps
   * the two in step; without it a non-default `rowHeight` left the token at
   * its 32px stylesheet default and those cells rendered off-centre.
   *
   * Set as an inline declaration, so the option wins over a stylesheet
   * override of the same token. That precedence is deliberate: the row height
   * is also the virtual scroller's scroll arithmetic
   * ({@link VirtualScroller.setTotalRows}), which cannot see a CSS value —
   * letting CSS move the row height alone would desync the scroller instead,
   * including dynamically via a media query the scroller never observes.
   * Host pages change these through the options, and the tokens follow.
   */
  private applySizingCustomProperties(el: HTMLElement): void {
    el.style.setProperty('--dt-row-height', `${this.resolvedOptions.rowHeight}px`);
    el.style.setProperty('--dt-header-height', `${this.resolvedOptions.headerHeight}px`);
  }

  /**
   * Create the ARIA grid element — the keyboard cursor's tab stop.
   *
   * `role="grid"` (not `table`) because `aria-activedescendant` is not an
   * allowed attribute on `role="table"`. The role and its `aria-*` companions
   * are attached lazily by {@link applyGridSemantics} once a schema and table
   * name exist: an empty shell showing "Load data to see the table" owns no
   * rows, and `role="grid"` without a `row` / `rowgroup` child is an
   * `aria-required-children` violation.
   */
  private createGridElement(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-grid`;
    return el;
  }

  /**
   * Write (or clear) the `data-dt-color-scheme` attribute for a given scheme.
   * `'auto'` removes the attribute so CSS `prefers-color-scheme` governs;
   * `'light'` / `'dark'` set it to force the theme regardless of OS preference.
   */
  private applyColorSchemeAttribute(el: HTMLElement, scheme: ColorScheme): void {
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
  private applyColorSchemeToTargets(scheme: ColorScheme): void {
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
  setColorScheme(scheme: ColorScheme): void {
    if (this.destroyed) return;
    this.resolvedOptions.colorScheme = scheme;
    this.applyColorSchemeToTargets(scheme);
  }

  /** Returns the currently-applied color scheme. */
  getColorScheme(): ColorScheme {
    return this.resolvedOptions.colorScheme ?? 'auto';
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
   * Create the header scroll container (hidden scrollbar, synced with body).
   *
   * {@link applyGridSemantics} gives it `role="rowgroup"` and `tabindex="0"`
   * once there is data. The tab stop is required by WCAG 2.1.1 /
   * `scrollable-region-focusable`: the element scrolls horizontally and every
   * control inside it is `tabindex="-1"`, so without one the region has no
   * keyboard route in. `tabindex="-1"` does *not* satisfy the rule — it asks
   * whether the element is in the tab order, not whether it can take focus.
   * The rowgroup role is equally load-bearing: a focusable roleless div
   * directly under `role="grid"` fails `aria-required-children`.
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
    // No role: `role="rowgroup"` lives on the scroll container one level up
    // (see createHeaderScroll). A plain div is transparent to ARIA, so the
    // tree still reads grid > rowgroup > row > columnheader.
    el.style.minHeight = `${this.resolvedOptions.headerHeight}px`;
    return el;
  }

  /**
   * Create the body scroll container (handles both horizontal and vertical
   * scrolling). Gains `role="rowgroup"` and `tabindex="0"` once data exists —
   * see {@link createHeaderScroll} for why both.
   */
  private createBodyScroll(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-body-scroll`;
    return el;
  }

  /**
   * Create the body container for data rows. Roleless for the same reason as
   * the header row container — the rowgroup is `.dt-body-scroll`.
   */
  private createBodyContainer(): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-body`;
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

    const a = this.messages.a11y;
    if (filters.length > 0) {
      parts.push(a.filtersActive(filters.length, filteredRows, totalRows));
    } else {
      parts.push(a.noFilters(totalRows));
    }

    if (sortColumns.length > 0) {
      const sortDescriptions = sortColumns.map(
        (s) => `${s.column} ${s.direction === 'asc' ? a.ascending : a.descending}`,
      );
      parts.push(a.sortedBy(sortDescriptions));
    }

    this.liveRegion.textContent = parts.join(', ');
  }

  /**
   * Commit a drag-to-reorder and announce where the column landed.
   *
   * A drop is silent to a screen reader otherwise — the column order is
   * conveyed entirely by DOM position and `aria-colindex`, neither of which
   * announces on change.
   */
  private applyReorderFromDrag(newOrder: string[], movedColumn: string): void {
    if (!this.actions) return;
    this.actions.setColumnOrder(newOrder);
    const visible = this.state.visibleColumns.get();
    const position = visible.indexOf(movedColumn);
    if (position === -1) return;
    this.announce(
      this.messages.a11y.columnMovedAnnouncement(movedColumn, position + 1, visible.length),
    );
  }

  /**
   * Speak a transient message through the table's second polite live region.
   *
   * For state changes a screen-reader user would otherwise have no way to
   * observe: a new column width, a column's new position, the entry and exit
   * of column layout mode. Distinct from the standing filter / sort / row-count
   * region, which is rebuilt wholesale from state on every flush and would
   * overwrite anything written into it.
   *
   * Repeating the same text re-announces it — a second identical message
   * (two resize steps that both land on the maximum, say) is blanked for a
   * frame first, because assistive tech ignores a live region whose text has
   * not changed.
   *
   * @example
   * ```typescript
   * container.announce('Price 220 pixels wide');
   * ```
   */
  announce(message: string): void {
    if (this.destroyed || !this.announceRegion) return;
    const region = this.announceRegion;
    if (region.textContent === message) {
      region.textContent = '';
      requestAnimationFrame(() => {
        if (!this.destroyed) region.textContent = message;
      });
      return;
    }
    region.textContent = message;
  }

  // =========================================
  // ARIA grid semantics + activedescendant
  // =========================================

  /**
   * Attach or detach the ARIA grid semantics on `.dt-grid`.
   *
   * Grid semantics only make sense once a schema and table name exist: the
   * empty shell renders a "Load data" placeholder, and `role="grid"` owning a
   * non-row child is an `aria-required-children` violation. Detaching is
   * therefore not cosmetic — it is what keeps an unloaded table clean.
   *
   * `tabindex="0"` rides along with the role so an inert shell contributes no
   * tab stop.
   */
  private applyGridSemantics(active: boolean): void {
    if (active === this.gridSemanticsActive) return;
    this.gridSemanticsActive = active;
    const grid = this.gridElement;
    if (active) {
      grid.setAttribute('role', 'grid');
      grid.setAttribute('aria-label', this.messages.a11y.gridLabel);
      grid.setAttribute('tabindex', '0');
      // Rows answer to ctrl-click (`toggle`) and shift-click (`range`), so the
      // selection is genuinely multiple. Without this, `aria-selected="false"`
      // on the rows announces a single-select grid.
      grid.setAttribute('aria-multiselectable', 'true');
      for (const scroller of [this.headerScroll, this.bodyScroll]) {
        scroller.setAttribute('role', 'rowgroup');
        scroller.setAttribute('tabindex', '0');
      }
    } else {
      grid.removeAttribute('role');
      grid.removeAttribute('aria-label');
      grid.removeAttribute('tabindex');
      grid.removeAttribute('aria-multiselectable');
      grid.removeAttribute('aria-rowcount');
      grid.removeAttribute('aria-colcount');
      grid.removeAttribute('aria-activedescendant');
      for (const scroller of [this.headerScroll, this.bodyScroll]) {
        scroller.removeAttribute('role');
        scroller.removeAttribute('tabindex');
      }
    }
  }

  /**
   * Refresh `aria-rowcount` / `aria-colcount` on `.dt-grid`.
   *
   * Row count is the *rendered* row count plus 1, because under `role="grid"`
   * the column-header row is row 1 — body row `n` reports
   * `aria-rowindex="n + 2"` to match. Under an active filter the body renders
   * `filteredRows` rows, so counting `totalRows` here would have a screen
   * reader announce "row 3 of 5,001" on a five-row result.
   */
  private updateGridCounts(): void {
    if (!this.gridSemanticsActive) return;
    const rows =
      this.state.filters.get().length > 0
        ? this.state.filteredRows.get()
        : this.state.totalRows.get();
    this.gridElement.setAttribute('aria-rowcount', String(rows + 1));
    this.gridElement.setAttribute('aria-colcount', String(this.state.schema.get().length));
  }

  /**
   * Point `aria-activedescendant` at the element the cursor currently sits on,
   * or drop the attribute when there is no cursor.
   *
   * The id must resolve to a live element — a dangling IDREF is an
   * `aria-valid-attr-value` failure — so a cursor on a body row that
   * virtualization has not materialized (or has recycled away) clears the
   * attribute rather than pointing into nothing. That is why TableBody calls
   * back here after every row render, not just on cursor moves.
   */
  private syncActiveDescendant(): void {
    if (this.destroyed) return;
    if (!this.gridSemanticsActive) return;

    const focused = this.state.focusedCell.get();
    let targetId: string | null = null;

    if (focused) {
      if (focused.row === HEADER_ROW_INDEX) {
        const header = this.columnHeaders.find((h) => h.getColumn().name === focused.column);
        targetId = header?.getElement().id || null;
      } else {
        const colIndex = this.state.visibleColumns.get().indexOf(focused.column);
        if (colIndex >= 0) {
          targetId = this.buildCellId(focused.row, colIndex);
        }
      }
    }

    const resolved = targetId && this.resolveInGrid(targetId) ? targetId : null;

    // Write only on change: this runs from TableBody's per-frame render
    // callback, and a no-op attribute write still produces a mutation record
    // for anything observing the grid.
    const current = this.gridElement.getAttribute('aria-activedescendant');
    if (resolved === current) return;
    if (resolved) {
      this.gridElement.setAttribute('aria-activedescendant', resolved);
    } else {
      this.gridElement.removeAttribute('aria-activedescendant');
    }
  }

  /**
   * Look up an id and confirm it lands inside this grid.
   *
   * Resolves against the grid's own root node rather than `document` so the
   * lookup keeps working when the table is mounted in a shadow root or in a
   * detached subtree, and the `contains` check keeps a same-id element
   * belonging to another table on the page from being adopted as this grid's
   * active descendant.
   */
  private resolveInGrid(id: string): HTMLElement | null {
    const root = this.gridElement.getRootNode();
    const found = 'getElementById' in root ? (root as Document).getElementById(id) : null;
    if (found && this.gridElement.contains(found)) return found;
    // Either the tree has no `getElementById` (detached subtree), or the
    // document-wide hit belongs to another table — two instances share an id
    // space whenever a caller supplies the same `instanceId` twice. Fall back
    // to a scoped query, which only costs a subtree scan in that rare case.
    return this.gridElement.querySelector<HTMLElement>(`[id="${id}"]`);
  }

  /**
   * The focused element as this table's own root node sees it.
   *
   * Resolves against `getRootNode()` rather than `document` for the same reason
   * {@link resolveInGrid} does: under a shadow root `document.activeElement`
   * reports the *host*, which would make every focus check inside the table
   * read as "focus is elsewhere". Returns `null` when the tree has no notion of
   * a focused element (a detached subtree).
   */
  private activeElementInRoot(): Element | null {
    const root = this.element.getRootNode();
    return 'activeElement' in root ? (root as Document | ShadowRoot).activeElement : null;
  }

  /** Stable DOM id for a body cell — mirrors `TableBody`'s id scheme. */
  private buildCellId(row: number, colIndex: number): string {
    return `${this.resolvedOptions.classPrefix}-${this.resolvedOptions.instanceId}-cell-${row}-${colIndex}`;
  }

  /** Stable DOM id for a column-header cell. */
  private buildHeaderCellId(colIndex: number): string {
    return `${this.resolvedOptions.classPrefix}-${this.resolvedOptions.instanceId}-colheader-${colIndex}`;
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

    // `render()` decides whether the grid carries its ARIA semantics from
    // schema + tableName, but only schema and visibleColumns trigger it. A
    // caller that sets the table name last would otherwise leave the grid
    // roleless and untabbable. Re-render only when the verdict actually
    // flips, so the normal load path (tableName, then schema) still renders
    // exactly once per signal.
    const unsubTableName = this.state.tableName.subscribe(() => {
      if (this.destroyed) return;
      const hasData = this.state.schema.get().length > 0 && !!this.state.tableName.get();
      if (hasData !== this.gridSemanticsActive) this.render();
    });
    this.unsubscribes.push(unsubTableName);

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
              header.getElement().getBoundingClientRect(),
            );
          }
        }
        this.updatePinnedColumnStyles();
      }
    });
    this.unsubscribes.push(unsubPinned);

    // Update aria-rowcount when total rows change
    const unsubAriaRows = this.state.totalRows.subscribe(() => {
      if (!this.destroyed) {
        this.updateGridCounts();
      }
    });
    this.unsubscribes.push(unsubAriaRows);

    // Update aria-colcount when schema changes
    const unsubAriaCols = this.state.schema.subscribe(() => {
      if (!this.destroyed) {
        this.updateGridCounts();
      }
    });
    this.unsubscribes.push(unsubAriaCols);

    // Keep aria-activedescendant pointed at the cursor. The companion
    // callback from TableBody (onRowsRendered) covers the case where the
    // cursor stays put but virtualization materializes or recycles its row.
    const unsubActiveDescendant = this.state.focusedCell.subscribe(() => {
      if (!this.destroyed) {
        this.syncActiveDescendant();
        this.updateHeaderCursorStyles();
      }
    });
    this.unsubscribes.push(unsubActiveDescendant);

    // Update live region on filter/sort/filteredRows changes
    const unsubLiveFilters = this.state.filters.subscribe(() => {
      if (!this.destroyed) {
        this.scheduleLiveRegionUpdate();
        this.updateGridCounts();
      }
    });
    this.unsubscribes.push(unsubLiveFilters);

    // Preserve horizontal scroll position through filter changes. Filter
    // add/remove triggers row re-fetch, the FilterBar max-height reveal
    // or collapse, and visualization re-renders — any of which can
    // transiently clamp scrollLeft to 0. Pin scrollLeft to its pre-change
    // value for 1s, correcting any drift each animation frame. Covers
    // the 300ms smooth scroll-to-top, the 200ms bar transition (in both
    // directions — reveal on add, collapse on remove), plus async row
    // and viz re-fetches.
    const unsubFilterScroll = this.state.filters.subscribe(() => {
      if (this.destroyed) return;
      const savedLeft = this.bodyScroll.scrollLeft;
      if (savedLeft === 0) return;

      const deadline = performance.now() + 1000;
      const correct = () => {
        if (this.destroyed) return;
        if (this.bodyScroll.scrollLeft !== savedLeft) {
          this.bodyScroll.scrollLeft = savedLeft;
          this.headerScroll.scrollLeft = savedLeft;
        }
        if (performance.now() < deadline) {
          requestAnimationFrame(correct);
        }
      };
      requestAnimationFrame(correct);
    });
    this.unsubscribes.push(unsubFilterScroll);

    const unsubLiveFilteredRows = this.state.filteredRows.subscribe(() => {
      if (!this.destroyed) {
        this.scheduleLiveRegionUpdate();
        this.updateGridCounts();
      }
    });
    this.unsubscribes.push(unsubLiveFilteredRows);

    const unsubLiveSort = this.state.sortColumns.subscribe(() => {
      if (!this.destroyed) this.scheduleLiveRegionUpdate();
    });
    this.unsubscribes.push(unsubLiveSort);

    // Clamp focused cell when row count shrinks. A header cursor
    // (row === HEADER_ROW_INDEX) is exempt — the header row exists
    // independently of how many data rows survive the filter.
    const unsubFocusClamp = this.state.filteredRows.subscribe(() => {
      if (this.destroyed) return;
      const focusedCell = this.state.focusedCell.get();
      if (!focusedCell) return;
      if (focusedCell.row === HEADER_ROW_INDEX) return;
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
            column: cols[0]!,
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

    // Update header widths. Rounded exactly as the body's prefix sums round
    // them: a fractional width is reachable (`setColumnWidth` does not round,
    // and a drag under page zoom passes a fractional `clientX`), and a residue
    // that multiplies by M in the header and by 1 in the body's spacer is what
    // pulls the two apart at 1,000 columns.
    for (const header of this.columnHeaders) {
      const col = header.getColumn();
      const width = Math.round(columnWidths.get(col.name) ?? 150);
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

    const baseZ =
      Number(getComputedStyle(this.element).getPropertyValue('--dt-z-pinned-col').trim()) || 20;

    // Cumulative left offsets over the leading run of `visibleColumns`, which
    // is where the pinned group actually lives — not over `pinnedColumns`,
    // which still lists columns `hideColumn` has removed from view. The same
    // helper the body uses, so the two cannot disagree.
    const { pinnedCount } = resolvePinnedCount(visibleColumns, pinnedColumns);
    const offsets = pinnedOffsets(visibleColumns, columnWidths, pinnedCount, baseZ);
    let pinnedWidth = 0;
    for (let i = 0; i < pinnedCount; i++) {
      pinnedWidth += Math.round(columnWidths.get(visibleColumns[i]!) ?? 150);
    }

    // Apply to header elements
    for (const header of this.columnHeaders) {
      const colName = header.getColumn().name;
      const el = header.getElement();
      const offset = offsets.get(colName);

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

    // Apply to body cells. Keyed by each cell's own `data-column`: a body row
    // holds a pinned prefix, two presentational spacers and a slice of the
    // columns, so pairing `cells[i]` with `visibleColumns[i]` would pin the
    // wrong elements. Window-scoping is free — only rendered cells exist.
    const cells = this.bodyContainer.querySelectorAll<HTMLElement>(`.${prefix}-cell[data-column]`);
    for (const cell of cells) {
      const offset = offsets.get(cell.getAttribute('data-column')!);

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

    // Manage the continuous demarcation line overlay
    if (pinnedCount > 0) {
      if (!this.pinnedDemarcation) {
        this.pinnedDemarcation = document.createElement('div');
        this.pinnedDemarcation.className = `${prefix}-pinned-demarcation`;
        this.element.appendChild(this.pinnedDemarcation);
      }
      this.pinnedDemarcation.style.left = `${pinnedWidth}px`;
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

    // Remember the *specific* element focus sits on before render destroys DOM
    // elements. Actions like pin/hide remove the focused button, dropping focus
    // to document.body — the rAF below puts it back on the grid. Tracking the
    // element rather than a boolean is what distinguishes that from "the user
    // tabbed away while we were rendering", which must not be reeled back in.
    const focusedBefore = this.activeElementInRoot();
    const focusedInTable =
      focusedBefore instanceof HTMLElement && this.element.contains(focusedBefore)
        ? focusedBefore
        : null;

    const schema = this.state.schema.get();
    const visibleColumns = this.state.visibleColumns.get();
    const tableName = this.state.tableName.get();
    const columnWidths = this.state.columnWidths.get();
    const columnOrder = this.state.columnOrder.get();

    // Attach / detach the ARIA grid semantics, then refresh its dimensions.
    this.applyGridSemantics(schema.length > 0 && !!tableName);
    this.updateGridCounts();

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
      // Row 1 of the grid — body rows start at 2 (see updateGridCounts).
      headerRowEl.setAttribute('aria-rowindex', '1');

      // Create column headers
      if (this.actions) {
        let visibleIndex = 0;
        for (const colName of visibleColumns) {
          const colSchema = schema.find((s) => s.name === colName);
          if (colSchema) {
            // aria-colindex is a position in the *presented* table, and ARIA
            // requires the values to ascend in DOM order within a row — a MUST,
            // not a SHOULD. `columnOrder` is the presentation order including
            // hidden columns, and `visibleColumns` is a filter over it, so
            // indexing into it ascends by construction while hidden columns
            // still leave the gaps ARIA uses to signal "columns not present".
            // Deriving from `schema` instead reported 3, 1, 2 after a reorder.
            const orderIndex = columnOrder.indexOf(colName);
            const colIndex =
              orderIndex >= 0 ? orderIndex + 1 : schema.findIndex((s) => s.name === colName) + 1;
            const columnHeader = new ColumnHeader(colSchema, this.state, this.actions, {
              cellId: this.buildHeaderCellId(visibleIndex++),
              classPrefix: this.resolvedOptions.classPrefix,
              onFilterClick: (column, buttonEl) => this.handleFilterClick(column, buttonEl),
              onDerivedIconClick: (column, buttonEl) =>
                void this.handleDerivedIconClick(column, buttonEl),
              colIndex: colIndex > 0 ? colIndex : undefined,
              messages: this.messages,
              showDerivedEditIcon: this.resolvedOptions.showDerivedColumnEditIcon !== false,
              annotations: this.resolvedOptions.annotations,
              annotationPopover: this.resolvedOptions.annotationPopover,
              columnHeaderTooltipPopover: this.resolvedOptions.columnHeaderTooltipPopover,
              announce: (message) => this.announce(message),
            });
            this.columnHeaders.push(columnHeader);

            // Apply dynamic width from state (default to 150px), rounded to
            // match the body's prefix sums — see `updateColumnWidths`.
            const headerEl = columnHeader.getElement();
            const width = Math.round(columnWidths.get(colName) ?? 150);
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
            // `role="row"` requires cell-ish children; without this the
            // no-actions shell would fail aria-required-children.
            colEl.setAttribute('role', 'columnheader');
            colEl.style.padding = '0.5rem';

            // Apply dynamic width from state (default to 150px)
            const width = columnWidths.get(colName) ?? 150;
            colEl.style.width = `${width}px`;

            // Build the placeholder header via DOM nodes so a hostile column
            // name (e.g. from an attacker-controlled CSV header) cannot inject
            // markup. Reachable via /advanced when TableContainer is mounted
            // without `actions`.
            const nameEl = document.createElement('strong');
            nameEl.textContent = colSchema.name;
            const typeEl = document.createElement('small');
            typeEl.textContent = colSchema.type;
            colEl.replaceChildren(nameEl, document.createElement('br'), typeEl);
            headerRowEl.appendChild(colEl);
          }
        }
      }

      // Only mount the row once it actually owns column headers. A childless
      // `role="row"` is a critical `aria-required-children` violation, and an
      // empty visible set is reachable both permanently (`setColumnOrder([])`,
      // `stripDerivedColumnRefs` — neither guards the way `hideColumn` does)
      // and transiently, whenever `schema` and `visibleColumns` land as
      // separate signal writes and the schema write renders first.
      if (headerRowEl.childElementCount > 0) {
        this.headerRow.appendChild(headerRowEl);
      }

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
        this.tableBody = new TableBody(this.bodyContainer, this.state, this.bridge, this.actions, {
          rowHeight: this.resolvedOptions.rowHeight,
          classPrefix: this.resolvedOptions.classPrefix,
          instanceId: this.resolvedOptions.instanceId,
          scrollContainer: this.bodyScroll,
          // headerHeight no longer needed - body scroll only contains body
          annotations: this.resolvedOptions.annotations,
          annotationPopover: this.resolvedOptions.annotationPopover,
          messages: this.messages,
          fetchBlockSize: this.resolvedOptions.fetchBlockSize,
          rowCacheRows: this.resolvedOptions.rowCacheRows,
          prefetch: this.resolvedOptions.prefetch,
          onRowsRendered: () => this.syncActiveDescendant(),
          // Where the body parks real DOM focus when it is about to detach the
          // row holding it. Passed explicitly rather than rediscovered with
          // `closest('.dt-grid')` so the dependency is visible at the wiring.
          gridElement: this.gridElement,
        });

        // Eagerly set content width so scrollWidth is correct for auto-scroll.
        // initialize() sets this later via async DuckDB fetch, but scrollToRightEnd()
        // may fire before that completes.
        {
          let totalWidth = 0;
          for (const colName of visibleColumns) {
            totalWidth += Math.round(columnWidths.get(colName) ?? 150);
          }
          this.tableBody.getVirtualScroller().setContentWidth(totalWidth);
        }

        // Initialize table body asynchronously, but track the promise so
        // `whenBodyReady()` can resolve only after the surviving body's
        // first SELECT settles. The `.catch` swallows so a transient init
        // error never rejects the public `await createDataTable(...)` /
        // `await table.loadData(...)` promise — current behavior is to log
        // and continue, which we preserve.
        this.currentBodyInit = this.tableBody.initialize().catch((error) => {
          console.error('Error initializing table body:', error);
        });
      } else {
        // Fallback: show row count if no bridge/actions. Wrapped in a
        // row/gridcell pair because `.dt-body-scroll` is the body rowgroup
        // once grid semantics are on, and a rowgroup may only own rows.
        const placeholderRow = document.createElement('div');
        // Its own class, not `.dt-row`: that would impose the 32px row
        // height, the row border and the pointer cursor on a centred block
        // of placeholder text. Only the role is needed here.
        placeholderRow.className = `${this.resolvedOptions.classPrefix}-placeholder-row`;
        placeholderRow.setAttribute('role', 'row');
        const bodyPlaceholder = document.createElement('div');
        bodyPlaceholder.className = `${this.resolvedOptions.classPrefix}-body-placeholder`;
        bodyPlaceholder.setAttribute('role', 'gridcell');
        bodyPlaceholder.textContent = `${this.state.totalRows.get().toLocaleString()} rows`;
        placeholderRow.appendChild(bodyPlaceholder);
        this.bodyContainer.appendChild(placeholderRow);
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

    // render() rebuilt every ColumnHeader, so the cursor's target element is
    // gone. Re-point it (dropping to the first visible column if its column
    // disappeared) before anything reads aria-activedescendant.
    this.reconcileCursorColumn(visibleColumns);
    this.syncActiveDescendant();
    this.updateHeaderCursorStyles();

    // Restore scroll positions and focus after DOM updates (both containers for robustness)
    requestAnimationFrame(() => {
      if (!this.destroyed) {
        this.bodyScroll.scrollLeft = savedBodyScrollLeft;
        this.bodyScroll.scrollTop = savedBodyScrollTop;
        this.headerScroll.scrollLeft = savedHeaderScrollLeft;

        // Restore focus only when this render is what destroyed it: the element
        // focus was on is gone from the table AND focus fell to nothing (body,
        // or null under a shadow root). Anything else — most importantly a Tab
        // that landed outside the table between the render and this frame —
        // is the user's own move and must be left alone; yanking focus back is
        // no better than trapping it. Guarded on `gridSemanticsActive` because
        // `.dt-grid` only carries `tabindex` while it does, so `.focus()` on an
        // unloaded shell is a silent no-op that would leave focus on <body>.
        const activeNow = this.activeElementInRoot();
        const focusFellAway = activeNow === null || activeNow === this.element.ownerDocument.body;
        if (
          focusedInTable &&
          this.gridSemanticsActive &&
          !this.element.contains(focusedInTable) &&
          focusFellAway
        ) {
          this.gridElement.focus({ preventScroll: true });
        }
      }
    });
  }

  /**
   * Keep the cursor on a column that still exists. Hiding or removing the
   * cursor's column would otherwise leave `aria-activedescendant` pointing at
   * a destroyed header and the header ring painted on nothing.
   */
  private reconcileCursorColumn(visibleColumns: string[]): void {
    const focused = this.state.focusedCell.get();
    if (!focused || visibleColumns.includes(focused.column)) return;
    if (visibleColumns.length === 0) {
      this.actions?.clearFocusedCell();
      return;
    }
    this.actions?.setFocusedCell({ row: focused.row, column: visibleColumns[0]! });
  }

  /**
   * Paint the cursor ring on the column header the cursor sits on, mirroring
   * `.dt-cell--focused` in the body. Body-cell painting stays in TableBody,
   * which owns the recycled row elements.
   */
  private updateHeaderCursorStyles(): void {
    const focused = this.state.focusedCell.get();
    const cursorColumn = focused && focused.row === HEADER_ROW_INDEX ? focused.column : null;
    const focusClass = `${this.resolvedOptions.classPrefix}-col-header--focused`;
    for (const header of this.columnHeaders) {
      header.getElement().classList.toggle(focusClass, header.getColumn().name === cursorColumn);
    }
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
        messages: this.messages,
      });
      this.element.appendChild(this.filterPanel.getElement());
    }

    this.filterPanel.toggle(column, anchorElement);
  }

  /**
   * Handle derived column icon click from a column header.
   * Dynamic-imports + lazily constructs the DerivedColumnEditPanel on first
   * click, then toggles it. The dynamic import keeps `CodeMirrorExpressionEditor`
   * (and its `@codemirror/*` peer deps) out of the consumer's static graph so
   * tables with `derivedColumns: false` ship without the editor chunk.
   */
  private async handleDerivedIconClick(
    columnName: string,
    anchorElement: HTMLElement,
  ): Promise<void> {
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

    if (!this.derivedEditPanel) {
      const { DerivedColumnEditPanel } = await import('../derived/DerivedColumnEditPanel');
      if (this.destroyed) return;
      if (!this.derivedEditPanel) {
        this.derivedEditPanel = new DerivedColumnEditPanel(this.state, this.actions, {
          classPrefix: this.resolvedOptions.classPrefix,
          editorFactory: this.resolvedOptions.editorFactory,
          colorSchemeSource: this.element,
          messages: this.messages,
        });
        this.element.appendChild(this.derivedEditPanel.getElement());
      }
    }

    if (this.destroyed || !this.derivedEditPanel) return;
    this.derivedEditPanel.toggle(columnName, anchorElement);
  }

  /**
   * Handle "+" add column button click.
   * Dynamic-imports + opens the DerivedColumnModal for creating a new derived
   * column. Chunk-splits CodeMirror out of the consumer's main bundle.
   */
  private async handleAddColumnClick(): Promise<void> {
    if (!this.actions) return;

    // Close other floating panels/modals (mutual exclusion)
    if (this.filterPanel?.getIsOpen()) this.filterPanel.close();
    if (this.derivedEditPanel?.getIsOpen()) this.derivedEditPanel.close();
    if (this.sqlFilterModal?.getIsOpen()) this.sqlFilterModal.close();
    if (this.presetPanel?.getIsOpen()) this.presetPanel.close();

    if (!this.derivedModal) {
      const { DerivedColumnModal } = await import('../derived/DerivedColumnModal');
      if (this.destroyed) return;
      if (!this.derivedModal) {
        this.derivedModal = new DerivedColumnModal(this.state, this.actions, {
          classPrefix: this.resolvedOptions.classPrefix,
          instanceId: this.resolvedOptions.instanceId,
          editorFactory: this.resolvedOptions.editorFactory,
          onCreated: () => this.scrollToRightEnd(),
          colorSchemeSource: this.element,
          messages: this.messages,
        });
        // Mount in the configured portal target (defaults to <body>). Fixed-
        // position modals need a root that isn't inside a transformed/filtered
        // ancestor so they can cover the viewport without stacking-context surprises.
        this.getPortalTarget().appendChild(this.derivedModal.getElement());
      }
    }

    if (this.destroyed || !this.derivedModal) return;
    this.derivedModal.open();
  }

  /**
   * Dynamic-import + lazy-construct the SQL filter modal. Shared by
   * `openSQLFilterModal` (create mode) and `openSQLFilterModalForEdit` so
   * both call sites hit a single chunk boundary.
   */
  private async ensureSqlFilterModal(): Promise<SQLFilterModal | null> {
    if (!this.actions) return null;
    if (this.sqlFilterModal) return this.sqlFilterModal;
    const { SQLFilterModal } = await import('../filters/SQLFilterModal');
    if (this.destroyed) return null;
    if (!this.sqlFilterModal) {
      this.sqlFilterModal = new SQLFilterModal(this.state, this.actions, {
        classPrefix: this.resolvedOptions.classPrefix,
        instanceId: this.resolvedOptions.instanceId,
        editorFactory: this.resolvedOptions.editorFactory,
        colorSchemeSource: this.element,
        messages: this.messages,
      });
      this.getPortalTarget().appendChild(this.sqlFilterModal.getElement());
    }
    return this.sqlFilterModal;
  }

  /**
   * Open the SQL filter modal in create mode.
   */
  private async openSQLFilterModal(): Promise<void> {
    if (!this.actions) return;

    // Mutual exclusion: close other panels/modals
    if (this.filterPanel?.getIsOpen()) this.filterPanel.close();
    if (this.derivedEditPanel?.getIsOpen()) this.derivedEditPanel.close();
    if (this.derivedModal?.getIsOpen()) this.derivedModal.close();
    if (this.presetPanel?.getIsOpen()) this.presetPanel.close();

    const modal = await this.ensureSqlFilterModal();
    if (this.destroyed || !modal) return;
    modal.open();
  }

  /**
   * Open the SQL filter modal in edit mode for the given filter id.
   */
  private async openSQLFilterModalForEdit(filterId: string): Promise<void> {
    if (!this.actions) return;

    // Mutual exclusion
    if (this.filterPanel?.getIsOpen()) this.filterPanel.close();
    if (this.derivedEditPanel?.getIsOpen()) this.derivedEditPanel.close();
    if (this.derivedModal?.getIsOpen()) this.derivedModal.close();
    if (this.presetPanel?.getIsOpen()) this.presetPanel.close();

    const modal = await this.ensureSqlFilterModal();
    if (this.destroyed || !modal) return;
    modal.openForEdit(filterId);
  }

  /**
   * Handle "Presets" button click from filter bar.
   * Dynamic-imports the FilterPresetPanel on first click (FilterPresetPanel
   * does not pull CodeMirror today, but the lazy boundary stays symmetric
   * with the other modal handlers).
   */
  private async handlePresetsClick(): Promise<void> {
    if (!this.actions || !this.resolvedOptions.presetManager) return;

    // Mutual exclusion: close other panels/modals
    if (this.filterPanel?.getIsOpen()) this.filterPanel.close();
    if (this.derivedEditPanel?.getIsOpen()) this.derivedEditPanel.close();
    if (this.sqlFilterModal?.getIsOpen()) this.sqlFilterModal.close();
    if (this.derivedModal?.getIsOpen()) this.derivedModal.close();

    if (!this.presetPanel) {
      const { FilterPresetPanel } = await import('../filters/FilterPresetPanel');
      if (this.destroyed) return;
      if (!this.presetPanel) {
        this.presetPanel = new FilterPresetPanel(
          this.resolvedOptions.presetManager,
          this.state,
          this.actions,
          {
            classPrefix: this.resolvedOptions.classPrefix,
            colorSchemeSource: this.element,
            messages: this.messages,
          },
        );
        this.element.appendChild(this.presetPanel.getElement());
      }
    }

    if (this.destroyed || !this.presetPanel) return;

    // Find the presets button as anchor for positioning
    const presetsBtn = this.filterBar
      ?.getElement()
      .querySelector(`.${this.resolvedOptions.classPrefix}-filter-presets-btn`) as HTMLElement;

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
   * Resolves once the surviving `TableBody`'s first paint has settled.
   *
   * Used by `loadDataImpl` so `await createDataTable({ source })` and
   * `await table.loadData(source)` only resolve after the first row
   * fetch lands — closing the contract gap where consumers could call
   * `addFilter` synchronously and race the unfiltered initial SELECT.
   *
   * Resolves (never rejects) on every path: success, body-init error
   * (swallowed at the assignment site), `destroy()` mid-init, and the
   * no-fetch paths (zero rows, empty `visibleColumns`).
   */
  whenBodyReady(): Promise<void> {
    return this.currentBodyInit;
  }

  /**
   * Get the root element
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Get the ARIA grid element — the keyboard cursor's tab stop.
   *
   * This is what `container.querySelector('[role="grid"]')` resolves to and
   * what to call `.focus()` on to put the keyboard cursor into the table. It
   * only carries `role="grid"` / `tabindex="0"` once a schema and table name
   * exist; before that it is an inert shell.
   *
   * @example
   * ```typescript
   * table.getContainer().getGridElement().focus();
   * ```
   */
  getGridElement(): HTMLElement {
    return this.gridElement;
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
   * The instance identifier actually mixed into this table's element IDs.
   *
   * Not the `instanceId` a caller passed in: `resolveInstanceId` always
   * appends a random suffix, so two tables handed the same value still mint
   * disjoint cell ids. Anything that builds an ID referencing this table —
   * the export dialog's `aria-labelledby`, a consumer's own test selector —
   * has to read the resolved value from here rather than assume the input.
   *
   * @example
   * ```typescript
   * const cellId = `dt-${container.getInstanceId()}-cell-0-1`;
   * ```
   */
  getInstanceId(): string {
    return this.resolvedOptions.instanceId;
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
