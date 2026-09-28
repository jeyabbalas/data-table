/**
 * DataTable — high-level facade over the library's modular API.
 *
 * Wires together everything a typical embedder needs (worker bridge,
 * reactive state, actions, UI container, visualizations, crossfilter,
 * undo/redo, session persistence, filter presets, export dialog) and
 * exposes a single object with a typed event bus and a unified
 * `destroy()` method.
 *
 * The modular classes (`WorkerBridge`, `TableContainer`, etc.) remain
 * exported for power users who want to orchestrate things manually.
 *
 * The mount container must have a bounded height before the table is created —
 * see {@link CreateDataTableOptions.container}.
 *
 * @example
 * ```html
 * <div id="my-table" style="height: 600px"></div>
 * ```
 *
 * ```ts
 * import { createDataTable } from '@jeyabbalas/data-table';
 * import '@jeyabbalas/data-table/styles';
 *
 * const table = await createDataTable({
 *   container: document.getElementById('my-table')!,
 *   source: fileOrUrl,
 *   persistence: true,
 *   presets: true,
 *   undoRedo: true,
 * });
 *
 * table.on('filterChange', ({ filters, filteredRowCount }) => {
 *   console.log(`${filters.length} filters, ${filteredRowCount} rows`);
 * });
 *
 * // Later, when unmounting:
 * await table.destroy();
 * ```
 */

import { AnnotationStore } from './annotations/AnnotationStore';
import { StateActions, type LoadDataOptions } from './core/Actions';
import { checkBrowserSupport } from './core/checkBrowserSupport';
import {
  ConfigurationError,
  DataTableError,
  DestroyedError,
  LoadError,
  WorkerInitError,
} from './core/errors';
import { EventEmitter } from './core/EventEmitter';
import type { TableState } from './core/State';
import { createTableState, resetTableState } from './core/State';
import { type Strings, type DeepPartial, defaultStrings, mergeStrings } from './core/Strings';
import { isStylesheetLoaded } from './core/stylesheet';
import type { TableEvents } from './core/TableEvents';
import type { ColumnSchema, Filter, SortColumn } from './core/types';
import { UndoManager } from './core/UndoManager';
import type { DataFormat } from './data/DataLoader';
import { WorkerBridge, type WorkerBridgeOptions } from './data/WorkerBridge';
import type { ExpressionEditorFactory } from './derived/ExpressionEditorTypes';
import { ExportDialog } from './export/ExportDialog';
import { FilterPresetManager } from './filters/FilterPresets';
import { AutoSave } from './persistence/AutoSave';
import { SessionStore } from './persistence/SessionStore';
import type { ColumnStatsData } from './statistics/ColumnStatsTypes';
import { escapeHtml, formatStatsLine1, formatStatsLine2 } from './statistics/StatsFormatters';
import { AnnotationPopover } from './table/AnnotationPopover';
import type { ColumnHeader } from './table/ColumnHeader';
import { ColumnHeaderTooltipPopover } from './table/ColumnHeaderTooltipPopover';
import { TableContainer } from './table/TableContainer';
import type { BaseStatsPanel, StatsPanelOptions } from './visualizations/BaseStatsPanel';
import type { BaseVisualization } from './visualizations/BaseVisualization';
import { CrossfilterCoordinator } from './visualizations/CrossfilterCoordinator';
import type { DateHistogram } from './visualizations/histogram/DateHistogram';
import type { Histogram } from './visualizations/histogram/Histogram';
import type { IntervalHistogram } from './visualizations/histogram/IntervalHistogram';
import type { TimeHistogram } from './visualizations/histogram/TimeHistogram';
import {
  InteractionManager,
  type InteractiveVisualization,
} from './visualizations/InteractionManager';
import { LazyVizController } from './visualizations/LazyVizController';
import { StatsPanelCoordinator } from './visualizations/StatsPanelCoordinator';
import type { StatsPanelRegistry } from './visualizations/StatsPanelRegistry';
import { defaultStatsPanelRegistry } from './visualizations/StatsPanelRegistry';
import type { ValueCounts } from './visualizations/valuecounts/ValueCounts';
import type { VisualizationRegistry } from './visualizations/VisualizationRegistry';
import { defaultVisualizationRegistry } from './visualizations/VisualizationRegistry';

// Emitted once per page lifetime when the library stylesheet is missing —
// detected via the `--dt-stylesheet-loaded` marker declared on `:root` in
// `src/styles/01-variables.css`. Kept module-scoped so multiple
// `createDataTable()` calls don't spam the console.
let stylesheetWarningEmitted = false;

/**
 * Programmatic light/dark theme selector for a {@link DataTable} instance.
 *
 * - `'auto'` (default) — follow the OS `prefers-color-scheme` media query.
 * - `'light'` / `'dark'` — force the theme regardless of OS preference.
 *
 * Applied via the `data-dt-color-scheme` attribute on the `.dt-root` element;
 * body-portalled modals copy the attribute on open so their styling stays in
 * sync. See the Theming section of the README for the full `--dt-*` variable
 * reference.
 */
export type ColorScheme = 'light' | 'dark' | 'auto';

const VALID_COLOR_SCHEMES: readonly ColorScheme[] = ['light', 'dark', 'auto'];

/**
 * How long, in ms, the mounted columns hold still before the columns that
 * arrived get their custom stats panels.
 *
 * @internal
 */
export const STATS_PANEL_SETTLE_MS = 150;

function validateColorScheme(value: unknown, origin: string): ColorScheme {
  if (value === undefined) return 'auto';
  if (typeof value === 'string' && (VALID_COLOR_SCHEMES as readonly string[]).includes(value)) {
    return value as ColorScheme;
  }
  throw new ConfigurationError(
    `${origin}: invalid colorScheme. Expected 'light', 'dark', or 'auto'.`,
    { code: 'OPTIONS_INVALID', details: { received: value } },
  );
}

/**
 * Options accepted by {@link createDataTable}. All feature toggles default
 * to `true`; pass `false` (or a configuration object) to customize.
 */
export interface CreateDataTableOptions {
  /**
   * Element that will host the table. The library takes full ownership of its
   * contents.
   *
   * Must have a bounded height before mounting: the table virtualizes against
   * this element, measuring it to render only `⌈height / rowHeight⌉ + 10` rows.
   * Give it an explicit height, or `flex: 1; min-height: 0` as a flex/grid
   * child — `min-height: 0` is mandatory, as flex and grid items otherwise
   * refuse to shrink below their content, which here is every row.
   *
   * Without one nothing errors: the root (`height: 100%`) becomes
   * content-sized, so the measured viewport is the whole dataset and the table
   * queries and builds DOM for every row. A zero-height container renders no
   * rows and logs a console warning. See "Sizing the container" in the README.
   *
   * @example
   * ```html
   * <div id="my-table" style="height: 600px"></div>
   * ```
   */
  container: HTMLElement;

  /** Optional initial data source. If omitted, call `table.loadData(source)` later. */
  source?: File | string | ArrayBuffer | Blob;
  /** Override the format detected from the source (e.g., if URL has no extension). */
  sourceFormat?: DataFormat;
  /** Table name used inside DuckDB. Auto-generated if omitted. */
  tableName?: string;

  // ---- Feature toggles ----

  /**
   * Persist UI state (filters, sort, columns, derived columns) to IndexedDB
   * and auto-restore on next mount. Pass `{ sessionStore }` to reuse an
   * existing store across tables. Default: `true`.
   */
  persistence?: boolean | { sessionStore?: SessionStore };

  /**
   * Enable the "Presets" button for saving/loading named filter sets.
   * Pass `{ manager }` to reuse an existing preset manager. Default: `true`.
   */
  presets?: boolean | { manager?: FilterPresetManager };

  /** Enable undo/redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z). Default: `true`. */
  undoRedo?: boolean;

  /** Enable the "Expression" (raw SQL) filter button in the filter bar. Default: `true`. */
  expressionFilter?: boolean;

  /**
   * Show the derived-column UI: the "+" button at the table's right edge and
   * the f(x) edit icon on every derived-column header. The programmatic API
   * (`actions.addDerivedColumn`, `actions.removeDerivedColumn`,
   * `actions.updateDerivedColumn`) is unaffected by this flag — only the
   * user-visible affordances are removed.
   *
   * Set this to `false` together with `expressionFilter: false` to skip
   * loading CodeMirror entirely. Consumers in that mode can omit the
   * `@codemirror/*` and `@lezer/highlight` peer dependencies (already marked
   * `optional` in `peerDependenciesMeta`).
   *
   * Default: `true`.
   */
  derivedColumns?: boolean;

  /**
   * Enable auto-attached column header visualizations (histograms, value counts). Default: `true`.
   *
   * A column's chart is built when its header scrolls within 200 px of view
   * and removed once the header is 400 px away, so a wide table runs chart
   * queries only for the columns near the view. `loadData` waits for the
   * charts in view to draw.
   */
  visualizations?: boolean;

