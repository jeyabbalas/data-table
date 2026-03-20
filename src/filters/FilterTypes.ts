/**
 * Discriminated union types for filters
 *
 * Replaces the old `{ type: string; value: unknown }` with proper
 * per-type interfaces so consumers get type-safe property access.
 */

export interface RangeFilter {
  type: 'range';
  column: string;
  min: number | string | Date;
  max: number | string | Date;
}

export interface PointFilter {
  type: 'point';
  column: string;
  value: unknown;
}

export interface SetFilter {
  type: 'set';
  column: string;
  values: unknown[];
}

export interface NotSetFilter {
  type: 'not-set';
  column: string;
  values: unknown[];
}

export interface NullFilter {
  type: 'null' | 'not-null';
  column: string;
}

export interface PatternFilter {
  type: 'pattern';
  column: string;
  pattern: string;
  mode: 'contains' | 'starts' | 'ends' | 'regex';
}

export type Filter = RangeFilter | PointFilter | SetFilter | NotSetFilter | NullFilter | PatternFilter;
export type FilterType = Filter['type'];
