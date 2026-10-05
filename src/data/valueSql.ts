/**
 * SQL that reads a column's values as text.
 *
 * Values that are not plain scalars (lists, arrays, structs, maps, unions,
 * VARIANT, and a few scalars Arrow carries as raw bytes) are read as text,
 * by one of two channels, so that neither depends on how Arrow represents
 * them on the way out of the worker:
 *
 * - {@link gridValueSQL}: the text a grid cell shows. DuckDB's own text
 *   (`[56, 3, 91]`, `{'x': 1.25, 'tier': bronze}`, `{k1=1, k2=2}`), bounded
 *   so that one cell costs about as much as a screenful of text, whatever
 *   the value holds.
 * - {@link jsonValueSQL}: the value itself, as exact JSON text, for anything
 *   that needs the data (value reads, exports, the value inspector).
 *
 * Imports no DOM code, so the worker could use it too.
 */

import {
  childTypes,
  containsKind,
  dataTypeOf,
  parseDuckDBType,
  type DuckDBTypeNode,
} from '../core/duckdbType';
import type { ColumnSchema } from '../core/types';
import { quoteIdentifier } from '../filters/FilterSQL';

/** List and array items, and map entries, a grid cell shows before `… +N`. */
export const PREVIEW_ITEMS = 32;

/** Graphemes of text a grid cell shows before `…`. */
export const TEXT_CAP = 1000;

/** Bytes of a BLOB a grid cell shows before `… +N`. */
export const BLOB_PREVIEW = 256;

/** BLOB and its aliases: Arrow carries a value as bytes, which a cell shows as `[object Object]`. */
const BLOB_NAMES = new Set(['BLOB', 'BYTEA', 'BINARY', 'VARBINARY']);

/** Other scalar types Arrow carries as bytes, whose text is DuckDB's: `0101`, `POINT (1 2)`, digits. */
const BYTES_AS_TEXT_NAMES = new Set([
  'BIT',
  'BITSTRING',
  'BIT VARYING',
  'GEOMETRY',
  'BIGNUM',
  'VARINT',
]);

