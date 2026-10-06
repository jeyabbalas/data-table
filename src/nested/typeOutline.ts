/**
 * Short texts for a DuckDB type, for the places a nested column shows one.
 *
 * `ColumnSchema.originalType` is exact but long: a 26-field STRUCT is several
 * hundred characters of DuckDB syntax. {@link typeOutline} writes a parsed
 * type ({@link parseDuckDBType}) in one of three forms, each for a place:
 *
 * | DuckDB type                                | `label`               | `outline`           | `summary`                            |
 * | ------------------------------------------ | --------------------- | ------------------- | ------------------------------------ |
 * | `STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)` | `struct(3)`           | `{x, y, tier}`      | `x double · y double · tier varchar` |
 * | `INTEGER[]`                                | `[integer]`           | `[integer]`         | `[integer]`                          |
 * | `INTEGER[3]` / `FLOAT[768]`                | `integer[3]`          | same                | same                                 |
 * | `MAP(VARCHAR, INTEGER)`                    | `{varchar → integer}` | same                | same                                 |
 * | `UNION(num INTEGER, str VARCHAR)`          | `union(2)`            | `union(num \| str)` | `num integer \| str varchar`         |
 * | `STRUCT(a INT, b VARCHAR)[]`               | `[struct(2)]`         | `[{a, b}]`          | `[{a integer, b varchar}]`           |
 * | `JSON` / `VARIANT`                         | `json` / `variant`    | same                | same                                 |
 *
 * - `label` is the column header's type line (and the filter panel's badge).
 * - `outline` is the text under the summary chart of a nested column.
 * - `summary` is line 2 of its stats.
 *
 * The rules:
 *
 * - **Scalars** are DuckDB's name in lower case, an alias written as the name
 *   `DESCRIBE` prints (`INT` → `integer`, `FLOAT8` → `double`, `TEXT` →
 *   `varchar`). `TIMESTAMP WITH TIME ZONE` is `timestamptz` and `TIME WITH
 *   TIME ZONE` is `timetz`. DECIMAL keeps its precision and scale
 *   (`decimal(18,4)`); every other scalar drops its arguments, so any ENUM is
 *   `enum`.
 * - **Lists, arrays and maps** read the same in every form, their children
 *   written in the same form: `[e]`, `e[N]`, `{k → v}`.
 * - **Structs** are `struct(N)` as a label, their field names as an outline
 *   (`{a, b}`: a field's own type is not shown), and their fields with types
 *   as a summary: `a double · b varchar` for the column's own type, `{a
 *   double, b varchar}` inside another one.
 * - **Unions** are `union(N)`, `union(a | b)`, and `a integer | b varchar`
 *   (`union(a integer | b varchar)` inside another type).
 * - **Unnamed struct fields** (`STRUCT(INTEGER, VARCHAR)`, what `row(…)`
 *   makes) have no name to show: such a struct is written in parentheses
 *   with its fields' types, as DuckDB writes its values: `(integer,
 *   varchar)`. A field whose name is the empty string shows as `""`.
 * - **Names** of fields and union members are shown as they are, without
 *   quotes (`my field`, `x,y`, `it's`); a control character in one (a
 *   newline) shows as a space. The text is for reading, never for parsing:
 *   render it as text (`textContent`, a canvas) or escape it (the stats line
 *   is HTML, and names come from the data file).
 * - **Length**: each form keeps within {@link TYPE_OUTLINE_MAX_LENGTH}
 *   characters. Fields and members that do not fit end the list as `… +N`
 *   (`{f1, f2, … +38}`), a type nested more than 8 levels deep shows as `…`,
 *   and what is still too long is cut with `…`, between graphemes: an emoji
 *   joined from several code points, a flag or an accented letter in a name
 *   is kept whole or left out.
 *
 * {@link spokenType} says a type in words, for a header's accessible name
 * ("list of integer"), through the `values` strings.
 */

import {
  type DuckDBScalarTypeNode,
  type DuckDBTypeNode,
  parseDuckDBType,
} from '../core/duckdbType';
import { clipText } from '../core/graphemes';
import { type Strings, defaultStrings } from '../core/Strings';
import type { ColumnSchema } from '../core/types';

/**
 * The three ways {@link typeOutline} writes a type: `label` for a column
 * header, `outline` for the summary chart, `summary` for the stats line.
 */
export type TypeOutlineForm = 'label' | 'outline' | 'summary';

/**
 * The longest text {@link typeOutline} gives in each form, `…` included. An
 * outline feeds one line under a 60 px chart, a summary at most three lines
 * of the stats slot, a label one header line (which also ellipsizes in CSS).
 */
