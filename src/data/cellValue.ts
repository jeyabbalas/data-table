/**
 * One cell's exact value, as JSON text.
 *
 * `actions.getCellValue` and the value inspector read a nested value (a
 * LIST, ARRAY, STRUCT, MAP, UNION or VARIANT), and the inspector a JSON
 * document too, through {@link fetchCellJson}: one query, by `__rowid__`,
 * that selects the value as the exact JSON text {@link jsonValueSQL} writes,
 * and the length of that text. The text crosses the worker boundary as a
 * plain string, never through Arrow's nested values, and `parseJsonTree`
 * reads it on the main thread.
 *
 * A value can be long: a 10,000-item list is some 50,000 characters of JSON,
 * a 768-float embedding some 15,000. `maxChars` cuts the text inside the
 * query, so no more than that crosses the worker boundary, and the length of
 * the whole text comes back beside it.
 *
 * {@link readJsonValue} turns such text into JS values, for value reads and
 * JSON exports.
 */

import type { DuckDBTypeNode } from '../core/duckdbType';
import { QueryError } from '../core/errors';
import { materialize, parseJsonTree } from '../core/jsonTree';
import { ROWID_COLUMN, type ColumnSchema } from '../core/types';
import { quoteIdentifier } from '../filters/FilterSQL';
import { jsonValueSQL } from './valueSql';
import type { WorkerBridge } from './WorkerBridge';

/** The largest `__rowid__` there can be: the loaders make the column a BIGINT. */
const MAX_ROWID = 9223372036854775807n;

/**
 * A cell's value as JSON text, as {@link fetchCellJson} reads it for a row
 * that exists.
 */
export interface CellJson {
  /**
   * The value as JSON text (see `jsonValueSQL`), or its first `maxChars`
   * characters when it is longer; `null` when the value is SQL NULL. Read it
   * with `parseJsonTree`, which also reads text that was cut short.
   */
  text: string | null;
  /** Whether `text` was cut at `maxChars`. */
  truncated: boolean;
  /**
   * The characters of the whole JSON text; 0 for NULL. DuckDB counts code
   * points, so an emoji counts once here, and twice in JavaScript's
   * `text.length`, which counts UTF-16 code units.
   */
  totalChars: number;
}

/** Options for {@link fetchCellJson}. */
export interface FetchCellJsonOptions {
  /**
   * The most characters of JSON text to fetch, counted as DuckDB counts
   * them, in code points (see {@link CellJson.totalChars}). Longer text is
   * cut inside the query, and `truncated` says so. A non-negative integer;
   * leave it out to fetch the whole text.
   */
  maxChars?: number | undefined;
  /** Aborts the query, which then rejects with a `QueryError` coded `QUERY_ABORTED`. */
  signal?: AbortSignal | undefined;
}

/**
 * Whether `rowId` can be a `__rowid__`: a non-negative safe integer, or a
 * non-negative bigint within the BIGINT range.
 *
 * @example
 * ```ts
 * isRowId(3);    // true
 * isRowId(3n);   // true
 * isRowId(1.5);  // false
 * isRowId(-1);   // false
 * ```
 */
export function isRowId(rowId: unknown): rowId is number | bigint {
  if (typeof rowId === 'number') return Number.isSafeInteger(rowId) && rowId >= 0;
  if (typeof rowId === 'bigint') return rowId >= 0n && rowId <= MAX_ROWID;
  return false;
}

/**
 * `rowId` as a SQL literal, its decimal digits: `1234`.
 *
 * @throws `QueryError` with `code: 'INVALID_ROWID'` and `details: { rowId }`
 *   when `rowId` is not one {@link isRowId} accepts.
 *
 * @example
 * ```ts
 * rowIdLiteral(42n); // '42'
 * rowIdLiteral(-1);  // throws QueryError INVALID_ROWID
 * ```
 */
export function rowIdLiteral(rowId: number | bigint): string {
  if (!isRowId(rowId)) {
    throw new QueryError(
      `Invalid rowId: ${String(rowId)} (must be a non-negative safe integer, or a bigint from 0 to 2^63 - 1)`,
      { code: 'INVALID_ROWID', details: { rowId } },
    );
  }
  // A safe integer prints as its digits, never in exponent form.
  return rowId.toString();
}

