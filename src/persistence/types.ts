/**
 * Persistence type definitions
 *
 * Types for session snapshots stored in IndexedDB.
 * Serialized forms replace Date objects with DateWrapper for JSON round-trip fidelity.
 */

import type { AnnotationFile, SeverityFilter } from '../annotations/types';
import type { HiddenColumnInfo } from '../core/State';
import type { SortColumn, ColumnHeaderTooltipContent } from '../core/types';
import type {
  DerivedColumnDef as _DerivedColumnDef,
  ExpressionColumnDef as _ExpressionColumnDef,
  VectorColumnDef as _VectorColumnDef,
  VectorDataType,
} from '../derived/types';
import type { FilterPreset } from '../filters/FilterPresetTypes';
import type { NullFilter, PatternFilter, RawSQLFilter } from '../filters/FilterTypes';

/** Current snapshot schema version — bump when the shape changes */
export const SNAPSHOT_VERSION = 5;

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

// ── Vector value pool (v4+) ─────────────────────────────────────────

/** A vector column stored by pool reference instead of inline values. */
export interface PooledVectorColumnRef {
  kind: 'vector';
  name: string;
  vectorType: VectorDataType;
  /** Key into SessionSnapshot.vectorValuePool */
  _poolRef: string;
}

/** Entry in the vector value pool. */
export interface VectorValuePoolEntry {
  vectorType: string;
  values: unknown[];
}

/**
 * Derived column in serialized form: may be inline (pre-v4) or pooled (v4+).
 * Pool references replace inline values to deduplicate vector data across
 * undo/redo stack entries.
 */
export type SerializedDerivedColumnDef =
  | ExpressionColumnDef
  | VectorColumnDef
  | PooledVectorColumnRef;

/** Type guard: true when a serialized derived column uses a pool reference. */
export function isPooledVectorRef(d: SerializedDerivedColumnDef): d is PooledVectorColumnRef {
  return d.kind === 'vector' && '_poolRef' in d;
}

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
  /** Derived column definitions. May use pool references (v4+) or inline values (pre-v4). */
  derivedColumns?: SerializedDerivedColumnDef[];
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
  /** Deduplicated vector column values shared across undo/redo stack entries. Absent in pre-v4 snapshots. */
  vectorValuePool?: Record<string, VectorValuePoolEntry>;
  /** Saved filter presets. Absent in pre-v3 snapshots. */
  filterPresets?: FilterPreset[];
  /** Saved annotations. Absent in pre-v5 snapshots. */
  annotations?: AnnotationFile;
  /**
   * Annotation severity-filter state (visual-only). Present only when the
   * user has toggled at least one severity off; the all-true default is
   * omitted to keep snapshots clean. Back-compat by absence — pre-fix
   * snapshots restore with the all-true default.
   */
  annotationSeverityFilter?: SeverityFilter;
  /**
   * App-controlled column-header tooltip overrides.
   *
   * String entries are an in-flight Phase 5 legacy format (a description-only
   * shorthand) and are normalized to `{ description: string }` on restore.
   * Object entries are validated field-by-field; malformed fields drop.
   */
  columnHeaderTooltips?: Record<string, string | ColumnHeaderTooltipContent>;
}
