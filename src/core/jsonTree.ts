/**
 * Lossless JSON for nested values.
 *
 * The table reads a nested value (a LIST, STRUCT, MAP, UNION or VARIANT) as
 * `CAST(to_json(c) AS VARCHAR)`: a plain string, which crosses the worker
 * boundary without Arrow's nested proxies. `to_json` is exact. DECIMAL,
 * HUGEINT and UBIGINT keep every digit; dates, times, UUIDs, BLOBs, ENUMs and
 * INTERVALs are DuckDB's own text; a UNION is `{"tag": value}`; fields and
 * keys keep their order, duplicates and the `""` keys of an unnamed struct
 * (`row(1, 'a')` → `{"":1,"":"a"}`) included. `JSON.parse` would lose some
 * of that: it rounds integers past 2^53, moves integer-like keys (`"2"`,
 * `"1"`) to the front, keeps one of two equal keys, and throws on the bare
 * `NaN`, `Infinity` and `-Infinity` that `to_json` writes for a double that
 * is not finite.
 *
 * So the text is read here instead. {@link parseJsonTree} turns it into a
 * {@link JsonNode} tree that keeps all of it: entries in order, number
 * lexemes as written. {@link materialize} turns a tree into JS values, guided
 * by the DuckDB type the text came from; {@link prettyJson} writes a tree
 * back as standard JSON; {@link toStandardJson} makes raw `to_json` text
 * standard JSON without building a tree.
 *
 * Nothing here recurses: a value nested 10,000 deep is read, materialized
 * and printed with explicit stacks. Imports only the type parser, so the
 * worker can use it too.
 */

import { containsKind } from './duckdbType';
import type {
  DuckDBMapTypeNode,
  DuckDBStructTypeNode,
  DuckDBTypeNode,
  DuckDBUnionMember,
  DuckDBUnionTypeNode,
} from './duckdbType';
import { setOwnProperty } from './ownProperty';

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

/** A JSON object. Its entries keep the text's order, duplicate keys included. */
export interface JsonObjectNode {
  readonly kind: 'object';
  readonly entries: readonly JsonEntry[];
}

/** One `"key": value` pair of a {@link JsonObjectNode}. */
export interface JsonEntry {
  readonly key: string;
  readonly value: JsonNode;
}

/** A JSON array. */
export interface JsonArrayNode {
  readonly kind: 'array';
  readonly items: readonly JsonNode[];
}

/** A JSON string, its escapes decoded. */
export interface JsonStringNode {
  readonly kind: 'string';
  readonly value: string;
}

/**
 * A JSON number, kept as the text that wrote it: `1.25`, `-0.0`, `1e-7`,
 * `170141183460469231731687303715884105727`. A number that is not finite is
 * the word DuckDB wrote for it: `NaN`, `Infinity` or `-Infinity` from
 * `to_json`, and in values of DuckDB's JSON type also `nan`, `inf`, `-inf`,
 * `INF`, … in any case.
 */
export interface JsonNumberNode {
  readonly kind: 'number';
  readonly raw: string;
}

/** `true` or `false`. */
export interface JsonBooleanNode {
  readonly kind: 'boolean';
  readonly value: boolean;
}

/** `null`. */
export interface JsonNullNode {
  readonly kind: 'null';
}

/**
 * A JSON value, as a tree that keeps everything the text said: object
 * entries in order with duplicate keys, and numbers as written. Every node
 * is an object of its own, so a node can be a key in a `Map` or `WeakMap`.
 * Nodes are not frozen; treat them as read-only.
 *
 * @example
 * ```ts
 * const { root } = parseJsonTree('{"2":1,"1":[1.50,NaN]}');
 * if (root.kind === 'object') {
 *   root.entries.map((e) => e.key); // ['2', '1'] — not reordered
 * }
 * ```
 */
export type JsonNode =
  JsonObjectNode | JsonArrayNode | JsonStringNode | JsonNumberNode | JsonBooleanNode | JsonNullNode;

/** What {@link parseJsonTree} read. */
export interface JsonParseResult {
  readonly root: JsonNode;
  /** The text ended early or was malformed: what was open got closed, what was read is kept. */
  readonly truncated: boolean;
}

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const SPACE = 0x20;
const QUOTE = 0x22;
const PLUS = 0x2b;
const COMMA = 0x2c;
const MINUS = 0x2d;
const DOT = 0x2e;
const SLASH = 0x2f;
const DIGIT_0 = 0x30;
const DIGIT_1 = 0x31;
const DIGIT_9 = 0x39;
const COLON = 0x3a;
const UPPER_E = 0x45;
const OPEN_BRACKET = 0x5b;
const BACKSLASH = 0x5c;
const CLOSE_BRACKET = 0x5d;
const LOWER_B = 0x62;
const LOWER_E = 0x65;
const LOWER_F = 0x66;
const LOWER_N = 0x6e;
const LOWER_R = 0x72;
const LOWER_T = 0x74;
const LOWER_U = 0x75;
const OPEN_BRACE = 0x7b;
const CLOSE_BRACE = 0x7d;

