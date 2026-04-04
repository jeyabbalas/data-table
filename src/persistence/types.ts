/**
 * Persistence type definitions
 *
 * Types for session snapshots stored in IndexedDB.
 * Serialized forms replace Date objects with DateWrapper for JSON round-trip fidelity.
 */

import type { SortColumn } from '../core/types';
import type { HiddenColumnInfo } from '../core/State';
import type { NullFilter, PatternFilter } from '../filters/FilterTypes';

/** Current snapshot schema version — bump when the shape changes */
export const SNAPSHOT_VERSION = 1;

/** Marker object for serialized Date instances */
export interface DateWrapper {
  __date__: string; // ISO 8601 string
}

// --- Serialized filter variants (Date replaced with DateWrapper) ---

export interface SerializedRangeFilter {
  type: 'range';
  column: string;
  min: number | string | DateWrapper;
  max: number | string | DateWrapper;
  maxInclusive?: boolean;
  minExclusive?: boolean;
}

export interface SerializedPointFilter {
  type: 'point';
  column: string;
  value: string | number | boolean | DateWrapper | null;
}

export interface SerializedSetFilter {
  type: 'set';
  column: string;
  values: unknown[];
  includeNull?: boolean;
}

export interface SerializedNotSetFilter {
  type: 'not-set';
  column: string;
  values: unknown[];
  includeNull?: boolean;
}

export type SerializedFilter =
  | SerializedRangeFilter
  | SerializedPointFilter
  | SerializedSetFilter
  | SerializedNotSetFilter
  | NullFilter
  | PatternFilter;

/** Placeholder for future derived column support (Task 8.4) */
export interface DerivedColumnDef {
  name: string;
  expression: string;
}

/** A serialized snapshot of table state, keyed by tableName in IndexedDB */
export interface SessionSnapshot {
  version: number;
  timestamp: number;
  tableName: string | null;
  filters: SerializedFilter[];
  sortColumns: SortColumn[];
  visibleColumns: string[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  pinnedColumns: string[];
  hiddenColumnInfo: Record<string, HiddenColumnInfo>;
  derivedColumns: DerivedColumnDef[];
}