  /**
   * Per-instance visualization registry. Use this to register custom
   * visualizations (or override built-ins) without affecting other tables
   * on the page. When omitted, the shared `defaultVisualizationRegistry`
   * is used.
   */
  visualizationRegistry?: VisualizationRegistry;

  /**
   * Per-instance stats panel registry. Register a {@link BaseStatsPanel}
   * subclass to replace the library's built-in two-line stats display in
   * a column header with your own rendering (custom DuckDB stats, badges,
   * progress bars, alternate locales). Same per-instance isolation
   * semantics as `visualizationRegistry`. When omitted, the shared
   * `defaultStatsPanelRegistry` is used (also empty by default — register
   * on it to share custom panels across every table without a per-instance
   * registry). When no registration matches a column's type, the library
   * falls back to its built-in HTML formatter, so behavior is unchanged
   * for tables that don't opt in.
   */
  statsPanelRegistry?: StatsPanelRegistry;

  /** Enable the built-in export dialog (CSV/JSON/Parquet). Default: `true`. */
  exportDialog?: boolean;

  // ---- Lifecycle ----

  /** Where fixed-position modals mount. Default: `document.body`. */
  portalTarget?: HTMLElement;
  /** Share a WorkerBridge across tables. If omitted, one is created and owned by this table. */
  bridge?: WorkerBridge;
  /** Options for the owned WorkerBridge (ignored if `bridge` is supplied). */
  bridgeOptions?: WorkerBridgeOptions;

  // ---- Customization ----

  /** CSS class prefix. Default: `'dt'`. */
  classPrefix?: string;
  /**
   * Identifier mixed into element IDs so multiple tables on the same page
   * don't collide on `aria-labelledby` / `aria-activedescendant` targets.
   * Auto-generated if omitted.
   *
   * A short random suffix is appended even to a value you supply, because
   * nothing stops an app from handing the same one to two tables and a
   * duplicate there is silent — the grids would mint identical cell ids and
   * publish ambiguous IDREFs. Read {@link DataTable.instanceId} for the value
   * actually used in the DOM; this option only seeds it, so it cannot be used
   * to predict element IDs.
   */
  instanceId?: string;
  /** Custom expression editor factory (replaces the CodeMirror-based default). */
  editorFactory?: ExpressionEditorFactory;
  /**
   * Row height in pixels. Default: 32.
   *
   * Published as the `--dt-row-height` custom property on the table root, so
   * the stylesheet lays rows out at exactly the height the virtual scroller
   * computes with. Set it here rather than overriding that token in CSS: the
   * scroller's arithmetic runs in JS and cannot read a stylesheet, so a
   * CSS-only change would move the rows and not the scroller.
   */
  rowHeight?: number;
  /**
   * Header height in pixels. Default: 120. Applied as the header row's
   * `min-height` and published as the `--dt-header-height` custom property.
   * Keep it at 96 or above when visualizations are enabled, or the header
   * plots have nowhere to draw.
   */
  headerHeight?: number;
  /**
   * Rows fetched per scroll block. Default: 128. Clamped to [16, 1024].
   *
   * Row fetches are quantized to block-aligned windows, so overlapping
   * scroll positions dedupe onto the same query and a block already in
   * flight is never re-requested. The default is roughly 3–4× a realistic
   * viewport (~30–48 rows): the viewport spans 1–2 blocks, fetch cost is
   * dominated by scroll depth rather than block length, and power-of-two
   * alignment keeps the dedupe keys stable. Raise it for very tall
   * viewports; lower it only if your rows are extremely wide and you want
   * smaller transfers.
   */
  fetchBlockSize?: number;
  /**
   * Maximum rows held in the in-memory row cache. Default: 2048 (rounded
   * up to whole blocks, floor 4 blocks).
   *
   * At the default block size that is 16 blocks — a few MB at typical row
   * widths — enough that scrolling back across ±900 rows repaints
   * instantly with zero queries. Raise it to make longer back-scrolls
   * query-free at the cost of memory; it never affects correctness, only
   * how often previously seen blocks are re-fetched.
   */
  rowCacheRows?: number;
  /**
   * Speculatively fetch one block beyond the viewport in the current
   * scroll direction while the fetch pipeline is idle. Default: `true`.
   *
   * The prefetch runs at normal worker priority, so visible-row fetches
   * always jump ahead of it; a direction change abandons it. Disable it
   * to keep query volume to the strict minimum (e.g. when the table
   * shares its DuckDB worker with heavier analytical queries).
   */
  prefetch?: boolean;

  /**
   * Initial light/dark theme selector. Defaults to `'auto'` (follows
   * `prefers-color-scheme`). Pass `'light'` or `'dark'` to force a theme per
   * instance, or call {@link DataTable.setColorScheme} later to switch at
   * runtime.
   */
  colorScheme?: ColorScheme;

  /**
   * Override user-facing strings (button labels, placeholders, aria-live
   * announcements, stats templates). Every key is optional; missing leaves
   * fall back to English defaults. See `Strings` for the full shape.
   *
   * Messages are resolved once at construction and threaded to every
   * component — recreate the table to switch languages at runtime.
   */
  messages?: DeepPartial<Strings>;

  /**
   * When `true`, probe for required browser APIs before attempting worker
   * init. Rejects with {@link WorkerInitError} (`code: 'WORKER_UNSUPPORTED'`,
   * `details.missing: string[]`) if any probe fails. Default `false`: the
   * library attempts to init and surfaces real failures later via the `error`
   * event — fine for most apps. Flip this on when you want to render a
   * dedicated "unsupported browser" screen instead of a half-mounted table.
   */
  strictBrowserCheck?: boolean;
}

/**
 * The returned object from {@link createDataTable}.
 */
export interface DataTable {
  /** Reactive state signals — advanced users can subscribe directly. */
  readonly state: TableState;
  /** Command/mutation layer. */
  readonly actions: StateActions;
  /** DuckDB worker bridge for custom SQL queries. */
  readonly bridge: WorkerBridge;
  /** UI container. Rarely needed directly; prefer the event bus. */
  readonly container: TableContainer;
  /**
   * Programmatic row / column / cell annotation store. Annotations are
   * app-authored metadata (validation errors, QC notes) that overlay the
   * table read-only; they do not participate in undo/redo and persist
   * independently via `SessionSnapshot`.
   */
  readonly annotations: AnnotationStore;

  /**
   * Unique per-instance identifier, e.g. `'t1-a3f9'`. Mixed into cell and
   * modal element IDs to keep two tables on the same page from colliding on
   * `aria-labelledby` and `aria-activedescendant` targets.
   *
   * This is the value actually used in the DOM, which is not the
   * {@link CreateDataTableOptions.instanceId} you passed in: a random suffix
   * is always appended. Read it here rather than assuming it.
   */
  readonly instanceId: string;

  /**
   * Load a new data source into the table. Re-uses the existing worker.
   * Emits `loadStart` → (`loadProgress` …) → `loadComplete` or `loadError`.
   */
  loadData(
    source: File | string | ArrayBuffer | Blob,
    opts?: LoadDataOptions & { sourceFormat?: DataFormat },
  ): Promise<void>;

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof TableEvents>(event: K, handler: (payload: TableEvents[K]) => void): () => void;
  /** Alternative to the return value of `on`. */
  off<K extends keyof TableEvents>(event: K, handler: (payload: TableEvents[K]) => void): void;

  /** Open the export dialog. No-op if `exportDialog: false`. */
  openExportDialog(): void;

  /**
   * Wipe the persisted UI snapshot for the current table AND reset in-memory
   * state. Clears filters, sort, columns, derived columns, undo/redo stacks,
   * filter presets, and the bridge's query cache. After this call the table
   * behaves as if just constructed with no `source` — call {@link loadData}
   * to populate it again. Safe to call when persistence is disabled (only the
   * IndexedDB delete is skipped).
   */
  clearSession(): Promise<void>;

  /**
   * Tear down everything this table owns: DOM, subscriptions, worker (if owned),
   * session store (if owned). Call when unmounting from the DOM.
   */
  destroy(): Promise<void>;

  /**
   * `true` once {@link destroy} has been called. Useful as a guard in
   * framework cleanup callbacks (e.g., React `useEffect` returns) that may
   * run after an earlier destroy.
   */
  isDestroyed(): boolean;

  /**
   * `true` if IndexedDB-backed session persistence is active. Returns `false`
   * when persistence was disabled via options OR when IndexedDB was
   * unavailable at init time (check for a `warning` event with code
   * `PERSISTENCE_UNAVAILABLE` to distinguish).
   */
  isPersistenceActive(): boolean;

