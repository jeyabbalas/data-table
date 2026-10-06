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
  dataTypeOf,
  parseDuckDBType,
  type DuckDBArrayTypeNode,
  type DuckDBListTypeNode,
  type DuckDBMapTypeNode,
  type DuckDBStructTypeNode,
  type DuckDBTypeNode,
} from '../core/duckdbType';
import { readsThroughVariant } from '../core/jsonTree';
import type { ColumnSchema } from '../core/types';
import { quoteIdentifier } from '../filters/FilterSQL';

/** List and array items, and map entries, a grid cell shows before `… +N`. */
export const PREVIEW_ITEMS = 32;

/** Graphemes of text a grid cell shows before `…`. */
export const TEXT_CAP = 1000;

/**
 * Items of a list or an array, and entries of a map, that the grid formats
 * when they sit inside a nested value: one more than {@link TEXT_CAP}.
 * DuckDB writes `, ` between any two items, at any depth, and a grapheme
 * always starts at its space, so a list's first TEXT_CAP + 1 items alone
 * make more than TEXT_CAP graphemes: whatever follows them is past the cap.
 */
export const FORMATTED_ITEMS = TEXT_CAP + 1;

/** Bytes of a BLOB a grid cell shows before `… +N`. */
export const BLOB_PREVIEW = 256;

/** BLOB and its aliases: Arrow carries a value as bytes, which a cell shows as `[object Object]`. */
const BLOB_NAMES = new Set(['BLOB', 'BYTEA', 'BINARY', 'VARBINARY']);

/**
 * Other scalar types read as DuckDB's text: those Arrow carries as bytes
 * (`0101`, `POINT (1 2)`, digits), and ENUM, whose dictionary the worker's
 * query path does not receive, so that a result holding one is read twice
 * (see `executeQueryCancellable`).
 */
const SCALAR_TEXT_NAMES = new Set([
  'BIT',
  'BITSTRING',
  'BIT VARYING',
  'GEOMETRY',
  'BIGNUM',
  'VARINT',
  'ENUM',
]);

/**
 * Times that Arrow carries in a form a cell cannot show, read as DuckDB's
 * short text as INTERVAL is: TIME_NS arrives in nanoseconds, which a cell
 * would read as microseconds (`03:04:05.123456789` showed as
 * `3068:05:23.456`), and TIME WITH TIME ZONE without its offset.
 */
