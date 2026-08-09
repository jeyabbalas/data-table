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
import type { ColumnSchema } from '../core/types';
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
import {
  BOX_OVERHEAD_PX,
  ColumnWindowModel,
  MIN_OVERSCAN_COLUMNS,
  buildColumnIndexMap,
  pinnedOffsets,
  resolveColumnWidth,
  resolvePinnedCount,
  type ColumnWindow,
  type ColumnWindowHost,
} from './ColumnWindow';
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
  /**
   * Called once a `ColumnHeader` has been constructed and registered.
   *
   * The header row is windowed, so this fires as columns scroll in — not once
   * per table. Anything that decorates a header from outside (the
   * visualization canvas, a custom stats panel) has to be driven from here
   * rather than from a sweep over `getColumnHeaders()`, which names only what
   * is mounted at the instant it is called.
   *
   * The header is resolvable by name and its elements are usable, but it is
   * **not** necessarily connected to the document yet: the caller places it
   * afterwards, and a full render fills a detached row before swapping it in.
   * A listener that needs geometry must therefore measure on its own
   * `ResizeObserver` rather than at this callback — which is what the
   * visualizations already do, and why they come up correctly sized.
   *
   * @internal
   */
  onHeaderMount?: ((header: ColumnHeader) => void) | undefined;
  /**
   * Called before a `ColumnHeader` is torn down, while it is still live and
   * still in the DOM — late enough that nothing else has touched it, early
   * enough that a listener can read state off it (a chart's data snapshot,
   * for instance) before it is gone.
   *
   * @internal
   */
  onHeaderUnmount?: ((header: ColumnHeader) => void) | undefined;
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
  /**
   * The **mounted** column headers, in DOM order.
   *
   * Since the header row is windowed this is the visible window plus the
   * pinned prefix, not one per visible column. `getColumnHeaders()` returns a
   * copy of it and `KeyboardNavigator` walks it.
   */
  private columnHeaders: ColumnHeader[] = [];
  /** The same set, by column name — the header half of `syncActiveDescendant`. */
  private headerByColumn = new Map<string, ColumnHeader>();
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

  // ---- Header column maps -------------------------------------------------
  //
  // The header build loop used to be O(cols²): a `schema.find` and a
  // `columnOrder.indexOf` per column, i.e. ~1M string comparisons per render
  // at 1,000 columns — and `render()` runs on every `schema` / `visibleColumns`
  // write, twice on load. These three maps replace all of it.
  //
  // Each is rebuilt only when the array identity behind it changes. That is a
  // sound cache key and not an optimistic one: the state layer replaces
  // `schema`, `visibleColumns` and `columnOrder` wholesale rather than mutating
  // them, which is the same premise `ColumnWindowModel.sync` and
  // `TableBody.syncVisibleIndexMap` are built on.
  private schemaByName = new Map<string, ColumnSchema>();
  private schemaMapSource: readonly ColumnSchema[] | null = null;
  /** Column name → index into `visibleColumns`. */
  private visibleIndexByName = new Map<string, number>();
  private visibleIndexSource: readonly string[] | null = null;
  /** Column name → 1-based `aria-colindex` — see {@link buildColumnIndexMap}. */
  private colIndexByName = new Map<string, number>();
  private colIndexSchemaSource: readonly ColumnSchema[] | null = null;
  private colIndexOrderSource: readonly string[] | null = null;

  // ---- Shared column window ------------------------------------------------
  //
  // One model, two consumers: the header row and the body render the same
  // columns at the same offsets, and computing that twice is how they drift.
  // The container owns the prefix sums, the viewport definition and the
  // drivers; `TableBody` is handed all three (`ColumnWindowHost`) and keeps
  // only its own body-cursor focus extension.
  private readonly columnWindowModel = new ColumnWindowModel();
  private readonly columnWindowHost: ColumnWindowHost;
  // The `role="row"` element inside `.dt-header`, or null before the first
  // build / while there is no data. Held rather than re-queried because it is
  // where the horizontal content extent is written on every body render pass.
  private headerRowInner: HTMLElement | null = null;
  // The window the mounted headers were built for, and the `visibleColumns`
  // identity they were built from. Together these say whether a recompute can
  // be absorbed by moving the two edges or needs the run rebuilt.
  private headerWindow: ColumnWindow = {
    start: 0,
    end: 0,
    pinnedCount: 0,
    leftSpacerPx: 0,
    rightSpacerPx: 0,
    pinnedWidthPx: 0,
    totalWidthPx: 0,
    pinnedPrefixViolated: false,
  };
  private headerWindowColumns: readonly string[] | null = null;
  // The two `.dt-col-spacer` elements standing in for the columns either side
  // of the window — the body row's primitive, in the header row.
  private leftHeaderSpacer: HTMLElement | null = null;
  private rightHeaderSpacer: HTMLElement | null = null;
  // Watches `.dt-body-scroll`'s box: the window is a function of `clientWidth`
  // as much as of `scrollLeft`, so a viewport that grows without scrolling has
  // to recompute. Lives here rather than in `TableBody` because both axes
  // consume the answer — see `ColumnWindowHost`.
  private readonly columnResizeObserver: ResizeObserver;
  private lastColumnClientWidth = -1;
  private lastColumnScrollLeft = -1;
  private columnScrollRAF: number | null = null;

  // FLIP animation: saved column positions before pin/unpin reorder
  private savedColumnPositions: Map<string, DOMRect> | null = null;

  // Track previous visible columns for restore-highlight detection
  private previousVisibleColumns = new Set<string>();

  /**
   * The relation the header row was last **rebuilt** for, by identity.
   *
   * `render()` dispatches on this: a new `schema` array or a new `tableName`
   * means the table is describing something else and everything is rebuilt;
   * anything else reconciles the row in place.
   *
   * Identity is a sound key because every writer of `schema` in `src/`
   * replaces the array rather than mutating it — the same fact the
   * column-window model's cache rests on. It is also what collapses the load's
   * double render: `initializeColumnsFromSchema` writes `schema` and
   * `visibleColumns` in one batch, so the `schema` subscriber rebuilds against
   * the final value of both, and the `visibleColumns` subscriber that follows
   * finds every column already mounted where it belongs.
   *
   * `visibleColumns` is deliberately *not* part of this. It would only be
   * usable to skip the cheap tier altogether, and `render()` does not skip —
   * see its docblock for why.
   */
  private headerStructure: {
    schema: readonly ColumnSchema[] | null;
    tableName: string | null;
  } = { schema: null, tableName: null };

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
      onHeaderMount: undefined as unknown as (header: ColumnHeader) => void,
      onHeaderUnmount: undefined as unknown as (header: ColumnHeader) => void,
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

    // The shared column window: the model, where it is anchored, where the
    // content extent is published, and what a move re-renders.
    this.columnWindowHost = {
      model: this.columnWindowModel,
      viewport: () => ({
        scrollLeft: this.bodyScroll.scrollLeft,
        // The wider of the two scrollers. They differ by the body's vertical
        // scrollbar, and taking the narrower one would leave the header's
        // rightmost column unmounted while its cells were rendered — a
        // one-column disagreement that grows into a visible gap at the right
        // edge of any scrolled table.
        viewportWidth: Math.max(this.headerScroll.clientWidth, this.bodyScroll.clientWidth),
      }),
      setContentWidth: (totalWidthPx) => this.applyContentWidth(totalWidthPx),
      refresh: () => this.refreshColumnWindow(),
    };
    this.columnResizeObserver = new ResizeObserver(() => this.handleColumnViewportResize());
    this.columnResizeObserver.observe(this.bodyScroll);

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
        refreshColumnWindow: () => this.refreshColumnWindow(),
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
      this.scheduleColumnWindowRefresh();
      if (isScrolling) return;
      isScrolling = true;
      this.headerScroll.scrollLeft = this.bodyScroll.scrollLeft;
      isScrolling = false;
    };

    this.boundHeaderScrollHandler = () => {
      // Ahead of the latch: a header-driven scroll writes `bodyScroll`
      // *inside* the latch, and the `scroll` event that produces arrives in a
      // later task. Without this, dragging the header's own scrollbar moves
      // the offset a frame before either axis re-windows.
      this.scheduleColumnWindowRefresh();
      if (isScrolling || this.suppressReverseScrollSync) return;
      isScrolling = true;
      this.bodyScroll.scrollLeft = this.headerScroll.scrollLeft;
      isScrolling = false;
    };

    this.bodyScroll.addEventListener('scroll', this.boundBodyScrollHandler, { passive: true });
    this.headerScroll.addEventListener('scroll', this.boundHeaderScrollHandler, { passive: true });
  }

  // =========================================
  // Shared column window
  // =========================================

  /**
   * Re-window both axes at most once per frame.
   *
   * One rAF in flight, every event in between dropped — the policy
   * `VirtualScroller.handleScroll` uses, because these run off the same
   * element and the same event storm and a second throttling policy on one
   * stream is only a second thing to get wrong. The `scrollLeft` comparison is
   * what makes vertical scrolling free: this fires on every wheel tick, and a
   * vertical-only scroll leaves `scrollLeft` alone.
   */
  private scheduleColumnWindowRefresh(): void {
    if (this.destroyed) return;
    if (this.bodyScroll.scrollLeft === this.lastColumnScrollLeft) return;
    if (this.columnScrollRAF !== null) return;

    this.columnScrollRAF = requestAnimationFrame(() => {
      this.columnScrollRAF = null;
      if (this.destroyed) return;
      this.refreshColumnWindow();
    });
  }

  /**
   * Re-window both axes when the viewport's *width* changes.
   *
   * Keyed on `clientWidth` alone: a height change moves the row range, which
   * is `VirtualScroller`'s business, and recomputing a window that cannot have
   * moved would put a binary search on every vertical resize frame. Collapse a
   * sidebar, maximize the window, or reveal a tab panel that was
   * `display: none` at mount, and without this the extra width is bare
   * right-spacer until something happens to scroll.
   */
  private handleColumnViewportResize(): void {
    if (this.destroyed) return;
    const width = this.bodyScroll.clientWidth;
    if (width === this.lastColumnClientWidth) return;
    this.lastColumnClientWidth = width;
    this.refreshColumnWindow();
  }

  /**
   * Recompute the shared column window and reconcile every consumer of it.
   *
   * Synchronous: when this returns, the DOM matches the current `scrollLeft`.
   * That is the whole reason it exists as a method rather than as a scroll
   * handler. The browser does not dispatch `scroll` until after the current
   * task, so code that *writes* `scrollLeft` — keyboard navigation, the
   * filter-change scroll pin, the scroll restore after a re-render — would
   * otherwise leave a frame in which what is on screen belongs to the previous
   * offset. At 1,000 columns that frame is a blank table.
   *
   * Cheap when nothing moved: cached prefix sums, a binary search, and a
   * comparison per axis — no DOM work at all. Safe to call unconditionally
   * after any programmatic scroll, which is what every call site does.
   *
   * @example
   * ```typescript
   * bodyScroll.scrollLeft = targetLeft;
   * container.refreshColumnWindow(); // both axes match the new offset now
   * ```
   */
  refreshColumnWindow(): void {
    if (this.destroyed) return;
    // Record the offset this pass answered for, whatever the answer is: the
    // scroll handler skips work while `scrollLeft` still matches it.
    this.lastColumnScrollLeft = this.bodyScroll.scrollLeft;
    // Header first, so a cursor move that mounts a header has its element in
    // the DOM before the body's render pass calls back into
    // `syncActiveDescendant` to resolve the cursor's id.
    this.syncHeaderWindow();
    // The body re-derives the window from the *shared* model and applies its
    // own body-cursor focus extension, so the two axes cannot disagree about
    // where a column starts.
    this.tableBody?.refreshColumnWindow();
  }

  // =========================================
  // Header column window
  // =========================================

  /**
   * The window the header row should render at the current scroll offset.
   *
   * The base window is the body's — same model, same viewport — plus the
   * header's own anchor extension. The two extensions are deliberately
   * different: a body row widens for a *body* cursor, and the header widens
   * for a header cursor, for real DOM focus, and for an open layout gesture,
   * none of which a body row has to render anything for.
   */
  private computeHeaderWindow(
    visibleColumns: readonly string[],
    columnWidths: ReadonlyMap<string, number>,
  ): ColumnWindow {
    const { scrollLeft, viewportWidth } = this.columnWindowHost.viewport();
    const win = this.columnWindowModel.compute({
      visibleColumns,
      columnWidths,
      pinnedColumns: this.state.pinnedColumns.get(),
      scrollLeft,
      viewportWidth,
      boxOverheadPx: BOX_OVERHEAD_PX,
    });
    return this.extendWindowToAnchors(win, visibleColumns);
  }

  /**
   * Columns that must stay mounted regardless of where the window is.
   *
   * Pinned columns are not here — they are `[0, pinnedCount)` and always
   * rendered. What is:
   *
   *  - the **cursor's column** while the cursor is on the header row, because
   *    `aria-activedescendant` has to name an element that exists;
   *  - the column of a header holding **real DOM focus** (F2 controls mode, or
   *    a click straight onto a header button), because destroying the element
   *    focus sits on drops focus to `<body>` and silently ends keyboard
   *    navigation;
   *  - the column of an open **Shift+F2 layout gesture**, which is a state
   *    machine rather than DOM focus, so nothing else would keep the header
   *    the arrow keys are resizing in the DOM.
   *
   * Derived on every call rather than tracked in a field. A stored set desyncs
   * — `KeyboardNavigator.activeControls` makes the same choice for the same
   * reason — and this runs at most once per animation frame.
   */
  private headerAnchorColumns(): Set<string> {
    const anchors = new Set<string>();

    const focused = this.state.focusedCell.get();
    if (focused && focused.row === HEADER_ROW_INDEX) anchors.add(focused.column);

    const active = this.activeElementInRoot();
    if (active instanceof HTMLElement) {
      const owner = active.closest<HTMLElement>(
        `.${this.resolvedOptions.classPrefix}-col-header[data-column]`,
      );
      const name = owner?.getAttribute('data-column');
      if (name) anchors.add(name);
    }

    const layoutColumn = this.keyboardNavigator?.getLayoutColumn();
    if (layoutColumn) anchors.add(layoutColumn);

    return anchors;
  }

  /**
   * Widen `win` so the anchored columns are rendered — when they are close.
   *
   * Clamped to the same overscan budget the body clamps its focus extension
   * to, and for the same reason: a cursor parked 900 columns from the viewport
   * must not drag 900 headers into the DOM, which is the whole thing windowing
   * exists to prevent. Past the budget the header simply is not mounted, and
   * `syncActiveDescendant` drops the attribute rather than pointing at
   * nothing — the correct ARIA answer for a cursor scrolled out of view.
   *
   * Real DOM focus is the one case the budget cannot be allowed to lose, and
   * it is not this method that saves it: {@link unmountColumnHeader} parks
   * focus on `.dt-grid` before detaching a header that holds it, the same
   * rescue `TableBody` performs for a row it is about to recycle. So focus
   * degrades to the grid cursor rather than to `<body>`, at any distance.
   *
   * Budgets are measured against the *incoming* window, never against a
   * running total, so several anchors cannot ratchet the window open.
   */
  private extendWindowToAnchors(
    win: ColumnWindow,
    visibleColumns: readonly string[],
  ): ColumnWindow {
    const anchors = this.headerAnchorColumns();
    if (anchors.size === 0) return win;

    this.syncVisibleIndexMap(visibleColumns);
    let start = win.start;
    let end = win.end;
    for (const column of anchors) {
      const index = this.visibleIndexByName.get(column);
      // Pinned columns are always rendered, so an anchor on one needs nothing.
      if (index === undefined || index < win.pinnedCount) continue;
      if (index < win.start) {
        if (win.start - index <= MIN_OVERSCAN_COLUMNS) start = Math.min(start, index);
      } else if (index >= win.end) {
        if (index + 1 - win.end <= MIN_OVERSCAN_COLUMNS) end = Math.max(end, index + 1);
      }
    }

    if (start === win.start && end === win.end) return win;
    const n = this.columnWindowModel.size();
    return {
      ...win,
      start,
      end,
      leftSpacerPx: this.columnWindowModel.spanPx(win.pinnedCount, start),
      rightSpacerPx: this.columnWindowModel.spanPx(end, n),
    };
  }

  /**
   * A header spacer: the width of the columns the row does not render.
   *
   * The body's primitive, verbatim — `TableBody.createSpacer` builds the same
   * element with the same class, role and attributes. `aria-hidden` is what
   * actually keeps it out of the accessibility tree, so `role="row"` still
   * satisfies `aria-required-children` with only spacers between its cells;
   * `role="presentation"` is inert alongside it but says out loud to anything
   * walking the DOM that this is not a column header.
   */
  private createColumnSpacer(side: 'left' | 'right'): HTMLElement {
    const el = document.createElement('div');
    el.className = `${this.resolvedOptions.classPrefix}-col-spacer`;
    el.setAttribute('role', 'presentation');
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('data-col-spacer', side);
    el.style.flex = '0 0 0px';
    return el;
  }

  /** Column headers in `row`, spacers excluded — counted by role. */
  private headerCellCount(row: HTMLElement): number {
    return row.querySelectorAll(':scope > [role="columnheader"]').length;
  }

  /**
   * Build one `ColumnHeader`, ready to be inserted.
   *
   * Everything a header needs to be *born correct* happens here: its width,
   * its `aria-colindex`, its stable id, the cursor ring if the cursor is on
   * it, the layout outline if a gesture is open on it, and its reorder
   * handler. A header scrolled into view mid-session has to be
   * indistinguishable from one built at load, or every piece of state the
   * table carries becomes a scroll-position-dependent bug.
   *
   * Sticky pinning is *not* applied here, and that is not an omission: pinned
   * columns are `[0, pinnedCount)`, which is force-rendered at every offset,
   * so a header mounted at a window edge is never pinned. `render()` still
   * runs `updatePinnedColumnStyles` over the whole mounted set.
   *
   * Returns `null` for a column with no schema entry — reachable transiently
   * while `schema` and `visibleColumns` are landing as separate writes.
   */
  private mountColumnHeader(
    colName: string,
    columnWidths: ReadonlyMap<string, number>,
  ): ColumnHeader | null {
    const colSchema = this.schemaByName.get(colName);
    if (!colSchema || !this.actions) return null;

    // aria-colindex is a position in the *presented* table, and ARIA requires
    // the values to ascend in DOM order within a row — a MUST, not a SHOULD.
    // The numbering rule, and why it is `columnOrder` and not `schema`, lives
    // on `buildColumnIndexMap`, which the body numbers its cells from too.
    // Gaps are correct for a windowed row for the same reason they are correct
    // for a hidden column: they say "columns not present", which is exactly
    // what is true either side of a spacer.
    const colIndex = this.colIndexByName.get(colName) ?? 0;

    const header = new ColumnHeader(colSchema, this.state, this.actions, {
      // The column's global index in `visibleColumns`, not a counter over what
      // happens to be mounted. An id has to name the same column at every
      // window position: a dense counter would give the leftmost mounted
      // header id `…-colheader-0` at any scroll offset, so
      // `aria-activedescendant` would silently follow the *window* rather than
      // the cursor.
      cellId: this.buildHeaderCellId(this.visibleIndexByName.get(colName) ?? 0),
      classPrefix: this.resolvedOptions.classPrefix,
      onFilterClick: (column, buttonEl) => this.handleFilterClick(column, buttonEl),
      onDerivedIconClick: (column, buttonEl) => void this.handleDerivedIconClick(column, buttonEl),
      colIndex: colIndex > 0 ? colIndex : undefined,
      messages: this.messages,
      showDerivedEditIcon: this.resolvedOptions.showDerivedColumnEditIcon !== false,
      annotations: this.resolvedOptions.annotations,
      annotationPopover: this.resolvedOptions.annotationPopover,
      columnHeaderTooltipPopover: this.resolvedOptions.columnHeaderTooltipPopover,
      announce: (message) => this.announce(message),
      // The container owns the seven signals a header would watch and fans
      // them out to the mounted set — see `forEachMountedHeader`. Seven
      // subscriptions per header is seven times the window rather than a
      // constant, and every scroll frame that moves the window would add and
      // remove them by the dozen. The header still pulls current values in its
      // constructor, so it is correct before it is ever appended.
      subscribe: false,
    });

    // Apply dynamic width from state, resolved to match the body's prefix
    // sums — see `updateColumnWidths`.
    const el = header.getElement();
    el.style.width = `${resolveColumnWidth(columnWidths.get(colName))}px`;

    const focused = this.state.focusedCell.get();
    if (focused && focused.row === HEADER_ROW_INDEX && focused.column === colName) {
      el.classList.add(`${this.resolvedOptions.classPrefix}-col-header--focused`);
    }
    if (this.keyboardNavigator?.getLayoutColumn() === colName) header.setLayoutMode(true);

    this.headerByColumn.set(colName, header);
    this.columnReorder?.attachHandler(el);
    // Last, so the hook sees a header that is fully wired and findable by
    // name — `createDataTable` resolves the visualization container through
    // exactly that lookup. Placement is still the caller's, and deliberately
    // stays there: `render()` fills a detached row, so no ordering here could
    // promise a connected element anyway.
    this.resolvedOptions.onHeaderMount?.(header);
    return header;
  }

  /**
   * Tear one header down and undo everything mounting it did.
   *
   * The rescue first: real DOM focus inside an element about to be detached
   * falls back to `<body>`, which silently ends keyboard navigation — the same
   * failure `TableBody.moveFocusToGridBeforeRemoval` exists for on the row
   * axis, and the reason a windowed header row cannot simply destroy whatever
   * scrolls past. Parking focus on `.dt-grid` also exits F2 controls mode by
   * construction, since `KeyboardNavigator` derives that mode from
   * `document.activeElement` rather than storing it.
   *
   * Then the two attachments `ColumnHeader.destroy()` cannot see: the reorder
   * `mousedown`, which lives in `ColumnReorder`'s element-keyed map, and — via
   * `destroy()` itself — any popover still anchored inside the header.
   */
  private unmountColumnHeader(header: ColumnHeader): void {
    // First, while the header is still whole and still resolvable by name:
    // the visualization it carries snapshots its data off a live canvas.
    this.resolvedOptions.onHeaderUnmount?.(header);

    const el = header.getElement();
    const active = this.activeElementInRoot();
    if (active instanceof HTMLElement && el.contains(active)) {
      if (this.gridSemanticsActive) this.gridElement.focus({ preventScroll: true });
      else active.blur();
    }
    this.columnReorder?.detachHandler(el);
    this.headerByColumn.delete(header.getColumn().name);
    header.destroy();
  }

  /**
   * Fill a fresh header row with `[P pinned][left spacer][window][right
   * spacer]`, the body row's shape exactly.
   *
   * Pinned first, because they are sticky at `left: 0` and because
   * `aria-colindex` has to ascend in DOM order — `[0, pinnedCount)` carries
   * the lowest indices by construction.
   */
  private buildHeaderWindow(
    headerRowEl: HTMLElement,
    visibleColumns: readonly string[],
    columnWidths: ReadonlyMap<string, number>,
  ): void {
    const win = this.computeHeaderWindow(visibleColumns, columnWidths);

    for (let i = 0; i < win.pinnedCount && i < visibleColumns.length; i++) {
      const header = this.mountColumnHeader(visibleColumns[i]!, columnWidths);
      if (header) headerRowEl.appendChild(header.getElement());
    }

    const leftSpacer = this.createColumnSpacer('left');
    headerRowEl.appendChild(leftSpacer);
    this.leftHeaderSpacer = leftSpacer;

    for (let i = win.start; i < win.end; i++) {
      const header = this.mountColumnHeader(visibleColumns[i]!, columnWidths);
      if (header) headerRowEl.appendChild(header.getElement());
    }

    const rightSpacer = this.createColumnSpacer('right');
    headerRowEl.appendChild(rightSpacer);
    this.rightHeaderSpacer = rightSpacer;

    this.headerWindow = win;
    this.headerWindowColumns = visibleColumns;
    this.rebuildMountedHeaderList(visibleColumns, win);
    this.applyHeaderSpacerWidths(win);
  }

  /**
   * Recompute the header window and reconcile the row to it.
   *
   * The incremental path: mount and unmount at the two edges, rewrite two
   * spacer widths, and touch nothing else. No `TableBody`, no panels, no focus
   * restoration — this runs on every horizontal scroll frame, and anything it
   * does that `render()` also does is something the user pays for at scroll
   * rate.
   */
  private syncHeaderWindow(): void {
    if (this.destroyed) return;
    const row = this.headerRowInner;
    if (!row || !this.actions || !this.leftHeaderSpacer || !this.rightHeaderSpacer) return;

    const visibleColumns = this.state.visibleColumns.get();
    const columnWidths = this.state.columnWidths.get();
    const win = this.computeHeaderWindow(visibleColumns, columnWidths);
    const current = this.headerWindow;

    if (this.headerWindowColumns !== visibleColumns || win.pinnedCount !== current.pinnedCount) {
      // The column set, its order, or the pinned prefix moved out from under
      // the mounted run — a state `render()` normally reaches first. Reaching
      // it from here means something wrote `visibleColumns` without a render,
      // so reconcile rather than assume: keyed by name, it is correct from any
      // starting arrangement and costs nothing when there was nothing to do.
      this.reconcileHeaderRow(row, visibleColumns, columnWidths, win);
    } else if (win.start !== current.start || win.end !== current.end) {
      this.shiftHeaderWindow(row, visibleColumns, columnWidths, win, current);
    }

    this.headerWindow = win;
    this.headerWindowColumns = visibleColumns;
    this.rebuildMountedHeaderList(visibleColumns, win);
    this.applyHeaderSpacerWidths(win);
    this.applyContentWidth(win.totalWidthPx);
  }

  /**
   * Reconcile the mounted headers against a new column set, keyed by name.
   *
   * Hide, show, reorder, pin and a derived-column add all rewrite
   * `visibleColumns`, and every one of them used to destroy each mounted
   * header and construct a replacement. Keyed by column name instead: a
   * surviving column keeps its element, and with it its chart, its listeners,
   * its popovers and its stats panel — so a move costs one `insertBefore` and
   * two attribute writes rather than a teardown and a rebuild.
   *
   * That is also what makes hide/show/reorder cost no chart queries:
   * `VizDataController.sync` destroys an instance only when its container
   * *identity* changed, and under this reconcile a survivor's does not.
   */
  private reconcileHeaderRow(
    row: HTMLElement,
    visibleColumns: readonly string[],
    columnWidths: ReadonlyMap<string, number>,
    win: ColumnWindow,
  ): void {
    const leftSpacer = this.leftHeaderSpacer!;
    const rightSpacer = this.rightHeaderSpacer!;

    const pinned: string[] = [];
    for (let i = 0; i < win.pinnedCount && i < visibleColumns.length; i++) {
      pinned.push(visibleColumns[i]!);
    }
    const windowed: string[] = [];
    for (let i = win.start; i < win.end; i++) windowed.push(visibleColumns[i]!);
    const wanted = new Set([...pinned, ...windowed]);

    // Unmount first, so the placement walk below never has to step over a
    // header that is on its way out.
    for (const [name, header] of [...this.headerByColumn]) {
      if (!wanted.has(name)) this.unmountColumnHeader(header);
    }

    // Descending, each header inserted before the one that follows it, so a
    // run already in the right order costs zero DOM writes and a two-column
    // swap costs one — where placing ascending against a fixed anchor would
    // move every header in the window on every reorder.
    const place = (names: readonly string[], terminator: ChildNode): void => {
      let anchor: ChildNode = terminator;
      for (let i = names.length - 1; i >= 0; i--) {
        const name = names[i]!;
        const header = this.headerByColumn.get(name) ?? this.mountColumnHeader(name, columnWidths);
        if (!header) continue;
        const el = header.getElement();
        if (el.parentNode !== row || el.nextSibling !== anchor) row.insertBefore(el, anchor);
        anchor = el;
      }
    };
    place(pinned, leftSpacer);
    place(windowed, rightSpacer);

    // Re-key and re-size whatever survived. A header just mounted already
    // carries both, from the same two maps; re-applying is cheaper than
    // tracking which is which.
    for (const name of wanted) {
      const header = this.headerByColumn.get(name);
      if (!header) continue;
      const colIndex = this.colIndexByName.get(name) ?? 0;
      header.setCellIdentity(
        this.buildHeaderCellId(this.visibleIndexByName.get(name) ?? 0),
        colIndex > 0 ? colIndex : undefined,
      );
      header.getElement().style.width = `${resolveColumnWidth(columnWidths.get(name))}px`;
    }
  }

  /**
   * Move the mounted run from `current` to `win`, touching only the ends.
   *
   * A disjoint jump — a scrollbar drag across the table, `Ctrl+End` — is
   * handled as unmount-all-then-mount-all rather than by walking edges that
   * never meet. Either way the work is bounded by the two windows' sizes, not
   * by the distance between them.
   */
  private shiftHeaderWindow(
    row: HTMLElement,
    visibleColumns: readonly string[],
    columnWidths: ReadonlyMap<string, number>,
    win: ColumnWindow,
    current: ColumnWindow,
  ): void {
    const leftSpacer = this.leftHeaderSpacer!;
    const rightSpacer = this.rightHeaderSpacer!;

    const unmountAt = (index: number): void => {
      const header = this.headerByColumn.get(visibleColumns[index]!);
      if (header) this.unmountColumnHeader(header);
    };

    if (win.start >= current.end || win.end <= current.start) {
      for (let i = current.start; i < current.end; i++) unmountAt(i);
      for (let i = win.start; i < win.end; i++) {
        const header = this.mountColumnHeader(visibleColumns[i]!, columnWidths);
        if (header) row.insertBefore(header.getElement(), rightSpacer);
      }
      return;
    }

    for (let i = current.start; i < win.start; i++) unmountAt(i);
    for (let i = current.end - 1; i >= win.end; i--) unmountAt(i);

    // Descending, inserting each straight after the left spacer, so the run
    // ends up in ascending order without a second pass.
    for (let i = current.start - 1; i >= win.start; i--) {
      const header = this.mountColumnHeader(visibleColumns[i]!, columnWidths);
      if (header) row.insertBefore(header.getElement(), leftSpacer.nextSibling);
    }
    for (let i = Math.max(current.end, win.start); i < win.end; i++) {
      const header = this.mountColumnHeader(visibleColumns[i]!, columnWidths);
      if (header) row.insertBefore(header.getElement(), rightSpacer);
    }
  }

  /**
   * Rebuild `columnHeaders` so it is the mounted set in DOM order.
   *
   * The array is what `getColumnHeaders()` returns and what `KeyboardNavigator`
   * walks, and both take its order to mean visual order. Derived from the
   * window rather than maintained through the mount/unmount edges, because one
   * missed splice would put the F2 cycle in a different order than the eye.
   */
  private rebuildMountedHeaderList(visibleColumns: readonly string[], win: ColumnWindow): void {
    const mounted: ColumnHeader[] = [];
    const push = (index: number): void => {
      const header = this.headerByColumn.get(visibleColumns[index]!);
      if (header) mounted.push(header);
    };
    for (let i = 0; i < win.pinnedCount && i < visibleColumns.length; i++) push(i);
    for (let i = win.start; i < win.end; i++) push(i);
    this.columnHeaders = mounted;
  }

  /**
   * Run `fn` over every mounted header.
   *
   * Over `headerByColumn` rather than `columnHeaders`, because the two are in
   * step only between renders: the array is rebuilt from the window *after*
   * the reconcile that mounted and unmounted, while the map is written as each
   * header arrives and leaves. A fan-out is allowed to run at either moment.
   */
  private forEachMountedHeader(fn: (header: ColumnHeader) => void): void {
    for (const header of this.headerByColumn.values()) fn(header);
  }

  /** Size the two spacers to the columns they stand in for. */
  private applyHeaderSpacerWidths(win: ColumnWindow): void {
    if (this.leftHeaderSpacer) this.leftHeaderSpacer.style.flex = `0 0 ${win.leftSpacerPx}px`;
    if (this.rightHeaderSpacer) this.rightHeaderSpacer.style.flex = `0 0 ${win.rightSpacerPx}px`;
  }

  /**
   * Publish the horizontal content extent onto the header row.
   *
   * The number arrives from `TableBody.applyContentWidth`, which passes the
   * same one it hands `VirtualScroller.setContentWidth` — that is the point:
   * the scroll extent and the header's `min-width` are the same quantity, and
   * two summations of it is how they drift. `render()` calls it once more
   * itself, from the same prefix sums, so a freshly built header row carries
   * the current extent immediately rather than staying narrower than its own
   * cells until the body's next render pass.
   */
  private applyContentWidth(totalWidthPx: number): void {
    if (this.headerRowInner) this.headerRowInner.style.minWidth = `${totalWidthPx}px`;
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
        // A map lookup, not a scan: this runs from the body's per-frame render
        // callback, and the mounted set is walked on every cursor keystroke by
        // `KeyboardNavigator` besides. A cursor whose header is not mounted
        // resolves to nothing and the attribute is dropped, which is the
        // correct answer for a column scrolled out of view.
        const header = this.headerByColumn.get(focused.column);
        targetId = header?.getElement().id || null;
      } else {
        const columns = this.state.visibleColumns.get();
        this.syncVisibleIndexMap(columns);
        const colIndex = this.visibleIndexByName.get(focused.column);
        if (colIndex !== undefined) {
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
  // Header column maps
  // =========================================

  /** Rebuild `name -> ColumnSchema` when the schema array identity changes. */
  private syncSchemaMap(schema: readonly ColumnSchema[]): void {
    if (this.schemaMapSource === schema) return;
    this.schemaByName.clear();
    for (const col of schema) this.schemaByName.set(col.name, col);
    this.schemaMapSource = schema;
  }

  /** Rebuild `name -> visibleColumns index` when the array identity changes. */
  private syncVisibleIndexMap(visibleColumns: readonly string[]): void {
    if (this.visibleIndexSource === visibleColumns) return;
    this.visibleIndexByName.clear();
    for (let i = 0; i < visibleColumns.length; i++) {
      this.visibleIndexByName.set(visibleColumns[i]!, i);
    }
    this.visibleIndexSource = visibleColumns;
  }

  /**
   * Rebuild the 1-based `aria-colindex` map when either input identity
   * changes. Keyed on both because the two move independently: a reorder
   * rewrites `columnOrder` and leaves `schema` alone, and a derived-column
   * add does the reverse for one frame.
   */
  private syncColIndexMap(columnOrder: readonly string[], schema: readonly ColumnSchema[]): void {
    if (this.colIndexOrderSource === columnOrder && this.colIndexSchemaSource === schema) return;
    this.colIndexByName = buildColumnIndexMap(columnOrder, schema);
    this.colIndexOrderSource = columnOrder;
    this.colIndexSchemaSource = schema;
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

    // Sort indicators. One subscription fanned out to the mounted headers,
    // rather than one subscription per header — see `mountColumnHeader`.
    const unsubSort = this.state.sortColumns.subscribe(() => {
      if (!this.destroyed) this.forEachMountedHeader((h) => h.update());
    });
    this.unsubscribes.push(unsubSort);

    // Filter indicators. The container had no reason to watch `filtersByColumn`
    // before the headers stopped watching it themselves.
    const unsubHeaderFilters = this.state.filtersByColumn.subscribe(() => {
      if (!this.destroyed) this.forEachMountedHeader((h) => h.refreshFilterIndicator());
    });
    this.unsubscribes.push(unsubHeaderFilters);

    // App-set column-name tooltip overrides.
    const unsubHeaderTooltips = this.state.columnHeaderTooltips.subscribe(() => {
      if (!this.destroyed) this.forEachMountedHeader((h) => h.refreshTooltip());
    });
    this.unsubscribes.push(unsubHeaderTooltips);

    // Column-scope annotation classes. `TableBody` keeps its own listener for
    // cell and row scopes; this one is the header row's share of it.
    const annotations = this.resolvedOptions.annotations;
    if (annotations) {
      const unsubHeaderAnnotations = annotations.on('change', () => {
        if (!this.destroyed) this.forEachMountedHeader((h) => h.refreshAnnotations());
      });
      this.unsubscribes.push(unsubHeaderAnnotations);
    }

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
        this.forEachMountedHeader((h) => h.refreshPinState());
      }
    });
    this.unsubscribes.push(unsubPinned);

    // Update aria-rowcount when total rows change, and the row count each
    // header prints in its stats line with it.
    const unsubAriaRows = this.state.totalRows.subscribe((count) => {
      if (!this.destroyed) {
        this.updateGridCounts();
        this.forEachMountedHeader((h) => h.refreshStatsLine(count));
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
        // The cursor is part of the header window's anchor set, so a move can
        // change which headers are mounted — and it has to happen before the
        // id lookup below, or a cursor landing on a column just outside the
        // window would resolve to nothing for a frame. `KeyboardNavigator`
        // normally scrolls the column into view first; this covers the
        // `/advanced` path, where a host can write `focusedCell` with no
        // scroll behind it at all.
        this.syncHeaderWindow();
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
          // Inside the `if` on purpose: this loop runs every frame for a
          // second, and in the steady state (nothing moved scrollLeft) it must
          // cost nothing. When something *did* move it, both axes are drawn
          // for the wrong offset until they are told.
          this.refreshColumnWindow();
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
   * Unmount every mounted column header.
   *
   * Through {@link unmountColumnHeader} rather than a bare `destroy()` loop,
   * so the focus rescue, the reorder handler and the popover dismissal happen
   * for a wholesale teardown exactly as they do for one header scrolling out
   * of the window. Two teardown paths is how one of them ends up missing a
   * detach.
   */
  private destroyColumnHeaders(): void {
    for (const header of this.columnHeaders) {
      this.unmountColumnHeader(header);
    }
    this.columnHeaders = [];
    this.headerByColumn.clear();
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

    // Update header widths through the body's own resolver, which rounds and
    // guards: a fractional width is reachable (`setColumnWidth` does not
    // round, and a drag under page zoom passes a fractional `clientX`), and a
    // residue that multiplies by M in the header and by 1 in the body's spacer
    // is what pulls the two apart at 1,000 columns. A width the resolver
    // refuses has to be refused identically on both sides, or the header moves
    // and the body does not.
    for (const header of this.columnHeaders) {
      const col = header.getColumn();
      const width = resolveColumnWidth(columnWidths.get(col.name));
      header.getElement().style.width = `${width}px`;
    }

    // A width change moves every column after it, so it moves the window and
    // both spacers as well — widening one column far enough pushes the ones
    // past it off screen. Updating the mounted headers alone would leave the
    // row the right total width made of the wrong pieces.
    this.syncHeaderWindow();
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
    const offsets = pinnedOffsets(visibleColumns, columnWidths, pinnedCount, baseZ, pinnedColumns);
    // From the shared prefix sums rather than a fourth summation of the same
    // widths. `sync` is a pointer comparison on a hit, which this almost
    // always is — `render()` has just computed the window from the same two
    // arrays.
    this.columnWindowModel.sync(visibleColumns, columnWidths, BOX_OVERHEAD_PX);
    const pinnedWidth = this.columnWindowModel.spanPx(0, pinnedCount);

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
   * Bring the table's DOM up to date with its state.
   *
   * Two tiers, dispatched on the header structure signature — the schema
   * array's identity and the relation's name:
   *
   * - **The schema or the relation changed** — a load. Everything is rebuilt
   *   once, including `TableBody`, and scroll and focus are restored across
   *   the rebuild.
   * - **Anything else** — a hide, show, reorder, pin, derived-column add, or
   *   a caller asking for a refresh. The header row is reconciled by column
   *   name and `TableBody` *survives*: it has its own `visibleColumns`
   *   subscription that re-renders a reorder and refetches a set change, so
   *   destroying it here only threw away its row cache and its scroll
   *   position. Focus and scroll are left alone, because nothing that held
   *   either was removed — a header that *was* removed parks focus on the
   *   grid as it goes, which is both earlier and more accurate than the
   *   rebuild's frame-later rescue.
   *
   * This is what collapses the load's double render. Both signals write in one
   * batch, so the `schema` subscriber rebuilds against the final value of
   * both, and the `visibleColumns` subscriber that follows finds every column
   * already mounted where it belongs — a walk over the window, no
   * construction, no `TableBody`.
   *
   * Deliberately not a bare early return in that case, though the phase plan
   * called for one: `render()` is public on an `/advanced` class and means
   * "bring the DOM up to date", and the cheap tier is what keeps that true for
   * state it does not dispatch on.
   *
   * A horizontal scroll is neither tier: it goes through
   * {@link refreshColumnWindow}, which never reaches this method.
   *
   * Synchronous either way — callers assert on the DOM immediately after
   * writing state.
   */
  render(): void {
    if (this.destroyed) return;

    const schema = this.state.schema.get();
    const visibleColumns = this.state.visibleColumns.get();
    const tableName = this.state.tableName.get();
    const columnWidths = this.state.columnWidths.get();
    const columnOrder = this.state.columnOrder.get();

    const last = this.headerStructure;
    // No header row to reconcile is structural by definition: the first render,
    // and the state a column set emptied to nothing leaves behind.
    const structural =
      last.schema !== schema || last.tableName !== tableName || this.headerRowInner === null;
    this.headerStructure = { schema, tableName };

    // O(1) lookups for the header work below — see the map fields. Both
    // position maps have to be resynced on a column-set change too: a hide
    // renumbers every column after it.
    this.syncSchemaMap(schema);
    this.syncVisibleIndexMap(visibleColumns);
    this.syncColIndexMap(columnOrder, schema);

    if (structural) this.renderStructural(schema, visibleColumns, tableName, columnWidths);
    else this.renderColumnSet(visibleColumns, columnWidths);
  }

  /**
   * The cheap tier: reconcile the header row in place and leave `TableBody`,
   * the scroll offsets and DOM focus alone.
   *
   * The panels are still torn down — a filter panel anchored to a column the
   * user just hid has nothing left to point at.
   */
  private renderColumnSet(
    visibleColumns: string[],
    columnWidths: ReadonlyMap<string, number>,
  ): void {
    const prevVisible = this.previousVisibleColumns;
    this.destroyTransientPanels();
    this.updateGridCounts();

    const row = this.headerRowInner!;
    const win = this.computeHeaderWindow(visibleColumns, columnWidths);
    this.reconcileHeaderRow(row, visibleColumns, columnWidths, win);
    this.headerWindow = win;
    this.headerWindowColumns = visibleColumns;
    this.rebuildMountedHeaderList(visibleColumns, win);
    this.applyHeaderSpacerWidths(win);
    this.columnWindowModel.sync(visibleColumns, columnWidths, BOX_OVERHEAD_PX);
    this.applyContentWidth(this.columnWindowModel.totalWidthPx());

    if (this.headerCellCount(row) === 0) {
      // A `role="row"` owning no `columnheader` is a critical
      // `aria-required-children` violation, and an empty visible set is
      // reachable (`stripDerivedColumnRefs`, or a direct `visibleColumns`
      // write). Take the row out rather than leave a pair of spacers claiming
      // to be a row; the null `headerRowInner` makes the next render
      // structural, which rebuilds it when there is something to put in it.
      //
      // Counted by role, the same way `renderStructural` decides whether to
      // mount the row at all — and not from the names the window asked for.
      // `mountColumnHeader` returns null for a column with no schema entry, so
      // a `visibleColumns` naming one would report a full window and leave
      // exactly the row this guard exists to remove.
      row.remove();
      this.headerRowInner = null;
      this.leftHeaderSpacer = null;
      this.rightHeaderSpacer = null;
      this.headerWindowColumns = null;
    }

    if (!this.tableBody) this.updateBodyPlaceholder();
    this.finishRender(visibleColumns, prevVisible);
  }

  /**
   * Refresh the row count on the no-bridge body placeholder.
   *
   * An `/advanced` shell mounted without a bridge shows a count where the grid
   * would be, and `totalRows` is not something `render()` dispatches on — so a
   * caller that writes the count and calls `render()` to pick it up is met
   * here rather than by a rebuild it does not need.
   */
  private updateBodyPlaceholder(): void {
    const el = this.bodyContainer.querySelector(
      `.${this.resolvedOptions.classPrefix}-body-placeholder`,
    );
    if (el) el.textContent = `${this.state.totalRows.get().toLocaleString()} rows`;
  }

  /**
   * Drop the three panels that hang off a column, each recreated lazily on the
   * next click that needs it.
   *
   * Torn down on a column-set change as well as a rebuild: each is anchored to
   * a specific header, and the column it points at is exactly the one a hide
   * or a reorder may have just moved or removed.
   */
  private destroyTransientPanels(): void {
    if (this.filterPanel) {
      this.filterPanel.destroy();
      this.filterPanel = null;
    }
    if (this.presetPanel) {
      this.presetPanel.destroy();
      this.presetPanel = null;
    }
    if (this.derivedEditPanel) {
      this.derivedEditPanel.destroy();
      this.derivedEditPanel = null;
    }
  }

  /** Tier 3: rebuild everything, and put scroll and focus back afterwards. */
  private renderStructural(
    schema: readonly ColumnSchema[],
    visibleColumns: string[],
    tableName: string | null,
    columnWidths: ReadonlyMap<string, number>,
  ): void {
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

    // Attach / detach the ARIA grid semantics, then refresh its dimensions.
    this.applyGridSemantics(schema.length > 0 && !!tableName);
    this.updateGridCounts();

    this.destroyTransientPanels();

    // Clear existing column headers
    this.destroyColumnHeaders();
    this.headerRow.innerHTML = '';
    this.headerRowInner = null;
    this.leftHeaderSpacer = null;
    this.rightHeaderSpacer = null;
    this.headerWindowColumns = null;
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
        this.buildHeaderWindow(headerRowEl, visibleColumns, columnWidths);
      } else {
        // Fallback if no actions provided - show simple placeholders
        for (const colName of visibleColumns) {
          const colSchema = this.schemaByName.get(colName);
          if (colSchema) {
            const colEl = document.createElement('div');
            colEl.className = `${this.resolvedOptions.classPrefix}-col-header`;
            // `role="row"` requires cell-ish children; without this the
            // no-actions shell would fail aria-required-children.
            colEl.setAttribute('role', 'columnheader');
            colEl.style.padding = '0.5rem';

            // Apply dynamic width from state, resolved the same way the body's
            // prefix sums resolve it — a fractional width written here and
            // floored there puts this header a growing fraction of a pixel
            // away from its own cells.
            const width = resolveColumnWidth(columnWidths.get(colName));
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

      // Only mount the row once it actually owns column *headers*. A
      // `role="row"` owning no cell is a critical `aria-required-children`
      // violation, and an empty visible set is reachable both permanently
      // (`setColumnOrder([])`, `stripDerivedColumnRefs` — neither guards the
      // way `hideColumn` does) and transiently, whenever `schema` and
      // `visibleColumns` land as separate signal writes and the schema write
      // renders first.
      //
      // Counted by role rather than by `childElementCount`, which the spacers
      // broke: a windowed row always has two of them, so the old test passed
      // for a row holding nothing a screen reader can see — the exact state it
      // existed to keep out of the DOM.
      if (this.headerCellCount(headerRowEl) > 0) {
        this.headerRow.appendChild(headerRowEl);
        this.headerRowInner = headerRowEl;
        // Give the fresh row the content extent straight away. The body
        // publishes it on every render pass, but its first pass is one fetch
        // away when there are rows at all and never happens when there are
        // none — so without this a rebuilt header row sits at its intrinsic
        // width while its own cells are already laid out past it.
        this.columnWindowModel.sync(visibleColumns, columnWidths, BOX_OVERHEAD_PX);
        this.applyContentWidth(this.columnWindowModel.totalWidthPx());
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
          // One window, two consumers. The body computes against the model the
          // header row measures against, from the viewport this container
          // defines, and re-windowing either axis re-windows both.
          columnWindowHost: this.columnWindowHost,
        });

        // Eagerly set content width so scrollWidth is correct for auto-scroll.
        // initialize() sets this later via async DuckDB fetch, but
        // scrollToRightEnd() may fire before that completes. From the shared
        // prefix sums — this used to be its own summation over the same
        // widths, which is the duplication that lets a rounding rule change on
        // one side and not the other.
        this.columnWindowModel.sync(visibleColumns, columnWidths, BOX_OVERHEAD_PX);
        this.tableBody.getVirtualScroller().setContentWidth(this.columnWindowModel.totalWidthPx());

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

    this.finishRender(visibleColumns, prevVisible);

    // Restore scroll positions and focus after DOM updates (both containers for robustness)
    requestAnimationFrame(() => {
      if (!this.destroyed) {
        this.bodyScroll.scrollLeft = savedBodyScrollLeft;
        this.bodyScroll.scrollTop = savedBodyScrollTop;
        this.headerScroll.scrollLeft = savedHeaderScrollLeft;

        // `render()` rebuilt at scrollLeft 0 and we have just put the offset
        // back. What is in the DOM is the window for 0 — every cell the user
        // was looking at is a spacer — and it stays that way until a `scroll`
        // event, which restoring the property does not produce reliably. This
        // is the blank-table flash after any re-render at a scrolled-right
        // offset.
        this.refreshColumnWindow();

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
   * The half of a render that a column-set change and a rebuild both owe:
   * pinned styles, the move animation, the restore highlight and the cursor.
   *
   * Every loop here walks `columnHeaders`, which is the mounted window — so
   * all of it is O(window), not O(columns), whichever tier called it.
   */
  private finishRender(visibleColumns: string[], prevVisible: ReadonlySet<string>): void {
    // Apply pinned column styles after headers are created
    this.updatePinnedColumnStyles();

    // The hide button is disabled while it would take the last visible column
    // away, so it is a function of the set this render was called for. Driven
    // from here rather than from a `visibleColumns` subscription of its own,
    // because every write of that signal renders anyway — and running after
    // the reconcile is what includes the headers this render just mounted.
    this.forEachMountedHeader((h) => h.refreshHideButtonState(visibleColumns));

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

    // Highlight columns that were hidden a moment ago and are back.
    //
    // Keyed to a *visibility* transition and never to a mount: a header
    // arriving because the user scrolled to it was visible all along, and
    // flashing it would turn a restore cue into scroll confetti. `prevVisible`
    // is the whole visible set, not the mounted window, which is what keeps
    // the two apart.
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

    // The cursor's column may have been hidden or removed outright, and on a
    // rebuild its element is gone regardless. Re-point it (dropping to the
    // first visible column) before anything reads aria-activedescendant.
    this.reconcileCursorColumn(visibleColumns);
    this.syncActiveDescendant();
    this.updateHeaderCursorStyles();
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
          // The `scrollend` path writes `scrollLeft` directly, and a written
          // offset produces no `scroll` event of its own — so without this the
          // window stays wherever the animation's last dispatched event left
          // it. Correct today only by accident: `scrollTo({behavior:'smooth'})`
          // happens to dispatch a final `scroll` at the destination, which the
          // 600 ms `setTimeout` fallback path does not guarantee.
          this.refreshColumnWindow();
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
   * The `ColumnHeader` instances that are **mounted right now**, in DOM order.
   *
   * The header row is windowed: it holds the pinned prefix plus the columns
   * near the horizontal viewport, between two spacers. So this is a snapshot
   * of the current window, not the table's columns — it changes as the user
   * scrolls sideways, and a wide table never returns more than a few dozen
   * entries however many columns it has. Read `state.visibleColumns` for the
   * column list.
   *
   * Suitable for acting on what is on screen (reading a visualization
   * container, restyling the mounted set). Not suitable as a place to attach
   * per-column behaviour: a header that scrolls in later will not have been
   * in any array this method ever returned. Drive that from the container's
   * `onHeaderMount` / `onHeaderUnmount` options instead.
   *
   * The array is a copy; the headers in it are live.
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

    // Disconnect resize observers
    this.resizeObserver.disconnect();
    this.columnResizeObserver.disconnect();
    if (this.columnScrollRAF !== null) {
      cancelAnimationFrame(this.columnScrollRAF);
      this.columnScrollRAF = null;
    }
    this.columnWindowModel.reset();
    this.headerRowInner = null;

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
