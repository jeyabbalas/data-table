/**
 * Creates each column's header chart only while its header is on screen or
 * close to it, so the number of live charts — and the queries they run —
 * follows the viewport instead of the column count.
 *
 * A chart fetches in its constructor, so creating one for every column made
 * a 1,000-column load run about 2,000 queries, and every header rebuild (each
 * hide, show, pin or reorder) ran them all again. Here, only columns near the
 * header viewport get an instance. A filter change reaches only those,
 * because only they are registered with the crossfilter coordinator; a
 * column that scrolls in later is created with the filters in force then.
 *
 * Visibility comes from two `IntersectionObserver`s rooted at the header
 * scroller, one per edge of a hysteresis band:
 *
 * - the **create** observer, at {@link VIZ_CREATE_MARGIN_PX}, reports a
 *   header coming within reach, and queues its chart;
 * - the **keep** observer, at {@link VIZ_KEEP_MARGIN_PX}, reports a header
 *   moving out of reach, and destroys its chart.
 *
 * Two observers because an observer reports only when a target crosses one
 * of its thresholds. With one observer at the keep margin, a header scrolled
 * in smoothly is reported once, at the outer edge, and never again as it
 * moves closer — so its chart was never created.
 *
 * @internal
 */

import type { ColumnSchema } from '../core/types';
import type { BaseVisualization } from './BaseVisualization';

/** How far outside the header viewport a column's chart is created. */
export const VIZ_CREATE_MARGIN_PX = 200;

/**
 * How far outside the header viewport a column's chart is kept. Twice the
 * create margin, so a scroll that reverses direction destroys nothing it has
 * just created.
 */
export const VIZ_KEEP_MARGIN_PX = VIZ_CREATE_MARGIN_PX * 2;

/**
 * Charts created at once. Each fetches on creation, and DuckDB-WASM runs one
 * query at a time, so more would only queue behind each other — and a fast
 * scroll leaves columns behind before their turn comes, which the queue then
 * skips.
 */
export const DEFAULT_VIZ_CREATE_CONCURRENCY = 4;

/**
 * How long a {@link LazyVizController.sync} waits for the create observer's
 * first report before settling without the charts in view. Browsers report
 * only when they render, and some pages never do: a hidden or throttled
 * iframe, or a tab hidden right after the sync.
 */
export const VIZ_FIRST_REPORT_TIMEOUT_MS = 1000;

/** The facade's side: how to build a chart and where it goes. */
export interface LazyVizHost {
  /** Build a chart into `container`, or return `null` when none applies. */
  createViz(column: ColumnSchema, container: HTMLElement): BaseVisualization | null;
  /** The column's `.dt-col-viz` element right now, or `null` without a header. */
  getVizContainer(columnName: string): HTMLElement | null;
  /** Called once a chart exists (coordinator registration, restores). */
  onVizCreated?(columnName: string, viz: BaseVisualization): void;
  /** Called just before a chart is destroyed. */
  onVizDestroyed?(columnName: string, viz: BaseVisualization): void;
  /** Called by {@link LazyVizController.sync} for a column that no longer gets a chart. */
  onColumnRemoved?(columnName: string): void;
  /** A `createViz` or `destroy` that threw. */
  onError?(error: unknown, columnName: string): void;
}

/** Builds an observer. Injected by tests; the global one otherwise. */
export type IntersectionObserverFactory = (
  callback: IntersectionObserverCallback,
  init: IntersectionObserverInit,
) => IntersectionObserver;

export interface LazyVizControllerOptions {
  host: LazyVizHost;
  /**
   * The header scroller, `.dt-header-scroll`. An observer root must be an
   * ancestor of its targets, so the body scroller, a sibling of the header
   * row, cannot be used.
   */
  getRoot: () => Element | null;
  /** Charts created at once. Default {@link DEFAULT_VIZ_CREATE_CONCURRENCY}. */
  concurrency?: number;
  /**
   * With no factory and no global `IntersectionObserver` (jsdom), every
   * column counts as visible and is created during {@link LazyVizController.sync}.
   */
  intersectionObserverFactory?: IntersectionObserverFactory | undefined;
}

interface Entry {
  column: ColumnSchema;
  viz: BaseVisualization | null;
  /** Inside the create band, as the create observer last reported. */
  wanted: boolean;
  /** `createViz` threw; not tried again until the next sync. */
  failed: boolean;
}

/** The charts a {@link LazyVizController.sync} creates for the columns in view. */
interface Wave {
  /** Columns in view whose chart has not finished its first fetch. */
  members: Set<string>;
  /** The create observer has reported, so no more columns will join. */
  closed: boolean;
  settled: boolean;
  /** Closes the wave if the create observer has not reported in time. */
  timer: ReturnType<typeof setTimeout> | null;
  resolve: () => void;
  promise: Promise<void>;
}