/** Whether `c` is a digit. `NaN` (past the end of the text) is not. */
function isDigit(c: number): boolean {
  return c >= DIGIT_0 && c <= DIGIT_9;
}

/** Whether `c` is an ASCII letter. */
function isLetter(c: number): boolean {
  const lower = c | 0x20;
  return lower >= 0x61 && lower <= 0x7a;
}

/**
 * The end of the JSON number that starts at `start`, or -1 when the text
 * there is not a whole number: `-`, `1.`, `1e+`, `.5`. Follows the JSON
 * grammar, so a leading zero ends the number (`01` is `0`, then `1`).
 */
function numberEnd(text: string, start: number): number {
  let i = start;
  let c = text.charCodeAt(i);
  if (c === MINUS) c = text.charCodeAt(++i);
  if (c === DIGIT_0) {
    c = text.charCodeAt(++i);
  } else if (c >= DIGIT_1 && c <= DIGIT_9) {
    do c = text.charCodeAt(++i);
    while (isDigit(c));
  } else {
    return -1;
  }
  if (c === DOT) {
    c = text.charCodeAt(++i);
    if (!isDigit(c)) return -1;
    do c = text.charCodeAt(++i);
    while (isDigit(c));
  }
  if (c === LOWER_E || c === UPPER_E) {
    c = text.charCodeAt(++i);
    if (c === PLUS || c === MINUS) c = text.charCodeAt(++i);
    if (!isDigit(c)) return -1;
    do c = text.charCodeAt(++i);
    while (isDigit(c));
  }
  return i;
}

/** The code unit written as four hex digits at `at`, or -1 when they are not there. */
function hex4(text: string, at: number): number {
  let unit = 0;
  for (let k = 0; k < 4; k++) {
    const c = text.charCodeAt(at + k);
    let digit: number;
    if (c >= DIGIT_0 && c <= DIGIT_9) digit = c - DIGIT_0;
    else if (c >= 0x41 && c <= 0x46) digit = c - 0x37;
    else if (c >= 0x61 && c <= 0x66) digit = c - 0x57;
    else return -1;
    unit = unit * 16 + digit;
  }
  return unit;
}

/**
 * The value of a word for a number that is not finite: `NaN`, `Infinity`,
 * `-Infinity`, and the spellings DuckDB's JSON type also accepts (`nan`,
 * `inf`, `-inf`, `infinity`, any case, `-NaN`). `undefined` for any other text.
 */
function nonFiniteValue(word: string): number | undefined {
  const lower = word.toLowerCase();
  const negative = lower.charCodeAt(0) === MINUS;
  const body = negative ? lower.slice(1) : lower;
  if (body === 'nan') return NaN;
  if (body === 'inf' || body === 'infinity') return negative ? -Infinity : Infinity;
  return undefined;
}

/** Whether `raw` is an integer written as digits: `-12`, `007`, not `1.0` or `1e3`. */
function isIntegerLexeme(raw: string): boolean {
  let i = raw.charCodeAt(0) === MINUS ? 1 : 0;
  if (i >= raw.length) return false;
  for (; i < raw.length; i++) {
    if (!isDigit(raw.charCodeAt(i))) return false;
  }
  return true;
}

/** An integer's digits as a number when that is exact, else as a bigint. */
function integerValue(digits: string): number | bigint {
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : BigInt(digits);
}

