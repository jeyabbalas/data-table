/**
 * BaseStatsPanel - Abstract base class for custom column stats panels.
 *
 * Sits in the same `.dt-col-stats` slot as the library's built-in two-line
 * default formatter, but lets a downstream app render whatever it wants
 * there (custom DuckDB stats, domain-specific badges, alternate locales,
 * progress bars, ...).
 *
 * Mounted by the facade alongside each column visualization. Receives the
 * same {@link ColumnStatsData} the visualizations already compute via
 * `update()`, plus filter-aware `updateFilters()` callbacks the panel can
 * use to issue its own queries against `options.bridge`.
 *
 * @example
 * ```ts
 * import {
 *   BaseStatsPanel,
 *   type StatsPanelOptions,
 *   type ColumnStatsData,
 * } from '@jeyabbalas/data-table/advanced';
 * import { filtersToWhereClause } from '@jeyabbalas/data-table';
 * import type { ColumnSchema } from '@jeyabbalas/data-table';
 *
 * class MeanStdPanel extends BaseStatsPanel {
 *   private mean: number | null = null;
 *   private std: number | null = null;
 *
 *   constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) {
 *     super(container, column, options);
 *     void this.refresh();
 *   }
 *
 *   update(stats: ColumnStatsData | null): void { this.paint(stats); }
 *
 *   async updateFilters(filters): Promise<void> {
 *     await super.updateFilters(filters);
 *     await this.refresh();
 *   }
 *
 *   private async refresh(): Promise<void> {
 *     const where = filtersToWhereClause(this.options.filters);
 *     const sql = `SELECT AVG("${this.column.name}") m, STDDEV("${this.column.name}") s
 *                  FROM "${this.options.tableName}"
 *                  ${where ? 'WHERE ' + where : ''}`;
 *     const [row] = await this.options.bridge.query<{ m: number; s: number }>(sql);
 *     this.mean = row?.m ?? null;
 *     this.std = row?.s ?? null;
 *     this.paint(null);
 *   }
 *
 *   private paint(_stats: ColumnStatsData | null): void {
 *     this.container.textContent = `μ=${this.mean} · σ=${this.std}`;
 *   }
 *
 *   destroy(): void { this.container.replaceChildren(); super.destroy(); }
 * }
 * ```
 *
 * @see StatsPanelRegistry for registering custom subclasses.
 * @see StatsPanelCoordinator for the filter-broadcast plumbing.
 */

import type { DataTableError } from '../core/errors';
import type { Strings } from '../core/Strings';
import type { ColumnSchema, Filter } from '../core/types';
import type { WorkerBridge } from '../data/WorkerBridge';
import type { ColumnStatsData } from '../statistics/ColumnStatsTypes';

/**
 * Stage where a stats-panel error originated. Surfaced on the `error`
 * event payload via `context.phase`.
 */
export type StatsPanelErrorPhase = 'construct' | 'update' | 'hover' | 'fetch' | 'destroy';

/**
 * Context passed to {@link StatsPanelOptions.onError} so listeners can
 * disambiguate stats-panel errors from visualization or load errors. The
 * facade re-emits these on its `error` event with `source: 'stats-panel'`.
 */
export interface StatsPanelErrorContext {
  source: 'stats-panel';
  column: string;
  phase: StatsPanelErrorPhase;
}

/**
 * Options passed to a stats panel constructor and refreshed on filter
 * changes. Mirrors the shape of {@link VisualizationOptions} so panel
 * authors can reach the same DuckDB worker, filter array, and i18n strings
 * the visualizations use.
 */
export interface StatsPanelOptions {
  /** Name of the DuckDB table the panel can query. */
  tableName: string;
  /** Bridge for executing custom SQL against DuckDB-WASM. */
  bridge: WorkerBridge;
  /** Currently active filters. Refreshed on each `updateFilters` call. */
  filters: Filter[];
  /** Resolved i18n strings; use these to localize any text the panel renders. */
  messages: Strings;
  /**
   * Called when the panel fails to fetch, render, or update. The facade
   * routes these to the `error` event with `source: 'statsPanel'`.
   */
  onError?: (error: DataTableError, context: StatsPanelErrorContext) => void;
}