/**
 * Read one cell's value as exact JSON text, with the length of that text.
 *
 * `table` is the relation to read (`state.tableName`, a derived-column VIEW
 * included) and `column` its schema entry; the value is selected as
 * {@link jsonValueSQL} writes it, which suits any column, though the
 * library uses it for nested and JSON columns. One query, in which DuckDB
 * builds the JSON text once, whatever refers to it (its common-subexpression
 * pass computes it in a projection of its own):
 *
 * ```sql
 * SELECT CASE WHEN length(J) > 2097152 THEN left(J, 2097152) ELSE J END AS "json",
 *        length(J) AS "chars"
 * FROM "t" WHERE "__rowid__" = 1234
 * ```
 *
 * Without `maxChars`, `J` itself is selected. The query skips the bridge's
 * result cache, which must not keep texts that can run to megabytes, and
 * runs ahead of queued normal-priority work (column charts, stats).
 *
 * @returns `undefined` when no row has that rowid; `{ text: null,
 *   truncated: false, totalChars: 0 }` when the value is SQL NULL.
 * @throws `QueryError` with `code: 'INVALID_ROWID'` when `rowId` is not a
 *   non-negative integer within the BIGINT range, and `INVALID_MAX_CHARS`
 *   when `maxChars` is not a non-negative integer; and whatever the query
 *   rejects with (`QUERY_ABORTED` when `signal` aborts it).
 *
 * @example
 * ```ts
 * const cell = await fetchCellJson(bridge, 'trips', column, 1234n, { maxChars: 2 * 1024 * 1024 });
 * if (cell?.text != null) {
 *   const { root, truncated } = parseJsonTree(cell.text);
 *   // truncated === cell.truncated, unless the column's own JSON was malformed
 * }
 * ```
 */
export async function fetchCellJson(
  bridge: WorkerBridge,
  table: string,
  column: ColumnSchema,
  rowId: number | bigint,
  options: FetchCellJsonOptions = {},
): Promise<CellJson | undefined> {
  const id = rowIdLiteral(rowId);
  const { maxChars, signal } = options;
  if (maxChars !== undefined && !(Number.isSafeInteger(maxChars) && maxChars >= 0)) {
    throw new QueryError(`Invalid maxChars: ${maxChars} (must be a non-negative integer)`, {
      code: 'INVALID_MAX_CHARS',
      details: { maxChars },
    });
  }

  const json = jsonValueSQL(column, quoteIdentifier(column.name));
  const text =
    maxChars === undefined
      ? json
      : `CASE WHEN length(${json}) > ${maxChars} THEN left(${json}, ${maxChars}) ELSE ${json} END`;
  const sql =
    `SELECT ${text} AS "json", length(${json}) AS "chars"` +
    ` FROM ${quoteIdentifier(table)} WHERE ${quoteIdentifier(ROWID_COLUMN)} = ${id}`;

  const rows = await bridge.query<{ json: unknown; chars: unknown }>(sql, signal, {
    priority: 'high',
    cache: false,
  });
  const row = rows[0];
  if (row === undefined) return undefined;
  if (row.json === null || row.json === undefined) {
    return { text: null, truncated: false, totalChars: 0 };
  }
  // The worker posts the BIGINT length as a number; a bridge that keeps
  // BigInts would give a bigint.
  const totalChars = Number(row.chars);
  return {
    text: String(row.json),
    truncated: maxChars !== undefined && totalChars > maxChars,
    totalChars,
  };
}

// ---------------------------------------------------------------------------
// Reading the text
// ---------------------------------------------------------------------------

/**
 * Scalar types whose every value the platform's `JSON.parse` reads as
 * `materialize` does, by the upper-case name `parseDuckDBType` gives them:
 * integers that cannot pass 2^53, FLOAT and DOUBLE, and BOOLEAN. Not the
 * wider integers or DECIMAL, which `materialize` keeps exact, nor text,
 * dates, times, UUIDs and the like, which `to_json` writes as strings or as
 * numbers that `materialize` keeps as text.
 */