  /**
   * Switch the light/dark theme at runtime. `'light'` / `'dark'` force the
   * corresponding theme; `'auto'` clears the override and lets
   * `prefers-color-scheme` govern again. Open body-portalled modals re-sync
   * automatically via their mounted `data-dt-color-scheme` attribute.
   *
   * @throws {@link ConfigurationError} — if `scheme` is not `'light' | 'dark' | 'auto'`.
   * @throws {@link DestroyedError} — if the table has been destroyed.
   */
  setColorScheme(scheme: ColorScheme): void;

  /** The currently-applied color scheme. Reflects the last {@link setColorScheme} call (or the initial option). */
  getColorScheme(): ColorScheme;
}

type VisualizationType =
  Histogram | DateHistogram | TimeHistogram | IntervalHistogram | ValueCounts;

/**
 * Create a fully-wired data table mounted in `container`.
 *
 * Awaits worker initialization before returning so the caller can immediately
 * `loadData()` or rely on `state.schema` being populated (if `source` was
 * provided).
 *
 * @remarks Size the container before calling this. The table virtualizes
 * against the container's height, and an unbounded one silently renders every
 * row — see {@link CreateDataTableOptions.container}.
 */
export async function createDataTable(opts: CreateDataTableOptions): Promise<DataTable> {
  // -------- Options validation --------
  if (opts.strictBrowserCheck) {
    const check = checkBrowserSupport();
    if (!check.supported) {
      throw new WorkerInitError(`Browser is missing required APIs: ${check.missing.join(', ')}.`, {
        code: 'WORKER_UNSUPPORTED',
        details: { missing: check.missing },
      });
    }
  }

  let colorScheme = validateColorScheme(opts.colorScheme, 'createDataTable');

  // -------- Resolve i18n messages (done once, threaded to every component) --------
  const messages: Strings = mergeStrings(defaultStrings, opts.messages);

  // -------- Worker bridge --------
  const ownsBridge = !opts.bridge;
  const bridge = opts.bridge ?? new WorkerBridge(opts.bridgeOptions);
  await bridge.initialize();

  // -------- Reactive state + actions --------
  const state = createTableState();
  const undoManager = opts.undoRedo === false ? undefined : new UndoManager();
  const actions = new StateActions(state, bridge, undoManager);

  // -------- Event bus --------
  // Constructed early so the persistence and stylesheet checks below can
  // emit `warning` events instead of silently degrading. The listener-error
  // handler references `emitter` in its closure; the handler only fires
  // after construction completes, so the lexical binding is always live.
  const emitter: EventEmitter<TableEvents> = new EventEmitter<TableEvents>((err, event) => {
    if (event === 'error' || event === 'warning') {
      // Do not re-emit — would recurse infinitely.

      console.error('[data-table] listener threw inside', String(event), 'handler', err);
      return;
    }
    const typed =
      err instanceof DataTableError
        ? err
        : new ConfigurationError(err instanceof Error ? err.message : String(err), {
            code: 'OPTIONS_INVALID',
            cause: err,
          });
    emitter.emit('error', { error: typed, source: 'listener' });
  });

  // -------- Persistence --------
  let sessionStore: SessionStore | null = null;
  let ownsSessionStore = false;
  let autoSave: AutoSave | null = null;
  if (opts.persistence !== false) {
    const persistConfig = typeof opts.persistence === 'object' ? opts.persistence : {};
    if (persistConfig.sessionStore) {
      sessionStore = persistConfig.sessionStore;
    } else {
      // Wire SessionStore.onLoadIssue → table.on('warning') so consumers can
      // distinguish "fresh user / no snapshot" from "stored snapshot was
      // rejected because its version is outside [1, SNAPSHOT_VERSION]"
      // (typically a downgrade from a newer library version that wrote the
      // IDB row). Phase 7 deferred this; Phase 9 surfaces it.
      sessionStore = new SessionStore({
        onLoadIssue: (issue) => {
          if (destroyed) return;
          emitter.emit('warning', {
            code: issue.code,
            message: `Persisted session for "${issue.tableName}" was rejected: version ${issue.details.version} is outside the supported range [1, ${issue.details.expectedMax}]. Booting fresh.`,
            details: { tableName: issue.tableName, ...issue.details },
          });
        },
      });
      ownsSessionStore = true;
    }
    try {
      await sessionStore.open();
    } catch (cause) {
      emitter.emit('warning', {
        code: 'PERSISTENCE_UNAVAILABLE',
        message: 'IndexedDB is unavailable; session persistence is disabled.',
        details: {
          reason: cause instanceof Error ? cause.message : String(cause),
        },
      });
      sessionStore = null;
      ownsSessionStore = false;
    }
  }

  // -------- Presets --------
  // `ownsPresetManager` is true when this DataTable created the manager
  // itself (no `presets.manager` option). User-supplied shared managers
  // (multi-table dashboards) must NOT be cleared on per-table loadData /
  // clearSession — sharing across tables is opt-in.
  let presetManager: FilterPresetManager | null = null;
  let ownsPresetManager = false;
  if (opts.presets !== false) {
    const presetConfig = typeof opts.presets === 'object' ? opts.presets : {};
    ownsPresetManager = presetConfig.manager === undefined;
    presetManager = presetConfig.manager ?? new FilterPresetManager();
  }

  // -------- Annotations --------
  // Constructed here (before TableContainer) so TableBody and every
  // ColumnHeader can be wired with the store + popover at construction
  // time; AutoSave below subscribes to the store's change event.
  const annotationStore = new AnnotationStore({ tableName: state.baseTableName });
  const annotationPopover = new AnnotationPopover({
    classPrefix: opts.classPrefix ?? 'dt',
    portalTarget: opts.portalTarget,
  });
  const columnHeaderTooltipPopover = new ColumnHeaderTooltipPopover({
    classPrefix: opts.classPrefix ?? 'dt',
    portalTarget: opts.portalTarget,
  });

  // -------- UI container --------
  const tableContainer = new TableContainer(opts.container, state, actions, bridge, {
    rowHeight: opts.rowHeight,
    headerHeight: opts.headerHeight,
    fetchBlockSize: opts.fetchBlockSize,
    rowCacheRows: opts.rowCacheRows,
    prefetch: opts.prefetch,
    classPrefix: opts.classPrefix ?? 'dt',
    instanceId: opts.instanceId,
    showExpressionFilter: opts.expressionFilter !== false,
    showAddColumnButton: opts.derivedColumns !== false,
    showDerivedColumnEditIcon: opts.derivedColumns !== false,
    editorFactory: opts.editorFactory,
    presetManager: presetManager ?? undefined,
    portalTarget: opts.portalTarget,
    colorScheme,
    messages,
    annotations: annotationStore,
    annotationPopover,
    columnHeaderTooltipPopover,
  });

  // -------- Instance id (multi-instance DOM ID isolation) --------
  // Read back rather than minted here, so exactly one value exists. The
  // container qualifies whatever it is given with a random suffix — two
  // tables handed the same `instanceId` must not mint the same cell ids —
  // and everything downstream (the export dialog's `aria-labelledby`, the
  // public `instanceId` property) has to agree with the ids actually in the
  // DOM. Minting a second value here is how they came to disagree.
  const instanceId = tableContainer.getInstanceId();

  // -------- Stylesheet presence check --------
  if (!stylesheetWarningEmitted && !isStylesheetLoaded()) {
    stylesheetWarningEmitted = true;
    const warnMessage = messages.errors.stylesheetMissing;
    // Keep the console warning as a safety net if no consumer has wired
    // up a `warning` listener yet (typical on the first createDataTable
    // call before any subscriptions exist).
    if (emitter.listenerCount('warning') === 0) {
      console.warn(warnMessage);
    }
    emitter.emit('warning', {
      code: 'STYLESHEET_MISSING',
      message: warnMessage,
    });
  }

  // -------- Lifecycle flag (hoisted so the coordinator's emit callback
  // below can short-circuit during teardown). The full event-bus wiring
  // sits further down where the unsubscribe array is built. --------
  let destroyed = false;

  // -------- Visualizations (auto-attach) --------
  const interactionManager = opts.visualizations === false ? null : new InteractionManager();
  // The crossfilter coordinator is the single source of `filterChange`
  // emissions for the public TableEvents API: it owns the async
  // `state.filteredRows` recompute and fires `onFilterCycleComplete` only
  // *after* that count has settled, so the event payload is never one cycle
  // behind. We create one instance per DataTable and reuse it across data
  // loads — the live `state.tableName` is read at query time, so no per-load
  // recreation is needed. Visualization instances are registered into it
  // inside `attachVisualizations`; with `visualizations: false` it simply
  // serves as the row-count-update + event-emit pipeline.
  const coordinator = new CrossfilterCoordinator(state, actions, bridge, undefined, {
    onFilterCycleComplete: (filters) => {
      if (destroyed) return;
      emitter.emit('filterChange', {
        filters: [...filters],
        filteredRowCount: state.filteredRows.get(),
        totalRowCount: state.totalRows.get(),
      });
    },
  });
  // Creates each column's chart while its header is in view; assigned below.
  let vizController: LazyVizController | null = null;
  // Tracks the most recent attachVisualizations pass's initial work
  // (the first fetch of each chart in view + both coordinators'
  // syncExistingFilters).
  // loadDataImpl awaits this in parallel with whenBodyReady before resolving
  // the public load promise, mirroring TableContainer.currentBodyInit.
  // Wrapped in Promise.allSettled so individual failures (already routed
  // through options.onError → 'error' event) don't reject the public promise.
  let pendingVizInit: Promise<void> = Promise.resolve();
  const vizRegistry: VisualizationRegistry =
    opts.visualizationRegistry ?? defaultVisualizationRegistry;

  // -------- Stats panels (auto-attach alongside visualizations) --------
  // Active panels are keyed by column name so the non-viz stats refresh path
  // can quickly check whether a column's slot is panel-owned without iterating
  // the array on every signal change.
  let statsPanelCoordinator: StatsPanelCoordinator | null = null;
  const activeStatsPanels = new Map<string, BaseStatsPanel>();
  const statsPanelRegistry: StatsPanelRegistry =
    opts.statsPanelRegistry ?? defaultStatsPanelRegistry;
  const emitStatsPanelError = (
    err: unknown,
    column: string,
    phase: 'construct' | 'update' | 'hover' | 'fetch' | 'destroy',
  ): void => {
    const typed =
      err instanceof DataTableError
        ? err
        : new ConfigurationError(err instanceof Error ? err.message : String(err), {
            code: 'INVARIANT',
            cause: err,
            details: { column, phase },
          });
    emitter.emit('error', { error: typed, source: 'stats-panel' });
  };

  /**
   * Put the column a chart error came from on the error's `details`, and the
   * stage that failed when the chart says, as stats-panel errors carry
   * theirs: only some of the charts' queries name the column themselves.
   * `details` is declared readonly on DataTableError; this is the deliberate
   * write-through site, as in the stats panels' `onError`.
   */
  const withChartContext = (
    err: DataTableError,
    column: string,
    stage?: 'fetch' | 'render' | 'filter',
  ): DataTableError => {
    const target = err as { details?: Record<string, unknown> };
    target.details = { ...(target.details ?? {}), column, ...(stage ? { stage } : {}) };
    return err;
  };

  /** Drop a column's interactions from the Escape stack (on filter removal). */
  const clearVisualizationState = (column: string): void => {
    interactionManager?.clearColumn(column);
  };

  // Table-wide line 1 for stats slots with no per-column stats: columns
  // without a visualization, and viz columns before their first fetch lands.
  // escapeHtml: messages.* are consumer-overridable functions whose return
  // value lands in innerHTML.
  const tableWideLine1Html = (): string => {
    const prefix = opts.classPrefix ?? 'dt';
    const tr = state.totalRows.get();
    const text =
      state.filters.get().length > 0
        ? messages.statistics.filteredRowCount(state.filteredRows.get(), tr)
        : messages.statistics.rowCount(tr);
    return `<span class="${prefix}-stats-line1">${escapeHtml(text)}</span>`;
  };

  if (opts.visualizations !== false) {
    actions.setOnFilterRemove(clearVisualizationState);
  }

  // The live headers by column name, rebuilt by every attach pass. Every
  // header rebuild schedules one, so it is current whenever a chart is made.
  let headersByName = new Map<string, ColumnHeader>();

  // The schema and table the last attach pass built charts and panels for.
  // A pass for the same ones keeps the chart and the panel of every header
  // that outlived the column change: a hide, show, move or pin rebuilds no
  // header but the one shown, and only a new relation needs new queries.
  let attachedSchema: readonly ColumnSchema[] | null = null;
  let attachedTableName: string | null = null;

  // The default stats each live chart last reported, for a stats panel made
  // while its column's chart is live.
  const latestStats = new Map<string, ColumnStatsData>();

  // Likewise its detail text: a committed brush or selection's, or a hover's.
  const latestDetail = new Map<string, string>();

  // Per column with a live chart, draws the chart's stats into the stats
  // slot, for a slot a panel was to take and did not.
  const chartStatsRenderers = new Map<string, () => void>();

  // Columns whose custom stats panel threw while being built. As with a chart
  // that throws, the same header on the same relation would throw again, so
  // it is not tried again until one of them changes.
  const failedStatsPanels = new Set<string>();

  // Builds the panels of the columns mounted since the last build, once the
  // mounted columns hold still (see `syncStatsPanels`).
  let statsPanelTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Holds a column's place on the Escape stack once its chart is destroyed.
   * Escape then removes the column's filter, which is what clearing the
   * chart's brush or selection does. Nothing else about the chart needs
   * keeping: a new chart draws its brush or selection from the column's
   * filter when its data lands.
   */
  const detachedInteraction = (columnName: string): InteractiveVisualization => {
    const clear = (): void => coordinator.handleFilterChange(columnName, null);
    return {
      // Dropped from the stack once there is no filter left to clear.
      isDestroyed: () => destroyed || !state.filters.get().some((f) => f.column === columnName),
      clearBrush: clear,
      clearSelection: clear,
    };
  };

  // Per chart, puts its stats slot back once the chart is destroyed.
  const statsSlotResets = new WeakMap<BaseVisualization, () => void>();

  /**
   * Build one column's chart. Called whenever the column comes into view,
   * so each call makes fresh closures over the column's current header.
   */
  const createVizForColumn = (
    column: ColumnSchema,
    vizContainer: HTMLElement,
  ): BaseVisualization | null => {
    const tableName = state.tableName.get();
    const header = headersByName.get(column.name);
    // While a derived-column change waits on DuckDB, `tableName` may name a
    // VIEW it has already dropped or replaced. The column is queued again
    // once the change settles (see `setOnRelationSettled` below).
    if (!tableName || !header || actions.isRelationChanging()) return null;
    const statsEl = header.getStatsElement();
    // A custom stats panel owns the slot while its column is mounted, which
    // need not be for as long as the chart lives, so it is looked up each
    // time.
    const panelOf = (): BaseStatsPanel | null => activeStatsPanels.get(column.name) ?? null;

    // The stats slot is composed of two regions: line 1 (the row-count
    // line, always present) and the detail region below it. Line 1 comes
    // from the viz's default stats; the detail region shows the viz's
    // interaction text (committed selection or transient hover) when one
    // is active, else the default type-specific line 2. Interaction text
    // never displaces line 1, and default-stats refreshes are never
    // dropped while interaction text is showing.
    let lastStats: ColumnStatsData | null = null;
    let detailHtml: string | null = null;

    const renderStatsSlot = (): void => {
      const prefix = opts.classPrefix ?? 'dt';
      // escapeHtml: messages.* are consumer-overridable functions whose
      // return value lands in innerHTML.
      const line1 = lastStats
        ? `<span class="${prefix}-stats-line1">${escapeHtml(formatStatsLine1(lastStats, messages))}</span>`
        : tableWideLine1Html();
      if (detailHtml) {
        statsEl.innerHTML = `${line1}<br>${detailHtml}`;
        return;
      }
      const line2 = lastStats ? formatStatsLine2(lastStats, column.type, messages) : '';
      statsEl.innerHTML = line2
        ? `${line1}<br><span class="${prefix}-stats-line2">${line2}</span>`
        : line1;
    };
    // A custom stats panel is on its way while the column is mounted and waits
    // for the mounted columns to hold still (see `syncStatsPanels`). The chart
    // keeps its stats out of the slot meanwhile: the panel is given them once
    // it is built, and the slot would only flash them before it.
    const panelComing = (): boolean =>
      statsPanelTimer !== null &&
      !failedStatsPanels.has(column.name) &&
      statsPanelRegistry.isApplicable(column) &&
      tableContainer.getColumnWindow().mountedColumns.get().includes(column.name);
    // Only write the placeholder fallback when there's no panel taking the slot.
    if (!panelOf() && !panelComing()) renderStatsSlot();

    let viz: VisualizationType | undefined;
    const vizOptions = {
      tableName,
      bridge,
      filters: state.filters.get(),
      messages,
      onFilterChange: (filter: Filter | null) => {
        coordinator.handleFilterChange(column.name, filter);
      },
      onDefaultStatsChange: (stats: ColumnStatsData) => {
        latestStats.set(column.name, stats);
        lastStats = stats;
        const panel = panelOf();
        if (panel) {
          try {
            panel.update(stats);
          } catch (err) {
            emitStatsPanelError(err, column.name, 'update');
          }
          return;
        }
        if (!panelComing()) renderStatsSlot();
      },
      onStatsChange: (stats: string | null) => {
        detailHtml = stats;
        if (stats === null) latestDetail.delete(column.name);
        else latestDetail.set(column.name, stats);
        const panel = panelOf();
        if (panel) {
          try {
            panel.setHoverStats(stats);
          } catch (err) {
            emitStatsPanelError(err, column.name, 'hover');
          }
          return;
        }
        if (!panelComing()) renderStatsSlot();
      },
      onBrushCommit: (colName: string) => {
        if (viz) interactionManager?.pushBrush(colName, viz);
      },
      onBrushClear: (colName: string) => {
        interactionManager?.removeColumn(colName);
      },
      onSelectionChange: (colName: string, hasSelection: boolean) => {
        if (!viz) return;
        if (hasSelection) interactionManager?.pushSelection(colName, viz);
        else interactionManager?.removeColumn(colName);
      },
      onError: (
        err: DataTableError,
        context: { columnName?: string; stage: 'fetch' | 'render' | 'filter' },
      ) => {
        // A fetch that failed leaves the chart nothing to describe: the
        // stats it reported before are for the filters then.
        if (context.stage !== 'render') {
          lastStats = null;
          latestStats.delete(column.name);
          const panel = panelOf();
          if (panel) {
            try {
              panel.update(null);
            } catch (panelErr) {
              emitStatsPanelError(panelErr, column.name, 'update');
            }
          } else if (!panelComing()) {
            renderStatsSlot();
          }
        }
        emitter.emit('error', {
          error: withChartContext(err, context.columnName ?? column.name, context.stage),
          source: 'visualization',
        });
      },
    };

    const created = vizRegistry.create(vizContainer, column, vizOptions);
    if (!created) return null;
    viz = created as VisualizationType;
    chartStatsRenderers.set(column.name, renderStatsSlot);
    // Once the chart is gone, its stats must not linger: a panel goes back
    // to its initial state, and the default slot to the table-wide count,
    // which `refreshNonVizStats` keeps current from then on.
    statsSlotResets.set(created, () => {
      chartStatsRenderers.delete(column.name);
      if (destroyed) return;
      latestStats.delete(column.name);
      latestDetail.delete(column.name);
      const panel = panelOf();
      if (!panel) {
        statsEl.innerHTML = tableWideLine1Html();
        return;
      }
      if (panel.isDestroyed()) return;
      try {
        panel.update(null);
      } catch (err) {
        emitStatsPanelError(err, column.name, 'update');
      }
    });
    return created;
  };

  if (opts.visualizations !== false) {
    const headerScrollSelector = `.${opts.classPrefix ?? 'dt'}-header-scroll`;
    vizController = new LazyVizController({
      host: {
        createViz: createVizForColumn,
        getVizContainer: (columnName) => headersByName.get(columnName)?.getVizContainer() ?? null,
        onVizCreated: (columnName, viz) => coordinator.register(columnName, viz),
        onVizDestroyed: (columnName, viz) => {
          statsSlotResets.get(viz)?.();
          interactionManager?.replaceVisualization(columnName, detachedInteraction(columnName));
          coordinator.unregister(columnName);
        },
        // A hidden or removed column leaves the Escape stack, as its chart
        // would when the header row is rebuilt without it.
        onColumnRemoved: (columnName) => interactionManager?.removeColumn(columnName),
        onError: (err, columnName) => {
          const typed =
            err instanceof DataTableError
              ? err
              : new ConfigurationError(err instanceof Error ? err.message : String(err), {
                  code: 'INVARIANT',
                  cause: err,
                });
          emitter.emit('error', {
            error: withChartContext(typed, columnName),
            source: 'visualization',
          });
        },
      },
      getRoot: () => tableContainer.getElement().querySelector(headerScrollSelector),
    });
  }

  /**
   * Put a column's stats slot as it is without a panel: the stats of the
   * column's chart while it lives (it reports them again only on its next
   * fetch), and otherwise the table-wide count, until a chart writes its own.
   */
  const resetStatsSlot = (header: ColumnHeader): void => {
    const renderChartStats = chartStatsRenderers.get(header.getColumn().name);
    if (renderChartStats) renderChartStats();
    else header.getStatsElement().innerHTML = tableWideLine1Html();
  };

  /**
   * Build a column's custom stats panel into its stats slot, when the
   * registry has one for it. A panel lives while its column is mounted (see
   * `syncStatsPanels` below).
   */
  const createStatsPanel = (header: ColumnHeader, tableName: string): void => {
    const column = header.getColumn();
    if (!statsPanelCoordinator || activeStatsPanels.has(column.name)) return;
    // While a derived-column change waits on DuckDB, `tableName` may name a
    // VIEW it has already dropped, as for charts. The panels skipped are
    // built once the change settles (see `setOnRelationSettled` below).
    if (actions.isRelationChanging() || failedStatsPanels.has(column.name)) return;
    if (!statsPanelRegistry.isApplicable(column)) return;
    const statsEl = header.getStatsElement();
    const panelOptions: StatsPanelOptions = {
      tableName,
      bridge,
      filters: state.filters.get(),
      messages,
      onError: (err, ctx) => {
        // Merge ctx into err.details so async errors carry the same
        // {column, phase} payload the synchronous-throw path attaches
        // via emitStatsPanelError. Without this, listeners see two
        // different shapes depending on which path the panel took.
        // `details` is declared readonly on DataTableError; the cast
        // is the deliberate write-through site.
        const target = err as { details?: Record<string, unknown> };
        target.details = {
          ...(target.details ?? {}),
          column: ctx.column,
          phase: ctx.phase,
        };
        emitter.emit('error', { error: err, source: 'stats-panel' });
      },
    };
    let panel: BaseStatsPanel | null = null;
    try {
      // Clear the slot before construction so the panel starts on a blank
      // canvas — any prior fallback HTML or previous-panel residue is gone.
      statsEl.innerHTML = '';
      panel = statsPanelRegistry.create(statsEl, column, panelOptions);
    } catch (err) {
      failedStatsPanels.add(column.name);
      emitStatsPanelError(err, column.name, 'construct');
    }
    if (!panel) {
      resetStatsSlot(header);
      return;
    }
    activeStatsPanels.set(column.name, panel);
    statsPanelCoordinator.register(column.name, panel);
    // What the column's chart has reported, if it is live; a later fetch
    // routes through `onDefaultStatsChange` to `panel.update(stats)`.
    try {
      panel.update(latestStats.get(column.name) ?? null);
    } catch (err) {
      emitStatsPanelError(err, column.name, 'update');
    }
    // And its detail text. A chart reports a committed selection's once, as
    // its data lands, which can be before the panel is built.
    const detail = latestDetail.get(column.name);
    if (detail === undefined) return;
    try {
      panel.setHoverStats(detail);
    } catch (err) {
      emitStatsPanelError(err, column.name, 'hover');
    }
  };

  /** Destroy a column's stats panel, if it has one. */
  const destroyStatsPanel = (columnName: string): void => {
    const panel = activeStatsPanels.get(columnName);
    if (!panel) return;
    activeStatsPanels.delete(columnName);
    statsPanelCoordinator?.unregister(columnName);
    try {
      panel.destroy();
    } catch (err) {
      emitStatsPanelError(err, columnName, 'destroy');
    }
  };

  // Auto-attach/detach visualizations as the schema changes. This replaces
  // the ~200 lines of manual wiring that every consumer used to have to write.
  //
  // The crossfilter coordinator above is a singleton-per-DataTable so the
  // public `filterChange` event always emits with a fresh row count, even
  // before the first data load. Charts register on it as they are created,
  // so a filter change refreshes only the charts in view.
  const attachVisualizations = (): void => {
    const tableName = state.tableName.get();
    if (!tableName) return;
    const schema = state.schema.get();
    // New data, or a derived column added, edited or removed: every chart and
    // panel queries the relation it was built with.
    const relationChanged = schema !== attachedSchema || tableName !== attachedTableName;
    attachedSchema = schema;
    attachedTableName = tableName;

    const headers = tableContainer.getColumnHeaders();
    const previousHeaders = headersByName;
    headersByName = new Map(headers.map((header) => [header.getColumn().name, header]));
    // A column keeps its chart and panel when its header outlived the change.
    const kept = (columnName: string): boolean => {
      const header = headersByName.get(columnName);
      return !relationChanged && header !== undefined && previousHeaders.get(columnName) === header;
    };

    // Tear down the stats panels that do not carry over (run before the
    // coordinator resets so a panel's destroy hook still sees a valid
    // registration if it queries us).
    for (const columnName of [...activeStatsPanels.keys()]) {
      if (!kept(columnName)) destroyStatsPanel(columnName);
    }
    for (const columnName of [...latestStats.keys()]) {
      if (!kept(columnName)) latestStats.delete(columnName);
    }
    for (const columnName of [...latestDetail.keys()]) {
      if (!kept(columnName)) latestDetail.delete(columnName);
    }
    for (const columnName of [...failedStatsPanels]) {
      if (!kept(columnName)) failedStatsPanels.delete(columnName);
    }

    // Recreate stats panel coordinator for a new relation. Panels for non-viz
    // columns still need filter-aware updates, so we keep this coordinator
    // independent of the viz one.
    if (relationChanged || !statsPanelCoordinator) {
      statsPanelCoordinator?.destroy();
      statsPanelCoordinator = new StatsPanelCoordinator(state);
    }

    // Per-column work (viz instances + custom stats panels) is gated by the
    // `visualizations` opt; the coordinator above is now wired regardless so
    // the public `filterChange` event always carries a fresh row count.
    if (!vizController) {
      // No vizs created and no syncExistingFilters call below — reset
      // pendingVizInit so loadDataImpl doesn't await a stale promise from a
      // previous attach pass.
      pendingVizInit = Promise.resolve();
      return;
    }

    const mounted = new Set(tableContainer.getColumnWindow().mountedColumns.get());
    const vizColumns: ColumnSchema[] = [];
    for (const header of headers) {
      const column = header.getColumn();
      const carriedOver = kept(column.name);
      // A custom stats panel owns the contents of `.dt-col-stats` while it
      // lives; the library never writes to the slot directly. Built for the
      // columns mounted now; the others get theirs when they mount.
      if (!carriedOver && mounted.has(column.name)) createStatsPanel(header, tableName);
      const hasPanel = activeStatsPanels.has(column.name);

      if (vizRegistry.isApplicable(column)) vizColumns.push(column);
      // A header that carried over has its slot as it was: its chart's, its
      // panel's, or the table-wide count `refreshNonVizStats` keeps current.
      // Otherwise the table-wide count, until the column's chart exists.
      if (!hasPanel && !carriedOver) header.getStatsElement().innerHTML = tableWideLine1Html();
    }

    // Destroys the charts that do not carry over, then creates the ones in
    // view.
    vizController.sync(vizColumns, kept);

    // Rebroadcast any filters already in state (e.g., restored from session)
    // to a new relation. Both coordinators return a Promise; we feed those
    // into pendingVizInit so loadDataImpl can await them in parallel with the
    // table body's first SELECT. Errors per task are swallowed by allSettled
    // below — viz fetch errors already route via options.onError → 'error'
    // event with source: 'visualization'; panel errors via source:
    // 'stats-panel'; the count query in updateFilteredRowCount is
    // best-effort. A column change on the same relation needs none of this:
    // charts and panels that carried over are current, and new ones are made
    // with the filters in force.
    const initPromises: Promise<unknown>[] = [vizController.whenWaveSettled()];
    if (relationChanged) {
      initPromises.push(
        coordinator.syncExistingFilters(),
        // Same for stats panels — give them the current filter array up-front
        // so panels with their own DuckDB queries don't have to wait for the
        // next user-driven filter change.
        statsPanelCoordinator.syncExistingFilters(state.filters.get()),
      );
    }

    pendingVizInit = Promise.allSettled(initPromises).then(() => undefined);
  };

  // -------- AutoSave --------
  if (sessionStore && opts.persistence !== false) {
    autoSave = new AutoSave(state, sessionStore, {
      undoManager,
      presetManager: presetManager ?? undefined,
      annotationStore,
      onError: (err) => {
        emitter.emit('error', { error: err, source: 'persistence' });
      },
    });
    autoSave.enable();
  }

  // -------- Export dialog (lazy) --------
  let exportDialog: ExportDialog | null = null;
  const openExport = (): void => {
    if (opts.exportDialog === false) return;
    if (!exportDialog) {
      exportDialog = new ExportDialog(state, bridge, {
        classPrefix: opts.classPrefix ?? 'dt',
        instanceId,
        colorSchemeSource: tableContainer.getElement(),
        messages,
      });
      tableContainer.getPortalTarget().appendChild(exportDialog.getElement());
    }
    exportDialog.open();
  };

  // -------- Re-emit signals as typed events --------
  const unsubscribes: (() => void)[] = [];
  // `destroyed` is declared near the top of this factory because the
  // crossfilter coordinator's `onFilterCycleComplete` callback (used to emit
  // `filterChange`) needs to short-circuit during teardown.
  // Sticky-replay payload for the `ready` lifecycle event. Set once when
  // `ready` fires; late subscribers via `table.on('ready', …)` receive a
  // microtask-scheduled replay so they never miss it regardless of whether
  // they registered before or after awaiting `createDataTable(...)`.
  let readyPayload: { bridgeReady: true } | null = null;

  // Each emit allocates a fresh shallow copy of mutable payload fields
  // (arrays, Sets) so handlers that destructure and mutate the payload
  // can't write back into the live signal value. Object-shape items
  // inside the arrays (Filter, SortColumn, ColumnSchema, …) are not
  // deep-cloned — the immutability contract is "the collection is
  // yours; the items inside are still shared, treat them read-only".
  //
  // `filterChange` is intentionally *not* emitted from
  // `state.filters.subscribe` — the row-count refresh that backs
  // `filteredRowCount` runs asynchronously inside CrossfilterCoordinator,
  // so a synchronous emit here would always carry the previous cycle's
  // count. The coordinator drives the emission via its
  // `onFilterCycleComplete` hook (wired in `attachVisualizations`) at the
  // trailing edge of each cycle, when both viz updates and the COUNT(*)
  // query have settled.
  unsubscribes.push(
    state.sortColumns.subscribe((sortColumns: SortColumn[]) => {
      emitter.emit('sortChange', { sortColumns: [...sortColumns] });
    }),
  );
  unsubscribes.push(
    state.selectedRows.subscribe((selectedRows: Set<number>) => {
      emitter.emit('selectionChange', { selectedRows: new Set(selectedRows) });
    }),
  );
  // visibleColumns and pinnedColumns are independent signals — but pinning a
  // column moves it from one to the other, firing both subscribers in the
  // same tick. Coalesce via a queueMicrotask flag so consumers see exactly
  // one columnChange event per logical change instead of two duplicate ones.
  let columnChangePending = false;
  const flushColumnChange = (): void => {
    if (!columnChangePending) return;
    columnChangePending = false;
    if (destroyed) return;
    emitter.emit('columnChange', {
      visibleColumns: [...state.visibleColumns.get()],
      pinnedColumns: [...state.pinnedColumns.get()],
      columnOrder: [...state.columnOrder.get()],
    });
  };
  const scheduleColumnChange = (): void => {
    if (columnChangePending) return;
    columnChangePending = true;
    queueMicrotask(flushColumnChange);
  };
  unsubscribes.push(state.visibleColumns.subscribe(scheduleColumnChange));
  unsubscribes.push(state.pinnedColumns.subscribe(scheduleColumnChange));
  // derivedChange is emitted explicitly from the action call sites (see
  // src/core/Actions.ts) so the payload can carry the `kind` discriminator
  // and the specific `columnName` that changed. Undo/redo and session
  // restore go through reconcileDerivedColumns and emit with kind omitted.
  actions.setOnDerivedChange((payload) => {
    emitter.emit('derivedChange', payload);
  });
  if (undoManager) {
    unsubscribes.push(
      undoManager.canUndoSignal.subscribe(() => {
        emitter.emit('undoChange', {
          canUndo: undoManager.canUndo,
          canRedo: undoManager.canRedo,
        });
      }),
    );
    unsubscribes.push(
      undoManager.canRedoSignal.subscribe(() => {
        emitter.emit('undoChange', {
          canUndo: undoManager.canUndo,
          canRedo: undoManager.canRedo,
        });
      }),
    );
  }

  // Debounced re-attach of visualizations. `initializeColumnsFromSchema`
  // (see `src/core/State.ts`) sets `schema` and `visibleColumns` back-to-back
  // and each triggers a `TableContainer.render()` — so attaching
  // synchronously inside each subscriber would run a pass per write, the
  // first against a header row the next write changes again.
  //
  // `queueMicrotask` defers until all synchronous signal updates in the
  // current call stack have fired (and the last `render()` has run), but
  // still runs before the browser paints — no visual flash.
  //
  // Subscribing to `visibleColumns` and `tableName` in addition to `schema`
  // covers: column hide/show/reorder (visibleColumns) and derived-column
  // table switches where a VIEW replaces the base table (tableName).
  let attachScheduled = false;
  const scheduleAttach = (): void => {
    if (attachScheduled || destroyed) return;
    attachScheduled = true;
    queueMicrotask(() => {
      attachScheduled = false;
      if (destroyed) return;
      if (state.schema.get().length === 0) return;
      if (!state.tableName.get()) return;
      attachVisualizations();
    });
  };
  unsubscribes.push(state.schema.subscribe(scheduleAttach));
  unsubscribes.push(state.visibleColumns.subscribe(scheduleAttach));
  unsubscribes.push(state.tableName.subscribe(scheduleAttach));

  /**
   * The table the last attach pass built charts and panels for, while it is
   * still the table's; `null` before that pass has run for the current table
   * and schema, and once the table is destroyed.
   */
  const attachedTable = (): string | null => {
    const tableName = state.tableName.get();
    if (destroyed || !tableName || tableName !== attachedTableName) return null;
    return state.schema.get() === attachedSchema ? tableName : null;
  };

  /** Give each mounted column without a custom stats panel its panel. */
  const buildMountedStatsPanels = (): void => {
    statsPanelTimer = null;
    const tableName = attachedTable();
    if (!tableName) return;
    for (const columnName of tableContainer.getColumnWindow().mountedColumns.get()) {
      const header = headersByName.get(columnName);
      if (header && !activeStatsPanels.has(columnName)) createStatsPanel(header, tableName);
    }
    // A chart whose column got no panel shows the stats it held back for one:
    // the column left, or the registry no longer has a panel for it.
    for (const [columnName, renderChartStats] of chartStatsRenderers) {
      if (!activeStatsPanels.has(columnName)) renderChartStats();
    }
  };

  /**
   * Keep the custom stats panels on the mounted columns. A panel lives while
   * its column is mounted, within about a viewport of the view, with the
   * hysteresis the mounted columns have, so a scroll back and forth rebuilds
   * none.
   *
   * A column that leaves loses its panel at once. One that arrives gets its
   * panel once the mounted columns have held still for
   * {@link STATS_PANEL_SETTLE_MS}; its chart, if it has one by then, holds
   * back its stats for the panel (see `createVizForColumn`). A smooth scroll
   * across a wide table mounts nearly every column on the way, and a panel
   * usually queries as it is built: the scroll to a derived column just
   * added built about 500 panels, and the charts at the far end waited
   * seconds behind their queries.
   *
   * Does nothing until an attach pass has run for the current table and
   * schema; that pass builds the panels of the columns mounted then.
   */
  const syncStatsPanels = (columns: readonly string[]): void => {
    if (!attachedTable()) return;
    const mounted = new Set(columns);
    for (const columnName of [...activeStatsPanels.keys()]) {
      if (mounted.has(columnName)) continue;
      destroyStatsPanel(columnName);
      // The panel leaves its slot empty, or as it last drew it, and the
      // column may be back in view before its next panel is built.
      const header = headersByName.get(columnName);
      if (header) resetStatsSlot(header);
    }
    if (statsPanelTimer !== null) clearTimeout(statsPanelTimer);
    statsPanelTimer = setTimeout(buildMountedStatsPanels, STATS_PANEL_SETTLE_MS);
  };
  if (vizController) {
    const columnWindow = tableContainer.getColumnWindow();
    unsubscribes.push(columnWindow.mountedColumns.subscribe(syncStatsPanels));
    // Build the charts and panels skipped during a derived-column change: the
    // charts now, the panels once the mounted columns hold still. After a
    // success the attach pass that follows builds them anyway; after a
    // failure nothing else would. A task rather than a microtask, so it runs
    // after the state update that follows the change and the attach pass it
    // schedules.
    actions.setOnRelationSettled(() => {
      setTimeout(() => {
        if (destroyed) return;
        vizController?.requeueWanted();
        syncStatsPanels(columnWindow.mountedColumns.get());
      }, 0);
    });
  }

  // Keep the row-count stats line live for every column without a live
  // chart: columns with no visualization (e.g. uuid), and chart columns out
  // of view, whose charts do not exist. A live chart refreshes its own stats
  // via the `onDefaultStatsChange` callback in `createVizForColumn`. A column
  // with a custom stats panel — chart or not — is skipped because the panel
  // owns the slot and receives filter updates from `StatsPanelCoordinator`
  // directly.
  const refreshNonVizStats = (): void => {
    if (destroyed) return;
    if (!state.tableName.get()) return;
    const headers = tableContainer.getColumnHeaders();
    for (const header of headers) {
      const column = header.getColumn();
      // With visualizations off, a column that would have had a chart is
      // skipped, as it always was.
      if (
        vizController ? vizController.hasLiveViz(column.name) : vizRegistry.isApplicable(column)
      ) {
        continue;
      }
      // Panel-owned slot? Skip — except when the panel destroyed itself
      // early. A self-destroyed panel leaves the slot frozen with whatever
      // it last wrote; that's worse than reverting to the default fallback,
      // so we prune the dangling entry here and fall through to the write.
      const panel = activeStatsPanels.get(column.name);
      if (panel) {
        if (!panel.isDestroyed()) continue;
        activeStatsPanels.delete(column.name);
      }
      header.getStatsElement().innerHTML = tableWideLine1Html();
    }
  };
  // `filters` and `filteredRows` both change in one filter cycle, in the
  // same turn when a filter is removed, so run one pass for both. The
  // microtask still runs before the browser paints.
  let nonVizStatsScheduled = false;
  const scheduleNonVizStatsRefresh = (): void => {
    if (nonVizStatsScheduled || destroyed) return;
    nonVizStatsScheduled = true;
    queueMicrotask(() => {
      nonVizStatsScheduled = false;
      refreshNonVizStats();
    });
  };
  unsubscribes.push(state.filters.subscribe(scheduleNonVizStatsRefresh));
  unsubscribes.push(state.filteredRows.subscribe(scheduleNonVizStatsRefresh));

  // -------- Public loadData --------
  // Base tables that failed loads left behind. `actions.loadData` resets
  // state before it loads, so after a failed load nothing points at the
  // previous table, though DuckDB still holds it. The next successful load,
  // or destroy() over a shared bridge, drops them.
  const strandedTables = new Set<string>();

  async function loadDataImpl(
    source: File | string | ArrayBuffer | Blob,
    loadOpts?: LoadDataOptions & { sourceFormat?: DataFormat | undefined },
  ): Promise<void> {
    const sourceLabel =
      typeof source === 'string' ? source : source instanceof File ? source.name : 'in-memory';
    emitter.emit('loadStart', { source: sourceLabel });
    // Disable auto-save while loading so we don't capture the transient
    // half-initialized state.
    autoSave?.disable();
    // Capture the previous base table NOW, before `actions.loadData`
    // resets state. We drop it AFTER the new load resolves successfully —
    // a failed load leaves the previous data queryable as a fallback.
    // `state.baseTableName` takes precedence so a derived-VIEW tableName
    // doesn't shadow the underlying physical table name.
    const previousBaseTableName = state.baseTableName.get() ?? state.tableName.get();
    try {
      // Clear per-dataset state before loading the new dataset. AutoSave
      // is disabled here, so these mutations don't fire spurious saves.
      // `restoreStateFromSnapshot` (run inside `actions.loadData`) will
      // re-populate presets / annotations from the new dataset's snapshot
      // if one exists. Shared `FilterPresetManager`s (user-supplied) are
      // left untouched so multi-table dashboards keep their cross-table
      // state. The annotation store is always per-DataTable, so its
      // clear is unconditional. Bridge query cache is invalidated to
      // avoid stale plans bound to the previous dataset's columns.
      if (ownsPresetManager) presetManager?.presets.set([]);
      annotationStore.clear('all');
      bridge.clearQueryCache();
      const mergedOpts: LoadDataOptions = {
        ...(loadOpts ?? {}),
        format: loadOpts?.sourceFormat ?? loadOpts?.format,
        // Always pass store/presetManager if we have them, so session +
        // preset restore happens as part of loadData.
        sessionStore: loadOpts?.sessionStore ?? sessionStore ?? undefined,
        presetManager: loadOpts?.presetManager ?? presetManager ?? undefined,
        annotationStore,
      };
      await actions.loadData(source, mergedOpts);
      if (destroyed) {
        // Tearing down — skip the loadComplete emit on a dead emitter and
        // surface a destroy error so consumers know the load was aborted.
        throw new DestroyedError('DataTable is destroyed; load aborted.');
      }
      // Wait in parallel for the body's first SELECT and the per-column
      // visualization/stats-panel initial fetches + filter-sync queries.
      // Both promises swallow internally (whenBodyReady catches body-init
      // errors; pendingVizInit wraps in allSettled and errors route through
      // the `error` event), so Promise.all here can never short-circuit.
      // Awaiting in parallel saves wall time over chaining since these
      // workloads are independent at the worker boundary.
      //
      // State setters inside `actions.loadData` fan out synchronously, so by
      // this point every triggered `TableContainer.render()` and
      // `attachVisualizations()` has run; `currentBodyInit` references the
      // last (surviving) body and `pendingVizInit` references the latest
      // attach pass's collected work.
      //
      // An attach pass that runs while this waits replaces `pendingVizInit`,
      // and settles the one it replaced without waiting for its charts, so
      // wait again for the pass that replaced it.
      let vizInit: Promise<void>;
      do {
        vizInit = pendingVizInit;
        await Promise.all([tableContainer.whenBodyReady(), vizInit]);
      } while (vizInit !== pendingVizInit && !destroyed);
      if (destroyed) {
        throw new DestroyedError('DataTable is destroyed; load aborted.');
      }
      emitter.emit('loadComplete', {
        tableName: state.tableName.get() ?? '',
        rowCount: state.totalRows.get(),
        // Defensive shallow clone — same contract as filterChange/sortChange/
        // selectionChange/columnChange (Phase 8). Handlers that destructure
        // and mutate `schema` cannot corrupt the live state signal value.
        schema: [...state.schema.get()],
      });
      // Reclaim the previous base table now that the new one is live, and
      // any that earlier failed loads left behind. Skip the new table's
      // own name — `CREATE OR REPLACE TABLE` already replaced it
      // atomically in the loader, and a redundant DROP would race with the
      // live table. Best-effort: a DROP failure must not turn a successful
      // load into a thrown error — we only leak one orphan in that worst
      // case.
      const newBaseTableName = state.baseTableName.get() ?? state.tableName.get();
      const reclaim = [...strandedTables];
      if (previousBaseTableName) reclaim.push(previousBaseTableName);
      strandedTables.clear();
      if (typeof bridge.dropTable === 'function') {
        for (const name of new Set(reclaim)) {
          if (name === newBaseTableName) continue;
          try {
            await bridge.dropTable(name);
          } catch (err) {
            console.warn(`[data-table] Failed to drop previous table "${name}":`, err);
          }
        }
      }
    } catch (error) {
      // The previous table stays in DuckDB as a fallback, but state no
      // longer names it once `actions.loadData` has reset it. Remember it
      // so a later load or destroy() can still drop it.
      const currentBaseTableName = state.baseTableName.get() ?? state.tableName.get();
      if (previousBaseTableName && previousBaseTableName !== currentBaseTableName) {
        strandedTables.add(previousBaseTableName);
      }
      const typed =
        error instanceof DataTableError
          ? error
          : new LoadError(error instanceof Error ? error.message : String(error), {
              code: 'PARSE_FAILED',
              cause: error,
            });
      // Skip event emission on a dead emitter — destroy() has already cleared
      // the listener map and consumers no longer expect notifications.
      if (!destroyed) {
        emitter.emit('loadError', { error: typed });
        emitter.emit('error', { error: typed, source: 'load' });
      }
      throw typed;
    } finally {
      if (!destroyed) autoSave?.enable();
    }
  }

  // -------- Fire 'ready' (and maybe initial load) --------
  readyPayload = { bridgeReady: true };
  emitter.emit('ready', readyPayload);
  if (opts.source !== undefined) {
    // Do not await inside createDataTable — consumers can await the returned
    // promise via `table.on('loadComplete', …)` or a subsequent state read.
    // However, we DO await here so that `createDataTable` resolves with
    // an already-populated table, matching most consumer expectations.
    await loadDataImpl(opts.source, {
      tableName: opts.tableName,
      sourceFormat: opts.sourceFormat,
    });
  }

  // -------- destroy --------
  async function destroy(): Promise<void> {
    if (destroyed) return;
    destroyed = true;
    // Mark the action layer destroyed first so any in-flight async action
    // (e.g. addDerivedColumn awaiting the worker) drops its post-await state
    // mutation rather than writing into the dead table.
    actions.markDestroyed();
    emitter.emit('destroy', {});

    autoSave?.disable();
    annotationStore.destroy();
    annotationPopover.destroy();
    columnHeaderTooltipPopover.destroy();
    for (const unsub of unsubscribes) {
      try {
        unsub();
      } catch {
        // Ignore — we're tearing down.
      }
    }
    unsubscribes.length = 0;

    vizController?.destroy();
    vizController = null;
    interactionManager?.destroy();
    coordinator.destroy();

    if (statsPanelTimer !== null) clearTimeout(statsPanelTimer);
    statsPanelTimer = null;

    for (const [colName, panel] of activeStatsPanels) {
      try {
        panel.destroy();
      } catch (err) {
        emitStatsPanelError(err, colName, 'destroy');
      }
    }
    activeStatsPanels.clear();
    statsPanelCoordinator?.destroy();
    statsPanelCoordinator = null;

    exportDialog?.destroy();
    exportDialog = null;

    tableContainer.destroy();

    if (ownsSessionStore && sessionStore) {
      try {
        sessionStore.close();
      } catch {
        // ignore
      }
    }

    // Reclaim the base table from the worker before tearing down. Skipped
    // when we own the bridge — `terminate()` discards the whole worker
    // (and its DuckDB context) below, so the DROP would be wasted IPC.
    // When the bridge is shared (multi-table dashboards), the worker
    // outlives this DataTable, and the table would orphan if we didn't
    // drop it here, along with any a failed load left behind. Best-effort:
    // a failure must not turn `destroy()` into a thrown error.
    if (!ownsBridge && typeof bridge.dropTable === 'function') {
      const baseToDrop = state.baseTableName.get() ?? state.tableName.get();
      const toDrop = new Set(strandedTables);
      if (baseToDrop) toDrop.add(baseToDrop);
      strandedTables.clear();
      for (const name of toDrop) {
        try {
          await bridge.dropTable(name);
        } catch (err) {
          console.warn(`[data-table] Failed to drop base table "${name}" on destroy:`, err);
        }
      }
    }

    if (ownsBridge) bridge.terminate();

    emitter.removeAllListeners();
  }

  // -------- clearSession --------
  // Order matters: disable AutoSave FIRST so the debounced save and the
  // beforeunload handler can't resurrect the snapshot we're about to delete.
  // Then delete the IDB row, then reset all in-memory state. Finally re-enable
  // AutoSave — it short-circuits on a null tableName until new data is loaded.
  // Key matches `snapshotFromState` (src/persistence/serialization.ts) —
  // baseTableName takes precedence so the same snapshot is shared between
  // the base table and any VIEW derived from it.
  async function clearSession(): Promise<void> {
    autoSave?.disable();
    try {
      if (sessionStore) {
        const key = state.baseTableName.get() ?? state.tableName.get();
        if (key) await sessionStore.delete(key);
      }
      // If destroy() raced ahead while we were awaiting the IDB delete, drop
      // the in-memory reset — the state slices are about to be torn down and
      // mutating them now would emit on a dying emitter.
      if (destroyed) {
        throw new DestroyedError('DataTable is destroyed; clearSession aborted.');
      }
      resetTableState(state);
      undoManager?.clear();
      // Only clear presets we own. A user-supplied shared
      // `FilterPresetManager` (multi-table dashboards) outlives any
      // single table's session — clearing it here would wipe other
      // tables' presets too.
      if (ownsPresetManager) presetManager?.presets.set([]);
      annotationStore.clear('all');
      bridge.clearQueryCache();
    } finally {
      if (!destroyed) autoSave?.enable();
    }
  }

  // -------- Public DataTable --------
  const throwIfDestroyed = (method: string): void => {
    if (destroyed) {
      throw new DestroyedError(`DataTable is destroyed; cannot call ${method}().`);
    }
  };

  const dataTable: DataTable = {
    state,
    actions,
    bridge,
    container: tableContainer,
    annotations: annotationStore,
    instanceId,
    loadData: (source, loadOpts) => {
      if (destroyed) {
        return Promise.reject(
          new DestroyedError('DataTable is destroyed; cannot call loadData().'),
        );
      }
      return loadDataImpl(source, loadOpts);
    },
    on(event, handler) {
      throwIfDestroyed('on');
      if (event === 'ready' && readyPayload) {
        const payload = readyPayload;
        queueMicrotask(() => {
          if (destroyed) return;
          (handler as (p: { bridgeReady: true }) => void)(payload);
        });
      }
      emitter.on(event, handler);
      return () => emitter.off(event, handler);
    },
    off(event, handler) {
      throwIfDestroyed('off');
      emitter.off(event, handler);
    },
    openExportDialog() {
      throwIfDestroyed('openExportDialog');
      openExport();
    },
    clearSession() {
      if (destroyed) {
        return Promise.reject(
          new DestroyedError('DataTable is destroyed; cannot call clearSession().'),
        );
      }
      return clearSession();
    },
    destroy,
    isDestroyed: () => destroyed,
    isPersistenceActive: () => sessionStore !== null,
    setColorScheme(scheme) {
      throwIfDestroyed('setColorScheme');
      const next = validateColorScheme(scheme, 'setColorScheme');
      colorScheme = next;
      tableContainer.setColorScheme(next);
    },
    getColorScheme: () => colorScheme,
  };

  return dataTable;
}