const TEXT_TIME_NAMES = new Set(['TIME_NS', 'TIME WITH TIME ZONE', 'TIMETZ']);

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
 * reads the column as it is: numbers, text, JSON, dates, TIME and the
 * other scalars Arrow carries well. `quotedCol` is the column's quoted
 * identifier (or any expression); the result has no alias.
 *
 * The text is DuckDB's own for the value, `CAST(c AS VARCHAR)`, bounded:
 *
 * - A LIST, or an ARRAY of more than {@link PREVIEW_ITEMS} items, shows its
 *   first 32 items and then how many more there are: `[1, 2, …, 32, … +68]`.
 *   The head is DuckDB's text for the first 32 items, its closing bracket
 *   cut by `left(t, -1)`, which removes exactly one character where
 *   `rtrim(t, ']')` would also eat the brackets of a last item that is a
 *   list itself.
 * - A MAP with more than 32 entries shows its first 32 the same way,
 *   rebuilt from the first 32 of `map_entries(c)`: `{k1=1, k2=2, … +568}`.
 * - A BLOB shows its first {@link BLOB_PREVIEW} bytes as DuckDB writes them
 *   (`\xAA` for a byte that is not printable ASCII), then the bytes left:
 *   `\x89PNG… +1834`. When that is more than {@link TEXT_CAP} characters, it
 *   shows the whole bytes that fit and `…`, without the count (see
 *   {@link blobText}).
 * - STRUCT, UNION, VARIANT, a type the parser could not read, BIT,
 *   GEOMETRY and BIGNUM (whose values Arrow carries as bytes) and ENUM
 *   (whose dictionary the worker's query path does not receive) show their
 *   whole text. INTERVAL keeps the plain cast it always had: Arrow carries
 *   it as an object, and its text is short. So do TIME_NS, which Arrow
 *   carries in nanoseconds where a cell reads a time in microseconds, and
 *   TIME WITH TIME ZONE, which Arrow carries without its offset.
 *
 * Each of those texts but INTERVAL's, the times' and a BLOB's is then cut
 * at {@link TEXT_CAP} graphemes and given a `…`. The cut is by grapheme
 * (`left_grapheme`), so an emoji joined from several code points is kept
 * whole, and `…` is added only when something was cut: only text of more
 * than TEXT_CAP bytes is looked at, and then `strlen` of the kept part is
 * compared with `strlen` of the whole (byte counts DuckDB keeps with every
 * string) rather than `length`, which counts code points: 1,001 code points
 * can be 999 graphemes. The cap is written as a lambda over a one-item list
 * so that the text is named once: written out in a `CASE`, the text appears
 * five times, and DuckDB's common-subexpression pass then took 150 ms to
 * plan a block of 40 such columns (18 ms as a lambda). The cap is left out
 * when the type alone keeps the text under {@link TEXT_CAP} characters:
 * lists, arrays and maps of booleans, dates, times and numbers up to
 * BIGINT, DOUBLE or DECIMAL(25,s), and structs, unions and fixed-size
 * arrays built only from those (see {@link shownTextBound}). Embeddings such
 * as `FLOAT[768]` are the common case.
 *
 * The cap bounds the text a cell shows. What DuckDB formats before the cap
 * is bounded too, so that a long list inside a value costs a cell no more
 * than a short one:
 *
 * - The items a cell shows are copied out of their list before it is cast
 *   (see {@link listItems}): DuckDB's cast to VARCHAR formats every item a
 *   slice such as `c[1:32]` shares with its list. When those items are
 *   lists or maps themselves, only the ones the cap can reach are kept
 *   (see {@link neededItems}).
 * - Inside the value, every list, array and map is cut to its first
 *   {@link FORMATTED_ITEMS} items, more than the cap can show, and a struct
 *   holding one is rebuilt around it (see {@link formattedValue}).
 *
 * Either way the text agrees with the whole value's until past the cap, so
 * the cell is the same. Unions, VARIANTs and map keys are formatted whole,
 * a list inside them included.
 *
 * NULL stays NULL in every form, so the cell shows its null style: the head
 * of a NULL list or map is NULL, and `||`, unlike `concat`, keeps NULL.
 *
 * @example
 * ```ts
 * const column = { name: 'scores', type: 'nested', nullable: true, originalType: 'INTEGER[]' };
 * gridValueSQL(column, '"scores"');
 * // left(CAST(list_transform(list_resize("scores", least(len("scores"), 32)), lambda x1: x1) AS VARCHAR), -1)
 * //   || CASE WHEN len("scores") > 32 THEN ', … +' || (len("scores") - 32) ELSE '' END || ']'
 * gridValueSQL({ ...column, type: 'integer', originalType: 'INTEGER' }, '"id"'); // null
 * ```
 */
export function gridValueSQL(column: ColumnSchema, quotedCol: string): string | null {
  const node = typeNodeOf(column);
  const c = operand(quotedCol);
  let text: string;
  switch (node.kind) {
    case 'list':
    case 'array': {
      const shown = neededItems(c, node.element) ?? PREVIEW_ITEMS;
      const head = listItems(c, node, shown, 1);
      text =
        node.kind === 'array' && node.size <= PREVIEW_ITEMS
          ? `CAST(${head ?? c} AS VARCHAR)`
          : previewText(head!, `len(${c})`, ']');
      break;
    }
    case 'map': {
      const shown = neededItems(`map_values(${c})`, node.value) ?? PREVIEW_ITEMS;
      text = previewText(mapEntries(c, node, shown, 1), `cardinality(${c})`, '}');
      break;
    }
    case 'struct':
      text = `CAST(${structFields(c, node, 1) ?? c} AS VARCHAR)`;
      break;
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
      if (BLOB_NAMES.has(node.name)) return blobText(c);
      if (SCALAR_TEXT_NAMES.has(node.name)) {
        text = `CAST(${c} AS VARCHAR)`;
        break;
      }
      if (
        node.name === 'INTERVAL' ||
        TEXT_TIME_NAMES.has(node.name) ||
        column.type === 'interval'
      ) {
        return `CAST(${c} AS VARCHAR)`;
      }
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
 * The text of a BLOB cell: its first {@link BLOB_PREVIEW} bytes as DuckDB
 * writes them, then `… +N` for the bytes left. DuckDB writes a byte that is
 * not printable ASCII as four characters (`\xAA`, a backslash among them),
 * so the text can pass {@link TEXT_CAP} characters. It is ASCII but for the
 * `…`, so characters are graphemes, and the cut is at TEXT_CAP characters,
 * less a `\`, `\x` or `\xA` it would leave of a byte's escape and anything
 * of the `… +N` it reaches: the cell shows the whole bytes that fit, 250 to
 * 256 of them, and `…`.
 */
function blobText(c: string): string {
  const text =
    `CASE WHEN octet_length(${c}) > ${BLOB_PREVIEW}` +
    ` THEN concat(CAST(${c}[1:${BLOB_PREVIEW}] AS VARCHAR), '… +', octet_length(${c}) - ${BLOB_PREVIEW})` +
    ` ELSE CAST(${c} AS VARCHAR) END`;
  return (
    `list_transform([${text}], lambda txt: CASE WHEN length(txt) > ${TEXT_CAP}` +
    ` THEN regexp_replace(left(txt, ${TEXT_CAP}), '(….*|\\\\(x[0-9A-Fa-f]?)?)$', '') || '…'` +
    ` ELSE txt END)[1]`
  );
}

/**
 * The text of `head`, the first {@link PREVIEW_ITEMS} items of a list or
 * entries of a map, as a cell shows it: when `count`, the whole value's
 * item count, is larger, the text loses its closing `close` and gains
 * `, … +N` and `close` again. `head` is named once, so DuckDB formats it
 * once.
 */
function previewText(head: string, count: string, close: string): string {
  return (
    `left(CAST(${head} AS VARCHAR), -1)` +
    ` || CASE WHEN ${count} > ${PREVIEW_ITEMS} THEN ', … +' || (${count} - ${PREVIEW_ITEMS}) ELSE '' END` +
    ` || '${close}'`
  );
}

/**
 * How many of the first {@link PREVIEW_ITEMS} items of `list` a cell needs
 * when they are lists, arrays or maps (`node` is their type): those whose
 * items before them hold fewer than {@link FORMATTED_ITEMS} items in all.
 * Each item holds at least one, so whatever follows the last one needed is
 * past the cap. `null` for items of any other type, and for arrays too short
 * for any of them to be left out. The count is worked out in lambdas over
 * the items' sizes, which refer to no column; it cannot come from an
 * array's size alone, since a NULL item holds none.
 */
function neededItems(list: string, node: DuckDBTypeNode): string | null {
  if (node.kind === 'array' && node.size * (PREVIEW_ITEMS - 1) < FORMATTED_ITEMS) return null;
  if (node.kind !== 'list' && node.kind !== 'array' && node.kind !== 'map') return null;
  const size = node.kind === 'map' ? 'cardinality' : 'len';
  return (
    `list_transform([list_transform(list_resize(${list}, least(len(${list}), ${PREVIEW_ITEMS})),` +
    ` lambda y: coalesce(${size}(y), 0))],` +
    ` lambda n: len(list_filter(range(1, len(n) + 1),` +
    ` lambda i: coalesce(list_sum(n[1:i - 1]), 0) < ${FORMATTED_ITEMS})))[1]`
  );
}

/**
 * Lists, arrays and maps nested deeper than this inside a value are
 * formatted whole: each level adds a lambda to the query, and DuckDB parses
 * at most 1,000 levels of expression.
 */
const MAX_FORMATTED_DEPTH = 16;

/**
 * SQL for `value`, of type `node`, with each list, array and map inside it
 * cut to its first {@link FORMATTED_ITEMS} items, so that DuckDB formats
 * only those: its text is the text of `value` up to the end of the first
 * list cut, which is past the cap. `null` when nothing in `value` is cut:
 * scalars, unions and VARIANTs (whose values are formatted whole, a list
 * inside them included), and structs and short arrays holding nothing to
 * cut.
 *
 * `value` is the column, or an expression over the parameters of the
 * lambdas around it, each level's named for its depth (`x2`, `e3`): no
 * column is named inside a lambda, where a parameter of the same name would
 * hide it.
 */
function formattedValue(value: string, node: DuckDBTypeNode, depth: number): string | null {
  if (depth > MAX_FORMATTED_DEPTH) return null;
  switch (node.kind) {
    case 'list':
    case 'array':
      return listItems(value, node, FORMATTED_ITEMS, depth);
    case 'map':
      return mapEntries(value, node, FORMATTED_ITEMS, depth);
    case 'struct':
      return structFields(value, node, depth);
    default:
      return null;
  }
}

/**
 * The first `count` items of `list`, each as {@link formattedValue} has it,
 * as a list of their own; `null` for an array of no more than `count` items
 * with nothing to cut in them. `count` is a number, or SQL for one
 * ({@link neededItems}).
 *
 * The items are taken with `list_resize`, held to the list's length so that
 * it never pads, and copied out with `list_transform`. A slice
 * (`list[1:count]`) costs more: on a list of lists it copies every item,
 * and on any list it shares the items it leaves out, which DuckDB's cast to
 * VARCHAR then formats too.
 */
function listItems(
  list: string,
  node: DuckDBListTypeNode | DuckDBArrayTypeNode,
  count: number | string,
  depth: number,
): string | null {
  const x = `x${depth}`;
  const item = formattedValue(x, node.element, depth + 1);
  if (node.kind === 'array' && typeof count === 'number' && node.size <= count) {
    return item === null ? null : `list_transform(${list}, lambda ${x}: ${item})`;
  }
  return `list_transform(list_resize(${list}, least(len(${list}), ${count})), lambda ${x}: ${item ?? x})`;
}

/**
 * The first `count` entries of `map`, each value as {@link formattedValue}
 * has it, as a map of their own. A key is kept whole: one cut short could
 * equal another key, and a map's keys must differ. `count` is a number, or
 * SQL for one ({@link neededItems}).
 */
function mapEntries(
  map: string,
  node: DuckDBMapTypeNode,
  count: number | string,
  depth: number,
): string {
  const e = `e${depth}`;
  const value = formattedValue(`${e}.value`, node.value, depth + 1) ?? `${e}.value`;
  return (
    `map_from_entries(list_transform(list_resize(map_entries(${map}), least(cardinality(${map}), ${count})),` +
    ` lambda ${e}: {'key': ${e}.key, 'value': ${value}}))`
  );
}

/**
 * `struct` rebuilt from its fields, each as {@link formattedValue} has it:
 * `struct_pack` with the same names, or `row` when its fields have none, so
 * that its text is the struct's own. `null` when no field has anything to
 * cut, or when a field is named with the empty string, which SQL cannot
 * write: such a struct is formatted whole. `struct` is named once for each
 * field: it is a column or a lambda parameter, or a field of one, and
 * naming it in a one-item list instead (as {@link capText} does) would copy
 * the whole value.
 */
function structFields(struct: string, node: DuckDBStructTypeNode, depth: number): string | null {
  const field = (i: number): string => `struct_extract_at(${struct}, ${i + 1})`;
  const parts = node.fields.map((f, i) => formattedValue(field(i), f.type, depth + 1));
  if (parts.every((part) => part === null)) return null;
  const unnamed = node.fields.every((f) => f.name === null);
  if (!unnamed && node.fields.some((f) => !f.name)) return null;
  const values = parts.map((part, i) => part ?? field(i));
  const built = unnamed
    ? `row(${values.join(', ')})`
    : `struct_pack(${values.map((v, i) => `${quoteIdentifier(node.fields[i]!.name!)} := ${v}`).join(', ')})`;
  // A NULL struct stays NULL: `struct_pack` of its fields would be a struct
  // of NULLs.
  return `CASE WHEN ${struct} IS NULL THEN NULL ELSE ${built} END`;
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
 *   VARIANT)`; `readsThroughVariant`, which the readers of this JSON ask
 *   too) goes through VARIANT first: `CAST(CAST(c AS VARIANT) AS JSON)`,
 *   NULL kept the same way. `to_json` and `CAST(c AS JSON)` of such
 *   a type are wrong (`to_json([42::VARIANT])` is `["42"]`) or an INTERNAL
 *   error that invalidates the database. Through VARIANT, a MAP inside comes
 *   out as a list of `{"key": …, "value": …}` objects, a UNION as its
 *   member's value, without the tag, and a DECIMAL with its scale's zeros
 *   (`1.5000`), which `to_json` writes only for one wider than 15 digits:
 *   `1.5` for a DECIMAL(15,4), `1.5000` for a DECIMAL(16,4). An unnamed
 *   struct cannot be cast to VARIANT, so one inside is first cast to the
 *   same struct with its fields named by position, `"1"`, `"2"`, …, which
 *   become its keys.
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
  if (!readsThroughVariant(node)) return `CAST(to_json(${c}) AS VARCHAR)`;
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
 * `STRUCT("1" VARIANT, "2" VARCHAR)[]`. Everything else is as written, but
 * a field named with the empty string, which SQL cannot write: it is named
 * by its position too, and since a cast from one struct to another matches
 * fields by name, its value reads as NULL. Only a type holding a VARIANT, an
 * unnamed struct and such a field comes here with one. Recursion is bounded
 * by the parser's depth limit.
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
            `${quoteIdentifier(field.name || String(i + 1))} ${withNamedFields(field.type)}`,
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
