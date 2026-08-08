/**
 * VizDataController — per-column visualization state machine, decoupled from
 * header DOM lifecycle.
 *
 * Before this existed, every column eagerly constructed a visualization whose
 * constructor fired ~2 full-table scans, the public load promise withheld
 * resolution until all of them settled, every filter change refetched all of
 * them, and any schema / `visibleColumns` / `tableName` write destroyed and
 * recreated all of them. At 1,000 columns that is ~2,000 queries at load and
 * ~600 per column move.
 *
 * The fix is to stop treating "a visualization exists" and "a visualization
 * has data" as the same fact:
 *
 * - **Creation is visibility-gated.** One `IntersectionObserver` rooted at the
 *   header's horizontal scroll container decides which columns get an
 *   instance. Headers still exist for every column (that is Phase 4's job),
 *   but canvases do not.
 * - **Data outlives the DOM.** `TableContainer.render()` wipes the whole
 *   header row, so an instance cannot survive a hide / show / pin / reorder.
 *   Its *data* can: the controller snapshots on destroy and seeds the
 *   replacement, so a column move issues zero queries.
 * - **Offscreen columns go stale, not refetched.** A filter change refreshes
 *   only the columns with a live instance; everything else is marked and
 *   fetched if and when it scrolls into view.
 *
 * Not exported from `src/index.ts` or `src/advanced.ts` — this is internal
 * machinery, and keeping it internal is what keeps the public API-surface
 * snapshot unchanged by the phase that introduced it.
 *
 * @internal
 */

import type { ColumnSchema, Filter } from '../core/types';
import type { BaseVisualization } from './BaseVisualization';
import type { FilterFanOutRequest, FilterFanOutScheduler } from './CrossfilterCoordinator';

/**
 * Default ceiling on visualization fetches in flight at once. DuckDB-WASM is
 * single-threaded, so a wider fan-out only queues work behind itself while
 * starving the viewport row fetches the user is actually waiting on.
 */
export const DEFAULT_VIZ_FETCH_CONCURRENCY = 4;

/**
 * Horizontal overscan for the **create** decision: a column this far outside
 * the header viewport already gets an instance, so a slow scroll finds its
 * chart drawn rather than drawing.
 */
export const VIZ_CREATE_MARGIN_PX = 200;

/**
 * Horizontal overscan for the **keep** decision. Destroying at the same
 * threshold as creating would thrash on every pixel of scroll jitter, and
 * (worse) a manual sweep across 1,000 columns would still have created 1,000
 * canvases by the end. Destroying at 2× the create margin gives a hysteresis
 * band wide enough that a direction reversal costs nothing, while a genuine
 * jump away reclaims the canvas.
 */
export const VIZ_KEEP_MARGIN_PX = VIZ_CREATE_MARGIN_PX * 2;

/** Lifecycle of one column's visualization *data* (not of its instance). */
export type VizEntryStatus =
  /** Never fetched. */
  | 'empty'
  /** A fetch is in flight. */
  | 'fetching'
  /** Data matches the current filter epoch. */
  | 'fresh'
  /** Data exists but predates the current filter epoch. */
  | 'stale';

/** One column's slot in the controller's map. Keyed by column **name**. */
export interface VizColumnEntry {
  column: ColumnSchema;
  status: VizEntryStatus;
  /** Filter epoch stamped at the last successful fetch. */
  filterEpoch: number;
  /** Live instance, or `null` while the column is scrolled far away. */
  viz: BaseVisualization | null;
  /** Last-known data, captured on destroy so it survives DOM churn. */
  snapshot: unknown | null;
  /** Whether the column is inside the create band as of the last IO signal. */
  visible: boolean;
  /**
   * The `.dt-col-viz` element {@link VizColumnEntry.viz} was created into.
   * Compared against the live lookup on every sync to detect a header
   * rebuild — see {@link VizDataController.sync}.
   */
  container: HTMLElement | null;
}

/**
 * The facade's side of the split. The controller decides *when* a column gets
 * an instance; the host knows *how* to build one — the stats-slot closures,
 * the coordinator registration and the brush/selection restore all live in
 * `createDataTable`.
 */
