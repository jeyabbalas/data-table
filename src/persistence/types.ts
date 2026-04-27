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

/** JSON-safe form of {@link RangeFilter}: any `Date` operand becomes a {@link DateWrapper}. */
export interface SerializedRangeFilter {
  type: 'range';
  column: string;
  min: number | string | DateWrapper;
  max: number | string | DateWrapper;
  maxInclusive?: boolean;
  minExclusive?: boolean;
}

/** JSON-safe form of {@link PointFilter}: any `Date` operand becomes a {@link DateWrapper}. */
export interface SerializedPointFilter {
  type: 'point';
  column: string;
  value: string | number | boolean | DateWrapper | null;
}

/** JSON-safe form of {@link SetFilter}; values pass through `serializeValue`. */
export interface SerializedSetFilter {
  type: 'set';
  column: string;
  values: unknown[];
  includeNull?: boolean;
}

/** JSON-safe form of {@link NotSetFilter}; values pass through `serializeValue`. */
export interface SerializedNotSetFilter {
  type: 'not-set';
  column: string;
  values: unknown[];
  includeNull?: boolean;
}

/**
 * Discriminated union of every {@link Filter} after JSON normalization. Used
 * by {@link SessionStore}, {@link FilterPresetManager}, and any consumer
 * round-tripping filter state through their own storage (URL params, cloud
 * sync). Filters whose runtime form is already JSON-safe (`NullFilter`,
 * `PatternFilter`, `RawSQLFilter`) flow through unchanged.
 */
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

// ── Vector value pool (v4+) ─────────────────────────────────────────

/**
 * A vector column stored by pool reference instead of inline values.
 *
 * `_poolRef` is a synthetic key (`vp_0`, `vp_1`, …) into the snapshot's
 * `vectorValuePool`. Multiple stack entries that refer to the same vector
 * column share the same key, so the values array is materialised exactly
 * once per snapshot.
 */
export interface PooledVectorColumnRef {
  kind: 'vector';
  name: string;
  vectorType: VectorDataType;
  /** Key into SessionSnapshot.vectorValuePool */
  _poolRef: string;
}

/**
 * Entry in the vector value pool.
 *
 * **Dedup is reference-identity, not content-hash.** `snapshotFromState`
 * walks the undo/redo stacks once and groups entries by JS array reference
 * (`Map<ArrayLike, key>`); two entries that hold the same array literal
 * but different references each produce their own pool entry. This
 * intentionally trades a small storage redundancy on the rare
 * "structurally-identical-but-distinct" case for O(n) snapshot
 * serialisation — `captureSnapshot` (`src/core/UndoManager.ts`) reuses the
 * derived-column array ref across stack entries that didn't mutate the
 * vector, so reference identity covers the common case.
 *
 * Consumers building their own undo stacks via the `/advanced` entry get
 * dedup only when they share array references explicitly.
 */
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
  | _ExpressionColumnDef
  | _VectorColumnDef
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
