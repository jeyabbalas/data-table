/**
 * Persistence type definitions
 *
 * Types for session snapshots stored in IndexedDB.
 * Serialized forms replace Date objects with DateWrapper for JSON round-trip fidelity.
 */

import type { SortColumn } from '../core/types';
import type { HiddenColumnInfo } from '../core/State';
import type { NullFilter, PatternFilter, RawSQLFilter } from '../filters/FilterTypes';
import type { DerivedColumnDef as _DerivedColumnDef, ExpressionColumnDef as _ExpressionColumnDef, VectorColumnDef as _VectorColumnDef } from '../derived/types';

/** Current snapshot schema version — bump when the shape changes */
export const SNAPSHOT_VERSION = 2;

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
  | PatternFilter
  | RawSQLFilter;

// Re-export derived column types from their canonical location
export type DerivedColumnDef = _DerivedColumnDef;
export type ExpressionColumnDef = _ExpressionColumnDef;
export type VectorColumnDef = _VectorColumnDef;

/**
 * A serialized StateSnapshot (undo/redo stack entry).
 *
 * Same fields as StateSnapshot but with JSON-safe types:
 * Map → Record, Date → DateWrapper (via SerializedFilter).
 */
export interface SerializedStateSnapshot {
  filters: SerializedFilter[];
  sortColumns: SortColumn[];
  visibleColumns: string[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  pinnedColumns: string[];
  hiddenColumnInfo: Record<string, HiddenColumnInfo>;
  /** Derived column definitions. Optional for backward compat with pre-existing entries. */
  derivedColumns?: DerivedColumnDef[];
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
  /** Persisted undo stack (oldest → newest). Absent in pre-v1 snapshots. */
  undoStack?: SerializedStateSnapshot[];
  /** Persisted redo stack (oldest → newest). Absent in pre-v1 snapshots. */
  redoStack?: SerializedStateSnapshot[];
}