export interface VizControllerHost {
  /**
   * Build a fresh instance into `container`. Must construct fresh closures
   * every call: the previous instance's captured `statsEl` belongs to a
   * header node that has already been discarded.
   *
   * @param seedSnapshot - pass through to `VisualizationOptions.initialSnapshot`.
   * @returns `null` when the registry declines the column.
   */
  createViz(
    column: ColumnSchema,
    container: HTMLElement,
    seedSnapshot: unknown | null,
  ): BaseVisualization | null;
  /** The column's `.dt-col-viz` element right now, or `null` if no header. */
  getVizContainer(columnName: string): HTMLElement | null;
  /** Called once a fresh instance exists (coordinator registration, restores). */
  onVizCreated?(columnName: string, viz: BaseVisualization): void;
  /** Called just before an instance is destroyed (coordinator unregistration). */
  onVizDestroyed?(columnName: string, viz: BaseVisualization): void;
  /** The current filter array. */
  getFilters(): Filter[];
  /** Surfaced to the `error` event with `source: 'visualization'`. */
  onError?(error: unknown, columnName: string): void;
}

/** Constructor shape for the injectable observer (the jsdom seam). */
export type IntersectionObserverFactory = (
  callback: IntersectionObserverCallback,
  init: IntersectionObserverInit,
) => IntersectionObserver;

export interface VizDataControllerOptions {
  host: VizControllerHost;
  /**
   * Resolve the element the observer roots at — `.dt-header-scroll`.
   * Re-resolved on every sync so a container rebuild is picked up.
   *
   * Measured (Phase 2 M0 spike, 300 columns, six scroll stops): rooting here
   * reproduces the geometric truth set exactly. Rooting at `.dt-body-scroll`
   * reports **zero** intersections forever — an observer root must be an
   * *ancestor* of its targets, and the body scroller is the header subtree's
   * sibling.
   */
  getRoot: () => Element | null;
  /** Max fetches in flight. Default {@link DEFAULT_VIZ_FETCH_CONCURRENCY}. */
  concurrency?: number;
  /**
   * jsdom has no `IntersectionObserver`. Inject one to script visibility in a
   * unit test; when the global is absent and nothing is injected the
   * controller falls back to treat-everything-visible and creates instances
   * synchronously inside `sync()`, which is what keeps the existing jsdom
   * suites deterministic.
   */
  intersectionObserverFactory?: IntersectionObserverFactory | undefined;
  /**
   * Fires once per {@link VizDataController.sync} wave, when every fetch that
   * wave scheduled has settled. `generation` is the value passed to `sync`,
   * so a late wave from a superseded pass can be identified.
   *
   * A test seam, and honest to say so: the facade does not supply it. It
   * drops a superseded wave with its own `loadGeneration` counter in
   * `DataTable.ts`, which is the one that knows about loads. Kept because the
   * controller's wave bookkeeping is otherwise unobservable from outside.
   */
  onWaveSettled?: (vizCount: number, generation: number) => void;
}

/** Per-pass knobs for {@link VizDataController.sync}. */
export interface VizSyncOptions {
  /**
   * Create and fetch every column now, ignoring visibility — the
   * `visualizations: { eager: true }` opt-out.
   *
   * This **is** the O(columns) fan-out the phase removed, restored on
   * request: no observer is constructed, every applicable column is built
   * synchronously, and the load promise waits for all of them. At the WIDE_CI
   * tier that measures 604 queries and 300 canvases against 20 and 8 lazily
   * (`tests/browser/viz-lazy.spec.ts`). It exists for callers who need every
   * chart drawn before the load resolves and are willing to pay for it.
   */
  eager?: boolean;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Bookkeeping for one `sync()` wave. */
interface Wave {
  generation: number;
  /** No further work will join this wave. */
  closed: boolean;
  inflight: number;
  /** Fetches scheduled — the `vizCount` reported to `vizReady`. */
  count: number;
  settled: boolean;
  gate: Deferred<number>;
}

/**
 * Per-column visualization data controller. One per `DataTable`, created only
 * when visualizations are enabled.
 *
 * @internal
 */
export class VizDataController implements FilterFanOutScheduler {
  private readonly entries = new Map<string, VizColumnEntry>();
  private readonly options: VizDataControllerOptions;
  private readonly concurrency: number;