/** A plain or table-qualified quoted identifier: `"tags"`, `"t"."tags"`. */
const QUOTED_IDENTIFIER = /^"(?:[^"]|"")*"(?:\."(?:[^"]|"")*")*$/;

/**
 * `quotedCol` as an operand: as given when it is a quoted identifier,
 * parenthesised otherwise, so that `[1:32]` and the like apply to all of it.
 */
function operand(quotedCol: string): string {
  return QUOTED_IDENTIFIER.test(quotedCol) ? quotedCol : `(${quotedCol})`;
}

function typeNodeOf(column: ColumnSchema): DuckDBTypeNode {
  // `originalType` is required by the type, but a schema built by hand in
  // JavaScript may leave it out.
  return parseDuckDBType(column.originalType ?? '');
}

// ---------------------------------------------------------------------------
// Grid text
// ---------------------------------------------------------------------------

/**
 * SQL for the text a grid cell shows for `column`, or `null` when the grid
 * reads the column as it is: numbers, text, JSON, dates, times and the
 * other scalars Arrow carries well. `quotedCol` is the column's quoted
 * identifier (or any expression); the result has no alias.
 *
 * The text is DuckDB's own for the value, `CAST(c AS VARCHAR)`, bounded:
 *
 * - A LIST, or an ARRAY of more than {@link PREVIEW_ITEMS} items, shows its
 *   first 32 items and then how many more there are: `[1, 2, …, 32, … +68]`.
 *   The head is DuckDB's text for the slice `c[1:32]`, its closing bracket
 *   cut by `left(t, -1)`, which removes exactly one character where
 *   `rtrim(t, ']')` would also eat the brackets of a last item that is a
 *   list itself. Only the outer list is sliced; lists inside it are left to
 *   the text cap.
 * - A MAP with more than 32 entries shows its first 32 the same way,
 *   rebuilt from `map_entries(c)[1:32]`: `{k1=1, k2=2, … +568}`.
 * - A BLOB shows its first {@link BLOB_PREVIEW} bytes as DuckDB writes them
 *   (`\xAA` for a byte that is not printable ASCII), then the bytes left:
 *   `\x89PNG… +1834`.
 * - STRUCT, UNION, VARIANT, a type the parser could not read, BIT,
 *   GEOMETRY and BIGNUM (whose values Arrow carries as bytes) show their
 *   whole text. INTERVAL keeps the plain cast it always had: Arrow carries
 *   it as an object, and its text is short.
 *
 * Each of those texts but INTERVAL's is then cut at {@link TEXT_CAP}
 * graphemes and given a `…`. The cut is by grapheme (`left_grapheme`), so
 * an emoji joined from several code points is kept whole, and `…` is added
 * only when something was cut: only text of more than TEXT_CAP bytes is
 * looked at, and then `strlen` of the kept part is compared with `strlen`
 * of the whole (byte counts DuckDB keeps with every string) rather than
 * `length`, which counts code points: 1,001 code points can be 999
 * graphemes. The cap is written as a lambda over a one-item list so that
 * the text is named once: written out in a `CASE`, the text appears five
 * times, and DuckDB's common-subexpression pass then took 150 ms to plan a
 * block of 40 such columns (18 ms as a lambda). The cap is left out when
 * the type alone keeps the text under {@link TEXT_CAP} characters: lists,
 * arrays and maps of booleans, dates, times and numbers up to BIGINT,
 * DOUBLE or DECIMAL(25,s), and structs, unions and fixed-size arrays built
 * only from those (see {@link shownTextBound}). Embeddings such as
 * `FLOAT[768]` are the common case.
 *
 * NULL stays NULL in every form, so the cell shows its null style: each
 * `concat`, which skips NULL arguments, sits behind a `CASE` whose test is
 * NULL for a NULL value and so falls to a plain cast of it.
 *
 * @example
 * ```ts
 * const column = { name: 'scores', type: 'nested', nullable: true, originalType: 'INTEGER[]' };
 * gridValueSQL(column, '"scores"');
 * // CASE WHEN len("scores") > 32
 * //   THEN concat(left(CAST("scores"[1:32] AS VARCHAR), -1), ', … +', len("scores") - 32, ']')
 * //   ELSE CAST("scores" AS VARCHAR) END
 * gridValueSQL({ ...column, type: 'integer', originalType: 'INTEGER' }, '"id"'); // null
 * ```
 */
export function gridValueSQL(column: ColumnSchema, quotedCol: string): string | null {
  const node = typeNodeOf(column);
  const c = operand(quotedCol);
  let text: string;
  switch (node.kind) {
    case 'list':
    case 'array':
      text =
        node.kind === 'array' && node.size <= PREVIEW_ITEMS
          ? `CAST(${c} AS VARCHAR)`
          : `CASE WHEN len(${c}) > ${PREVIEW_ITEMS}` +
            ` THEN concat(left(CAST(${c}[1:${PREVIEW_ITEMS}] AS VARCHAR), -1), ', … +', len(${c}) - ${PREVIEW_ITEMS}, ']')` +
            ` ELSE CAST(${c} AS VARCHAR) END`;
      break;
    case 'map':
      text =
        `CASE WHEN cardinality(${c}) > ${PREVIEW_ITEMS}` +
        ` THEN concat(left(CAST(map_from_entries(map_entries(${c})[1:${PREVIEW_ITEMS}]) AS VARCHAR), -1), ', … +', cardinality(${c}) - ${PREVIEW_ITEMS}, '}')` +
        ` ELSE CAST(${c} AS VARCHAR) END`;
      break;
    case 'struct':
    case 'union':
    case 'variant':
      text = `CAST(${c} AS VARCHAR)`;
      break;
    case 'unknown':
      if (column.type !== 'nested' && dataTypeOf(node) !== 'nested') {
        return column.type === 'interval' ? `CAST(${c} AS VARCHAR)` : null;
      }
      text = `CAST(${c} AS VARCHAR)`;
      break;
    case 'json':
      return null;
    case 'scalar':
      if (BLOB_NAMES.has(node.name)) {
        text =
          `CASE WHEN octet_length(${c}) > ${BLOB_PREVIEW}` +
          ` THEN concat(CAST(${c}[1:${BLOB_PREVIEW}] AS VARCHAR), '… +', octet_length(${c}) - ${BLOB_PREVIEW})` +
          ` ELSE CAST(${c} AS VARCHAR) END`;
        break;
      }
      if (BYTES_AS_TEXT_NAMES.has(node.name)) {
        text = `CAST(${c} AS VARCHAR)`;
        break;
      }
      if (node.name === 'INTERVAL' || column.type === 'interval') return `CAST(${c} AS VARCHAR)`;
      return null;
  }
  return shownTextBound(node) > TEXT_CAP ? capText(text) : text;
}

/**
 * `text` cut at {@link TEXT_CAP} graphemes, with `…` when something was
 * cut; see {@link gridValueSQL}. The lambda's parameter shadows any column
 * of the same name, and nothing else inside it names a column.
 */
function capText(text: string): string {
  return (
    `list_transform([${text}], lambda txt: CASE WHEN strlen(txt) > ${TEXT_CAP}` +
    ` AND strlen(left_grapheme(txt, ${TEXT_CAP})) < strlen(txt)` +
    ` THEN concat(left_grapheme(txt, ${TEXT_CAP}), '…') ELSE txt END)[1]`
  );
}

/**
 * The most characters of DuckDB's text for one scalar inside a nested value,
 * quotes included (a date before year 1 prints as `'5877642-06-25 (BC)'`), by
 * type name. Measured on DuckDB 1.5.4, then rounded up: `-1234567800000000.0`
 * is a FLOAT, `-2.2250738585072014e-308` a DOUBLE.
 */
const SCALAR_TEXT_WIDTH = new Map<string, number>([
  ['BOOLEAN', 5],
  ['BOOL', 5],
  ['LOGICAL', 5],
  ['TINYINT', 4],
  ['INT1', 4],
  ['SMALLINT', 6],
  ['INT2', 6],
  ['SHORT', 6],
  ['INTEGER', 11],
  ['INT4', 11],
  ['INT', 11],
  ['SIGNED', 11],
  ['BIGINT', 20],
  ['INT8', 20],
  ['LONG', 20],
  ['HUGEINT', 40],
  ['UTINYINT', 3],
  ['USMALLINT', 5],
  ['UINTEGER', 10],
  ['UBIGINT', 20],
  ['UHUGEINT', 39],
  ['FLOAT', 20],
  ['FLOAT4', 20],
  ['REAL', 20],
  ['DOUBLE', 25],
  ['FLOAT8', 25],
  ['DOUBLE PRECISION', 25],
  ['DATE', 20],
  ['TIME', 26],
  ['TIME WITH TIME ZONE', 26],
  ['TIME WITHOUT TIME ZONE', 26],
  ['TIMETZ', 26],
  ['TIME_NS', 26],
  ['TIMESTAMP', 48],
  ['DATETIME', 48],
  ['TIMESTAMP WITH TIME ZONE', 48],
  ['TIMESTAMP WITHOUT TIME ZONE', 48],
  ['TIMESTAMPTZ', 48],
  ['TIMESTAMP_S', 48],
  ['TIMESTAMP_MS', 48],
  ['TIMESTAMP_NS', 48],
  ['TIMESTAMP_US', 48],
  ['INTERVAL', 80],
  ['UUID', 38],
]);

/** `NULL`, which any item may be. */
const NULL_WIDTH = 4;

/** Digits of the `N` in `… +N`: a BIGINT. */
const COUNT_DIGITS = 19;

/**
 * The most characters of DuckDB's text for a value of `node` inside a
 * nested value, or `Infinity` when its type does not bound it: text, BLOB,
 * ENUM, JSON, VARIANT, and lists and maps, which hold any number of items.
 */
function textBound(node: DuckDBTypeNode): number {
  switch (node.kind) {
    case 'scalar': {
      if (node.name === 'DECIMAL' || node.name === 'NUMERIC') {
        // A sign, the digits and a point; `DECIMAL` alone is DECIMAL(18,3).
        const precision = node.args.length === 0 ? 18 : Number(node.args[0]);
        return Number.isInteger(precision) ? Math.max(NULL_WIDTH, precision + 3) : Infinity;
      }
      const width = SCALAR_TEXT_WIDTH.get(node.name);
      return width === undefined ? Infinity : Math.max(NULL_WIDTH, width);
    }
    case 'array':
      // `[` + items joined by `, ` + `]`
      return node.size * (textBound(node.element) + 2);
    case 'struct':
      // `{'name': value, …}`; a name may have every character escaped.
      return node.fields.reduce(
        (sum, field) => sum + 2 * (field.name?.length ?? 0) + 2 + 2 + textBound(field.type) + 2,
        2,
      );
    case 'union':
      // A union prints as its member's value.
      return node.members.reduce(
        (max, member) => Math.max(max, textBound(member.type)),
        NULL_WIDTH,
      );
    default:
      return Infinity;
  }
}

/** The most characters of `[`, {@link PREVIEW_ITEMS} items of `item` characters, and `, … +N]`. */
function previewBound(item: number): number {
  return 1 + PREVIEW_ITEMS * item + (PREVIEW_ITEMS - 1) * 2 + ', … +'.length + COUNT_DIGITS + 1;
}

/**
 * The most characters of the text {@link gridValueSQL} shows for a column of
 * type `node` before its cap, or `Infinity`. Only the outer list, array or
 * map is sliced, so only it counts as {@link PREVIEW_ITEMS} items; a list
 * inside it has no bound. `FLOAT[768]` comes to 728 characters and
 * `DOUBLE[]` to 888, so neither is capped; `VARCHAR[]`, `HUGEINT[]` (40
 * characters an item) and `TIMESTAMP[]` (48) are.
 */
function shownTextBound(node: DuckDBTypeNode): number {
  switch (node.kind) {
    case 'list':
      return previewBound(textBound(node.element));
    case 'array':
      return node.size <= PREVIEW_ITEMS ? textBound(node) : previewBound(textBound(node.element));
    case 'map':
      return previewBound(textBound(node.key) + 1 + textBound(node.value));
    default:
      return textBound(node);
  }
}

// ---------------------------------------------------------------------------
// Exact values as JSON
// ---------------------------------------------------------------------------

/**
 * SQL for the exact value of `column` as JSON text (a VARCHAR, NULL for a
 * NULL value), for value reads, exports and the value inspector.
 * `quotedCol` is the column's quoted identifier (or any expression); the
 * result has no alias.
 *
 * - Most types: `CAST(to_json(c) AS VARCHAR)`. `to_json` is exact: DECIMAL,
 *   HUGEINT and UBIGINT keep every digit, dates, times, UUIDs, BLOBs, ENUMs
 *   and INTERVALs are DuckDB's text, a UNION is `{"tag": value}`, a MAP an
 *   object in key order, an unnamed struct an object with `""` keys. It
 *   writes a double that is not finite as a bare `NaN` or `Infinity`, and a
 *   FLOAT widened (`0.10000000149011612`), so the text is read with
 *   `parseJsonTree`, not `JSON.parse`.
 * - A JSON column: its text as it is, `CAST(c AS VARCHAR)`.
 * - A VARIANT column: `CAST(c AS JSON)`, behind a `CASE` that keeps NULL
 *   (the cast writes a NULL as the text `null`). `to_json` of a VARIANT
 *   gives the text of the value as a JSON string (`"42"`).
 * - A type holding a VARIANT anywhere inside (`VARIANT[]`, `STRUCT(v
 *   VARIANT)`) goes through VARIANT first: `CAST(CAST(c AS VARIANT) AS
 *   JSON)`, NULL kept the same way. `to_json` and `CAST(c AS JSON)` of such
 *   a type are wrong (`to_json([42::VARIANT])` is `["42"]`) or an INTERNAL
 *   error that invalidates the database. Through VARIANT, a MAP inside comes
 *   out as a list of `{"key": …, "value": …}` objects, a UNION as its
 *   member's value, without the tag, and a DECIMAL with its scale's zeros
 *   (`1.5000`, where `to_json` writes `1.5`). An unnamed struct cannot be cast to
 *   VARIANT, so one inside is first cast to the same struct with its fields
 *   named by position, `"1"`, `"2"`, …, which become its keys.
 * - A type the parser could not read goes through VARIANT when its text
 *   names VARIANT, through `to_json` otherwise.
 *
 * @example
 * ```ts
 * jsonValueSQL({ name: 'tags', type: 'nested', nullable: true, originalType: 'VARCHAR[]' }, '"tags"');
 * // 'CAST(to_json("tags") AS VARCHAR)'
 * jsonValueSQL({ name: 'v', type: 'nested', nullable: true, originalType: 'VARIANT' }, '"v"');
 * // 'CASE WHEN "v" IS NULL THEN NULL ELSE CAST(CAST("v" AS JSON) AS VARCHAR) END'
 * ```
 */
export function jsonValueSQL(column: ColumnSchema, quotedCol: string): string {
  const node = typeNodeOf(column);
  const c = operand(quotedCol);
  if (node.kind === 'json') return `CAST(${c} AS VARCHAR)`;
  if (node.kind === 'variant') {
    return `CASE WHEN ${c} IS NULL THEN NULL ELSE CAST(CAST(${c} AS JSON) AS VARCHAR) END`;
  }
  const holdsVariant =
    node.kind === 'unknown' ? /\bVARIANT\b/i.test(node.sqlType) : containsKind(node, 'variant');
  if (!holdsVariant) return `CAST(to_json(${c}) AS VARCHAR)`;
  const value = hasUnnamedStruct(node) ? `CAST(${c} AS ${withNamedFields(node)})` : c;
  return `CASE WHEN ${c} IS NULL THEN NULL ELSE CAST(CAST(CAST(${value} AS VARIANT) AS JSON) AS VARCHAR) END`;
}

/** Whether `node` is, or holds, a struct whose fields have no names. */
function hasUnnamedStruct(node: DuckDBTypeNode): boolean {
  const pending: DuckDBTypeNode[] = [node];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.kind === 'struct' && current.fields.some((field) => field.name === null)) {
      return true;
    }
    pending.push(...childTypes(current));
  }
  return false;
}

/**
 * The SQL type of `node` with each unnamed struct field named by its
 * 1-based position: `STRUCT(VARIANT, VARCHAR)[]` becomes
 * `STRUCT("1" VARIANT, "2" VARCHAR)[]`. Everything else is as written.
 * Recursion is bounded by the parser's depth limit.
 */
function withNamedFields(node: DuckDBTypeNode): string {
  switch (node.kind) {
    case 'list':
      return `${withNamedFields(node.element)}[]`;
    case 'array':
      return `${withNamedFields(node.element)}[${node.size}]`;
    case 'struct':
      return `STRUCT(${node.fields
        .map(
          (field, i) =>
            `${quoteIdentifier(field.name ?? String(i + 1))} ${withNamedFields(field.type)}`,
        )
        .join(', ')})`;
    case 'map':
      return `MAP(${withNamedFields(node.key)}, ${withNamedFields(node.value)})`;
    case 'union':
      return `UNION(${node.members
        .map((member) => `${quoteIdentifier(member.tag)} ${withNamedFields(member.type)}`)
        .join(', ')})`;
    default:
      return node.sqlType;
  }
}
