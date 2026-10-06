/**
 * Exact filters on JSON columns, as saved sessions and presets hold them.
 *
 * A JSON column compares its value with text by reading the text as JSON,
 * so `"doc" = 'abc'` is a Conversion Error ("Malformed JSON") that fails
 * every query the filter is in. The filter panel gives an exact filter on a
 * JSON column `valueType: 'text'`, which compares `CAST("doc" AS VARCHAR)`
 * instead. A filter saved by a version before 0.9, or written by hand,
 * may lack it; on a JSON column from a Parquet file it used to compare
 * plain text until something loaded DuckDB's json extension, which the
 * Parquet loader now loads with the table.
 */

import { parseDuckDBType } from '../core/duckdbType';
import type { ColumnSchema, Filter } from '../core/types';

/**
 * `filters`, with `valueType: 'text'` given to each point, set and not-set
 * filter on a JSON column (`originalType` JSON) that has no `valueType`: what
 * filters restored from a saved session or loaded from a preset need.
 *
 * Compared as text, a JSON value matches the same rows it matched as JSON,
 * since DuckDB compares two JSON values by their text, spacing included
 * (`'{"a": 1}'` does not match `{"a":1}` either way); text that is not JSON
 * matches nothing instead of failing. Every other filter is kept as it is:
 * on a nested column (LIST, STRUCT, MAP, …), a filter without `valueType`
 * compares by value, which is what it meant. A column `schema` does not
 * name is kept as it is too. Returns `filters` itself when nothing changed.
 *
 * @example
 * ```ts
 * const schema = [{ name: 'doc', type: 'string', nullable: true, originalType: 'JSON' }];
 * jsonFiltersAsText([{ type: 'point', column: 'doc', value: 'abc' }], schema);
 * // [{ type: 'point', column: 'doc', value: 'abc', valueType: 'text' }]
 * ```
 */
export function jsonFiltersAsText(filters: Filter[], schema: readonly ColumnSchema[]): Filter[] {
  let jsonColumns: Set<string> | undefined;
  let changed = false;
  const result = filters.map((filter) => {
    if (filter.type !== 'point' && filter.type !== 'set' && filter.type !== 'not-set') {
      return filter;
    }
    if (filter.valueType !== undefined) return filter;
    jsonColumns ??= new Set(
      schema
        .filter((column) => parseDuckDBType(column.originalType ?? '').kind === 'json')
        .map((column) => column.name),
    );
    if (!jsonColumns.has(filter.column)) return filter;
    changed = true;
    return { ...filter, valueType: 'text' as const };
  });
  return changed ? result : filters;
}