  private io: IntersectionObserver | null = null;
  private ioRoot: Element | null = null;
  /**
   * True when this environment has no `IntersectionObserver` to construct at
   * all — jsdom, and browsers predating the API. Everything is then treated
   * as visible and created synchronously.
   *
   * A latch, and only facts that cannot change may set it: `sync()` reads it
   * before `ensureObserver()`, so once it is true no observer is ever built
   * again. "No observer constructor exists" qualifies. "`getRoot()` returned
   * null this pass" does not — see {@link ensureObserver}.
   */
  private fallbackVisible = false;

  /** Bumped on every filter broadcast; stamped onto entries on success. */
  private filterEpoch = 0;

  /** Column names waiting for a creation/refetch slot, visible-first FIFO. */
  private queue: string[] = [];
  private inflight = 0;

  private wave: Wave | null = null;
  private destroyed = false;

  /** Lazily-built companion scheduler for `StatsPanelCoordinator`. */
  private panelSchedulerRef: FilterFanOutScheduler | null = null;
  /** The stats-panel coordinator's per-column update, captured per broadcast. */
  private panelRefresh: ((columnName: string) => Promise<void>) | null = null;
  /** Panels deferred because their header was offscreen when filters changed. */
  private readonly stalePanels = new Set<string>();

  constructor(options: VizDataControllerOptions) {
    this.options = options;
    this.concurrency = Math.max(1, options.concurrency ?? DEFAULT_VIZ_FETCH_CONCURRENCY);
  }

  // =========================================
  // Public surface
  // =========================================

  /**
   * One entry, live — not a copy. Inspection only; the facade reaches for
   * {@link hasLiveViz} instead, and mutating what comes back here would
   * desynchronise the state machine from the DOM.
   */
  getEntry(columnName: string): VizColumnEntry | undefined {
    return this.entries.get(columnName);
  }

  /** Column names the controller currently tracks. Inspection only. */
  getColumnNames(): string[] {
    return [...this.entries.keys()];
  }

  /**
   * Whether a column has a live instance feeding `onDefaultStatsChange`.
   *
   * `refreshNonVizStats` used to skip every viz-applicable column on the
   * assumption that each had one. Once creation is lazy that assumption is
   * false, and an offscreen column's stats line would freeze at whatever the
   * unfiltered attach wrote.
   */
  hasLiveViz(columnName: string): boolean {
    return this.entries.get(columnName)?.viz != null;
  }

  /** Number of columns with a live instance — the canvas count, effectively. */
  liveVizCount(): number {
    let n = 0;
    for (const entry of this.entries.values()) if (entry.viz) n++;
    return n;
  }