/** A number lexeme or word as a double: `-0.0` → -0, `nan` → NaN, `-inf` → -Infinity. */
function floatValue(raw: string): number {
  const n = Number(raw);
  if (!Number.isNaN(n)) return n;
  return nonFiniteValue(raw) ?? NaN;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** A container {@link parseJsonTree} has opened and not closed yet. */
interface OpenObject {
  readonly kind: 'object';
  readonly entries: JsonEntry[];
}
interface OpenArray {
  readonly kind: 'array';
  readonly items: JsonNode[];
}

// What the parser expects next.
/** A value: the document's own, or the one after a `:`. */
const EXPECT_VALUE = 0;
/** An array item, or `]`: after `[`, and after a `,` (DuckDB allows `[1,]`). */
const EXPECT_ITEM = 1;
/** An object key, or `}`: after `{`, and after a `,` (DuckDB allows `{"a":1,}`). */
const EXPECT_KEY = 2;
/** The `:` after a key. */
const EXPECT_COLON = 3;
/** A `,` or the closing bracket after a value; after the document's value, the end of the text. */
const EXPECT_NEXT = 4;

/**
 * Read JSON text into a {@link JsonNode} tree, losing nothing: object entries
 * stay in order with duplicate keys, and numbers keep the text that wrote
 * them, every digit included.
 *
 * Reads standard JSON plus what DuckDB writes and accepts beyond it: the
 * words `NaN`, `Infinity` and `-Infinity` that `to_json` writes for doubles
 * that are not finite, read as numbers (in any case, and `inf` and
 * `infinity` too, which values of DuckDB's JSON type may hold), and a
 * trailing comma before `]` or `}`. String escapes are decoded, `\uXXXX`
 * included; a surrogate pair written as two escapes becomes the one
 * character, and a lone surrogate escape stays that code unit.
 *
 * Never throws. When the text ends early or is malformed, reading stops
 * there: every open container is closed, what was read is kept, and
 * `truncated` is `true`. A string cut short keeps the part that was read; a
 * number cut short is kept when what was read is a number by itself (`12`)
 * and left out otherwise (`1.`, `-`), as are a key without its value and a
 * word cut short. Text with no value at all reads as `null`, truncated.
 *
 * One pass with an explicit stack, so any depth of nesting is fine.
 *
 * @example
 * ```ts
 * parseJsonTree('[1.50,NaN,170141183460469231731687303715884105727]');
 * // { root: { kind: 'array', items: [
 * //     { kind: 'number', raw: '1.50' },
 * //     { kind: 'number', raw: 'NaN' },
 * //     { kind: 'number', raw: '170141183460469231731687303715884105727' } ] },
 * //   truncated: false }
 *
 * parseJsonTree('{"tags":["a","b');
 * // { root: { kind: 'object', entries: [{ key: 'tags', value:
 * //     { kind: 'array', items: [{ kind: 'string', value: 'a' }, { kind: 'string', value: 'b' }] } }] },
 * //   truncated: true }
 * ```
 */
export function parseJsonTree(text: string): JsonParseResult {
  const length = text.length;
  const open: (OpenObject | OpenArray)[] = [];
  let root: JsonNode | undefined;
  /** The key of the entry whose value is read next. */
  let key = '';
  let expect = EXPECT_VALUE;
  let i = 0;
  let truncated = true;
  // Where the next quote and backslash are. Reading only moves forward, so
  // each is searched for again only once reading has passed it, and every
  // character is searched over at most once for each.
  let quote = -1;
  let backslash = -1;
  /** Set by `readString`: the index after the closing quote, or -1 when there was none. */
  let stringEnd = -1;

  const add = (node: JsonNode): void => {
    const parent = open[open.length - 1];
    if (parent === undefined) root = node;
    else if (parent.kind === 'array') parent.items.push(node);
    else parent.entries.push({ key, value: node });
  };

  /**
   * Read the string whose opening quote is at `at`. Returns what was read
   * even when the text ends first or a bad escape stops it; `stringEnd`
   * tells which.
   */
  const readString = (at: number): string => {
    let value = '';
    let from = at + 1;
    for (;;) {
      if (quote < from) {
        quote = text.indexOf('"', from);
        if (quote === -1) quote = length;
      }
      if (backslash < from) {
        backslash = text.indexOf('\\', from);
        if (backslash === -1) backslash = length;
      }
      if (backslash >= quote) {
        // No escape before the closing quote (or before the end of a string cut short).
        value += text.slice(from, quote);
        stringEnd = quote < length ? quote + 1 : -1;
        return value;
      }
      value += text.slice(from, backslash);
      let char: string;
      let width = 2;
      switch (text.charCodeAt(backslash + 1)) {
        case QUOTE:
          char = '"';
          break;
        case BACKSLASH:
          char = '\\';
          break;
        case SLASH:
          char = '/';
          break;
        case LOWER_B:
          char = '\b';
          break;
        case LOWER_F:
          char = '\f';
          break;
        case LOWER_N:
          char = '\n';
          break;
        case LOWER_R:
          char = '\r';
          break;
        case LOWER_T:
          char = '\t';
          break;
        case LOWER_U: {
          const unit = hex4(text, backslash + 2);
          if (unit < 0) {
            stringEnd = -1;
            return value;
          }
          // Each escape is one UTF-16 code unit, so the two escapes of a
          // surrogate pair make the one character, and a lone one stays.
          char = String.fromCharCode(unit);
          width = 6;
          break;
        }
        default:
          // An escape JSON does not have, or the text ends after the backslash.
          stringEnd = -1;
          return value;
      }
      value += char;
      from = backslash + width;
    }
  };

  for (;;) {
    let c = text.charCodeAt(i);
    while (c === SPACE || c === LINE_FEED || c === CARRIAGE_RETURN || c === TAB) {
      c = text.charCodeAt(++i);
    }
    if (i >= length) {
      truncated = open.length > 0 || root === undefined;
      break;
    }

    if (expect === EXPECT_NEXT) {
      const parent = open[open.length - 1];
      // More text after the document's value.
      if (parent === undefined) break;
      if (c === COMMA) {
        i++;
        expect = parent.kind === 'array' ? EXPECT_ITEM : EXPECT_KEY;
        continue;
      }
      if (c === (parent.kind === 'array' ? CLOSE_BRACKET : CLOSE_BRACE)) {
        i++;
        open.pop();
        continue;
      }
      break;
    }

    if (expect === EXPECT_KEY) {
      if (c === CLOSE_BRACE) {
        i++;
        open.pop();
        expect = EXPECT_NEXT;
        continue;
      }
      if (c !== QUOTE) break;
      key = readString(i);
      // A key cut short has no value, so its entry is left out.
      if (stringEnd < 0) break;
      i = stringEnd;
      expect = EXPECT_COLON;
      continue;
    }

    if (expect === EXPECT_COLON) {
      if (c !== COLON) break;
      i++;
      expect = EXPECT_VALUE;
      continue;
    }

    if (expect === EXPECT_ITEM && c === CLOSE_BRACKET) {
      i++;
      open.pop();
      expect = EXPECT_NEXT;
      continue;
    }

    // A value.
    if (c === QUOTE) {
      add({ kind: 'string', value: readString(i) });
      if (stringEnd < 0) break;
      i = stringEnd;
      expect = EXPECT_NEXT;
      continue;
    }
    if (c === OPEN_BRACE) {
      const node: OpenObject = { kind: 'object', entries: [] };
      add(node);
      open.push(node);
      i++;
      expect = EXPECT_KEY;
      continue;
    }
    if (c === OPEN_BRACKET) {
      const node: OpenArray = { kind: 'array', items: [] };
      add(node);
      open.push(node);
      i++;
      expect = EXPECT_ITEM;
      continue;
    }
    if (isDigit(c) || (c === MINUS && isDigit(text.charCodeAt(i + 1)))) {
      const end = numberEnd(text, i);
      if (end < 0) break;
      add({ kind: 'number', raw: text.slice(i, end) });
      i = end;
      expect = EXPECT_NEXT;
      continue;
    }
    // A word: true, false, null, or a number that is not finite.
    let end = c === MINUS ? i + 1 : i;
    while (isLetter(text.charCodeAt(end))) end++;
    const word = text.slice(i, end);
    let node: JsonNode;
    if (word === 'true') node = { kind: 'boolean', value: true };
    else if (word === 'false') node = { kind: 'boolean', value: false };
    else if (word === 'null') node = { kind: 'null' };
    else if (nonFiniteValue(word) !== undefined) node = { kind: 'number', raw: word };
    else break;
    add(node);
    i = end;
    expect = EXPECT_NEXT;
  }

  return { root: root ?? { kind: 'null' }, truncated };
}

/**
 * A JSON number's text as a JS value, the way {@link materialize} reads a
 * number it has no DuckDB type for: an integer written as digits is a
 * `number` when that is exact (within ±(2^53−1)) and a `bigint` beyond;
 * anything with a fraction or an exponent is a `number`; the words for
 * numbers that are not finite are `NaN`, `Infinity` and `-Infinity`.
 *
 * @example
 * ```ts
 * jsonNumberToJs('42');                    // 42
 * jsonNumberToJs('9007199254740993');      // 9007199254740993n
 * jsonNumberToJs('100000000000000000000.0'); // 100000000000000000000 (a double: it has a fraction)
 * jsonNumberToJs('-0.0');                  // -0
 * jsonNumberToJs('-Infinity');             // -Infinity
 * ```
 */
export function jsonNumberToJs(raw: string): number | bigint {
  return isIntegerLexeme(raw) ? integerValue(raw) : floatValue(raw);
}

// ---------------------------------------------------------------------------
// Materializing
// ---------------------------------------------------------------------------

// How a container made by `materialize` is filled from its JSON.
/** A JSON array → a JS array; the task's type is the element type. */
const FILL_ITEMS = 0;
/** A JSON object read as a STRUCT whose fields all have names → an object. */
const FILL_FIELDS = 1;
/** A JSON object read as a STRUCT with an unnamed field → an array. */
const FILL_TUPLE = 2;
/** A JSON object read as a MAP (`to_json`'s `{"key": value}`) → a Map or an object. */
const FILL_MAP_OBJECT = 3;
/**
 * A JSON array of `{"key": …, "value": …}` read as a MAP → a Map or an
 * object. A MAP cast to VARIANT, then to JSON, is written this way.
 */
const FILL_MAP_ENTRIES = 4;
/** A JSON object with no type to follow → an object. */
const FILL_OBJECT = 5;

type Fill =
  | typeof FILL_ITEMS
  | typeof FILL_FIELDS
  | typeof FILL_TUPLE
  | typeof FILL_MAP_OBJECT
  | typeof FILL_MAP_ENTRIES
  | typeof FILL_OBJECT;

/** A container made by `materialize`, still empty, and how to fill it. */
interface FillTask {
  readonly fill: Fill;
  readonly node: JsonObjectNode | JsonArrayNode;
  readonly type: DuckDBTypeNode | undefined;
  readonly out: unknown[] | Record<string, unknown> | Map<unknown, unknown>;
}

/** The library's `DataType` for a scalar type; `undefined` for any other kind of type. */
function scalarDataType(type: DuckDBTypeNode | undefined): string | undefined {
  return type?.kind === 'scalar' ? type.dataType : undefined;
}

/** A JSON number read as `type`. */
function numberValue(raw: string, type: DuckDBTypeNode | undefined, exporting: boolean): unknown {
  const dataType = scalarDataType(type);
  if (dataType === 'float' || dataType === 'decimal') {
    const n = floatValue(raw);
    return exporting && !Number.isFinite(n) ? null : n;
  }
  if (dataType !== undefined && dataType !== 'integer' && dataType !== 'boolean') {
    // A type whose values are text (BIGNUM, for one, is written as digits).
    return raw;
  }
  // An integer type, or no type to follow.
  const value = jsonNumberToJs(raw);
  if (!exporting) return value;
  if (typeof value === 'bigint') return value.toString();
  return Number.isFinite(value) ? value : null;
}

/**
 * A MAP key, from its text, as a JS value: a number for an integer type (a
 * bigint beyond ±(2^53−1)) and for a FLOAT, DOUBLE or DECIMAL type, a
 * boolean for BOOLEAN, and the text as is for every other type.
 */
function mapKeyValue(text: string, keyType: DuckDBTypeNode): unknown {
  switch (scalarDataType(keyType)) {
    case 'integer':
      return isIntegerLexeme(text) ? integerValue(text) : text;
    case 'float':
    case 'decimal':
      // DuckDB's text for a double: `1.5`, `-0.0`, `1e+300`, `nan`, `inf`, `-inf`.
      if (numberEnd(text, 0) === text.length) return Number(text);
      return nonFiniteValue(text) ?? text;
    case 'boolean':
      return text === 'true' ? true : text === 'false' ? false : text;
    default:
      return text;
  }
}

/**
 * Whether a value of `type` is read through VARIANT: `jsonValueSQL` writes
 * one as `CAST(CAST(c AS VARIANT) AS JSON)` when the type holds a VARIANT
 * inside (`VARIANT[]`, `STRUCT(v VARIANT)`), and so do {@link materialize}
 * and the value inspector read its JSON. Through VARIANT a MAP is a list of
 * `{"key": …, "value": …}` objects and a UNION its member's bare value,
 * without the tag. A VARIANT or JSON column is not: its value is the JSON.
 * A type the parser could not read is when its text names VARIANT.
 *
 * @example
 * ```ts
 * readsThroughVariant(parseDuckDBType('STRUCT(v VARIANT)[]')); // true
 * readsThroughVariant(parseDuckDBType('VARIANT'));             // false
 * readsThroughVariant(parseDuckDBType('INTEGER[]'));           // false
 * ```
 */
export function readsThroughVariant(type: DuckDBTypeNode | undefined): boolean {
  if (type === undefined || type.kind === 'variant' || type.kind === 'json') return false;
  return type.kind === 'unknown'
    ? /\bVARIANT\b/i.test(type.sqlType)
    : containsKind(type, 'variant');
}

/**
 * The text of a MAP key read through VARIANT, whose keys are typed JSON:
 * a string's value, a number as written, `true`, `false` and `null`, and a
 * STRUCT or LIST key as its JSON, which DuckDB also reads back as the key.
 *
 * @example
 * ```ts
 * mapKeyText(parseJsonTree('1.50').root);       // '1.50'
 * mapKeyText(parseJsonTree('{"k":1}').root);    // '{"k":1}'
 * ```
 */
export function mapKeyText(node: JsonNode): string {
  switch (node.kind) {
    case 'string':
      return node.value;
    case 'number':
      return node.raw;
    case 'boolean':
      return node.value ? 'true' : 'false';
    case 'null':
      return 'null';
    default:
      return prettyJson(node, 0);
  }
}

/**
 * The `key` and `value` of one item of a MAP read through VARIANT,
 * `{"key": …, "value": …}` with its two entries in either order; `undefined`
 * for any other JSON (an item cut short, for one).
 *
 * @example
 * ```ts
 * mapEntryOf(parseJsonTree('{"key":"a","value":1}').root);
 * // { key: { kind: 'string', value: 'a' }, value: { kind: 'number', raw: '1' } }
 * mapEntryOf(parseJsonTree('{"key":"a"}').root); // undefined
 * ```
 */
export function mapEntryOf(item: JsonNode): { key: JsonNode; value: JsonNode } | undefined {
  if (item.kind !== 'object' || item.entries.length !== 2) return undefined;
  const [first, second] = item.entries as [JsonEntry, JsonEntry];
  if (first.key === 'key' && second.key === 'value')
    return { key: first.value, value: second.value };
  if (first.key === 'value' && second.key === 'key')
    return { key: second.value, value: first.value };
  return undefined;
}

/** Whether every item of `node` is a `{"key": …, "value": …}` object. */
function isEntryList(node: JsonArrayNode): boolean {
  for (const item of node.items) {
    if (mapEntryOf(item) === undefined) return false;
  }
  return true;
}

/**
 * The member of `type` that `to_json`'s `{"tag": value}` names: the one
 * with that tag exactly, else in any case, as `to_json` writes the tag.
 *
 * @example
 * ```ts
 * unionMember(parseDuckDBType('UNION(num INTEGER, str VARCHAR)') as DuckDBUnionTypeNode, 'NUM');
 * // { tag: 'num', type: { kind: 'scalar', name: 'INTEGER', … } }
 * ```
 */
export function unionMember(type: DuckDBUnionTypeNode, tag: string): DuckDBUnionMember | undefined {
  const exact = type.members.find((m) => m.tag === tag);
  if (exact) return exact;
  const lower = tag.toLowerCase();
  return type.members.find((m) => m.tag.toLowerCase() === lower);
}

/** Whether any field of `type` has no name. */
function hasUnnamedField(type: DuckDBStructTypeNode): boolean {
  return type.fields.some((f) => f.name === null);
}

/**
 * Turn a {@link JsonNode} tree into JS values, reading it as the DuckDB type
 * the JSON came from (`parseDuckDBType(column.originalType)`).
 *
 * In `'value'` mode, what `actions.getCellValue` and `getColumnValues` give:
 *
 * - LIST and ARRAY → an array.
 * - STRUCT → an object keyed by field name, fields matched to the JSON's
 *   entries by position (`to_json` keeps their order); a field named with
 *   the empty string (`{"b": 2, "": 1}` loads as `STRUCT(b BIGINT,
 *   BIGINT)`) under the key `''`. A struct with unnamed fields
 *   (`row(1, 'a')`) → an array of its values in order.
 * - MAP → a `Map` in key order. Keys follow the key type: integers are
 *   numbers (bigints beyond ±(2^53−1)), FLOAT, DOUBLE and DECIMAL keys
 *   numbers, BOOLEAN keys booleans; every other key, STRUCT and LIST keys
 *   included (`to_json` writes them as DuckDB text, `{'k': 1}`), is its text.
 * - UNION → `{ [tag]: value }`.
 * - Integers → a number when exact, a bigint beyond ±(2^53−1). FLOAT,
 *   DOUBLE and DECIMAL → a number (`NaN`, `±Infinity` and `-0` kept; a
 *   FLOAT arrives widened, `0.10000000149011612`, which is exactly
 *   `Math.fround(0.1)`). BOOLEAN → a boolean. Every other type (text, UUID,
 *   dates, times, timestamps, INTERVAL, BLOB, BIT, ENUM) → its DuckDB text
 *   as `to_json` wrote it; a number where such a type is expected → its
 *   digits as text.
 * - JSON, VARIANT, a type the parser could not read, or no type at all →
 *   read from the JSON alone: objects → objects (of two equal keys the last
 *   wins), arrays → arrays, numbers as {@link jsonNumberToJs} reads them,
 *   strings, booleans and `null` as they are.
 * - `null` → `null`, at any level. A node whose kind does not fit the type
 *   (text where a list was expected) is read from the JSON alone.
 *
 * `'export'` mode, for JSON export files, differs only where JSON cannot
 * hold the value (as `formatValueForJSON` in `JSONExport.ts`): a MAP is a
 * plain object keyed by the key's text, an integer beyond ±(2^53−1) is its
 * decimal string, and `NaN` and `±Infinity` are `null`.
 *
 * Objects are ordinary objects built the way `JSON.parse` builds them:
 * every key is an own, enumerable data property, so `__proto__`,
 * `constructor`, `toJSON` and `hasOwnProperty` are keys like any other and
 * nothing reaches a prototype. They survive `structuredClone` and show in
 * `JSON.stringify` and `Object.keys`. Two caveats come with every JS
 * object: integer-like keys are listed first, in ascending order (the tree
 * and {@link prettyJson} keep the text's order), and a key named
 * `hasOwnProperty` hides the method, so test keys with `Object.hasOwn`.
 *
 * A MAP read through VARIANT (`CAST(CAST(c AS VARIANT) AS JSON)`, for types
 * that hold a VARIANT: {@link readsThroughVariant}) arrives as
 * `[{"key": k, "value": v}, …]` and is read the same way, a STRUCT or LIST
 * key then being its JSON text. A UNION read that way has lost its tag, and
 * its bare value is read from the JSON alone: a struct member is not taken
 * for the member its one field's name happens to match.
 *
 * Iterative, so any depth of nesting is fine.
 *
 * @example
 * ```ts
 * const type = parseDuckDBType('MAP(INTEGER, DECIMAL(4,2)[])');
 * const { root } = parseJsonTree('{"2":[1.25],"1":[]}');
 * materialize(root, type, 'value');  // Map { 2 => [1.25], 1 => [] }
 * materialize(root, type, 'export'); // { '1': [], '2': [1.25] }
 *
 * materialize(parseJsonTree('[170141183460469231731687303715884105727,NaN]').root,
 *   parseDuckDBType('HUGEINT[]'), 'value');
 * // [170141183460469231731687303715884105727n, NaN]
 * ```
 */
export function materialize(
  node: JsonNode,
  type: DuckDBTypeNode | undefined,
  mode: 'value' | 'export',
): unknown {
  const exporting = mode === 'export';
  const throughVariant = readsThroughVariant(type);
  const tasks: FillTask[] = [];

  /**
   * The JS value for `json` read as `as`: a leaf, or a new container that
   * is queued to be filled. Containers are filled from the queue, never by
   * recursion, and each one's slots in order, so object keys and Map
   * entries keep the JSON's order.
   */
  const start = (json: JsonNode, as: DuckDBTypeNode | undefined): unknown => {
    switch (json.kind) {
      case 'null':
        return null;
      case 'string':
      case 'boolean':
        return json.value;
      case 'number':
        return numberValue(json.raw, as, exporting);
      case 'array': {
        if (as?.kind === 'list' || as?.kind === 'array') {
          const out: unknown[] = [];
          tasks.push({ fill: FILL_ITEMS, node: json, type: as.element, out });
          return out;
        }
        if (as?.kind === 'map' && isEntryList(json)) {
          const out = exporting ? {} : new Map<unknown, unknown>();
          tasks.push({ fill: FILL_MAP_ENTRIES, node: json, type: as, out });
          return out;
        }
        const out: unknown[] = [];
        tasks.push({ fill: FILL_ITEMS, node: json, type: undefined, out });
        return out;
      }
      case 'object': {
        if (as?.kind === 'struct') {
          if (hasUnnamedField(as)) {
            const out: unknown[] = [];
            tasks.push({ fill: FILL_TUPLE, node: json, type: as, out });
            return out;
          }
          const out: Record<string, unknown> = {};
          tasks.push({ fill: FILL_FIELDS, node: json, type: as, out });
          return out;
        }
        if (as?.kind === 'map') {
          const out = exporting ? {} : new Map<unknown, unknown>();
          tasks.push({ fill: FILL_MAP_OBJECT, node: json, type: as, out });
          return out;
        }
        if (as?.kind === 'union' && !throughVariant && json.entries.length === 1) {
          const entry = json.entries[0]!;
          const member = unionMember(as, entry.key);
          if (member) {
            const out: Record<string, unknown> = {};
            setOwnProperty(out, entry.key, start(entry.value, member.type));
            return out;
          }
        }
        const out: Record<string, unknown> = {};
        tasks.push({ fill: FILL_OBJECT, node: json, type: undefined, out });
        return out;
      }
    }
  };

  /** Put one MAP entry into `out`, a Map (value mode) or an object (export mode). */
  const putMapEntry = (
    out: FillTask['out'],
    text: string,
    value: JsonNode,
    map: DuckDBMapTypeNode,
  ): void => {
    const converted = start(value, map.value);
    if (out instanceof Map) out.set(mapKeyValue(text, map.key), converted);
    else setOwnProperty(out as Record<string, unknown>, text, converted);
  };

  const result = start(node, type);

  while (tasks.length > 0) {
    const { fill, node: json, type: as, out } = tasks.pop()!;
    switch (fill) {
      case FILL_ITEMS: {
        const items = (json as JsonArrayNode).items;
        const array = out as unknown[];
        for (const item of items) array.push(start(item, as));
        break;
      }
      case FILL_FIELDS: {
        const entries = (json as JsonObjectNode).entries;
        const fields = (as as DuckDBStructTypeNode).fields;
        const object = out as Record<string, unknown>;
        for (let k = 0; k < entries.length; k++) {
          const entry = entries[k]!;
          const field = fields[k];
          // An entry beyond the type's fields keeps its own key, read from the JSON alone.
          if (field) setOwnProperty(object, field.name!, start(entry.value, field.type));
          else setOwnProperty(object, entry.key, start(entry.value, undefined));
        }
        break;
      }
      case FILL_TUPLE: {
        const entries = (json as JsonObjectNode).entries;
        const fields = (as as DuckDBStructTypeNode).fields;
        const array = out as unknown[];
        for (let k = 0; k < entries.length; k++) {
          array.push(start(entries[k]!.value, fields[k]?.type));
        }
        break;
      }
      case FILL_MAP_OBJECT: {
        const map = as as DuckDBMapTypeNode;
        for (const entry of (json as JsonObjectNode).entries) {
          putMapEntry(out, entry.key, entry.value, map);
        }
        break;
      }
      case FILL_MAP_ENTRIES: {
        const map = as as DuckDBMapTypeNode;
        for (const item of (json as JsonArrayNode).items) {
          const entry = mapEntryOf(item)!;
          putMapEntry(out, mapKeyText(entry.key), entry.value, map);
        }
        break;
      }
      case FILL_OBJECT: {
        const object = out as Record<string, unknown>;
        for (const entry of (json as JsonObjectNode).entries) {
          setOwnProperty(object, entry.key, start(entry.value, undefined));
        }
        break;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Line breaks with indentation, by depth, for the depths most values reach. */
const BREAK_CACHE_DEPTH = 32;

/**
 * Write a {@link JsonNode} tree as standard JSON text, laid out the way
 * `JSON.stringify(value, null, indent)` lays it out. Unlike a round trip
 * through `JSON.parse`, it keeps what the tree holds: object entries in
 * order, duplicate keys, and number lexemes exactly as written
 * (`1.50`, `-0.0`, all 39 digits of a HUGEINT). Numbers that are not
 * finite, which JSON cannot hold, are written `null`. Strings are escaped
 * as `JSON.stringify` escapes them. An empty object or array is `{}` or
 * `[]`.
 *
 * @param indent - Spaces per level, 0 to 10 (as `JSON.stringify` clamps it);
 *   0 writes everything on one line.
 *
 * @example
 * ```ts
 * prettyJson(parseJsonTree('{"2":1.50,"1":[NaN]}').root);
 * // '{\n  "2": 1.50,\n  "1": [\n    null\n  ]\n}'
 * prettyJson(parseJsonTree('{"2":1.50,"1":[NaN]}').root, 0);
 * // '{"2":1.50,"1":[null]}'
 * ```
 */
export function prettyJson(node: JsonNode, indent = 2): string {
  let width = Math.trunc(indent);
  if (!(width > 0)) width = 0;
  if (width > 10) width = 10;
  const separator = width > 0 ? ': ' : ':';
  const breaks: string[] = [];
  const lineBreak = (depth: number): string => {
    if (width === 0) return '';
    if (depth >= BREAK_CACHE_DEPTH) return '\n' + ' '.repeat(width * depth);
    return (breaks[depth] ??= '\n' + ' '.repeat(width * depth));
  };

  const open: { readonly node: JsonObjectNode | JsonArrayNode; next: number }[] = [];
  let out = '';
  let pending: JsonNode | undefined = node;
  for (;;) {
    if (pending !== undefined) {
      switch (pending.kind) {
        case 'object':
          if (pending.entries.length === 0) out += '{}';
          else {
            out += '{';
            open.push({ node: pending, next: 0 });
          }
          break;
        case 'array':
          if (pending.items.length === 0) out += '[]';
          else {
            out += '[';
            open.push({ node: pending, next: 0 });
          }
          break;
        case 'string':
          out += JSON.stringify(pending.value);
          break;
        case 'number':
          // Anything but a JSON number (NaN, Infinity, -inf, …) is null.
          out += numberEnd(pending.raw, 0) === pending.raw.length ? pending.raw : 'null';
          break;
        case 'boolean':
          out += pending.value ? 'true' : 'false';
          break;
        case 'null':
          out += 'null';
          break;
      }
      pending = undefined;
    }

    const frame = open[open.length - 1];
    if (frame === undefined) break;
    const container = frame.node;
    const count = container.kind === 'object' ? container.entries.length : container.items.length;
    if (frame.next < count) {
      if (frame.next > 0) out += ',';
      out += lineBreak(open.length);
      if (container.kind === 'object') {
        const entry = container.entries[frame.next]!;
        out += JSON.stringify(entry.key) + separator;
        pending = entry.value;
      } else {
        pending = container.items[frame.next]!;
      }
      frame.next++;
    } else {
      open.pop();
      out += lineBreak(open.length) + (container.kind === 'object' ? '}' : ']');
    }
  }
  return out;
}

/**
 * A quick test for text that may need {@link toStandardJson}'s pass: a word
 * for a number that is not finite, or a trailing comma. Either may also be
 * inside a string; the pass tells.
 */
const MAY_NEED_WORK = /nan|inf|,\s*[\]}]/i;

/** The index after the string whose content starts at `from`, or the text's length. */
function afterString(text: string, from: number): number {
  let at = from;
  for (;;) {
    const quote = text.indexOf('"', at);
    if (quote === -1) return text.length;
    // The quote closes the string unless an odd number of backslashes escape it.
    let before = quote - 1;
    while (before >= at && text.charCodeAt(before) === BACKSLASH) before--;
    if ((quote - 1 - before) % 2 === 0) return quote + 1;
    at = quote + 1;
  }
}

/**
 * Make raw `to_json` text standard JSON, without building a tree: outside
 * strings, the words for numbers that are not finite (`NaN`, `Infinity`,
 * `-Infinity`, and DuckDB's other spellings, `nan`, `-inf`, `INF`, …)
 * become `null`, and a trailing comma before `]` or `}` (which values of
 * DuckDB's JSON type may hold) is dropped. Everything else is kept
 * character for character, so number digits are untouched: a HUGEINT keeps
 * all 39 digits, for a reader that can use them. Strings are never
 * touched, even when they read `"NaN"`.
 *
 * One pass; text with nothing to change comes back as the same string.
 * Used for CSV cells and the clipboard.
 *
 * @example
 * ```ts
 * toStandardJson('{"x":[1.5,NaN,-Infinity],"s":"NaN"}');
 * // '{"x":[1.5,null,null],"s":"NaN"}'
 * toStandardJson('[18446744073709551615]'); // unchanged
 * ```
 */
export function toStandardJson(text: string): string {
  if (!MAY_NEED_WORK.test(text)) return text;
  const length = text.length;
  let out = '';
  let copied = 0;
  /** A comma with nothing but whitespace after it so far, or -1. */
  let comma = -1;
  let i = 0;
  while (i < length) {
    const c = text.charCodeAt(i);
    if (c === QUOTE) {
      i = afterString(text, i + 1);
      comma = -1;
      continue;
    }
    if (c === SPACE || c === LINE_FEED || c === CARRIAGE_RETURN || c === TAB) {
      i++;
      continue;
    }
    if (c === COMMA) {
      comma = i++;
      continue;
    }
    if (c === CLOSE_BRACKET || c === CLOSE_BRACE) {
      if (comma >= 0) {
        out += text.slice(copied, comma);
        copied = comma + 1;
        comma = -1;
      }
      i++;
      continue;
    }
    comma = -1;
    if (isLetter(c) || (c === MINUS && isLetter(text.charCodeAt(i + 1)))) {
      let end = i + 1;
      while (isLetter(text.charCodeAt(end))) end++;
      if (nonFiniteValue(text.slice(i, end)) !== undefined) {
        out += text.slice(copied, i) + 'null';
        copied = end;
      }
      i = end;
      continue;
    }
    i++;
  }
  return copied === 0 ? text : out + text.slice(copied);
}
