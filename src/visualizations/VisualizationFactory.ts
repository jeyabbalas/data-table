/**
 * @deprecated Use `VisualizationRegistry` (per-instance) instead. This
 * static wrapper forwards to `defaultVisualizationRegistry` and will be
 * removed in a future minor release.
 *
 * See `./VisualizationRegistry.ts` for the replacement — pass
 * `visualizationRegistry` to `createDataTable()` to scope custom
 * registrations to a single table.
 */

import type { ColumnSchema } from '../core/types';
import type { VisualizationOptions } from './BaseVisualization';
import type { BaseVisualization } from './BaseVisualization';
import {
  defaultVisualizationRegistry,
  type VisualizationRegistration,
} from './VisualizationRegistry';

// Re-export type predicates and registration types so existing imports
// from this module keep working until the wrapper is removed.
export {
  isNumericType,
  isDateType,
  isTimeType,
  isCategoricalType,
  isIntervalType,
  needsVisualization,
  type VisualizationRegistration,
  type VisualizationConstructor,
} from './VisualizationRegistry';

let hasWarned = false;
function warnOnce(): void {
  if (hasWarned) return;
  hasWarned = true;
  // eslint-disable-next-line no-console
  console.warn(
    'VisualizationFactory is deprecated; use `VisualizationRegistry` and pass ' +
      '`visualizationRegistry` to `createDataTable()`. The static wrapper will be ' +
      'removed in a future minor release.',
  );
}

/**
 * @deprecated Static wrapper that forwards to `defaultVisualizationRegistry`.
 * Prefer constructing a `VisualizationRegistry` instance per table.
 */
export class VisualizationFactory {
  /** @deprecated Use `VisualizationRegistry#register` on an instance. */
  static register(registration: VisualizationRegistration): void {
    warnOnce();
    defaultVisualizationRegistry.register(registration);
  }

  /** @deprecated Use `VisualizationRegistry#unregister` on an instance. */
  static unregister(name: string): boolean {
    warnOnce();
    return defaultVisualizationRegistry.unregister(name);
  }

  /** @deprecated Use `VisualizationRegistry#create` on an instance. */
  static create(
    container: HTMLElement,
    column: ColumnSchema,
    options: VisualizationOptions,
  ): BaseVisualization | null {
    warnOnce();
    return defaultVisualizationRegistry.create(container, column, options);
  }

  /** @deprecated Use `VisualizationRegistry#isApplicable` on an instance. */
  static isApplicable(column: ColumnSchema): boolean {
    warnOnce();
    return defaultVisualizationRegistry.isApplicable(column);
  }

  /** @deprecated Use `VisualizationRegistry#getRegisteredTypes` on an instance. */
  static getRegisteredTypes(): string[] {
    warnOnce();
    return defaultVisualizationRegistry.getRegisteredTypes();
  }

  /** @deprecated Use `VisualizationRegistry#resetToDefaults` on an instance. */
  static resetToDefaults(): void {
    warnOnce();
    defaultVisualizationRegistry.resetToDefaults();
  }
}