  /**
   * Reconcile the tracked columns with `columns` and start a new wave.
   *
   * Removed columns are destroyed and dropped; surviving columns keep their
   * data (and are re-created synchronously if they were visible, so a header
   * rebuild does not flash an empty chart for a frame while the observer
   * catches up); new columns start `empty` and wait for a visibility signal.
   *
   * Whether the headers were rebuilt is **detected, not declared**: each live
   * instance's creation-time container is compared against the host's live
   * lookup. A flag would be a guess, because `state.tableName` re-renders
   * only when `gridSemanticsActive` flips — so "tableName changed" does not
   * reliably mean "the headers survived", nor the reverse.
   *
   * @param columns - viz-applicable columns, in display order.
   * @param generation - opaque token echoed back to `onWaveSettled`.
   */
  sync(columns: ColumnSchema[], generation: number, opts: VizSyncOptions = {}): void {
    if (this.destroyed) return;

    const wanted = new Set(columns.map((c) => c.name));
    for (const [name, entry] of [...this.entries]) {
      if (wanted.has(name)) continue;
      this.destroyInstance(name, entry);
      this.entries.delete(name);
    }

    for (const column of columns) {
      const existing = this.entries.get(column.name);
      if (!existing) {
        this.entries.set(column.name, {
          column,
          status: 'empty',
          filterEpoch: -1,
          viz: null,
          snapshot: null,
          visible: false,
          container: null,
        });
        continue;
      }
      // A same-named column whose type changed is a different chart.
      if (existing.column.type !== column.type) {
        this.destroyInstance(column.name, existing);
        existing.status = 'empty';
        existing.filterEpoch = -1;
        existing.snapshot = null;
      }
      existing.column = column;
      // If the header row was rebuilt, this instance's canvas went with it.
      // Snapshot and tear it down properly — dropping the reference alone
      // would strand its ResizeObserver, its theme MutationObserver and its
      // WindowListenerManager registration, which at 1,000 columns is a leak
      // per column per render.
      if (existing.viz && existing.container !== this.options.host.getVizContainer(column.name)) {
        this.destroyInstance(column.name, existing);
      }
    }

    // Anything queued referred to the previous header generation, and so did
    // the deferred panel set: `attachVisualizations` destroys and recreates
    // the `StatsPanelCoordinator` on every pass, so a name held over from
    // before would dispatch `panelRefresh` into a dead coordinator — a silent
    // no-op — and a column dropped from the schema would sit in the set for
    // the table's lifetime. The new coordinator re-broadcasts on its own.
    this.queue = [];
    this.stalePanels.clear();
    this.panelRefresh = null;
    this.startWave(generation);

    if (opts.eager || this.fallbackVisible || !this.ensureObserver()) {
      // No visibility signal is coming (or none is wanted): create everything
      // synchronously, right here. `DataTable.colStats.router.test.ts` reads
      // `StubViz.instances[len - 1]` after exactly two microtask turns, so
      // this path must not defer behind a queue, a microtask or a task.
      for (const column of columns) {
        const entry = this.entries.get(column.name);
        if (!entry) continue;
        entry.visible = true;
        this.createAndTrack(column.name, entry);
      }
      this.closeWave();
      return;
    }

    // Re-create instances for columns that were visible before this rebuild.
    // Observer callbacks are at least a frame late, so a purely IO-driven
    // rebuild would make every canvas vanish and reappear on each
    // hide/show/pin/reorder — visible flicker on an operation users perform
    // constantly. Seeded from the snapshot, these cost zero queries.
    for (const column of columns) {
      const entry = this.entries.get(column.name);
      if (!entry?.visible) continue;
      this.createAndTrack(column.name, entry);
    }

    // An instance that survived the pass but whose data went stale (the
    // derived-column VIEW switch is the live case) still needs a refetch —
    // the queue that would have carried it was just cleared.
    for (const [name, entry] of this.entries) {
      if (entry.viz && entry.status === 'stale') this.enqueue(name);
    }
    this.pump();

    this.io!.disconnect();
    let observed = 0;
    for (const column of columns) {
      const container = this.options.host.getVizContainer(column.name);
      if (container) {
        this.io!.observe(container);
        observed++;
      }
    }
    // The wave closes on the observer's first callback for this pass, which
    // reports every observed target's initial state at once. That callback is
    // the definition of "the initial visible wave".
    //
    // Unless there is nothing to observe, in which case there is no callback
    // to wait for and the wave would stay open forever. Reachable through the
    // public `visualizationRegistry` option: a registry whose registrations
    // match none of the table's column types leaves `vizColumns` empty, and
    // `whenVizReady()` would then never settle on a table that is otherwise
    // working perfectly.
    if (observed === 0) {
      this.closeWave();
      return;
    }
    //
    // Except in a hidden document, where it never arrives: a background tab
    // gets no rendering opportunity, so the browser delivers no
    // IntersectionObserver callbacks at all. Measured on a 1,000-column load
    // in a background tab, `dt:load:viz` came out at 57,151 ms against a
    // 3,637 ms load — it settled when the tab was foregrounded, 53 seconds
    // later, and would not have settled at all had nobody looked. Close the
    // wave here instead: nothing is visible, so the visible wave is empty and
    // `whenVizReady()` is right to resolve with 0. The observer still fires
    // when the document is shown, and the charts are built then.
    //
    // A document that goes hidden *after* this point but before the first
    // callback still waits for it — that window is one frame wide, and the
    // callback arrives when the user returns.
    if (documentHidden()) this.closeWave();
  }

