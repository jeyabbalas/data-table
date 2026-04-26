/**
 * Per-instance registry of column stats panels.
 *
 * Mirrors {@link VisualizationRegistry} for the column-stats slot:
 * downstream apps register a {@link BaseStatsPanel} subclass, scoped to
 * one or more {@link DataType}s, and the facade will route stats data and
 * filter changes to that panel for matching columns. When no registration
 * matches a column's type, the library falls back to its built-in
 * `formatDefaultStats()` HTML — so this registry starts **empty** and
 * downstream apps only register what they want to override.
 *
 * Consumers typically pass a `StatsPanelRegistry` via
 * `createDataTable({ statsPanelRegistry })`; when omitted the
 * module-scoped {@link defaultStatsPanelRegistry} is used (which is also
 * empty by default — register on it to share custom panels across every
 * table that doesn't specify its own registry).
 *
 * @example
 * ```ts
 * import {
 *   createDataTable,
 *   StatsPanelRegistry,
 * } from '@jeyabbalas/data-table';
 * import { MeanStdPanel } from './stats/MeanStdPanel';
 *
 * const statsPanelRegistry = new StatsPanelRegistry();
 * statsPanelRegistry.register({
 *   name: 'mean-std',
 *   isApplicable: (type) => type === 'integer' || type === 'float' || type === 'decimal',
 *   constructor: MeanStdPanel,
 *   priority: 10,
 * });
 *
 * await createDataTable({
 *   container: '#table',
 *   source,
 *   statsPanelRegistry,
 * });
 * ```
 *
 * To restrict a panel to a specific column name (the type filter only
 * receives `DataType`), subclass `StatsPanelRegistry` and override
 * `create()` — same pattern as `examples/08-custom-visualization/`.
 *
 * @see BaseStatsPanel
 * @see StatsPanelRegistration
 * @see StatsPanelConstructor
 */

import type { ColumnSchema, DataType } from '../core/types';
import type { BaseStatsPanel, StatsPanelOptions } from './BaseStatsPanel';

/**
 * Constructor signature for stats panel classes. Mirrors
 * {@link VisualizationConstructor}.
 */
export type StatsPanelConstructor = new (
  container: HTMLElement,
  column: ColumnSchema,
  options: StatsPanelOptions,
) => BaseStatsPanel;

/**
 * Registration entry for a stats panel.
 */
export interface StatsPanelRegistration {
  /** Stable identifier; same-name re-register replaces the existing entry. */
  name: string;
  /** Predicate: should this panel handle a column of the given type? */
  isApplicable: (type: DataType) => boolean;
  /** The panel class to instantiate when {@link isApplicable} returns true. */
  constructor: StatsPanelConstructor;
  /**
   * Higher priority wins when multiple registrations match. There are no
   * library built-ins (the default HTML formatter is the implicit
   * fallback), so any positive number is enough to take effect; use
   * higher numbers to layer overrides.
   */
  priority: number;
}

/**
 * Per-instance registry of stats panels. Empty by default — add
 * registrations only for the column types you want to override.
 *
 * @example
 * ```ts
 * import {
 *   createDataTable,
 *   StatsPanelRegistry,
 * } from '@jeyabbalas/data-table';
 * import { BaseStatsPanel } from '@jeyabbalas/data-table/advanced';
 *
 * class MeanStdPanel extends BaseStatsPanel {
 *   update(stats) { ... }
 * }
 *
 * const registry = new StatsPanelRegistry();
 * registry.register({
 *   name: 'mean-std',
 *   isApplicable: (type) => type === 'float' || type === 'integer',
 *   constructor: MeanStdPanel,
 *   priority: 10,
 * });
 *
 * await createDataTable({ container, source, statsPanelRegistry: registry });
 * ```
 */
export class StatsPanelRegistry {
  private registry: StatsPanelRegistration[] = [];

  /**
   * Register a stats panel type. Replaces any existing registration with
   * the same name.
   */
  register(registration: StatsPanelRegistration): void {
    const idx = this.registry.findIndex((r) => r.name === registration.name);
    if (idx >= 0) {
      this.registry[idx] = registration;
    } else {
      this.registry.push(registration);
    }
  }

  /**
   * Unregister a stats panel type by name.
   * @returns true if a registration was removed
   */
  unregister(name: string): boolean {
    const idx = this.registry.findIndex((r) => r.name === name);
    if (idx >= 0) {
      this.registry.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Create the appropriate stats panel for a column. Iterates the registry
   * by descending priority and returns the first match, or null when no
   * registration applies (the facade then falls back to the library's
   * built-in HTML formatter).
   */
  create(
    container: HTMLElement,
    column: ColumnSchema,
    options: StatsPanelOptions,
  ): BaseStatsPanel | null {
    const sorted = [...this.registry].sort((a, b) => b.priority - a.priority);
    for (const reg of sorted) {
      if (reg.isApplicable(column.type)) {
        return new reg.constructor(container, column, options);
      }
    }
    return null;
  }

  /**
   * Check whether any registered panel matches the column's type. Useful
   * for callers that want to short-circuit before constructing
   * {@link StatsPanelOptions}.
   */
  isApplicable(column: ColumnSchema): boolean {
    return this.registry.some((r) => r.isApplicable(column.type));
  }

  /** List all registered panel names. */
  getRegisteredTypes(): string[] {
    return this.registry.map((r) => r.name);
  }

  /**
   * Empty the registry. Mirror of {@link VisualizationRegistry.resetToDefaults}
   * — there are no library built-ins for stats panels, so this just clears
   * everything that was registered.
   */
  resetToDefaults(): void {
    this.registry = [];
  }
}

/**
 * Shared module-scoped registry. Used as the fallback when
 * `createDataTable()` is called without a `statsPanelRegistry` option.
 * Empty by default.
 */
export const defaultStatsPanelRegistry = new StatsPanelRegistry();
