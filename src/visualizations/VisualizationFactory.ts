/**
 * VisualizationFactory - Centralized creation of column visualizations
 *
 * Provides a plugin-extensible registry for mapping DataTypes to visualization
 * constructors. Built-in registrations cover all standard column types.
 *
 * Task 4.8: Visualization Factory
 */

import type { ColumnSchema, DataType } from '../core/types';
import type { VisualizationOptions } from './BaseVisualization';
import { BaseVisualization } from './BaseVisualization';
import { Histogram } from './histogram';
import { DateHistogram } from './histogram';
import { TimeHistogram } from './histogram';
import { ValueCounts } from './valuecounts';

/**
 * Constructor signature for visualization classes
 */
export type VisualizationConstructor = new (
  container: HTMLElement,
  column: ColumnSchema,
  options: VisualizationOptions
) => BaseVisualization;

/**
 * Registration entry for a visualization type
 */
export interface VisualizationRegistration {
  name: string;
  isApplicable: (type: DataType) => boolean;
  constructor: VisualizationConstructor;
  /** Higher priority wins when multiple registrations match; built-ins use 0 */
  priority: number;
}

/**
 * Check if a column type is numeric (suitable for numeric histogram)
 */
export function isNumericType(type: DataType): boolean {
  return type === 'integer' || type === 'float' || type === 'decimal';
}

/**
 * Check if a column type is date/timestamp (suitable for date histogram)
 */
export function isDateType(type: DataType): boolean {
  return type === 'date' || type === 'timestamp';
}

/**
 * Check if a column type is time (suitable for time histogram)
 */
export function isTimeType(type: DataType): boolean {
  return type === 'time';
}

/**
 * Check if a column type is categorical (suitable for value counts)
 */
export function isCategoricalType(type: DataType): boolean {
  return type === 'string' || type === 'boolean' || type === 'uuid';
}

/**
 * Check if a column type has a registered visualization
 */
export function needsVisualization(type: DataType): boolean {
  return VisualizationFactory.isApplicable({ name: '', type, nullable: false, originalType: '' });
}

/**
 * Factory for creating visualizations based on column type.
 * Supports plugin registration with priority-based override.
 */
export class VisualizationFactory {
  private static registry: VisualizationRegistration[] = [];

  /**
   * Register a visualization type. Replaces any existing registration with the same name.
   */
  static register(registration: VisualizationRegistration): void {
    // Replace if name already exists
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
  static unregister(name: string): boolean {
    const idx = this.registry.findIndex((r) => r.name === name);
    if (idx >= 0) {
      this.registry.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Create the appropriate visualization for a column.
   * Iterates registry by descending priority, returns first match or null.
   */
  static create(
    container: HTMLElement,
    column: ColumnSchema,
    options: VisualizationOptions
  ): BaseVisualization | null {
    // Sort by descending priority
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
  static isApplicable(column: ColumnSchema): boolean {
    return this.registry.some((r) => r.isApplicable(column.type));
  }

  /**
   * List all registered visualization type names.
   */
  static getRegisteredTypes(): string[] {
    return this.registry.map((r) => r.name);
  }

  /**
   * Clear the registry and re-register all built-in visualization types.
   */
  static resetToDefaults(): void {
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
      name: 'value-counts',
      isApplicable: isCategoricalType,
      constructor: ValueCounts as unknown as VisualizationConstructor,
      priority: 0,
    });
  }
}

// Auto-register built-in visualizations at module load
VisualizationFactory.resetToDefaults();