  /**
   * Retire every cached snapshot and mark every entry stale, without issuing
   * a query. Used for the derived-column VIEW switch, where `tableName`
   * changes without a header rebuild — every chart's data was computed
   * against the previous relation.
   *
   * Deliberately does **not** refetch. Its one caller, `attachVisualizations`,
   * calls it immediately before `sync()`, and a refetch here would run against
   * the relation the instances were *constructed* with:
   * `BaseVisualization.updateFilters` replaces `options.filters` but not
   * `options.tableName`, which is fixed at construction. So the queries would
   * scan the old view, land on instances `sync()` is about to destroy, and be
   * discarded — up to four full-table scans of pure waste per derived-column
   * change. Marking stale is enough: `sync()` re-creates what is visible, and
   * a stale entry re-creates without its snapshot, so it comes up correct
   * against the new relation in one step.
   */
  invalidateAll(): void {
    if (this.destroyed) return;
    this.filterEpoch++;
    for (const entry of this.entries.values()) {
      entry.snapshot = null;
      if (entry.status !== 'empty') entry.status = 'stale';
    }
  }

  /**
   * {@link FilterFanOutScheduler} — replaces both coordinators' fan-out over
   * every registration.
   *
   * Bumps the filter epoch, refetches the columns that have a live instance
   * (bounded, at `'low'` worker priority), and marks the rest stale without
   * touching DuckDB. A stale column fetches when it scrolls into view.
   */
  async refreshOnFilters(request: FilterFanOutRequest): Promise<void> {
    if (this.destroyed) return;
    this.filterEpoch++;
    const epoch = this.filterEpoch;

    const live: string[] = [];
    for (const [name, entry] of this.entries) {
      if (entry.viz) {
        entry.status = 'stale';
        live.push(name);
      } else if (entry.status !== 'empty') {
        entry.status = 'stale';
      }
    }

    // Columns the coordinator knows about but we do not (a standalone
    // registration, or a stats panel) still have to be refreshed, or the
    // caller's contract is broken.
    const extra = request.columns.filter((name) => !this.entries.has(name));

    await this.runBounded([...live, ...extra], async (name) => {
      // Per column, not around the whole fan-out: both shipped `refresh`
      // implementations swallow their own errors, but a custom one need not,
      // and one throwing column must not abandon the columns queued behind it
      // — nor reject the caller, which reaches this through a bare
      // `void this.onFiltersChanged(...)` and would surface an unhandled
      // rejection. The column stays `'stale'`, so it retries on scroll-in.
      try {
        await request.refresh(name);
      } catch (error) {
        this.options.host.onError?.(error, name);
        return;
      }
      const entry = this.entries.get(name);
      if (!entry || epoch !== this.filterEpoch) return;
      entry.status = entry.viz ? 'fresh' : entry.status;
      entry.filterEpoch = epoch;
    });
  }

  /**
   * A {@link FilterFanOutScheduler} for registrations the controller does not
   * own — custom {@link BaseStatsPanel}s, which live in a header the
   * controller *does* have a visibility signal for.
   *
   * Separate from {@link refreshOnFilters} because the two coordinators
   * broadcast independently: sharing one entry point would bump the filter
   * epoch twice per user-visible filter change and discard the first cycle's
   * own fetches as stale.
   *
   * Panels for offscreen columns are deferred, not dropped — the column name
   * is remembered and the panel refreshes when its header scrolls in.
   */
  get panelScheduler(): FilterFanOutScheduler {
    this.panelSchedulerRef ??= {
      refreshOnFilters: (request) => this.refreshPanels(request),
    };
    return this.panelSchedulerRef;
  }