export const TYPE_OUTLINE_MAX_LENGTH: Readonly<Record<TypeOutlineForm, number>> = Object.freeze({
  label: 48,
  outline: 64,
  summary: 120,
});

const ELLIPSIS = '…';

/** Levels of nesting written out; a type deeper than this shows as `…`. */
const MAX_DEPTH = 8;

/** Aliases, by the upper-case name the parser gives, to the name `DESCRIBE` prints. */
const CANONICAL_NAMES: Readonly<Record<string, string>> = {
  INT8: 'BIGINT',
  LONG: 'BIGINT',
  INT4: 'INTEGER',
  INT: 'INTEGER',
  SIGNED: 'INTEGER',
  INT2: 'SMALLINT',
  SHORT: 'SMALLINT',
  INT1: 'TINYINT',
  FLOAT4: 'FLOAT',
  REAL: 'FLOAT',
  FLOAT8: 'DOUBLE',
  'DOUBLE PRECISION': 'DOUBLE',
  NUMERIC: 'DECIMAL',
  BOOL: 'BOOLEAN',
  LOGICAL: 'BOOLEAN',
  STRING: 'VARCHAR',
  TEXT: 'VARCHAR',
  CHAR: 'VARCHAR',
  BPCHAR: 'VARCHAR',
  'CHARACTER VARYING': 'VARCHAR',
  BYTEA: 'BLOB',
  BINARY: 'BLOB',
  VARBINARY: 'BLOB',
  BITSTRING: 'BIT',
  'BIT VARYING': 'BIT',
  DATETIME: 'TIMESTAMP',
  'TIMESTAMP WITHOUT TIME ZONE': 'TIMESTAMP',
  TIMESTAMPTZ: 'TIMESTAMP WITH TIME ZONE',
  'TIME WITHOUT TIME ZONE': 'TIME',
  TIMETZ: 'TIME WITH TIME ZONE',
};

/** Canonical names written shorter than `DESCRIBE` prints them. */
const SHORT_NAMES: Readonly<Record<string, string>> = {
  'TIMESTAMP WITH TIME ZONE': 'timestamptz',
  'TIME WITH TIME ZONE': 'timetz',
};

/**
 * Write a DuckDB type in one of three short forms: a header label
 * (`struct(3)`), a chart outline (`{x, y, tier}`) or a stats summary
 * (`x double · y double · tier varchar`). See the module comment for the
 * rules. Never longer than `TYPE_OUTLINE_MAX_LENGTH[form]` characters.
 *
 * @param node - A parsed type, from {@link parseDuckDBType}.
 * @param form - Which text: `label`, `outline` or `summary`.
 *
 * @example
 * ```ts
 * const node = parseDuckDBType('STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)');
 * typeOutline(node, 'label');   // 'struct(3)'
 * typeOutline(node, 'outline'); // '{x, y, tier}'
 * typeOutline(node, 'summary'); // 'x double · y double · tier varchar'
 * typeOutline(parseDuckDBType('MAP(VARCHAR, INTEGER)'), 'label'); // '{varchar → integer}'
 * ```
 */
export function typeOutline(node: DuckDBTypeNode, form: TypeOutlineForm): string {
  const budget = TYPE_OUTLINE_MAX_LENGTH[form];
  return clipText(render(node, form, budget, 0, true), budget);
}

/**
 * Say a DuckDB type in words, for an accessible name: `INTEGER[]` is "list
 * of integer", `STRUCT(a INTEGER, b VARCHAR)` "struct with 2 fields",
 * `MAP(VARCHAR, DOUBLE)` "map from varchar to double". Scalars are their
 * `DESCRIBE` name in lower case, without arguments ("decimal", "timestamp
 * with time zone"). The words come from `messages.values`.
 *
 * @param node - A parsed type, from {@link parseDuckDBType}.
 * @param messages - Resolved strings. Defaults to English.
 *
 * @example
 * ```ts
 * spokenType(parseDuckDBType('INTEGER[]'));           // 'list of integer'
 * spokenType(parseDuckDBType('FLOAT[768]'));          // 'array of 768 float'
 * spokenType(parseDuckDBType('STRUCT(a INT)[]'));     // 'list of struct with 1 field'
 * ```
 */
export function spokenType(node: DuckDBTypeNode, messages: Strings = defaultStrings): string {
  return speak(node, messages.values, 0);
}

