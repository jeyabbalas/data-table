/**
 * Derived Column Type Definitions
 *
 * Types for virtual, mutable columns layered over immutable source data.
 * Two kinds: expression columns (DuckDB SQL) and vector columns (JS arrays).
 */

import type { DataType } from '../core/types';

/** Discriminant for derived column kind */
export type DerivedColumnKind = 'expression' | 'vector';

/** Supported types for pre-computed vector data (matches DataType) */
export type VectorDataType =
  | 'integer'
  | 'float'
  | 'decimal'
  | 'string'
  | 'boolean'
  | 'uuid'
  | 'date'
  | 'timestamp'
  | 'time'
  | 'interval';

/** SQL expression column — DuckDB evaluates the expression */
export interface ExpressionColumnDef {
  kind: 'expression';
  name: string;
  expression: string;
}

/** Pre-computed vector column — values provided by JavaScript */
export interface VectorColumnDef {
  kind: 'vector';
  name: string;
  vectorType: VectorDataType;
  values: ArrayLike<number> | ArrayLike<string> | ArrayLike<boolean>;
}

/** Union of both derived column kinds */
export type DerivedColumnDef = ExpressionColumnDef | VectorColumnDef;

/** Runtime metadata after adding a column — extends the def with detected DuckDB info */
export interface DerivedColumnInfo {
  def: DerivedColumnDef;
  detectedType: DataType;
  detectedOriginalType: string;
}

/**
 * Completion context exposed for expression editor autocompletion.
 * Downstream apps can use this with CodeMirror or similar editors.
 */
export interface CompletionContext {
  columns: { name: string; type: string; isDerived: boolean }[];
  functions?: string[];
}