  private async refreshPanels(request: FilterFanOutRequest): Promise<void> {
    if (this.destroyed) return;
    this.panelRefresh = request.refresh;
    const now: string[] = [];
    for (const name of request.columns) {
      const entry = this.entries.get(name);
      // Untracked columns have no visibility signal of their own — a panel on
      // a column with no visualization must always refresh.
      if (!entry || entry.visible) now.push(name);
      else this.stalePanels.add(name);
    }
    await this.runBounded(now, async (name) => {
      // Per panel, for the reason `refreshOnFilters` does it per column: the
      // one shipped `refresh` swallows (`StatsPanelCoordinator`'s
      // `callUpdateFilters`), but a custom one need not, and one throwing
      // panel must not abandon the panels queued behind it — nor reject the
      // caller, which reaches this through a bare
      // `void this.onFiltersChanged(...)` and would surface an unhandled
      // rejection. The name stays out of `stalePanels`, so the panel retries
      // on the next filter change rather than on scroll-in.
      try {
        await request.refresh(name);
      } catch (error) {
        this.options.host.onError?.(error, name);
      }
    });
  }

  /**
   * Resolves when the current wave has settled, with the number of
   * visualizations it fetched. A wave with nothing visible resolves with `0`
   * rather than hanging — otherwise a table mounted in a `display:none` tab
   * panel would never report ready.
   */
  whenWaveSettled(): Promise<number> {
    return this.wave ? this.wave.gate.promise : Promise.resolve(0);
  }

  /** Tear down the observer and every live instance. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.io?.disconnect();
    this.io = null;
    this.queue = [];
    for (const [name, entry] of this.entries) this.destroyInstance(name, entry);
    this.entries.clear();
    // Never leave `whenVizReady()` pending after teardown.
    if (this.wave && !this.wave.settled) {
      this.wave.settled = true;
      this.wave.gate.resolve(this.wave.count);
    }
  }

  // =========================================
  // Observation
  // =========================================

  /** @returns whether a usable observer exists after the call. */
  private ensureObserver(): boolean {
    const root = this.options.getRoot();
    if (this.io && this.ioRoot === root) return true;
    this.io?.disconnect();
    this.io = null;
    this.ioRoot = root;

    const factory =
      this.options.intersectionObserverFactory ??
      (typeof IntersectionObserver !== 'undefined'
        ? (cb: IntersectionObserverCallback, init: IntersectionObserverInit) =>
            new IntersectionObserver(cb, init)
        : null);
    if (!factory) {
      this.fallbackVisible = true;
      return false;
    }
    // A root that is not there *yet* is a different fact, and must not latch.
    // `getRoot` is re-resolved every sync precisely because the container it
    // names can appear, move or be rebuilt; a host whose first `sync()` lands
    // one tick before `.dt-header-scroll` is mounted would otherwise pin this
    // table into create-everything for its whole life — the 1,000-canvas /
    // ~2,000-query shape lazy creation exists to remove, restored with no
    // error to say so. Fall back for this pass only; the next sync re-probes.
    if (!root) return false;

    this.io = factory((entries) => this.onIntersections(entries), {
      root,
      // The observer runs at the *keep* margin; the narrower create band is
      // derived per entry below. One observer rather than two keeps
      // `readObserverCensus().intersection` at 1 per table.
      rootMargin: `0px ${VIZ_KEEP_MARGIN_PX}px`,
    });
    return true;
  }

  private onIntersections(entries: IntersectionObserverEntry[]): void {
    if (this.destroyed) return;
    for (const entry of entries) {
      const name = columnNameOf(entry.target);
      const record = name ? this.entries.get(name) : undefined;
      if (!name || !record) continue;

      if (!entry.isIntersecting) {
        // Past the keep band — reclaim the canvas, keeping the data.
        record.visible = false;
        this.destroyInstance(name, record);
        continue;
      }

      if (!inCreateBand(entry)) {
        // Hysteresis band: keep what exists, create nothing new.
        continue;
      }

      record.visible = true;
      if (!record.viz || record.status === 'stale') this.enqueue(name);
      if (this.stalePanels.delete(name)) this.refreshDeferredPanel(name);
    }
    this.pump();
    // Every observed target reports in the first callback after `observe()`,
    // so one pass is the whole initial wave.
    this.closeWave();
  }

