/**
 * Per-instance registry of column visualizations.
 *
 * Replaces the static `VisualizationFactory` (now deprecated) so custom
 * registrations are scoped to a single `createDataTable()` instance rather
 * than leaking across every table on the page. Consumers typically pass
 * a `VisualizationRegistry` via `createDataTable({ visualizationRegistry })`;
 * when omitted the module-scoped `defaultVisualizationRegistry` is used.
 *
 * @example
 * import {
 *   VisualizationRegistry,
 *   createDataTable,
 * } from '@jeyabbalas/data-table';
 * import { MyChoroplethVisualization } from './viz/MyChoropleth';
 *
 * const visualizationRegistry = new VisualizationRegistry();
 * visualizationRegistry.register({
 *   name: 'choropleth',
 *   VisualizationClass: MyChoroplethVisualization,
 *   match: (column) => column.name === 'fips_code',
 * });
 *
 * await createDataTable({
 *   container: '#table',
 *   data: csv,
 *   visualizationRegistry,
 * });
 *
 * @see VisualizationRegistration
 * @see VisualizationConstructor
 * @see BaseVisualization
 */

import type { ColumnSchema, DataType } from '../core/types';
import type { VisualizationOptions } from './BaseVisualization';
import { BaseVisualization } from './BaseVisualization';
import { Histogram } from './histogram';
import { DateHistogram } from './histogram';
import { TimeHistogram } from './histogram';
import { IntervalHistogram } from './histogram';
import { ValueCounts } from './valuecounts';

/**
 * Constructor signature for visualization classes.
 */
export type VisualizationConstructor = new (
  container: HTMLElement,
  column: ColumnSchema,
  options: VisualizationOptions
) => BaseVisualization;

/**
 * Registration entry for a visualization type.
 */
export interface VisualizationRegistration {
  name: string;
  isApplicable: (type: DataType) => boolean;
  constructor: VisualizationConstructor;
  /** Higher priority wins when multiple registrations match; built-ins use 0. */
  priority: number;
}

/**
 * Check if a column type is numeric (suitable for numeric histogram).
 */
export function isNumericType(type: DataType): boolean {
  return type === 'integer' || type === 'float' || type === 'decimal';
}

/**
 * Check if a column type is date/timestamp (suitable for date histogram).
 */
export function isDateType(type: DataType): boolean {
  return type === 'date' || type === 'timestamp';
}

/**
 * Check if a column type is time (suitable for time histogram).
 */
export function isTimeType(type: DataType): boolean {
  return type === 'time';
}

/**
 * Check if a column type is categorical (suitable for value counts).
 */
export function isCategoricalType(type: DataType): boolean {
  return type === 'string' || type === 'boolean' || type === 'uuid';
}

/**
 * Check if a column type is interval (suitable for interval histogram).
 */
export function isIntervalType(type: DataType): boolean {
  return type === 'interval';
}

/**
 * Per-instance registry of visualization types. Built-ins are seeded at
 * construction and on `resetToDefaults()`.
 *
 * @example
 * import { createDataTable, VisualizationRegistry } from '@jeyabbalas/data-table';
 * import { BaseVisualization } from '@jeyabbalas/data-table/advanced';
 *
 * class MyBoxPlot extends BaseVisualization {
 *   // ...fetchData(), render(), handleMouseMove(), handleClick(), handleMouseLeave()
 * }
 *
 * const registry = new VisualizationRegistry();
 * registry.register({
 *   name: 'box-plot',
 *   isApplicable: (type) => type === 'float' || type === 'integer',
 *   constructor: MyBoxPlot,
 *   priority: 10, // higher than built-ins (0) — wins for numeric columns
 * });
 *
 * const table = await createDataTable({ container, source, visualizationRegistry: registry });
 */
export class VisualizationRegistry {
  private registry: VisualizationRegistration[] = [];

  constructor() {
    this.resetToDefaults();
  }

  /**
   * Register a visualization type. Replaces any existing registration
   * with the same name.
   */
  register(registration: VisualizationRegistration): void {
    const idx = this.registry.findIndex((r) => r.name === registration.name);
    if (idx >= 0) {
      this.registry[idx] = registration;
    } else {
      this.registry.push(registration);
    }
  }

  /**
   * Unregister a visualization type by name.
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
   * Create the appropriate visualization for a column. Iterates the
   * registry by descending priority and returns the first match or null.
   */
  create(
    container: HTMLElement,
    column: ColumnSchema,
    options: VisualizationOptions
  ): BaseVisualization | null {
    const sorted = [...this.registry].sort((a, b) => b.priority - a.priority);
    for (const reg of sorted) {
      if (reg.isApplicable(column.type)) {
        return new reg.constructor(container, column, options);
      }
    }
    return null;
  }

  /**
   * Check if any registered visualization matches the column's type.
   */
  isApplicable(column: ColumnSchema): boolean {
    return this.registry.some((r) => r.isApplicable(column.type));
  }

  /**
   * List all registered visualization type names.
   */
  getRegisteredTypes(): string[] {
    return this.registry.map((r) => r.name);
  }

  /**
   * Clear the registry and re-register all built-in visualization types.
   */
  resetToDefaults(): void {
    this.registry = [];

    this.register({
      name: 'histogram',
      isApplicable: isNumericType,
      constructor: Histogram as unknown as VisualizationConstructor,
      priority: 0,
    });

    this.register({
      name: 'date-histogram',
      isApplicable: isDateType,
      constructor: DateHistogram as unknown as VisualizationConstructor,
      priority: 0,
    });

    this.register({
      name: 'time-histogram',
      isApplicable: isTimeType,
      constructor: TimeHistogram as unknown as VisualizationConstructor,
      priority: 0,
    });

    this.register({
      name: 'interval-histogram',
      isApplicable: isIntervalType,
      constructor: IntervalHistogram as unknown as VisualizationConstructor,
      priority: 0,
    });

    this.register({
      name: 'value-counts',
      isApplicable: isCategoricalType,
      constructor: ValueCounts as unknown as VisualizationConstructor,
      priority: 0,
    });
  }
}

/**
 * Shared module-scoped registry. Used by the deprecated
 * `VisualizationFactory` static wrapper and as the fallback when
 * `createDataTable()` is called without a `visualizationRegistry` option.
 */
export const defaultVisualizationRegistry = new VisualizationRegistry();

/**
 * Check if a column type has a registered visualization in the default
 * registry.
 */
export function needsVisualization(type: DataType): boolean {
  return defaultVisualizationRegistry.isApplicable({
    name: '',
    type,
    nullable: false,
    originalType: '',
  });
}