/**
 * One per `DataTable` with visualizations on.
 *
 * @internal
 */
export class LazyVizController {
  private readonly host: LazyVizHost;
  private readonly getRoot: () => Element | null;
  private readonly concurrency: number;
  private readonly factory: IntersectionObserverFactory | null;

  private readonly entries = new Map<string, Entry>();
  private createObserver: IntersectionObserver | null = null;
  private keepObserver: IntersectionObserver | null = null;
  private observerRoot: Element | null = null;

  /** Columns waiting to be created, in the order they came into reach. */
  private queue: string[] = [];
  private creating = 0;
  private wave: Wave | null = null;
  private destroyed = false;

  constructor(options: LazyVizControllerOptions) {
    this.host = options.host;
    this.getRoot = options.getRoot;
    this.concurrency = Math.max(1, options.concurrency ?? DEFAULT_VIZ_CREATE_CONCURRENCY);
    this.factory =
      options.intersectionObserverFactory ??
      (typeof IntersectionObserver === 'undefined'
        ? null
        : (callback, init) => new IntersectionObserver(callback, init));
  }

  /** Whether a column has a live chart writing its stats slot. */
  hasLiveViz(columnName: string): boolean {
    return this.entries.get(columnName)?.viz != null;
  }

  /** Number of live charts. */
  liveVizCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) if (entry.viz) count++;
    return count;
  }

  /**
   * Start over with `columns`, after the header row was rebuilt or the
   * table's relation changed.
   *
   * Every live chart is destroyed: a rebuild discarded the element its canvas
   * sits in, and a chart queries the relation it was built with. The charts
   * in view are then created again as the observers report them.
   *
   * @param columns - the columns that get a chart, in display order.
   */
  sync(columns: ColumnSchema[]): void {
    if (this.destroyed) return;
    const names = new Set(columns.map((column) => column.name));
    for (const [name, entry] of this.entries) {
      this.destroyViz(name, entry);
      if (!names.has(name)) this.host.onColumnRemoved?.(name);
    }
    this.entries.clear();
    this.queue = [];
    for (const column of columns) {
      this.entries.set(column.name, { column, viz: null, wanted: false, failed: false });
    }
    const wave = this.startWave();

    if (!this.ensureObservers()) {
      // No visibility signal will come: create every chart now.
      for (const [name, entry] of this.entries) {
        entry.wanted = true;
        const viz = this.createViz(name, entry);
        if (!viz) continue;
        wave.members.add(name);
        this.leaveWaveOnSettle(wave, name, viz.waitForData());
      }
      this.closeWave(wave);
      return;
    }

    this.createObserver!.disconnect();
    this.keepObserver!.disconnect();
    let observed = 0;
    for (const name of this.entries.keys()) {
      const container = this.host.getVizContainer(name);
      if (!container) continue;
      this.createObserver!.observe(container);
      this.keepObserver!.observe(container);
      observed++;
    }
    // The wave closes on the create observer's first report, which covers
    // every target observed above. With nothing observed there is no report
    // to wait for. A hidden document gets no rendering updates, so it gets
    // no report either until it is shown; nothing in it is visible, so the
    // visible wave is empty. Any other page that does not render gets the
    // same answer after a timeout.
    if (observed === 0 || documentHidden()) {
      this.closeWave(wave);
      return;
    }
    wave.timer = setTimeout(() => this.closeWave(wave), VIZ_FIRST_REPORT_TIMEOUT_MS);
  }

  /**
   * Queue every column in reach that has no chart, such as one whose
   * creation the host declined by returning `null` while the table's
   * relation was changing.
   */
  requeueWanted(): void {
    if (this.destroyed) return;
    for (const [name, entry] of this.entries) {
      if (!entry.wanted || entry.viz || entry.failed || this.queue.includes(name)) continue;
      this.queue.push(name);
    }
    this.pump();
  }

  /**
   * Resolves once the latest {@link sync}'s charts in view have finished
   * their first fetch. Resolves early if a newer `sync` replaces it.
   */
  whenWaveSettled(): Promise<void> {
    return this.wave?.promise ?? Promise.resolve();
  }

  /** Disconnect the observers and destroy every live chart. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.createObserver?.disconnect();
    this.keepObserver?.disconnect();
    this.createObserver = null;
    this.keepObserver = null;
    this.queue = [];
    for (const [name, entry] of this.entries) this.destroyViz(name, entry);
    this.entries.clear();
    this.settleWave(this.wave);
  }

  // =========================================
  // Observation
  // =========================================

  /** @returns whether both observers exist, rooted at the current root. */
  private ensureObservers(): boolean {
    const root = this.getRoot();
    if (this.createObserver && this.observerRoot === root) return true;
    this.createObserver?.disconnect();
    this.keepObserver?.disconnect();
    this.createObserver = null;
    this.keepObserver = null;
    this.observerRoot = root;
    if (!this.factory || !root) return false;

    this.createObserver = this.factory((records) => this.onCreateBand(records), {
      root,
      rootMargin: `0px ${VIZ_CREATE_MARGIN_PX}px`,
    });
    this.keepObserver = this.factory((records) => this.onKeepBand(records), {
      root,
      rootMargin: `0px ${VIZ_KEEP_MARGIN_PX}px`,
    });
    return true;
  }

  private onCreateBand(records: IntersectionObserverEntry[]): void {
    if (this.destroyed) return;
    // The first report after a sync covers every observed column, so the
    // columns it queues are the ones in view when the rows first paint.
    const wave = this.wave && !this.wave.closed ? this.wave : null;
    for (const record of records) {
      const name = columnNameOf(record.target);
      const entry = name === null ? undefined : this.entries.get(name);
      if (!name || !entry) continue;
      // Leaving the create band marks a column unwanted, so a queued
      // creation is skipped, but destroys nothing: that is the keep band's
      // job, further out.
      entry.wanted = record.isIntersecting;
      if (!entry.wanted || entry.viz || entry.failed || this.queue.includes(name)) continue;
      this.queue.push(name);
      wave?.members.add(name);
    }
    this.pump();
    if (this.wave) this.closeWave(this.wave);
  }

  private onKeepBand(records: IntersectionObserverEntry[]): void {
    if (this.destroyed) return;
    for (const record of records) {
      if (record.isIntersecting) continue;
      const name = columnNameOf(record.target);
      const entry = name === null ? undefined : this.entries.get(name);
      if (!name || !entry) continue;
      entry.wanted = false;
      this.destroyViz(name, entry);
    }
  }

  // =========================================
  // Creation
  // =========================================

  private pump(): void {
    while (!this.destroyed && this.creating < this.concurrency && this.queue.length > 0) {
      const name = this.queue.shift()!;
      const entry = this.entries.get(name);
      const viz =
        entry && !entry.viz && !entry.failed && entry.wanted ? this.createViz(name, entry) : null;
      const wave = this.wave?.members.has(name) ? this.wave : null;
      if (!viz) {
        if (wave) this.leaveWave(wave, name);
        continue;
      }
      this.creating++;
      const done = (): void => {
        this.creating--;
        this.pump();
      };
      const fetched = viz.waitForData().then(done, done);
      if (wave) this.leaveWaveOnSettle(wave, name, fetched);
    }
  }

  private createViz(name: string, entry: Entry): BaseVisualization | null {
    const container = this.host.getVizContainer(name);
    if (!container) return null;
    let viz: BaseVisualization | null;
    try {
      viz = this.host.createViz(entry.column, container);
    } catch (error) {
      // A chart that throws in its constructor may already have added its
      // canvas, and would throw again: leave it until the next sync.
      entry.failed = true;
      container.replaceChildren();
      this.host.onError?.(error, name);
      return null;
    }
    if (!viz) return null;
    entry.viz = viz;
    this.host.onVizCreated?.(name, viz);
    return viz;
  }

  private destroyViz(name: string, entry: Entry): void {
    const viz = entry.viz;
    if (!viz) return;
    entry.viz = null;
    this.host.onVizDestroyed?.(name, viz);
    try {
      viz.destroy();
    } catch (error) {
      this.host.onError?.(error, name);
    }
  }

  // =========================================
  // Wave bookkeeping
  // =========================================

  private startWave(): Wave {
    // Never leave an awaiter of the previous wave hanging.
    this.settleWave(this.wave);
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
      resolve = res;
    });
    this.wave = {
      members: new Set(),
      closed: false,
      settled: false,
      timer: null,
      resolve,
      promise,
    };
    return this.wave;
  }

  private leaveWaveOnSettle(wave: Wave, name: string, fetched: Promise<void>): void {
    // `waitForData` never rejects; the second handler is for a custom chart
    // that breaks that contract.
    const leave = (): void => this.leaveWave(wave, name);
    void fetched.then(leave, leave);
  }

  private leaveWave(wave: Wave, name: string): void {
    wave.members.delete(name);
    if (wave.closed && wave.members.size === 0) this.settleWave(wave);
  }

  private closeWave(wave: Wave): void {
    if (wave.timer !== null) clearTimeout(wave.timer);
    wave.timer = null;
    if (wave.closed) return;
    wave.closed = true;
    if (wave.members.size === 0) this.settleWave(wave);
  }

  private settleWave(wave: Wave | null): void {
    if (!wave || wave.settled) return;
    if (wave.timer !== null) clearTimeout(wave.timer);
    wave.timer = null;
    wave.settled = true;
    wave.resolve();
  }
}

/** Whether the document is hidden: a background tab, a minimized window. */
function documentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** The column a `.dt-col-viz` element belongs to. */
function columnNameOf(target: Element): string | null {
  return target.closest('[data-column]')?.getAttribute('data-column') ?? null;
}