  /**
   * Fire the panel refresh {@link refreshPanels} deferred while this column
   * was offscreen.
   *
   * Fire-and-forget by construction — an observer callback cannot await — so
   * it carries its own error routing rather than borrowing a caller's. A
   * rejection would otherwise be unhandled (nobody holds this promise), and a
   * synchronous throw would abandon the rest of the callback batch: the
   * remaining entries, the `pump()` and the `closeWave()` that resolves
   * `whenVizReady()`.
   */
  private refreshDeferredPanel(name: string): void {
    try {
      void this.panelRefresh?.(name).catch((error: unknown) =>
        this.options.host.onError?.(error, name),
      );
    } catch (error) {
      this.options.host.onError?.(error, name);
    }
  }

  // =========================================
  // Scheduling
  // =========================================

  private enqueue(columnName: string): void {
    if (!this.queue.includes(columnName)) this.queue.push(columnName);
  }

  private pump(): void {
    while (!this.destroyed && this.inflight < this.concurrency && this.queue.length > 0) {
      const name = this.queue.shift()!;
      const entry = this.entries.get(name);
      if (!entry || !entry.visible) continue;
      this.inflight++;
      this.trackInWave(this.runEntry(name, entry).finally(() => this.onSlotFreed()));
    }
  }

  private onSlotFreed(): void {
    this.inflight--;
    if (this.queue.length > 0) this.pump();
  }

  /**
   * Bring one entry up to date. Creation and refetch share a slot because a
   * built-in's constructor issues its own first fetch — bounding creation is
   * the only way to bound queries in flight.
   */
  private async runEntry(name: string, entry: VizColumnEntry): Promise<void> {
    if (!entry.viz) {
      const created = this.createNow(name, entry);
      if (!created) return;
      await this.settleFetch(name, entry, created.waitForData());
      return;
    }
    if (entry.status === 'stale') {
      await this.settleFetch(name, entry, entry.viz.updateFilters(this.options.host.getFilters()));
    }
  }

  /**
   * Create outside the queue and fold the first load into the current wave.
   *
   * Used by the two paths that must not defer: the fallback/eager sweep, and
   * the re-creation of columns that were already visible before a header
   * rebuild.
   */
  private createAndTrack(name: string, entry: VizColumnEntry): void {
    const created = this.createNow(name, entry);
    if (!created) return;
    this.trackInWave(this.settleFetch(name, entry, created.waitForData()));
  }

  private async settleFetch(
    name: string,
    entry: VizColumnEntry,
    work: Promise<void>,
  ): Promise<void> {
    const epoch = this.filterEpoch;
    entry.status = 'fetching';
    try {
      await work;
    } catch (error) {
      this.options.host.onError?.(error, name);
    }
    if (this.destroyed) return;
    const current = this.entries.get(name);
    if (current !== entry) return;
    if (epoch !== this.filterEpoch) {
      // A filter cycle overtook this fetch: its result describes a filter
      // context nobody is looking at any more. Keep the data (it renders
      // something) but do not claim it is current.
      entry.status = 'stale';
      return;
    }
    if (!entry.viz) {
      // The instance was reclaimed while its fetch was in flight, so the
      // result landed nowhere: the snapshot `destroyInstance` captured is
      // whatever the chart held *before* this fetch, one filter context
      // behind. Calling that `'fresh'` is how a superseded snapshot gets
      // seeded into the re-created chart — which then issues no query,
      // because it believes it is current, and never corrects itself.
      // `refreshOnFilters` has the same guard for the same reason.
      entry.status = 'stale';
      return;
    }
    entry.status = 'fresh';
    entry.filterEpoch = epoch;
  }

