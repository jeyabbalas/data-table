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
import { clearLoadMarks, markLoad } from './core/loadMarks';
import type { ProgressInfo } from './core/Progress';
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
import { DateHistogram } from './visualizations/histogram/DateHistogram';
import { Histogram } from './visualizations/histogram/Histogram';
import { shouldUseApproxDistinct } from './visualizations/histogram/HistogramData';
import { IntervalHistogram } from './visualizations/histogram/IntervalHistogram';
import { TimeHistogram } from './visualizations/histogram/TimeHistogram';
import { InteractionManager } from './visualizations/InteractionManager';
import { StatsPanelCoordinator } from './visualizations/StatsPanelCoordinator';
import type { StatsPanelRegistry } from './visualizations/StatsPanelRegistry';
import { defaultStatsPanelRegistry } from './visualizations/StatsPanelRegistry';
import { ThemeWatcher } from './visualizations/ThemeWatcher';
import { ValueCounts } from './visualizations/valuecounts/ValueCounts';
import type { VisualizationRegistry } from './visualizations/VisualizationRegistry';
import { defaultVisualizationRegistry } from './visualizations/VisualizationRegistry';
import { VizDataController } from './visualizations/VizDataController';

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
   * Auto-attached column header visualizations (histograms, value counts).
   *
   * - `true` / `undefined` / `{}` — **lazy** (the default). A column's chart
   *   is created and fetched when its header scrolls into view, and its data
   *   survives the header rebuild that every hide / show / pin / reorder
   *   causes. On a 1,000-column table this is the difference between ~2,000
   *   queries at load and a few dozen.
   * - `false` — off entirely.
   * - `{ eager: true }` — turn the visibility gate off: a column's chart is
   *   created and fetched as soon as its header exists, rather than when the
   *   header nears the viewport, and the load promise holds until all of them
   *   settle.
   *
   *   **This is no longer "every column".** The header row is windowed on the
   *   horizontal axis, so only the columns around the viewport have a header
   *   — and a chart needs its header's container to render into. An eager
   *   load of a 300-column table draws the ~17 charts that are on screen, not
   *   300. A screenshot pipeline gets every chart *in the shot*, which is the
   *   part that was ever visible; there is no setting that draws a chart for
   *   a column the page is not showing, because there is nowhere to draw it.
   *
   *   What `eager` still buys is determinism: no dependence on
   *   `IntersectionObserver` timing, and no chance of capturing a frame in
   *   which the visible charts have not been built yet.
   *
   * @example
   * ```ts
   * // Default: the grid is interactive as soon as rows paint.
   * const table = await createDataTable({ container, source });
   *
   * // Screenshot pipeline: every *visible* chart drawn before the await
   * // resolves. Scroll and re-await `whenVizReady()` to capture more.
   * const shot = await createDataTable({
   *   container,
   *   source,
   *   visualizations: { eager: true },
   * });
   * ```
   */
  visualizations?: boolean | { eager?: boolean };

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
   *
   * @remarks Resolves at first **interactive** paint — schema known, first
   * row block rendered, filter counts correct — not when every column chart
   * has drawn. See {@link whenVizReady}.
   */
  loadData(
    source: File | string | ArrayBuffer | Blob,
    opts?: LoadDataOptions & { sourceFormat?: DataFormat },
  ): Promise<void>;

  /**
   * Resolves when the current load's visible column charts have finished
   * fetching — the promise form of the `vizReady` event.
   *
   * `loadData` (and `await createDataTable({ source })`) resolves at first
   * interactive paint and does not wait for charts. Await this when you need
   * them drawn: a screenshot, a PDF, a visual-regression snapshot.
   *
   * Resolves immediately before the first load, and is replaced on each
   * subsequent `loadData` — call it after starting the load you care about.
   * With `visualizations: false` or `{ eager: true }` it has already
   * resolved by the time `loadData` does.
   *
   * @remarks **In a hidden document it resolves immediately, with no charts
   * drawn.** Chart creation is driven by an `IntersectionObserver`, and a
   * browser gives a background or minimized window no rendering opportunity,
   * so no intersection is ever computed and nothing is ever visible. The
   * visible wave is therefore empty, `vizReady` fires with `vizCount: 0`, and
   * this resolves rather than waiting for a callback that is not coming. The
   * charts are built when the document is shown. Use `{ eager: true }` if you
   * need them drawn in a document that is never shown.
   *
   * @example
   * ```ts
   * const table = await createDataTable({ container, source });
   * // The grid is already interactive here.
   * await table.whenVizReady();
   * await page.screenshot();
   * ```
   */
  whenVizReady(): Promise<void>;

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

/** Normalized form of {@link CreateDataTableOptions.visualizations}. */
interface VisualizationMode {
  enabled: boolean;
  eager: boolean;
}

