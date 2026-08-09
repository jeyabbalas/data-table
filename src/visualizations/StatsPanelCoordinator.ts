/**
 * StatsPanelCoordinator — broadcasts filter changes to every registered
 * {@link BaseStatsPanel}.
 *
 * Parallel to {@link CrossfilterCoordinator}: subscribes to `state.filters`
 * and calls `panel.updateFilters(filters)` on every registered, non-
 * destroyed panel whenever the filter array changes. A separate
 * coordinator (rather than a method on `CrossfilterCoordinator`) keeps the
 * concerns separate — a panel can exist for a column that has no
 * visualization (e.g. `uuid`), so panel updates can't be parented to viz
 * updates.
 *
 * Composed by `createDataTable()` for you. Reach for it directly only when
 * building a custom pipeline of panels outside the facade.
 *
 * @example
 * ```ts
 * import { StatsPanelCoordinator } from '@jeyabbalas/data-table/advanced';
 *
 * const coord = new StatsPanelCoordinator(state);
 * coord.register('age', ageStatsPanel);
 * coord.register('country', countryStatsPanel);
 * // later:
 * coord.destroy();
 * ```
 *
 * @see BaseStatsPanel
 * @see StatsPanelRegistry
 * @see CrossfilterCoordinator
 */

import { runLimited } from '../core/concurrency';
import type { TableState } from '../core/State';
import type { Filter } from '../core/types';
import type { BaseStatsPanel } from './BaseStatsPanel';
import type { FilterFanOutRequest, FilterFanOutScheduler } from './CrossfilterCoordinator';

/**
 * Default max number of panel updates in flight at once. Sized
 * independently of the visualization fan-out cap because a panel may issue
 * its own DuckDB queries (mean+stddev, top value, ...) and we don't want
 * to flood the single-threaded worker on wide tables.
 */
const DEFAULT_PANEL_CONCURRENCY = 4;

/**
 * Optional hooks for the panel coordinator, supplied as the constructor's
 * trailing argument. Separate from `CrossfilterCoordinatorOptions` because
 * panels have no row-count cycle to hook.
 */
export interface StatsPanelCoordinatorOptions {
  /**
   * See {@link FilterFanOutScheduler}. Absent = today's fan-out over every
   * registered panel. Note this governs {@link StatsPanelCoordinator} filter
   * *changes* only — `syncExistingFilters` always bypasses it.
   */
  vizScheduler?: FilterFanOutScheduler;
}

/**
 * Mirrors {@link CrossfilterCoordinator} for `BaseStatsPanel` subclasses:
 * stamps a monotonic `filterSequence` on every broadcast so panels can drop
 * stale results, and bounds panel-issued query fan-out via its own
 * concurrency cap. Composed by the facade; expose for power users
 * orchestrating panels manually.
 */
export class StatsPanelCoordinator {
  private panels = new Map<string, BaseStatsPanel>();
  private unsubscribe: (() => void) | null = null;
  private readonly concurrency: number;
  private destroyed = false;
  /**
   * Monotonically-increasing tag for filter changes. Captured per broadcast
   * so that an in-flight `runLimited` from filter set F1 can be aborted
   * mid-fan-out as soon as a fresh F2 arrives — without it, F1's per-panel
   * `updateFilters(F1)` calls keep firing after F2 has been broadcast and
   * the base-class default's last-write-wins behavior on
   * `this.options.filters` lands stale data on each panel. Mirrors
   * `CrossfilterCoordinator.filterSequence`.
   */
  private filterSequence = 0;
  private readonly options: StatsPanelCoordinatorOptions;

  constructor(
    state: TableState,
    concurrency: number = DEFAULT_PANEL_CONCURRENCY,
    options: StatsPanelCoordinatorOptions = {},
  ) {
    this.concurrency = Math.max(1, concurrency);
    this.options = options;
    this.unsubscribe = state.filters.subscribe((filters) => void this.onFiltersChanged(filters));
  }

