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

import type { TableState } from '../core/State';
import type { Filter } from '../core/types';
import type { BaseStatsPanel } from './BaseStatsPanel';

/**
 * Default max number of panel updates in flight at once. Sized
 * independently of the visualization fan-out cap because a panel may issue
 * its own DuckDB queries (mean+stddev, top value, ...) and we don't want
 * to flood the single-threaded worker on wide tables.
 */
const DEFAULT_PANEL_CONCURRENCY = 4;

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

  constructor(state: TableState, concurrency: number = DEFAULT_PANEL_CONCURRENCY) {
    this.concurrency = Math.max(1, concurrency);
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
   * Useful after registering new panels so they see filters that were
   * already in state (e.g., restored from persistence) before the
   * coordinator was created or the panel was registered.
   */
  syncExistingFilters(filters: Filter[]): void {
    if (this.destroyed) return;
    void this.onFiltersChanged(filters);
  }

  private async onFiltersChanged(filters: Filter[]): Promise<void> {
    if (this.destroyed) return;

    const seq = ++this.filterSequence;
    const tasks = [...this.panels.values()]
      .filter((p) => !p.isDestroyed())
      .map((p) => () => this.callUpdateFilters(p, filters, seq));

    await this.runLimited(tasks);
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

  /**
   * Run async tasks with a ceiling on simultaneous in-flight count.
   * Mirrors the implementation in `CrossfilterCoordinator` so behavior
   * stays consistent across the two coordinators.
   */
  private async runLimited(tasks: (() => Promise<void>)[]): Promise<void> {
    if (tasks.length === 0) return;
    let cursor = 0;
    const workerCount = Math.min(this.concurrency, tasks.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= tasks.length) return;
        await tasks[i]!();
      }
    });
    await Promise.all(workers);
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