/**
 * The parsed type of a column whose type is shown as a type outline: a
 * nested column (`type: 'nested'`), or a JSON one (`type: 'string'`, but
 * `originalType` `JSON`). `null` for every other column, which keeps showing
 * its `type`.
 *
 * @example
 * ```ts
 * outlinedColumnType({ type: 'nested', originalType: 'INTEGER[]' })?.kind; // 'list'
 * outlinedColumnType({ type: 'string', originalType: 'JSON' })?.kind;      // 'json'
 * outlinedColumnType({ type: 'string', originalType: 'VARCHAR' });        // null
 * ```
 */
export function outlinedColumnType(
  column: Pick<ColumnSchema, 'type' | 'originalType'>,
): DuckDBTypeNode | null {
  if (column.type !== 'nested' && column.type !== 'string') return null;
  const node = parseDuckDBType(column.originalType ?? '');
  if (column.type === 'nested' || node.kind === 'json') return node;
  return null;
}

/**
 * The type text a column header shows: the `label` outline of a nested or
 * JSON column's type (`[integer]`, `struct(3)`, `json`), and the library's
 * `type` for every other column (`integer`, `string`).
 *
 * @example
 * ```ts
 * columnTypeLabel({ type: 'nested', originalType: 'VARCHAR[]' }); // '[varchar]'
 * columnTypeLabel({ type: 'float', originalType: 'DOUBLE' });     // 'float'
 * ```
 */
export function columnTypeLabel(column: Pick<ColumnSchema, 'type' | 'originalType'>): string {
  const node = outlinedColumnType(column);
  return (node && typeOutline(node, 'label')) || column.type;
}

/**
 * The full type a nested or JSON column's label stands for, as `DESCRIBE`
 * prints it, for a `title` on the label. `null` for every other column,
 * whose label is not a shortening.
 *
 * @example
 * ```ts
 * columnTypeTitle({ type: 'nested', originalType: 'STRUCT(x DOUBLE)' }); // 'STRUCT(x DOUBLE)'
 * columnTypeTitle({ type: 'integer', originalType: 'INTEGER' });         // null
 * ```
 */
export function columnTypeTitle(
  column: Pick<ColumnSchema, 'type' | 'originalType'>,
): string | null {
  return outlinedColumnType(column) && column.originalType ? column.originalType : null;
}

/**
 * The type a column header says to a screen reader: the spoken form of a
 * nested or JSON column's type ("list of integer", "JSON"), and the
 * library's `type` for every other column, as its label shows.
 *
 * @example
 * ```ts
 * columnTypeSpoken({ type: 'nested', originalType: 'INTEGER[]' }); // 'list of integer'
 * columnTypeSpoken({ type: 'date', originalType: 'DATE' });        // 'date'
 * ```
 */