/**
 * Abstract base class for column stats panels.
 *
 * Subclasses must implement {@link update}; everything else has a sensible
 * default. The library guarantees:
 *
 * - The constructor is called with an empty `container` element (the
 *   `.dt-col-stats` slot inside a column header).
 * - {@link update} fires with `null` once on mount, then with each
 *   `ColumnStatsData` the visualization for this column emits (and on data
 *   reload). Columns without a visualization receive `update(null)` only.
 * - {@link updateFilters} fires every time the table's active filter array
 *   changes, before any subsequent `update(stats)` call from a viz refetch.
 * - {@link setHoverStats} fires when a viz emits a hover snippet for this
 *   column (and again with `null` to clear). Columns without a viz never
 *   trigger this.
 * - {@link destroy} is called exactly once, before the container is reused
 *   for a freshly-constructed panel (e.g. on a schema change). Subclasses
 *   are responsible for clearing any DOM nodes they appended.
 */
export abstract class BaseStatsPanel {
  protected readonly container: HTMLElement;
  protected readonly column: ColumnSchema;
  protected options: StatsPanelOptions;
  protected destroyed = false;

  constructor(container: HTMLElement, column: ColumnSchema, options: StatsPanelOptions) {
    this.container = container;
    this.column = column;
    this.options = options;
  }

  /**
   * Called when default stats become available or change. Receives `null`
   * on the initial render before the visualization has fetched (or when no
   * visualization is registered for the column).
   */
  abstract update(stats: ColumnStatsData | null): void;

  /**
   * Called when the user hovers a visualization bin / segment. `null`
   * clears the hover and signals the panel should restore its resting state.
   *
   * The argument is an **HTML string**, not plain text — the same pre-
   * formatted markup the library's built-in panel briefly renders in place
   * of the second line (e.g.
   * `<span class="stats-label">Bin:</span><br>...`). The library's bundled
   * visualizations escape every user-derived value before producing this
   * string (see `escapeHTML` calls inside `Histogram` / `ValueCounts`); a
   * panel writing the value via `innerHTML` is trusting the visualization
   * to have done that escaping.
   *
   * Custom visualizations that emit their own hover snippets are
   * responsible for escaping any user-derived text before passing it to
   * `onStatsChange`. Panels that only want plain text should write the
   * value via `textContent`, which strips the markup safely (line breaks
   * and label styling will be lost, but XSS-safe by construction).
   *
   * Default implementation is a no-op so simple panels can ignore hover.
   */
  setHoverStats(_html: string | null): void {
    // no-op default
  }

  /**
   * Called when the table's active filter array changes. The default
   * implementation only refreshes `this.options.filters`; subclasses that
   * compute their own statistics should override this to issue queries via
   * `this.options.bridge`. The visualization is guaranteed to call
   * {@link update} with the refreshed `ColumnStatsData` separately, so
   * panels that only re-render existing stats need not override.
   */
  async updateFilters(filters: Filter[]): Promise<void> {
    if (this.destroyed) return;
    this.options = { ...this.options, filters };
  }

  /**
   * Tear down the panel. Subclasses must clear any DOM nodes they appended
   * to `container` and any subscriptions or listeners they registered, then
   * call `super.destroy()`. The library does not clear the container for
   * the panel; that is the panel's responsibility.
   *
   * The library calls `destroy()` exactly once on its own teardown path
   * (schema change, table destroy). Panels should **not** call `destroy()`
   * on themselves — the library tracks active panels in a name-keyed map
   * and a self-destroy leaves a dangling registration whose
   * `.dt-col-stats` slot is no longer eligible for fallback rendering.
   * Use `setHoverStats` / `update` to express resting / loading / empty
   * states instead, and let the library's lifecycle drive `destroy()`.
   */
  destroy(): void {
    this.destroyed = true;
  }

  /** True after {@link destroy} has been called. */
  isDestroyed(): boolean {
    return this.destroyed;
  }

  /** The column this panel renders stats for. */
  getColumn(): ColumnSchema {
    return this.column;
  }
}