  /** Run `task` over `names` with the controller's concurrency ceiling. */
  private async runBounded(names: string[], task: (name: string) => Promise<void>): Promise<void> {
    if (names.length === 0) return;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(this.concurrency, names.length) }, async () => {
      while (!this.destroyed) {
        const i = cursor++;
        if (i >= names.length) return;
        await task(names[i]!);
      }
    });
    await Promise.all(workers);
  }

  // =========================================
  // Instance lifecycle
  // =========================================

  /** @returns the new instance, or `null` when none could be built. */
  private createNow(name: string, entry: VizColumnEntry): BaseVisualization | null {
    if (entry.viz || this.destroyed) return null;
    const container = this.options.host.getVizContainer(name);
    if (!container) return null;

    // Seed only when the snapshot describes the *current* filter context.
    // A stale snapshot would paint a chart for filters the user has since
    // changed; a plain fetch comes up correct in one step.
    const seed =
      entry.snapshot !== null && entry.status === 'fresh' && entry.filterEpoch === this.filterEpoch
        ? entry.snapshot
        : null;

    let viz: BaseVisualization | null;
    try {
      viz = this.options.host.createViz(entry.column, container, seed);
    } catch (error) {
      this.options.host.onError?.(error, name);
      return null;
    }
    if (!viz) return null;
    entry.viz = viz;
    entry.container = container;
    if (seed !== null) {
      entry.status = 'fresh';
      entry.filterEpoch = this.filterEpoch;
    }
    this.options.host.onVizCreated?.(name, viz);
    return viz;
  }

  private destroyInstance(name: string, entry: VizColumnEntry): void {
    const viz = entry.viz;
    if (!viz) return;
    try {
      const snapshot = viz.exportDataSnapshot();
      if (snapshot !== null && snapshot !== undefined) entry.snapshot = snapshot;
    } catch (error) {
      this.options.host.onError?.(error, name);
    }
    this.options.host.onVizDestroyed?.(name, viz);
    entry.viz = null;
    entry.container = null;
    try {
      viz.destroy();
    } catch (error) {
      this.options.host.onError?.(error, name);
    }
  }

  // =========================================
  // Wave bookkeeping
  // =========================================

  private startWave(generation: number): void {
    // A superseded wave must never hang its awaiter.
    if (this.wave && !this.wave.settled) {
      this.wave.settled = true;
      this.wave.gate.resolve(this.wave.count);
    }
    this.wave = {
      generation,
      closed: false,
      inflight: 0,
      count: 0,
      settled: false,
      gate: deferred<number>(),
    };
  }

  private trackInWave(work: Promise<void>): void {
    const wave = this.wave;
    if (!wave) return;
    wave.count++;
    wave.inflight++;
    void work.then(
      () => this.leaveWave(wave),
      () => this.leaveWave(wave),
    );
  }

  private leaveWave(wave: Wave): void {
    wave.inflight--;
    this.maybeSettleWave(wave);
  }

  private closeWave(): void {
    if (!this.wave || this.wave.closed) return;
    this.wave.closed = true;
    this.maybeSettleWave(this.wave);
  }

  private maybeSettleWave(wave: Wave): void {
    if (wave.settled || !wave.closed || wave.inflight > 0) return;
    wave.settled = true;
    wave.gate.resolve(wave.count);
    this.options.onWaveSettled?.(wave.count, wave.generation);
  }
}

/**
 * Is the document currently hidden — a background tab, a minimized window?
 *
 * Guarded for environments with no `document` (a worker, an SSR pass) rather
 * than assumed: this runs on the load path, and throwing there would take the
 * whole table with it.
 */
function documentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** Resolve the column a `.dt-col-viz` element belongs to. */
function columnNameOf(target: Element): string | null {
  const header = target.closest('[data-column]');
  return header?.getAttribute('data-column') ?? null;
}

/**
 * Is this entry inside the narrower **create** band?
 *
 * The observer runs at {@link VIZ_KEEP_MARGIN_PX} so it can report the exit
 * edge, so "should we create" has to be derived from geometry. `rootBounds`
 * is the root rect already expanded by `rootMargin`; shrinking it back by the
 * difference of the two margins gives the create box.
 *
 * `rootBounds` is `null` for a cross-origin root, and a hand-written test
 * double may omit it — in both cases fall back to the observer's own answer,
 * which is correct, just less hysteretic.
 */
function inCreateBand(entry: IntersectionObserverEntry): boolean {
  const bounds = entry.rootBounds;
  if (!bounds) return entry.isIntersecting;
  const shrink = VIZ_KEEP_MARGIN_PX - VIZ_CREATE_MARGIN_PX;
  const rect = entry.boundingClientRect;
  return rect.right >= bounds.left + shrink && rect.left <= bounds.right - shrink;
}