const NATIVE_SCALAR_NAMES: ReadonlySet<string> = new Set([
  'BOOLEAN',
  'BOOL',
  'LOGICAL',
  'TINYINT',
  'INT1',
  'SMALLINT',
  'INT2',
  'SHORT',
  'INTEGER',
  'INT4',
  'INT',
  'SIGNED',
  'UTINYINT',
  'USMALLINT',
  'UINTEGER',
  'FLOAT',
  'FLOAT4',
  'REAL',
  'DOUBLE',
  'FLOAT8',
  'DOUBLE PRECISION',
]);

/** Whether `JSON.parse` reads values of a type as `materialize` does: see {@link readJsonValue}. */
const nativeReadable = new WeakMap<DuckDBTypeNode, boolean>();

/**
 * Whether `type` is built only from lists, arrays and structs whose fields
 * all have names, over {@link NATIVE_SCALAR_NAMES}. A MAP (a `Map`), a
 * UNION (its tag), an unnamed struct (an array), a VARIANT, JSON and a type
 * the parser could not read all come out of `materialize` other than
 * `JSON.parse` would give them.
 */
function holdsNativeValuesOnly(type: DuckDBTypeNode): boolean {
  const pending: DuckDBTypeNode[] = [type];
  while (pending.length > 0) {
    const node = pending.pop()!;
    switch (node.kind) {
      case 'scalar':
        if (!NATIVE_SCALAR_NAMES.has(node.name)) return false;
        break;
      case 'list':
      case 'array':
        pending.push(node.element);
        break;
      case 'struct':
        for (const field of node.fields) {
          if (field.name === null) return false;
          pending.push(field.type);
        }
        break;
      default:
        return false;
    }
  }
  return true;
}

/**
 * Read a nested value's exact JSON text, as {@link jsonValueSQL} writes it,
 * into JS values: what `materialize(parseJsonTree(text).root, type, mode)`
 * gives, value for value.
 *
 * The lossless reader is needed for what `JSON.parse` gets wrong: integers
 * past 2^53, a MAP's typed keys, a UNION's tag, an unnamed struct, and the
 * bare `NaN`, `Infinity` and `-Infinity` that `to_json` writes for a FLOAT
 * or DOUBLE that is not finite. A type that holds none of those, a list,
 * array or named struct of integers up to UINTEGER, FLOATs, DOUBLEs and
 * BOOLEANs, is read with `JSON.parse` instead, which gives the same values:
 * `to_json` writes a FLOAT widened to a double's digits
 * (`0.10000000149011612`), and both read a number's digits to the same
 * double, `-0.0` as `-0` included. A value that `JSON.parse` rejects, one
 * holding `NaN`, say, is read losslessly after all. A `FLOAT[768]`
 * embedding reads about twice as fast.
 *
 * @param type - The column's parsed type (`parseDuckDBType(originalType)`).
 * @param mode - As `materialize` takes it: `'value'` for value reads,
 *   `'export'` for JSON export files.
 *
 * @example
 * ```ts
 * const type = parseDuckDBType('FLOAT[]');
 * readJsonValue('[0.10000000149011612,-0.0]', type, 'value'); // [0.10000000149011612, -0] (JSON.parse)
 * readJsonValue('[NaN,1.0]', type, 'value'); // [NaN, 1] (lossless)
 * readJsonValue('[9007199254740993]', parseDuckDBType('BIGINT[]'), 'value'); // [9007199254740993n]
 * ```
 */
export function readJsonValue(
  text: string,
  type: DuckDBTypeNode | undefined,
  mode: 'value' | 'export',
): unknown {
  if (type !== undefined) {
    let native = nativeReadable.get(type);
    if (native === undefined) {
      native = holdsNativeValuesOnly(type);
      nativeReadable.set(type, native);
    }
    if (native) {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        // NaN or ±Infinity, which JSON cannot hold, or text cut short.
      }
    }
  }
  return materialize(parseJsonTree(text).root, type, mode);
}
