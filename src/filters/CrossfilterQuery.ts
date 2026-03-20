import type { Filter } from '../core/types';

export interface CrossfilterSplit {
  /** Filters excluding the target column (for background/unfiltered view).
   *  Empty array if the column has no filter (signals "no crossfilter distinction"). */
  background: Filter[];
  /** All filters unchanged (for foreground/filtered view) */
  foreground: Filter[];
  /** Whether any filter targets the given column */
  hasOwnFilter: boolean;
}

export function splitCrossfilterFilters(
  filters: Filter[],
  column: string
): CrossfilterSplit {
  const hasOwnFilter = filters.some((f) => f.column === column);
  return {
    background: hasOwnFilter
      ? filters.filter((f) => f.column !== column)
      : [],
    foreground: filters,
    hasOwnFilter,
  };
}
