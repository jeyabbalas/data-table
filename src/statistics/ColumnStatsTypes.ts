/**
 * ColumnStatsTypes - Typed stats interfaces for column header stats panel
 *
 * Discriminated union of stats interfaces, one per type family.
 * Each visualization emits the appropriate stats type via onDefaultStatsChange.
 */

import { ConfigurationError } from '../core/errors';
import type { DataType } from '../core/types';

/**
 * Base stats shared by all column types.
 * Answers: "How much data? Any quality issues?"
 */
export interface BaseColumnStats {
  /** Total row count (unfiltered when filteredTotalRows is set, otherwise current) */
  totalRows: number;
  /** Count of non-null values in the (possibly filtered) column */
  nonNullCount: number;
  /** Count of null values in the (possibly filtered) column */
  nullCount: number;
  /** Total rows in filtered view, or null if no filter is active */
  filteredTotalRows: number | null;
}

/**
 * Stats for numeric columns (integer, float, decimal).
 * Line 2: "min 0 · med 42 · max 1.2K"
 */
export interface NumericColumnStats extends BaseColumnStats {
  kind: 'numeric';
  min: number | null;
  max: number | null;
  median: number | null;
  distinctCount: number;
}

/**
 * Stats for categorical columns (string, boolean, uuid).
 * Line 2 varies by DataType:
 * - string: "12 unique" or "all unique"
 * - boolean: "67% true"
 * - uuid: "1,234 unique (100%)" or "all unique"
 */
export interface CategoricalColumnStats extends BaseColumnStats {
  kind: 'categorical';
  distinctCount: number;
  /** Count of true values (boolean columns only) */
  trueCount?: number;
}

/**
 * Stats for date and timestamp columns.
 * Line 2: "2020-01-01 – 2024-12-31"
 */
export interface TemporalColumnStats extends BaseColumnStats {
  kind: 'temporal';
  /** Minimum date/timestamp as ISO string, or null if all null */
  min: string | null;
  /** Maximum date/timestamp as ISO string, or null if all null */
  max: string | null;
}

/**
 * Stats for time columns.
 * Line 2: "08:00 – 23:45"
 */
export interface TimeColumnStats extends BaseColumnStats {
  kind: 'time';
  /** Minimum time as seconds from midnight, or null if all null */
  minSeconds: number | null;
  /** Maximum time as seconds from midnight, or null if all null */
  maxSeconds: number | null;
}

/**
 * Stats for interval columns.
 * Line 2: "min 2h · med 8h · max 48h"
 */
export interface IntervalColumnStats extends BaseColumnStats {
  kind: 'interval';
  /** Pre-formatted minimum interval from DuckDB */
  minDisplay: string | null;
  /** Pre-formatted maximum interval from DuckDB */
  maxDisplay: string | null;
  /** Pre-formatted median interval from DuckDB */
  medianDisplay: string | null;
}

/**
 * Discriminated union of all column stats types.
 * Switch on `stats.kind` for type-safe formatting.
 */
export type ColumnStatsData =
  | NumericColumnStats
  | CategoricalColumnStats
  | TemporalColumnStats
  | TimeColumnStats
  | IntervalColumnStats;

/**
 * Map from DataType to the appropriate stats kind.
 */
export function statsKindForDataType(dataType: DataType): ColumnStatsData['kind'] {
  switch (dataType) {
    case 'integer':
    case 'float':
    case 'decimal':
      return 'numeric';
    case 'string':
    case 'boolean':
    case 'uuid':
      return 'categorical';
    case 'date':
    case 'timestamp':
      return 'temporal';
    case 'time':
      return 'time';
    case 'interval':
      return 'interval';
    default: {
      const _exhaustive: never = dataType;
      throw new ConfigurationError(`Unknown DataType: ${_exhaustive as string}`, {
        code: 'INVARIANT',
      });
    }
  }
}
