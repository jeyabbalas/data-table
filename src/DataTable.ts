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
 * @example
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
import { nextInstanceId } from './core/instanceId';
import type { TableState } from './core/State';
import { createTableState, resetTableState } from './core/State';
import { type Strings, type DeepPartial, defaultStrings, mergeStrings } from './core/Strings';
import { isStylesheetLoaded } from './core/stylesheet';
import type { TableEvents } from './core/TableEvents';
import type { Filter, SortColumn } from './core/types';
import { UndoManager } from './core/UndoManager';
import type { DataFormat } from './data/DataLoader';
import { WorkerBridge, type WorkerBridgeOptions } from './data/WorkerBridge';
import type { ExpressionEditorFactory } from './derived/ExpressionEditorTypes';
import { ExportDialog } from './export/ExportDialog';
import { FilterPresetManager } from './filters/FilterPresets';
import { AutoSave } from './persistence/AutoSave';
import { SessionStore } from './persistence/SessionStore';
import type { ColumnStatsData } from './statistics/ColumnStatsTypes';
import { escapeHtml, formatDefaultStats } from './statistics/StatsFormatters';
import { AnnotationPopover } from './table/AnnotationPopover';
import { ColumnHeaderTooltipPopover } from './table/ColumnHeaderTooltipPopover';
import { TableContainer } from './table/TableContainer';
import type { BaseStatsPanel, StatsPanelOptions } from './visualizations/BaseStatsPanel';
import type { BaseVisualization } from './visualizations/BaseVisualization';
import { CrossfilterCoordinator } from './visualizations/CrossfilterCoordinator';
import { DateHistogram } from './visualizations/histogram/DateHistogram';
import { Histogram } from './visualizations/histogram/Histogram';
import { IntervalHistogram } from './visualizations/histogram/IntervalHistogram';
import { TimeHistogram } from './visualizations/histogram/TimeHistogram';
import { InteractionManager } from './visualizations/InteractionManager';
import { StatsPanelCoordinator } from './visualizations/StatsPanelCoordinator';
import type { StatsPanelRegistry } from './visualizations/StatsPanelRegistry';
import { defaultStatsPanelRegistry } from './visualizations/StatsPanelRegistry';
import { ValueCounts } from './visualizations/valuecounts/ValueCounts';
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
  /** Element that will host the table. The library takes full ownership of its contents. */
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

  /** Enable auto-attached column header visualizations (histograms, value counts). Default: `true`. */
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
   * Unique identifier mixed into element IDs so multiple tables on the
   * same page don't collide on `aria-labelledby` targets. Auto-generated
   * if omitted. Primarily useful for deterministic test IDs.
   */
  instanceId?: string;
  /** Custom expression editor factory (replaces the CodeMirror-based default). */
  editorFactory?: ExpressionEditorFactory;
  /** Row height in pixels. Default: 32. */
  rowHeight?: number;
  /** Header height in pixels. Default: 120. */
  headerHeight?: number;

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
   * Unique per-instance identifier, e.g. `'t1-a3f9'`. Mixed into modal
   * element IDs to keep two tables on the same page from colliding on
   * `aria-labelledby` targets.
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
  | Histogram
  | DateHistogram
  | TimeHistogram
  | IntervalHistogram
  | ValueCounts;

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

  // -------- Instance id (multi-instance DOM ID isolation) --------
  const instanceId = opts.instanceId ?? nextInstanceId();

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
    classPrefix: opts.classPrefix ?? 'dt',
    instanceId,
    showExpressionFilter: opts.expressionFilter !== false,
    editorFactory: opts.editorFactory,
    presetManager: presetManager ?? undefined,
    portalTarget: opts.portalTarget,
    colorScheme,
    messages,
    annotations: annotationStore,
    annotationPopover,
    columnHeaderTooltipPopover,
  });

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
  let activeVisualizations: BaseVisualization[] = [];
  // Tracks the most recent attachVisualizations pass's initial work
  // (each viz's first fetchData + both coordinators' syncExistingFilters).
  // loadDataImpl awaits this in parallel with whenBodyReady before resolving
  // the public load promise, mirroring TableContainer.currentBodyInit.
  // Wrapped in Promise.allSettled so individual failures (already routed
  // through options.onError → 'error' event) don't reject the public promise.
  let pendingVizInit: Promise<void> = Promise.resolve();
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

  if (opts.visualizations !== false) {
    actions.setOnFilterRemove(clearVisualizationState);
  }

  // Auto-attach/detach visualizations as the schema changes. This replaces
  // the ~200 lines of manual wiring that every consumer used to have to write.
  //
  // The crossfilter coordinator above is a singleton-per-DataTable so the
  // public `filterChange` event always emits with a fresh row count, even
  // before the first data load. Each attach pass only registers/unregisters
  // viz instances on it. Per-column viz creation is gated by
  // `opts.visualizations`.
  const attachVisualizations = (): void => {
    const vizEnabled = opts.visualizations !== false;
    const tableName = state.tableName.get();
    if (!tableName) return;

    // Save brush/selection state so it survives a schema-change reattach.
    // (No-op when viz is disabled — `activeVisualizations` is always empty.)
    for (const viz of activeVisualizations) {
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
    }

    // Tear down previous visualizations and their registrations.
    for (const viz of activeVisualizations) {
      coordinator.unregister(viz.getColumn().name);
    }
    for (const viz of activeVisualizations) viz.destroy();
    activeVisualizations = [];
    interactionManager?.clear();

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
    statsPanelCoordinator = new StatsPanelCoordinator(state);

    // Per-column work (viz instances + custom stats panels) is gated by the
    // `visualizations` opt; the coordinator above is now wired regardless so
    // the public `filterChange` event always carries a fresh row count.
    if (!vizEnabled) {
      // No vizs created and no syncExistingFilters call below — reset
      // pendingVizInit so loadDataImpl doesn't await a stale promise from a
      // previous (vizEnabled) attach pass.
      pendingVizInit = Promise.resolve();
      return;
    }

    // Collect the first-fetch promises from every viz constructor + each
    // coordinator's filter-sync work. Surfaced via pendingVizInit so the
    // public load promise can wait on first-paint readiness.
    const initPromises: Promise<unknown>[] = [];

    // Create a visualization per applicable column.
    const headers = tableContainer.getColumnHeaders();
    for (const header of headers) {
      const column = header.getColumn();
      const statsEl = header.getStatsElement();

      // Try to instantiate a custom stats panel for this column. When a panel
      // is created, it owns the contents of `.dt-col-stats` for the lifetime
      // of this attach pass; the library never writes to the slot directly.
      // Failures during construction route to the `error` event and the
      // column gracefully falls back to the default HTML formatter.
      let panel: BaseStatsPanel | null = null;
      if (statsPanelRegistry.isApplicable(column)) {
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

      if (!vizRegistry.isApplicable(column)) {
        // No visualization for this column. If a custom panel is mounted, it
        // owns the stats slot — `refreshNonVizStats` skips panel-owned columns
        // and the panel's own `updateFilters` (via the coordinator) handles
        // filter-aware refreshes. Otherwise, write the simple row-count fallback.
        if (!panel) {
          const total = state.totalRows.get();
          // escapeHtml the i18n function output: consumers may override
          // `messages.statistics.rowCount` with anything, and we splice into innerHTML.
          statsEl.innerHTML = `<span class="${opts.classPrefix ?? 'dt'}-stats-line1">${escapeHtml(messages.statistics.rowCount(total))}</span>`;
        }
        continue;
      }

      const vizContainer = header.getVizContainer();
      let currentDefault: string | null = null;
      let showingHover = false;

      const fallbackStats = (): string => {
        const fr = state.filteredRows.get();
        const tr = state.totalRows.get();
        const af = state.filters.get();
        // escapeHtml: messages.* are consumer-overridable functions whose
        // return value lands in innerHTML.
        return af.length > 0
          ? `<span class="${opts.classPrefix ?? 'dt'}-stats-line1">${escapeHtml(messages.statistics.filteredRowCount(fr, tr))}</span>`
          : `<span class="${opts.classPrefix ?? 'dt'}-stats-line1">${escapeHtml(messages.statistics.rowCount(tr))}</span>`;
      };
      // Only write the placeholder fallback when there's no panel taking the slot.
      if (!panel) statsEl.innerHTML = fallbackStats();

      let viz: VisualizationType | undefined;
      const vizOptions = {
        tableName,
        bridge,
        filters: state.filters.get(),
        onFilterChange: (filter: Filter | null) => {
          coordinator.handleFilterChange(column.name, filter);
        },
        onDefaultStatsChange: (stats: ColumnStatsData) => {
          if (panel) {
            try {
              panel.update(stats);
            } catch (err) {
              emitStatsPanelError(err, column.name, 'update');
            }
            return;
          }
          const html = formatDefaultStats(stats, column.type, messages);
          currentDefault = html;
          if (!showingHover) statsEl.innerHTML = html;
        },
        onStatsChange: (stats: string | null) => {
          if (panel) {
            try {
              panel.setHoverStats(stats);
            } catch (err) {
              emitStatsPanelError(err, column.name, 'hover');
            }
            return;
          }
          if (stats) {
            showingHover = true;
            statsEl.innerHTML = stats;
          } else {
            showingHover = false;
            statsEl.innerHTML = currentDefault ?? fallbackStats();
          }
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
      if (!created) continue;
      viz = created as VisualizationType;
      activeVisualizations.push(viz);
      coordinator.register(column.name, viz);
      // Track the viz's eager first fetch (kicked off in its constructor)
      // so loadDataImpl can await it before resolving the public promise.
      initPromises.push(viz.waitForData());

      // Restore saved interaction state on the next data frame.
      const savedBrush = brushStates.get(column.name);
      const savedSel = selectionStates.get(column.name);
      if (savedBrush || savedSel) {
        void viz.waitForData().then(() => {
          if (!viz) return;
          if (
            savedBrush &&
            (viz instanceof Histogram ||
              viz instanceof DateHistogram ||
              viz instanceof TimeHistogram ||
              viz instanceof IntervalHistogram)
          ) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            viz.setBrushState(savedBrush as any);
            interactionManager?.pushBrush(column.name, viz);
          }
          if (savedSel) {
            if (viz instanceof ValueCounts && savedSel.selectedSegments !== undefined) {
              viz.setSelectionState({
                selectedSegments: savedSel.selectedSegments,
                selectedNull: savedSel.selectedNull,
              });
              if (savedSel.selectedSegments.length > 0 || savedSel.selectedNull) {
                interactionManager?.pushSelection(column.name, viz);
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
                interactionManager?.pushSelection(column.name, viz);
              }
            }
          }
        });
      }
    }

    // Rebroadcast any filters already in state (e.g., restored from session).
    // Both coordinators now return a Promise; we feed those into pendingVizInit
    // so loadDataImpl can await them in parallel with the table body's first
    // SELECT. Errors per task are swallowed by allSettled below — viz fetch
    // errors already route via options.onError → 'error' event with
    // source: 'visualization'; panel errors via source: 'stats-panel'; the
    // count query in updateFilteredRowCount is best-effort.
    initPromises.push(coordinator.syncExistingFilters());
    // Same for stats panels — give them the current filter array up-front so
    // panels with their own DuckDB queries don't have to wait for the next
    // user-driven filter change.
    initPromises.push(statsPanelCoordinator.syncExistingFilters(state.filters.get()));

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

  // Keep the row-count stats line live for columns without a visualization
  // (e.g. uuid). Columns *with* a visualization refresh their own stats via
  // the `onDefaultStatsChange` callback inside `attachVisualizations`. A
  // column with a custom stats panel — viz-backed or not — is skipped because
  // the panel owns the slot and receives filter updates from
  // `StatsPanelCoordinator` directly.
  const refreshNonVizStats = (): void => {
    if (destroyed) return;
    if (!state.tableName.get()) return;
    const headers = tableContainer.getColumnHeaders();
    const totalRows = state.totalRows.get();
    const filteredRows = state.filteredRows.get();
    const activeFilters = state.filters.get();
    const prefix = opts.classPrefix ?? 'dt';
    for (const header of headers) {
      const column = header.getColumn();
      if (vizRegistry.isApplicable(column)) continue;
      // Panel-owned slot? Skip — except when the panel destroyed itself
      // early. A self-destroyed panel leaves the slot frozen with whatever
      // it last wrote; that's worse than reverting to the default fallback,
      // so we prune the dangling entry here and fall through to the write.
      const panel = activeStatsPanels.get(column.name);
      if (panel) {
        if (!panel.isDestroyed()) continue;
        activeStatsPanels.delete(column.name);
      }
      const statsEl = header.getStatsElement();
      statsEl.innerHTML =
        activeFilters.length > 0
          ? `<span class="${prefix}-stats-line1">${filteredRows.toLocaleString()} / ${totalRows.toLocaleString()} rows</span>`
          : `<span class="${prefix}-stats-line1">${totalRows.toLocaleString()} rows</span>`;
    }
  };
  unsubscribes.push(state.filters.subscribe(refreshNonVizStats));
  unsubscribes.push(state.filteredRows.subscribe(refreshNonVizStats));

  // -------- Public loadData --------
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
      await actions.loadData(normalized, mergedOpts);
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
      await Promise.all([tableContainer.whenBodyReady(), pendingVizInit]);
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

    for (const viz of activeVisualizations) viz.destroy();
    activeVisualizations = [];
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