  /** Register a panel for filter-broadcast updates. Same-column re-register replaces. */
  register(columnName: string, panel: BaseStatsPanel): void {
    if (this.destroyed) return;
    this.panels.set(columnName, panel);
  }

  /** Unregister a panel. Idempotent. */
  unregister(columnName: string): void {
    this.panels.delete(columnName);
  }

  /** Get the panel registered for a column, or undefined. */
  get(columnName: string): BaseStatsPanel | undefined {
    return this.panels.get(columnName);
  }

  /** True if a panel is registered for the column. */
  has(columnName: string): boolean {
    return this.panels.has(columnName);
  }

  /**
   * Re-broadcast the current filter array to every registered panel.
   * Returns a promise that resolves once every panel's `updateFilters` call
   * settles (per-panel errors are swallowed by `callUpdateFilters`). The
   * facade awaits this during `loadData` so `loadComplete` doesn't fire
   * while initial panel queries are still in flight.
   *
   * Useful after registering new panels so they see filters that were
   * already in state (e.g., restored from persistence) before the
   * coordinator was created or the panel was registered.
   *
   * Deliberately asymmetric with the `state.filters` subscription path: this
   * one **always** fans out directly over every registered panel, even when a
   * {@link FilterFanOutScheduler} is attached. The facade's load gate awaits
   * this call, so routing it through the scheduler would make load completion
   * depend on the header-visibility wave — precisely the coupling the lazy
   * visualization work removes. A scheduler only ever owns filter *changes*.
   */
  syncExistingFilters(filters: Filter[]): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    return this.broadcast(filters, undefined);
  }

  private onFiltersChanged(filters: Filter[]): Promise<void> {
    return this.broadcast(filters, this.options.vizScheduler);
  }

  /**
   * Broadcast one filter array to the registered panels under a fresh
   * sequence number. With a scheduler, it decides which panels refresh now
   * (typically only the visible ones) and which are deferred; without one,
   * every live panel is refreshed through the bounded pool.
   */
  private async broadcast(
    filters: Filter[],
    scheduler: FilterFanOutScheduler | undefined,
  ): Promise<void> {
    if (this.destroyed) return;

    const seq = ++this.filterSequence;
    const live = [...this.panels.entries()].filter(([, p]) => !p.isDestroyed());

    if (scheduler) {
      const request: FilterFanOutRequest = {
        filters,
        sequence: seq,
        columns: live.map(([columnName]) => columnName),
        refresh: (columnName) => this.refreshColumn(columnName, filters, seq),
      };
      await scheduler.refreshOnFilters(request);
      return;
    }

    await runLimited(
      live.map(
        ([, p]) =>
          () =>
            this.callUpdateFilters(p, filters, seq),
      ),
      this.concurrency,
    );
  }

  /** The per-column update a scheduler-driven fan-out performs. Routed
   *  through `callUpdateFilters` so the destroyed / stale-sequence /
   *  error-swallowing guards apply exactly as they do on the direct path. */
  private refreshColumn(columnName: string, filters: Filter[], seq: number): Promise<void> {
    const panel = this.panels.get(columnName);
    if (!panel) return Promise.resolve();
    return this.callUpdateFilters(panel, filters, seq);
  }

  private async callUpdateFilters(
    panel: BaseStatsPanel,
    filters: Filter[],
    seq: number,
  ): Promise<void> {
    if (this.destroyed) return;
    if (seq !== this.filterSequence) return;
    if (panel.isDestroyed()) return;
    try {
      await panel.updateFilters(filters);
    } catch {
      // Swallow per-panel errors here; BaseStatsPanel implementations are
      // expected to route their own failures through `options.onError` so
      // the facade's `error` event fires with full context. We still want
      // a thrown error in one panel to leave the others intact.
    }
  }

  /** Clean up the signal subscription and clear registrations. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.panels.clear();
  }
}