export function columnTypeSpoken(
  column: Pick<ColumnSchema, 'type' | 'originalType'>,
  messages: Strings = defaultStrings,
): string {
  const node = outlinedColumnType(column);
  return (node && spokenType(node, messages)) || column.type;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Write `node` in `form`, in about `budget` characters (the caller clips
 * what is still over). `top` is set for the column's own type, which a
 * summary writes without the braces of a struct or the `union(…)` of a union.
 */
function render(
  node: DuckDBTypeNode,
  form: TypeOutlineForm,
  budget: number,
  depth: number,
  top: boolean,
): string {
  if (budget < 1 || depth > MAX_DEPTH) return ELLIPSIS;
  switch (node.kind) {
    case 'scalar':
      return scalarLabel(node);
    case 'json':
      return 'json';
    case 'variant':
      return 'variant';
    case 'unknown':
      // Text the parser could not read: shown as it is.
      return clipText(printable(node.sqlType), budget);
    case 'list':
      return `[${render(node.element, form, budget - 2, depth + 1, false)}]`;
    case 'array': {
      const size = `[${node.size}]`;
      return render(node.element, form, budget - size.length, depth + 1, false) + size;
    }
    case 'map': {
      const key = render(node.key, form, budget - 5, depth + 1, false);
      const value = render(node.value, form, budget - 5 - key.length, depth + 1, false);
      return `{${key} → ${value}}`;
    }
    case 'struct':
      return renderStruct(node.fields, form, budget, depth, top);
    case 'union':
      return renderUnion(node.members, form, budget, depth, top);
  }
}

function renderStruct(
  fields: readonly { readonly name: string | null; readonly type: DuckDBTypeNode }[],
  form: TypeOutlineForm,
  budget: number,
  depth: number,
  top: boolean,
): string {
  if (form === 'label') return `struct(${fields.length})`;
  if (fields.length === 0) return '{}';
  // Unnamed fields are written as DuckDB writes the values: `(1, a)`.
  const unnamed = fields.every((f) => f.name === null);
  const open = unnamed ? '(' : '{';
  const close = unnamed ? ')' : '}';

  if (form === 'outline') {
    const entry = (i: number, room: number): string => {
      const field = fields[i]!;
      return field.name === null
        ? render(field.type, 'label', room, depth + 1, false)
        : clipText(displayName(field.name), room);
    };
    return open + boundedJoin(fields.length, entry, ', ', budget - 2) + close;
  }

  const entry = (i: number, room: number): string => {
    const field = fields[i]!;
    if (field.name === null) return render(field.type, 'summary', room, depth + 1, false);
    const name = displayName(field.name);
    const type = render(field.type, 'summary', room - name.length - 1, depth + 1, false);
    return clipText(`${name} ${type}`, room);
  };
  if (top) return boundedJoin(fields.length, entry, ' · ', budget);
  return open + boundedJoin(fields.length, entry, ', ', budget - 2) + close;
}

function renderUnion(
  members: readonly { readonly tag: string; readonly type: DuckDBTypeNode }[],
  form: TypeOutlineForm,
  budget: number,
  depth: number,
  top: boolean,
): string {
  if (form === 'label') return `union(${members.length})`;
  if (members.length === 0) return 'union()';

  if (form === 'outline') {
    const entry = (i: number, room: number): string => clipText(displayName(members[i]!.tag), room);
    return `union(${boundedJoin(members.length, entry, ' | ', budget - 7)})`;
  }

  const entry = (i: number, room: number): string => {
    const member = members[i]!;
    const tag = displayName(member.tag);
    const type = render(member.type, 'summary', room - tag.length - 1, depth + 1, false);
    return clipText(`${tag} ${type}`, room);
  };
  if (top) return boundedJoin(members.length, entry, ' | ', budget);
  return `union(${boundedJoin(members.length, entry, ' | ', budget - 7)})`;
}

/**
 * Join `count` entries with `separator` in about `budget` characters. The
 * entries that do not fit are left out for a closing `… +N`, so a list cut
 * short says how much of it is missing. Only the first entry may be cut
 * itself (`{a_very_long_na…, … +3}`): a later one shows whole or not at all.
 */
function boundedJoin(
  count: number,
  entry: (index: number, room: number) => string,
  separator: string,
  budget: number,
): string {
  let out = '';
  for (let i = 0; i < count; i++) {
    const sep = i === 0 ? '' : separator;
    const after = count - i - 1;
    // Keep room for the `… +N` that would follow this entry.
    const reserve = after > 0 ? separator.length + more(after).length : 0;
    const room = budget - out.length - sep.length - reserve;
    const text = room > 0 ? entry(i, room) : '';
    const cut = text.endsWith(ELLIPSIS);
    if (text === '' || text === ELLIPSIS || text.length > room || (cut && i > 0)) {
      return out + sep + more(count - i);
    }
    out += sep + text;
  }
  return out;
}

function more(count: number): string {
  return `${ELLIPSIS} +${count}`;
}

/** A scalar as a label: `integer`, `decimal(18,4)`, `timestamptz`, `enum`. */
function scalarLabel(node: DuckDBScalarTypeNode): string {
  const name = CANONICAL_NAMES[node.name] ?? node.name;
  if (name === 'DECIMAL' && node.args.length > 0) return `decimal(${node.args.join(',')})`;
  return SHORT_NAMES[name] ?? name.toLowerCase();
}

/** A scalar in words: its `DESCRIBE` name in lower case, without arguments. */
function scalarSpoken(node: DuckDBScalarTypeNode): string {
  return (CANONICAL_NAMES[node.name] ?? node.name).toLowerCase();
}

function speak(node: DuckDBTypeNode, words: Strings['values'], depth: number): string {
  if (depth > MAX_DEPTH) return ELLIPSIS;
  switch (node.kind) {
    case 'scalar':
      return scalarSpoken(node);
    case 'json':
      return words.typeJson;
    case 'variant':
      return words.typeVariant;
    case 'unknown':
      return clipText(printable(node.sqlType), TYPE_OUTLINE_MAX_LENGTH.label);
    case 'list':
      return words.typeList(speak(node.element, words, depth + 1));
    case 'array':
      return words.typeArray(speak(node.element, words, depth + 1), node.size);
    case 'struct':
      return words.typeStruct(node.fields.length);
    case 'map':
      return words.typeMap(speak(node.key, words, depth + 1), speak(node.value, words, depth + 1));
    case 'union':
      return words.typeUnion(node.members.length);
  }
}

/** A field name or union tag as shown: printable, and the empty name as `""`. */
function displayName(name: string): string {
  return name === '' ? '""' : printable(name);
}

/** `text` with each control character (a newline, a tab) as a space. */
function printable(text: string): string {
  return text.replace(/\p{Cc}/gu, ' ');
}