/**
 * Collapse the widened `visualizations` option to two booleans, once, so the
 * four places that used to re-test `opts.visualizations !== false` cannot
 * drift apart as the option grows.
 */
function normalizeVisualizations(
  option: CreateDataTableOptions['visualizations'],
): VisualizationMode {
  if (option === false) return { enabled: false, eager: false };
  if (option === true || option === undefined) return { enabled: true, eager: false };
  return { enabled: true, eager: option.eager === true };
}

type BrushState = Record<string, unknown>;

interface SelectionStateSnapshot {
  selectedBin?: number | null;
  selectedSegments?: number[];
  selectedNull: boolean;
}

/**
 * Resolve a source argument into something `DataLoader.load()` accepts.
 * It natively handles File/string/ArrayBuffer; we convert Blob to ArrayBuffer.
 */
async function normalizeSource(
  source: File | string | ArrayBuffer | Blob,
): Promise<File | string | ArrayBuffer> {
  if (source instanceof Blob && !(source instanceof File)) {
    return source.arrayBuffer();
  }
  return source;
}

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

  // -------- Header mount hooks --------
  // The header row is windowed, so headers come and go as the user scrolls
  // sideways and "every column's header" is not a thing that exists at any one
  // moment. Everything this file decorates a header with — the visualization
  // canvas, a custom stats panel, the fallback stats line — hangs off these
  // two hooks instead of a sweep over `getColumnHeaders()`.
  //
  // The map and the two slots are declared here because `TableContainer`
  // renders inside its own constructor, so the hooks have to be passable
  // below; the work they dispatch to needs `vizController` and the stats
  // registry, which are built further down. Until then the slots are null and
  // the map is simply kept current — `attachVisualizations` sweeps the
  // mounted set once, so nothing mounted early is missed.
  const mountedHeaders = new Map<string, ColumnHeader>();
  let onHeaderMounted: ((header: ColumnHeader) => void) | null = null;
  let onHeaderUnmounted: ((header: ColumnHeader) => void) | null = null;

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
    onHeaderMount: (header) => {
      // Registered before the hook runs: resolving a header by name is the
      // first thing anything downstream does, `getVizContainer` included.
      mountedHeaders.set(header.getColumn().name, header);
      onHeaderMounted?.(header);
    },
    onHeaderUnmount: (header) => {
      // Deregistered after, for the mirrored reason — the hook still has to
      // be able to reach the header it is being told about.
      onHeaderUnmounted?.(header);
      mountedHeaders.delete(header.getColumn().name);
    },
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
  const vizMode = normalizeVisualizations(opts.visualizations);
  const interactionManager = vizMode.enabled ? new InteractionManager() : null;
  // One `data-dt-color-scheme` observer for the whole table instead of one
  // per visualization. The WIDE baseline measured 1,001 live MutationObservers
  // with charts on against 1 with them off; this is the 1,000.
  const themeWatcher = vizMode.enabled ? new ThemeWatcher(tableContainer.getElement()) : null;
  // Assigned a few statements below; the coordinators' scheduler hooks close
  // over this binding rather than the instance, because the controller's host
  // callbacks need the coordinators and the coordinators need the scheduler.
  // Nothing can fire in between — both are constructed synchronously here.
  let vizController: VizDataController | null = null;
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
    // With visualizations off there is nothing to schedule, and leaving the
    // hook absent keeps the standalone fan-out path exactly as it was.
    ...(vizMode.enabled
      ? {
          vizScheduler: {
            refreshOnFilters: (request) =>
              vizController?.refreshOnFilters(request) ?? Promise.resolve(),
          },
        }
      : {}),
  });
  // Tracks the most recent attachVisualizations pass's initial work
  // (each viz's first fetchData + both coordinators' syncExistingFilters).
  // loadDataImpl awaits this in parallel with whenBodyReady before resolving
  // the public load promise, mirroring TableContainer.currentBodyInit.
  // Wrapped in Promise.allSettled so individual failures (already routed
  // through options.onError → 'error' event) don't reject the public promise.
  let pendingVizInit: Promise<void> = Promise.resolve();
  /** Charts the most recent attach wave fetched — the `vizReady` payload. */
  let pendingVizCount = 0;
  const brushStates = new Map<string, BrushState>();
  const selectionStates = new Map<string, SelectionStateSnapshot>();
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

  /** Clear saved interaction state for a single column (on filter removal). */
  const clearVisualizationState = (column: string): void => {
    brushStates.delete(column);
    selectionStates.delete(column);
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

  if (vizMode.enabled) {
    actions.setOnFilterRemove(clearVisualizationState);
  }

  /**
   * The mounted `ColumnHeader` for a column, or `undefined` when the column
   * is hidden, gone, or simply scrolled out of the header window.
   *
   * A map lookup rather than the scan over `getColumnHeaders()` this used to
   * be: it runs once per visualization create and once per destroy, and with
   * lazy creation those happen per column as the user scrolls rather than
   * once per table.
   */
  const headerFor = (columnName: string): ColumnHeader | undefined =>
    mountedHeaders.get(columnName);

  /**
   * Capture brush/selection before an instance goes away, so it can be put
   * back on the replacement.
   *
   * Per-column rather than the global sweep this used to be: with lazy
   * creation, instances come and go one at a time as headers scroll, and
   * there is no longer a moment when "all of them" are about to be destroyed.
   */
  const saveInteractionState = (viz: VisualizationType): void => {
    const column = viz.getColumn();
    if (
      viz instanceof Histogram ||
      viz instanceof DateHistogram ||
      viz instanceof TimeHistogram ||
      viz instanceof IntervalHistogram
    ) {
      const brush = viz.getBrushState();
      if (brush) brushStates.set(column.name, brush);
      const sel = viz.getSelectionState();
      if (sel.selectedBin !== null || sel.selectedNull) {
        selectionStates.set(column.name, sel);
      }
    } else if (viz instanceof ValueCounts) {
      const sel = viz.getSelectionState();
      if (sel.selectedSegments.length > 0 || sel.selectedNull) {
        selectionStates.set(column.name, {
          selectedSegments: sel.selectedSegments,
          selectedNull: sel.selectedNull,
        });
      }
    }
  };

  /**
   * Put a saved brush/selection back on a freshly-created instance.
   *
   * Only when a filter for that column is still active. Committing a brush or
   * a selection is what creates the filter in the first place, so a saved
   * interaction with no filter behind it describes a selection the user has
   * since cleared — restoring it paints a chart that contradicts its own row
   * count ("60,000 rows" on line 1, "24,271 rows (40.5%)" underneath).
   *
   * `clearVisualizationState` now prunes the entry as the filter goes away, so
   * in the ordinary case there is nothing here to skip. This check stays
   * because it is the more robust rule: it holds however the entry came to be
   * stale, including the paths that write `state.filters` directly and never
   * reach `setOnFilterRemove` at all — session restore
   * (`persistence/serialization.ts`) and `resetTableState`.
   */
  const restoreInteractionState = (columnName: string, viz: VisualizationType): void => {
    const savedBrush = brushStates.get(columnName);
    const savedSel = selectionStates.get(columnName);
    if (!savedBrush && !savedSel) return;
    if (!state.filters.get().some((f) => f.column === columnName)) {
      brushStates.delete(columnName);
      selectionStates.delete(columnName);
      return;
    }
    void viz.waitForData().then(() => {
      if (viz.isDestroyed()) return;
      if (
        savedBrush &&
        (viz instanceof Histogram ||
          viz instanceof DateHistogram ||
          viz instanceof TimeHistogram ||
          viz instanceof IntervalHistogram)
      ) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        viz.setBrushState(savedBrush as any);
        interactionManager?.pushBrush(columnName, viz);
      }
      if (savedSel) {
        if (viz instanceof ValueCounts && savedSel.selectedSegments !== undefined) {
          viz.setSelectionState({
            selectedSegments: savedSel.selectedSegments,
            selectedNull: savedSel.selectedNull,
          });
          if (savedSel.selectedSegments.length > 0 || savedSel.selectedNull) {
            interactionManager?.pushSelection(columnName, viz);
          }
        } else if (
          (viz instanceof Histogram ||
            viz instanceof DateHistogram ||
            viz instanceof TimeHistogram ||
            viz instanceof IntervalHistogram) &&
          savedSel.selectedBin !== undefined
        ) {
          viz.setSelectionState({
            selectedBin: savedSel.selectedBin,
            selectedNull: savedSel.selectedNull,
          });
          if (savedSel.selectedBin !== null || savedSel.selectedNull) {
            interactionManager?.pushSelection(columnName, viz);
          }
        }
      }
    });
  };

  /**
   * Build one column's visualization, with **fresh** closures.
   *
   * Called by the controller whenever a column needs an instance — at attach
   * time for columns already on screen, and later as headers scroll in. It
   * cannot reuse a previous pass's closures: those captured a `statsEl`
   * belonging to a header node `TableContainer.render()` has since discarded,
   * and would go on writing `onDefaultStatsChange` into a detached element,
   * silently freezing the column's stats line after every hide/show/pin.
   */
  const createVizForColumn = (
    column: ColumnSchema,
    vizContainer: HTMLElement,
    seedSnapshot: unknown | null,
  ): BaseVisualization | null => {
    const tableName = state.tableName.get();
    if (!tableName) return null;
    const header = headerFor(column.name);
    if (!header) return null;
    const statsEl = header.getStatsElement();

    // Resolved on every call rather than captured: stats panels are recreated
    // on each attach pass (they are deliberately not diffed), while a
    // visualization can outlive one, so a captured reference would go stale.
    const currentPanel = (): BaseStatsPanel | null => activeStatsPanels.get(column.name) ?? null;

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
    // Only write the placeholder fallback when there's no panel taking the slot.
    if (!currentPanel()) renderStatsSlot();

    let viz: VisualizationType | undefined;
    const vizOptions = {
      tableName,
      bridge,
      filters: state.filters.get(),
      messages,
      initialSnapshot: seedSnapshot ?? undefined,
      // Above ~100k rows an exact `COUNT(DISTINCT col)` is a full scan per
      // column; HyperLogLog answers the same question in a fraction of the
      // time and the stats line only ever shows a rounded figure anyway.
      useApproxDistinct: shouldUseApproxDistinct(state.totalRows.get()),
      ...(themeWatcher ? { themeWatcher } : {}),
      onFilterChange: (filter: Filter | null) => {
        coordinator.handleFilterChange(column.name, filter);
      },
      onDefaultStatsChange: (stats: ColumnStatsData) => {
        const panel = currentPanel();
        if (panel) {
          try {
            panel.update(stats);
          } catch (err) {
            emitStatsPanelError(err, column.name, 'update');
          }
          return;
        }
        lastStats = stats;
        renderStatsSlot();
      },
      onStatsChange: (stats: string | null) => {
        const panel = currentPanel();
        if (panel) {
          try {
            panel.setHoverStats(stats);
          } catch (err) {
            emitStatsPanelError(err, column.name, 'hover');
          }
          return;
        }
        detailHtml = stats;
        renderStatsSlot();
      },
      onBrushCommit: (colName: string) => {
        if (!viz) return;
        interactionManager?.pushBrush(colName, viz);
        if (
          viz instanceof Histogram ||
          viz instanceof DateHistogram ||
          viz instanceof TimeHistogram ||
          viz instanceof IntervalHistogram
        ) {
          const bs = viz.getBrushState();
          if (bs) brushStates.set(colName, bs);
        }
      },
      onBrushClear: (colName: string) => {
        interactionManager?.removeColumn(colName);
        brushStates.delete(colName);
      },
      onSelectionChange: (colName: string, hasSelection: boolean) => {
        if (!viz) return;
        if (hasSelection) {
          interactionManager?.pushSelection(colName, viz);
          if (viz instanceof ValueCounts) {
            const sel = viz.getSelectionState();
            selectionStates.set(colName, {
              selectedSegments: sel.selectedSegments,
              selectedNull: sel.selectedNull,
            });
          } else if (
            viz instanceof Histogram ||
            viz instanceof DateHistogram ||
            viz instanceof TimeHistogram ||
            viz instanceof IntervalHistogram
          ) {
            selectionStates.set(colName, viz.getSelectionState());
          }
        } else {
          interactionManager?.removeColumn(colName);
          selectionStates.delete(colName);
        }
      },
      onError: (err: DataTableError) => {
        emitter.emit('error', { error: err, source: 'visualization' });
      },
    };

    const created = vizRegistry.create(vizContainer, column, vizOptions);
    if (!created) return null;
    viz = created as VisualizationType;
    return created;
  };

  if (vizMode.enabled) {
    vizController = new VizDataController({
      host: {
        createViz: createVizForColumn,
        getVizContainer: (columnName) => headerFor(columnName)?.getVizContainer() ?? null,
        getFilters: () => state.filters.get(),
        onVizCreated: (columnName, viz) => {
          coordinator.register(columnName, viz);
          restoreInteractionState(columnName, viz as VisualizationType);
        },
        onVizDestroyed: (columnName, viz) => {
          saveInteractionState(viz as VisualizationType);
          interactionManager?.removeColumn(columnName);
          coordinator.unregister(columnName);
        },
        onError: (err) => {
          const typed =
            err instanceof DataTableError
              ? err
              : new ConfigurationError(err instanceof Error ? err.message : String(err), {
                  code: 'INVARIANT',
                  cause: err,
                });
          emitter.emit('error', { error: typed, source: 'visualization' });
        },
      },
      // `.dt-header-scroll` is the only root that works: an
      // IntersectionObserver root must be an ancestor of its targets, and the
      // body scroller is the header subtree's sibling (M0 spike).
      getRoot: () => tableContainer.getHeaderScroll(),
    });
  }

  /**
   * Fill one mounted header's stats slot: a custom stats panel when the
   * registry claims the column, otherwise the table-wide fallback line.
   *
   * Per header mount — for the initial window at load, and for each column as
   * it scrolls into the window afterwards. A panel created here owns the
   * contents of `.dt-col-stats` until its header is unmounted; the library
   * never writes into the slot behind it. Failures during construction route
   * to the `error` event and the column falls back to the default formatter.
   */
  const attachHeaderStats = (header: ColumnHeader): void => {
    // There is no relation to describe before one is loaded. Headers mounted
    // before the first attach pass are picked up by that pass's sweep over the
    // mounted set.
    const tableName = state.tableName.get();
    if (!tableName) return;
    const column = header.getColumn();
    const statsEl = header.getStatsElement();

    // Custom stats panels are part of the `visualizations` opt-in. The
    // fallback line below is deliberately *not* — see the note on it.
    let panel: BaseStatsPanel | null = null;
    if (vizMode.enabled && statsPanelCoordinator && statsPanelRegistry.isApplicable(column)) {
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
      try {
        // Clear the slot before construction so the panel starts on a blank
        // canvas — any prior fallback HTML or previous-panel residue is gone.
        statsEl.innerHTML = '';
        panel = statsPanelRegistry.create(statsEl, column, panelOptions);
      } catch (err) {
        emitStatsPanelError(err, column.name, 'construct');
        panel = null;
      }
      if (panel) {
        activeStatsPanels.set(column.name, panel);
        statsPanelCoordinator.register(column.name, panel);
        // Initial render with no stats. A subsequent viz fetch (if any) will
        // emit `onDefaultStatsChange` which routes to `panel.update(stats)`.
        try {
          panel.update(null);
        } catch (err) {
          emitStatsPanelError(err, column.name, 'update');
        }
      }
    }

    // A mounted panel owns the slot — `refreshNonVizStats` skips panel-owned
    // columns and the panel's own `updateFilters` (via the coordinator)
    // handles filter-aware refreshes. Otherwise write the row-count fallback,
    // unless a live chart is already writing there — the controller overwrites
    // the slot the moment an instance exists, and re-seeding it under a drawn
    // chart would blank the stats line it just published. One condition covers
    // the chart column and the plain one: a column with no applicable
    // visualization is never tracked, so `hasLiveViz` is false for it.
    //
    // Written whatever the `visualizations` opt says, and that is a windowing
    // fix rather than a tidy-up. `ColumnHeader` seeds its own slot from
    // `totalRows` alone (`ColumnHeader.updateStatsLine`), so a header that
    // mounts while a filter is active is born reading the **unfiltered**
    // count; with charts off nothing corrected it until the next filter write,
    // because `refreshNonVizStats` only runs on one. Before the header row was
    // windowed every header existed by the time that ran, so the gap could not
    // open.
    if (panel) return;
    if (!vizController?.hasLiveViz(column.name)) statsEl.innerHTML = tableWideLine1Html();
  };

  onHeaderMounted = (header): void => {
    attachHeaderStats(header);
    // `sync()` observes the containers of the headers mounted at the instant
    // it runs, and the header row is windowed — so every later mount has to
    // announce itself or its chart is never built.
    vizController?.observeColumn(header.getColumn().name);
  };

  onHeaderUnmounted = (header): void => {
    const name = header.getColumn().name;
    // The chart first, while its canvas is still in the document: the
    // controller snapshots the data on the way out so the column redraws
    // without a query when it scrolls back.
    vizController?.unobserveColumn(name);
    const panel = activeStatsPanels.get(name);
    if (!panel) return;
    // A panel's DOM lives inside the header. Destroying it here rather than
    // letting the header take it along is what gives a custom panel its
    // `destroy()` call at all, and what keeps `activeStatsPanels` the size of
    // the window instead of growing with every column scrolled past.
    // Before deregistration, so a destroy hook that queries the coordinator
    // still finds itself registered.
    try {
      panel.destroy();
    } catch (err) {
      emitStatsPanelError(err, name, 'destroy');
    }
    activeStatsPanels.delete(name);
    statsPanelCoordinator?.unregister(name);
  };

  /** Bumped per attach pass so a late wave from a superseded pass is ignorable. */
  let attachGeneration = 0;
  /** The `tableName` the last attach pass ran against. */
  let lastAttachTableName: string | null = null;

  // Auto-attach/detach visualizations as the schema changes. This replaces
  // the ~200 lines of manual wiring that every consumer used to have to write.
  //
  // What this pass still owns: the stats-panel *coordinator* (deliberately
  // wipe-and-recreate — the default registry ships none, so it costs nothing
  // at scale) and the column diff handed to `vizController`. What it no
  // longer owns is anything per header. Instances belong to the controller,
  // which creates them when their header is visible and keeps their data
  // across a rebuild; slots and panels belong to `attachHeaderStats`, which
  // the mount hook drives. This pass sweeps the mounted set once, for the
  // headers that were built before there was a coordinator to register with.
  const attachVisualizations = (): void => {
    const tableName = state.tableName.get();
    if (!tableName) return;

    // Tear down previous stats panels (run before the coordinator resets so a
    // panel's destroy hook still sees a valid registration if it queries us).
    for (const [colName, panel] of activeStatsPanels) {
      try {
        panel.destroy();
      } catch (err) {
        emitStatsPanelError(err, colName, 'destroy');
      }
    }
    activeStatsPanels.clear();

    // Recreate stats panel coordinator. Panels for non-viz columns still need
    // filter-aware updates, so we keep this coordinator independent of the viz one.
    if (statsPanelCoordinator) statsPanelCoordinator.destroy();
    statsPanelCoordinator = new StatsPanelCoordinator(
      state,
      undefined,
      vizController ? { vizScheduler: vizController.panelScheduler } : {},
    );

    // Re-fill the stats slot of every header mounted right now. Their panels
    // were destroyed above, and the initial window's headers were mounted
    // during the container's own `render()`, before there was a coordinator to
    // register a panel with. Runs before `sync()` — as the loop it replaces
    // did — so `hasLiveViz` still describes the charts of the previous pass,
    // and before the gate below because the fallback line it writes is not
    // gated by the `visualizations` opt.
    for (const header of mountedHeaders.values()) attachHeaderStats(header);

    // Visualization instances and custom stats panels are gated by the
    // `visualizations` opt; the coordinator above is now wired regardless so
    // the public `filterChange` event always carries a fresh row count.
    if (!vizMode.enabled) {
      // No vizs created and no syncExistingFilters call below — reset
      // pendingVizInit so loadDataImpl doesn't await a stale promise from a
      // previous (vizEnabled) attach pass.
      pendingVizInit = Promise.resolve();
      pendingVizCount = 0;
      return;
    }

    // The column list comes from the schema, never from the DOM.
    // `getColumnHeaders()` names only the mounted window now, and handing
    // `sync()` that would destroy every chart outside it, discard the queued
    // fetches and re-arm `whenWaveSettled` on each pass. The controller's
    // contract is the full viz-applicable set in display order, however few of
    // them happen to have a header.
    const schemaByName = new Map(state.schema.get().map((c) => [c.name, c]));
    const vizColumns: ColumnSchema[] = [];
    for (const colName of state.visibleColumns.get()) {
      const column = schemaByName.get(colName);
      if (column && vizRegistry.isApplicable(column)) vizColumns.push(column);
    }

    // A derived-column VIEW switch changes `tableName` without necessarily
    // rebuilding the headers, and every cached chart was computed against the
    // previous relation. Drop the snapshots *before* the diff so a surviving
    // or re-created instance fetches rather than seeding from stale data.
    if (lastAttachTableName !== null && lastAttachTableName !== tableName) {
      vizController?.invalidateAll();
    }
    lastAttachTableName = tableName;

    vizController?.sync(vizColumns, ++attachGeneration, { eager: vizMode.eager });

    // Rebroadcast any filters already in state (e.g., restored from session).
    // Both coordinators now return a Promise; we feed those into pendingVizInit
    // so loadDataImpl can await them in parallel with the table body's first
    // SELECT. Errors per task are swallowed by allSettled below — viz fetch
    // errors already route via options.onError → 'error' event with
    // source: 'visualization'; panel errors via source: 'stats-panel'; the
    // count query in updateFilteredRowCount is best-effort.
    const initPromises: Promise<unknown>[] = [
      (vizController?.whenWaveSettled() ?? Promise.resolve(0)).then((count) => {
        pendingVizCount = count;
      }),
      coordinator.syncExistingFilters(),
      // Same for stats panels — give them the current filter array up-front so
      // panels with their own DuckDB queries don't have to wait for the next
      // user-driven filter change.
      statsPanelCoordinator.syncExistingFilters(state.filters.get()),
    ];

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
  // and each triggers a `TableContainer.render()` that rebuilds column
  // headers — so attaching synchronously inside the schema subscriber would
  // bind visualizations to headers that are immediately destroyed by the
  // following visibleColumns render.
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

  // Keep the row-count stats line live for every column whose slot nothing
  // else owns. A column with a **live** visualization refreshes its own stats
  // via `onDefaultStatsChange`; a column with a custom stats panel — viz-backed
  // or not — is skipped because the panel owns the slot and receives filter
  // updates from `StatsPanelCoordinator` directly.
  //
  // The predicate used to be `vizRegistry.isApplicable(column)`, on the
  // then-true assumption that every applicable column had an instance feeding
  // it. Once creation is lazy that is false, and an offscreen chart column's
  // line 1 would be written once at attach and never again — leaving a
  // permanently stale `"20,000 rows"` under an active filter.
  const refreshNonVizStats = (): void => {
    if (destroyed) return;
    if (!state.tableName.get()) return;
    for (const header of mountedHeaders.values()) {
      const column = header.getColumn();
      if (vizController?.hasLiveViz(column.name)) continue;
      // Panel-owned slot? Skip — except when the panel destroyed itself
      // early. A self-destroyed panel leaves the slot frozen with whatever
      // it last wrote; that's worse than reverting to the default fallback,
      // so we prune the dangling entry here and fall through to the write.
      const panel = activeStatsPanels.get(column.name);
      if (panel) {
        if (!panel.isDestroyed()) continue;
        activeStatsPanels.delete(column.name);
        // Unregister too, not just forget. `onHeaderUnmounted` returns early
        // when the map has no entry, so it never reaches its own unregister
        // for a panel pruned here — and the coordinator would go on
        // broadcasting `updateFilters` into a destroyed panel until the next
        // attach pass replaced the coordinator wholesale.
        statsPanelCoordinator?.unregister(column.name);
      }
      header.getStatsElement().innerHTML = tableWideLine1Html();
    }
  };
  // `filters` and `filteredRows` both drive this, and both fire inside a
  // single filter cycle — synchronously together on a filter *removal*
  // (`updateFilteredRowCount` short-circuits to `totalRows` with no query),
  // one turn apart on an add. Coalescing with the same `queueMicrotask` latch
  // `scheduleAttach` uses collapses the same-turn case and any burst of
  // filter writes into one pass over the headers, which at 1,000 columns is
  // 1,000 `innerHTML` assignments saved per cycle. The microtask still runs
  // before paint, so nothing is ever displayed stale.
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

  // -------- vizReady --------
  // Charts are lazy, so "the visible ones have data" is no longer something
  // the load promise can express. It gets its own promise and event.
  //
  // The generation counter exists because `clearLoadMarks()` runs at the top
  // of every load: a wave belonging to load N that settles after load N+1
  // has already marked `start` would write `dt:load:vizReady` against the
  // wrong origin, producing a `dt:load:viz` measure that spans two loads.
  let loadGeneration = 0;
  let vizReadyPromise: Promise<void> = Promise.resolve();
  let resolveVizReady: (() => void) | null = null;

  /** Arm a fresh `whenVizReady()` promise for the load about to start. */
  const beginVizReady = (): number => {
    // A previous load's awaiters must not be stranded by the new promise
    // replacing theirs.
    resolveVizReady?.();
    vizReadyPromise = new Promise<void>((resolve) => {
      resolveVizReady = resolve;
    });
    return ++loadGeneration;
  };

  /** Settle it — from the wave, or from the failure path. */
  const settleVizReady = (generation: number, emit: boolean): void => {
    if (generation !== loadGeneration) return;
    const resolve = resolveVizReady;
    resolveVizReady = null;
    if (!resolve) return;
    if (emit && !destroyed) {
      markLoad('vizReady');
      emitter.emit('vizReady', {
        tableName: state.tableName.get() ?? '',
        vizCount: pendingVizCount,
      });
    }
    resolve();
  };

  // -------- Public loadData --------
  async function loadDataImpl(
    source: File | string | ArrayBuffer | Blob,
    loadOpts?: LoadDataOptions & { sourceFormat?: DataFormat | undefined },
  ): Promise<void> {
    const sourceLabel =
      typeof source === 'string' ? source : source instanceof File ? source.name : 'in-memory';
    // Stale entries first: a reload's `dt:load:total` must span *this*
    // load, not the previous one's `dt:load:start`.
    clearLoadMarks();
    markLoad('start');
    const generation = beginVizReady();
    emitter.emit('loadStart', { source: sourceLabel });
    // Disable auto-save while loading so we don't capture the transient
    // half-initialized state.
    autoSave?.disable();
    try {
      const normalized = await normalizeSource(source);
      if (destroyed) {
        throw new DestroyedError('DataTable is destroyed; load aborted.');
      }
      // Capture the previous base table NOW, before `actions.loadData`
      // resets state. We drop it AFTER the new load resolves successfully —
      // a failed load leaves the previous data queryable as a fallback.
      // `state.baseTableName` takes precedence so a derived-VIEW tableName
      // doesn't shadow the underlying physical table name.
      const previousBaseTableName = state.baseTableName.get() ?? state.tableName.get();
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
      // `loadProgress` has been declared, typed, documented and bound by a
      // shipped example since before Phase 1 — and emitted by nothing. This
      // is the reconnection. The clamp exists because the sequence is
      // assembled from two threads: the main thread reports `reading` while
      // the worker's earlier reports may still be in the message queue, and
      // a bar that goes backwards reads as a bug in the app rather than in
      // the reporting.
      let lastPercent = -1;
      const reportProgress = (info: ProgressInfo): void => {
        if (destroyed || info.percent < lastPercent) return;
        lastPercent = info.percent;
        emitter.emit('loadProgress', info);
      };
      await actions.loadData(normalized, mergedOpts, reportProgress);
      // Not a pure worker boundary: `StateActions.loadData` calls
      // `bridge.loadData` once, then also runs IndexedDB session restore
      // and the derived-column VIEW rebuild before returning. With
      // `persistence: false` that tail is a no-op; for a real app
      // `dt:load:worker` includes it. Splitting it finer is Phase 1's job.
      markLoad('workerDone');
      if (destroyed) {
        // Tearing down — skip the loadComplete emit on a dead emitter and
        // surface a destroy error so consumers know the load was aborted.
        throw new DestroyedError('DataTable is destroyed; load aborted.');
      }
      // The load promise resolves at **first interactive paint**: the body's
      // first SELECT has painted, and `filteredRows` is correct for any
      // filters restored from the session (one COUNT). It no longer waits
      // for per-column charts — that is `whenVizReady()` / the `vizReady`
      // event, and the migration note in the changeset.
      //
      // `syncExistingFilters` is deliberately routed around the visibility
      // scheduler (see `StatsPanelCoordinator.syncExistingFilters`): gating
      // the load on it is only sound while it is a single count query that
      // cannot depend on the observer wave.
      //
      // State setters inside `actions.loadData` fan out synchronously, so by
      // this point every triggered `TableContainer.render()` and
      // `attachVisualizations()` has run; `currentBodyInit` references the
      // last (surviving) body and `pendingVizInit` references the latest
      // attach pass's collected work.
      //
      // Both branches swallow internally (whenBodyReady catches body-init
      // errors; pendingVizInit wraps in allSettled and errors route through
      // the `error` event), so `Promise.all` here can never short-circuit.
      const painted = tableContainer.whenBodyReady().then(() => markLoad('firstPaint'));
      const counted = coordinator.syncExistingFilters();
      // Hung off the wave, not awaited — except in the two configurations
      // where the wave is already over by construction. Keeping
      // `dt:load:vizReady` inside the gate for those preserves the
      // `complete >= vizReady` ordering the mark suite pins, and it is the
      // honest semantics: with no charts to wait for, they are ready.
      const vizzed = pendingVizInit.then(() => settleVizReady(generation, true));
      const gate: Promise<unknown>[] = [painted, counted];
      if (!vizMode.enabled || vizMode.eager) gate.push(vizzed);
      await Promise.all(gate);
      if (destroyed) {
        throw new DestroyedError('DataTable is destroyed; load aborted.');
      }
      markLoad('complete');
      emitter.emit('loadComplete', {
        tableName: state.tableName.get() ?? '',
        rowCount: state.totalRows.get(),
        // Defensive shallow clone — same contract as filterChange/sortChange/
        // selectionChange/columnChange (Phase 8). Handlers that destructure
        // and mutate `schema` cannot corrupt the live state signal value.
        schema: [...state.schema.get()],
      });
      // Reclaim the previous base table now that the new one is live.
      // Skip when names match — `CREATE OR REPLACE TABLE` already
      // replaced it atomically in the loader, and a redundant DROP would
      // race with the live table. Best-effort: a DROP failure must not
      // turn a successful load into a thrown error — we only leak one
      // orphan in that worst case.
      const newBaseTableName = state.baseTableName.get() ?? state.tableName.get();
      if (
        previousBaseTableName &&
        previousBaseTableName !== newBaseTableName &&
        typeof bridge.dropTable === 'function'
      ) {
        try {
          await bridge.dropTable(previousBaseTableName);
        } catch (err) {
          console.warn(
            `[data-table] Failed to drop previous table "${previousBaseTableName}":`,
            err,
          );
        }
      }
    } catch (error) {
      const typed =
        error instanceof DataTableError
          ? error
          : new LoadError(error instanceof Error ? error.message : String(error), {
              code: 'PARSE_FAILED',
              cause: error,
            });
      // A failed load has no visible wave to wait for. Settle `whenVizReady`
      // without emitting `vizReady` — silently, so an awaiter does not hang,
      // and quietly, because nothing became ready.
      settleVizReady(generation, false);
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

    // Never strand a `whenVizReady()` awaiter on a table being torn down.
    resolveVizReady?.();
    resolveVizReady = null;

    // The controller owns every live instance and its observer. Instances
    // unregister from the theme watcher as they go, so it is disconnected
    // by the time we tear it down — the call is the belt to that braces.
    vizController?.destroy();
    vizController = null;
    themeWatcher?.destroy();
    interactionManager?.destroy();
    coordinator.destroy();

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
    // drop it here. Best-effort: a failure must not turn `destroy()` into
    // a thrown error.
    if (!ownsBridge && typeof bridge.dropTable === 'function') {
      const baseToDrop = state.baseTableName.get() ?? state.tableName.get();
      if (baseToDrop) {
        try {
          await bridge.dropTable(baseToDrop);
        } catch (err) {
          console.warn(`[data-table] Failed to drop base table "${baseToDrop}" on destroy:`, err);
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
    whenVizReady() {
      throwIfDestroyed('whenVizReady');
      return vizReadyPromise;
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
