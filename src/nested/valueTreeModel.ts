/**
 * The value inspector's tree: one nested value, as the nodes a tree view
 * shows.
 *
 * The inspector reads a cell's exact value as JSON text (`jsonValueSQL`),
 * parses it with `parseJsonTree`, and hands the tree here with the column's
 * DuckDB type (`parseDuckDBType(column.originalType)`). {@link buildValueTree}
 * pairs the two. Each node knows the DuckDB type at its place, the key it sits
 * under, how its value reads, and the path that "extract field → column"
 * reads it by. Nothing here touches the DOM: the panel turns nodes into rows,
 * and every word it shows comes from {@link ValueTreeMessages}.
 *
 * What a node shows:
 *
 * - **Text** quoted and escaped as JSON escapes it (`"a\nb"`; control
 *   characters and lone surrogates as `\uXXXX`), cut after
 *   {@link VALUE_TREE_STRING_CAP} characters (code points, at a grapheme
 *   boundary, never inside a surrogate pair), with a "more characters" note.
 * - **Numbers** exactly as DuckDB wrote them: a DECIMAL with its zeros
 *   (`1.50`, when the JSON kept them), a HUGEINT with all its digits. A FLOAT
 *   arrives widened to a double (`0.10000000149011612`) and is shown at
 *   float32 precision, as DuckDB writes a FLOAT (`0.1`; {@link formatFloat32}).
 *   `NaN`, `Infinity`, `-Infinity`, `true` and `false` are keywords; `null`
 *   is null.
 * - **Dates, times, timestamps, intervals, UUIDs, BLOBs, ENUMs and BITs** as
 *   DuckDB's text for them, unquoted (`2024-01-31`, `\xAA\x00`).
 * - **Containers** (lists, arrays, structs, maps, unions, JSON objects and
 *   arrays) as their type, a count, and a preview of what they hold, at most
 *   {@link VALUE_TREE_PREVIEW_CHARS} characters: `[56, 3, 91, …]`,
 *   `{x: 1.25, y: 0.58, …}`, `{k1 → 1, k2 → 2}`, `(1, "a")` for a struct
 *   whose fields have no names.
 *
 * Under what key:
 *
 * - A struct's field under its name; an unnamed field under its 1-based
 *   position.
 * - A list's or an array's element under its 1-based position, as SQL
 *   counts (`tags[1]`); an element of a JSON array under its 0-based index,
 *   as JSONPath counts (`$[0]`).
 * - A map's entry under its key's text; the node shows the entry's value
 *   (the panel draws `key → value`).
 * - A union's one member under its tag. A union read through VARIANT (inside
 *   a type that holds a VARIANT) has lost its tag: it shows its bare value,
 *   typed by the JSON alone.
 * - Inside a JSON or VARIANT value, objects and arrays are typed by their
 *   JSON kind (`object`, `array`, `string`, …), not by a DuckDB type.
 *
 * Big containers come in buckets, as in browser DevTools: past
 * {@link VALUE_TREE_BUCKET_SIZE} children, a container shows at most 100
 * buckets of 100^k children (the smallest k ≥ 1 that makes 100 buckets or
 * fewer), and each bucket splits the same way. 10,000 items are 100 buckets
 * of 100; 10,001 are a bucket of 10,000 (100 buckets of 100) and a bucket of
 * one. A bucket is labelled with the container's own numbering: `[1 … 100]`
 * for a list, `[0 … 99]` for a JSON array.
 *
 * Children are built the first time they are asked for, and previews read
 * only what fits in them, so a value with a million items, or nested 10,000
 * deep, costs only what is shown. Nothing here recurses over a whole value.
 */

import type {
  DuckDBMapTypeNode,
  DuckDBStructField,
  DuckDBTypeNode,
  DuckDBUnionMember,
} from '../core/duckdbType';
import {
  mapEntryOf,
  mapKeyText,
  prettyJson,
  readsThroughVariant,
  unionMember,
} from '../core/jsonTree';
import type { JsonEntry, JsonNode } from '../core/jsonTree';
import { typeOutline } from './typeOutline';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Children a container lists before it splits them into buckets. */
export const VALUE_TREE_BUCKET_SIZE = 100;

/** Characters of text (code points) a node shows before it cuts the rest. */
export const VALUE_TREE_STRING_CAP = 2000;

/** The longest preview a container shows. */
export const VALUE_TREE_PREVIEW_CHARS = 60;

/**
 * Rows {@link defaultExpansion} lets the tree open with: the root, its
 * children, and their children when that comes to this many rows or fewer.
 */
export const VALUE_TREE_EXPANDED_ROWS = 50;

/**
 * The words a value tree shows. Every one takes a number and does its own
 * formatting and plural forms; the panel passes its resolved strings.
 *
 * @example
 * ```ts
 * const messages: ValueTreeMessages = {
 *   itemCount: (n) => `${n.toLocaleString()} ${n === 1 ? 'item' : 'items'}`,
 *   entryCount: (n) => `${n.toLocaleString()} ${n === 1 ? 'entry' : 'entries'}`,
 *   fieldCount: (n) => `${n.toLocaleString()} ${n === 1 ? 'field' : 'fields'}`,
 *   keyCount: (n) => `${n.toLocaleString()} ${n === 1 ? 'key' : 'keys'}`,
 *   bucketLabel: (first, last) => `[${first} … ${last}]`,
 *   moreCharacters: (n) => `${n.toLocaleString()} more characters`,
 * };
 * ```
 */
export interface ValueTreeMessages {
  /** Elements of a list, an array or a JSON array: "3 items". */
  itemCount: (count: number) => string;
  /** Entries of a map: "600 entries". */
  entryCount: (count: number) => string;
  /** Fields of a struct: "3 fields". */
  fieldCount: (count: number) => string;
  /** Keys of a JSON object: "2 keys". */
  keyCount: (count: number) => string;
  /**
   * A bucket's label, from the number of its first child to the number of
   * its last, in the container's own numbering (1-based for DuckDB lists,
   * arrays, structs and maps, 0-based inside JSON): "[1 … 100]". `first`
   * equals `last` for a bucket of one.
   */
  bucketLabel: (first: number, last: number) => string;
  /** What follows text cut short, by how many characters (code points) were left out. */
  moreCharacters: (count: number) => string;
}

/**
 * How a leaf's text is styled:
 *
 * - `string`: text, quoted and escaped (`"it's"`).
 * - `number`: a number as written (`1.50`, `-0.0`, a HUGEINT's 39 digits).
 * - `keyword`: `true`, `false`, `NaN`, `Infinity`, `-Infinity`.
 * - `null`: `null`.
 * - `text`: DuckDB's text for a date, time, timestamp, interval, UUID, BLOB,
 *   ENUM or BIT, shown unquoted (`2024-01-31`).
 */
export type ValueStyle = 'string' | 'number' | 'keyword' | 'null' | 'text';

/** A leaf's value, as {@link ValueTreeNode.value} shows it. */
export interface ValueTreeValue {
  /**
   * The text to show. Text cut short ends with `…` (inside the quotes of a
   * string: `"Lorem ipsum…"`).
   */
  readonly text: string;
  readonly style: ValueStyle;
  /**
   * When the text was cut: how much more there is, from
   * {@link ValueTreeMessages.moreCharacters}, for the panel to show after it.
   */
  readonly more?: string;
}

/**
 * What a node's key is:
 *
 * - `column`: the root, under the name given as `rootKey`.
 * - `field`: a struct field's name.
 * - `position`: a 1-based position: a list's or array's element, a field of
 *   a struct without names.
 * - `mapKey`: a map entry's key, as text.
 * - `tag`: the tag of the member a union holds.
 * - `jsonKey`: a key of a JSON object.
 * - `jsonIndex`: a 0-based index into a JSON array.
 * - `bucket`: a bucket's label (`[1 … 100]`).
 */
export type ValueTreeKeyKind =
  'column' | 'field' | 'position' | 'mapKey' | 'tag' | 'jsonKey' | 'jsonIndex' | 'bucket';

/** The key a node sits under. */
export interface ValueTreeKey {
  /**
   * The key as shown: control characters escaped (`a\nb`), the empty key as
   * `""`, a key longer than {@link VALUE_TREE_STRING_CAP} cut with `…`.
   */
  readonly text: string;
  readonly kind: ValueTreeKeyKind;
}

/** The children a bucket holds: the container's children `start` to `end - 1`. */
export interface ValueTreeBucket {
  /** 0-based index of the first child, whatever the container's numbering. */
  readonly start: number;
  /** One past the last child. */
  readonly end: number;
}

/**
 * One step of a {@link ValueTreeNode.path}, as `addNestedFieldColumn` and
 * `nestedFieldExpression` read it: a struct field's name (or 1-based position
 * for an unnamed field), a list or array element's 1-based position, a map
 * key (a number for a map whose keys are whole numbers, text otherwise), a
 * union member's tag, and inside a JSON or VARIANT value a key (text) or a
 * 0-based array index (a number).
 */
export type ValueTreePathStep = string | number;

/**
 * One node of a value tree. A leaf has {@link ValueTreeNode.value}; a
 * container has a count, a preview and, unless it is empty,
 * {@link ValueTreeNode.children}; a bucket has
 * {@link ValueTreeNode.bucket}. Treat nodes as read-only.
 */
export interface ValueTreeNode {
  /**
   * Unique within the tree, and the same each time the same value is built:
   * `$` for the root, then the parent container's id and the child's 0-based
   * index (`$/2/0`), and for a bucket the container's id and the indexes it
   * spans (`$/0-99`). Long for deep nodes: one segment per level.
   */
  readonly id: string;
  /**
   * The steps that read this node's value from the column (`[]` for the
   * root), for "extract field → column". `null` for a bucket, and for a
   * node no path reaches: the inside of a union read through VARIANT (its
   * tag is lost), and JSON that does not fit the DuckDB type at its place.
   * Computed when read, so a node 10,000 deep keeps no 10,000-step array.
   */
  readonly path: readonly ValueTreePathStep[] | null;
  /** The key the node sits under; `null` for the root when no `rootKey` was given. */
  readonly key: ValueTreeKey | null;
  /**
   * The DuckDB type of the value at this place. `undefined` inside a JSON or
   * VARIANT value, for a union that lost its tag, and for JSON that does not
   * fit its type: those are typed by their JSON kind. A bucket carries its
   * container's.
   */
  readonly type: DuckDBTypeNode | undefined;
  /**
   * The JSON the node shows: a map entry's value, a union member's value. A
   * bucket carries its container's ({@link nodeJsonText} slices it).
   */
  readonly json: JsonNode;
  /**
   * The type as shown: `typeOutline(type, 'label')` (`struct(3)`, `[integer]`,
   * `json`), or inside JSON or VARIANT the JSON kind: `object`, `array`,
   * `string`, `number`, `boolean`, `null`. Empty for a bucket.
   */
  readonly typeLabel: string;
  /** A leaf's value. */
  readonly value?: ValueTreeValue;
  /**
   * How many children a container holds (its own, not its buckets); for a
   * bucket, how many of them it spans. A union has none.
   */
  readonly count?: number;
  /** The count in words: "3 items", "600 entries", "26 fields", "2 keys". */
  readonly countText?: string;
  /**
   * What a container holds, in at most {@link VALUE_TREE_PREVIEW_CHARS}
   * characters: `[56, 3, 91, …]`, `{x: 1.25, tier: "gold"}`, `{k → 1}`,
   * `{num: 42}` for a union, `[]` when empty.
   */
  readonly preview?: string;
  /** For a bucket: the container's children it spans. */
  readonly bucket?: ValueTreeBucket;
  /**
   * The accessible name, which also drives type-ahead. It starts with the
   * key's text: `x: 1.25`, `point: struct(3), 3 fields`,
   * `u: union(2), {num: 42}`, `s: "Lorem…", 18,000 more characters`,
   * `[1 … 100]`.
   */
  readonly label: string;
  /**
   * Present exactly when the node can expand: a container with children, or
   * a bucket. Builds the children on the first call; later calls return the
   * same array of the same nodes. A container with more than
   * {@link VALUE_TREE_BUCKET_SIZE} children returns buckets.
   */
  readonly children?: () => readonly ValueTreeNode[];
}

/** Options for {@link buildValueTree}. */
export interface ValueTreeOptions {
  /** Key text of the root, such as the column's name. Without it the root has no key. */
  rootKey?: string | undefined;
  /** Children a container lists before splitting them into buckets. Default 100. */
  bucketSize?: number | undefined;
  /** Characters of text a leaf or key shows before cutting the rest. Default 2,000. */
  stringCap?: number | undefined;
  /** The longest container preview. Default 60. */
  previewChars?: number | undefined;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const ELLIPSIS = '…';
const MINUS = 0x2d;
const DIGIT_0 = 0x30;
const DIGIT_9 = 0x39;

/** Control characters and lone surrogates, which shown text escapes. */
const UNPRINTABLE = /[\p{Cc}\p{Cs}]/gu;
/** The same, plus the quote and backslash a quoted string escapes. */
const UNPRINTABLE_OR_QUOTE = /["\\\p{Cc}\p{Cs}]/gu;
/** One character: whether {@link escapeText} escapes it (quoted, then unquoted). */
const ESCAPED_IN_QUOTES = /^["\\\p{Cc}\p{Cs}]$/u;
const ESCAPED_BARE = /^[\p{Cc}\p{Cs}]$/u;

const SHORT_ESCAPES: Readonly<Record<string, string>> = {
  '"': '\\"',
  '\\': '\\\\',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

/** A character as JSON escapes it: `\n`, `\"`, or `\u0001` (lowercase hex, as `JSON.stringify` writes). */
function escapeChar(char: string): string {
  return SHORT_ESCAPES[char] ?? `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
}

/**
 * `text` with its control characters (C0 as `JSON.stringify` writes them, and
 * DEL and C1 too) and lone surrogates escaped; with `quoted`, also its
 * quotes and backslashes, for text shown inside quotes.
 */
function escapeText(text: string, quoted: boolean): string {
  return text.replace(quoted ? UNPRINTABLE_OR_QUOTE : UNPRINTABLE, escapeChar);
}

function isHighSurrogate(unit: number): boolean {
  return unit >= 0xd800 && unit <= 0xdbff;
}

function isLowSurrogate(unit: number): boolean {
  return unit >= 0xdc00 && unit <= 0xdfff;
}

/** UTF-16 units of the code point at `i`: 2 for a surrogate pair, else 1. */
function widthAt(text: string, i: number): number {
  return isHighSurrogate(text.charCodeAt(i)) && isLowSurrogate(text.charCodeAt(i + 1)) ? 2 : 1;
}

/** Code points in `text` from index `from` on. */
function codePointsFrom(text: string, from: number): number {
  let count = 0;
  for (let i = from; i < text.length; i += widthAt(text, i)) count++;
  return count;
}

let graphemeSegmenter: Intl.Segmenter | null | undefined;

/** A grapheme segmenter, or `null` where `Intl.Segmenter` is missing. */
function graphemes(): Intl.Segmenter | null {
  if (graphemeSegmenter === undefined) {
    graphemeSegmenter =
      typeof Intl === 'object' && typeof Intl.Segmenter === 'function'
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null;
  }
  return graphemeSegmenter;
}

/** Characters either side of a cut that are segmented to find the grapheme it falls in. */
const CLUSTER_WINDOW = 64;

/**
 * Where to cut `text` at index `at` so as not to split a grapheme: the start
 * of the cluster `at` falls inside, or `at` itself when it is already
 * between two, when no segmenter is available, or when the cluster reaches
 * back past the window (then it is too long to keep whole, and `at` is
 * still never inside a surrogate pair).
 */
function clusterStart(text: string, at: number): number {
  const segmenter = graphemes();
  if (!segmenter) return at;
  const from = Math.max(0, at - CLUSTER_WINDOW);
  const segment = segmenter.segment(text.slice(from, at + CLUSTER_WINDOW)).containing(at - from);
  if (!segment || segment.index === 0) return at;
  return from + segment.index;
}

/**
 * Where to cut `text` to keep `cap` code points, at a grapheme boundary at
 * or before that; `text.length` when it is not longer.
 */
function cutPoint(text: string, cap: number): number {
  // Code points never outnumber UTF-16 units.
  if (text.length <= cap) return text.length;
  let end = 0;
  for (let points = 0; points < cap && end < text.length; points++) end += widthAt(text, end);
  return end >= text.length ? text.length : clusterStart(text, end);
}

/** A key as shown: escaped, `""` when empty, cut with `…` past `cap` code points. */
function keyText(key: string, cap: number): string {
  if (key === '') return '""';
  const end = cutPoint(key, cap);
  return end < key.length
    ? escapeText(key.slice(0, end), false) + ELLIPSIS
    : escapeText(key, false);
}

/**
 * `value` in at most `room` characters, escaped (and quoted when `quoted`),
 * ending in `…` when cut: `"Lorem ipsu…"`. `undefined` when not even one
 * character fits. Reads only as much of `value` as it shows.
 */
function shortText(value: string, room: number, quoted: boolean): string | undefined {
  const escaped = quoted ? ESCAPED_IN_QUOTES : ESCAPED_BARE;
  const frame = quoted ? 2 : 0;
  let out = '';
  for (let i = 0; i < value.length;) {
    const width = widthAt(value, i);
    const char = value.slice(i, i + width);
    const piece = escaped.test(char) ? escapeChar(char) : char;
    i += width;
    // While more follows, keep room for the ellipsis.
    if (out.length + piece.length + frame + (i < value.length ? 1 : 0) > room) {
      if (out === '') return undefined;
      return quoted ? `"${out}${ELLIPSIS}"` : out + ELLIPSIS;
    }
    out += piece;
  }
  const whole = quoted ? `"${out}"` : out;
  return whole.length <= room ? whole : undefined;
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/** Whether a JSON number's text is written with digits: not `NaN`, `Infinity`, `-inf`, … */
function isDigits(raw: string): boolean {
  const c = raw.charCodeAt(raw.charCodeAt(0) === MINUS ? 1 : 0);
  return c >= DIGIT_0 && c <= DIGIT_9;
}

/** A word for a number that is not finite, spelled as JavaScript spells it. */
function nonFiniteText(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('nan')) return 'NaN';
  return lower.charCodeAt(0) === MINUS ? '-Infinity' : 'Infinity';
}

const FLOAT32_NAMES = new Set(['FLOAT', 'FLOAT4', 'REAL']);

function isFloat32(type: DuckDBTypeNode | undefined): boolean {
  return type?.kind === 'scalar' && FLOAT32_NAMES.has(type.name);
}

/** A number's text, written with digits, as shown for `type`. */
function numberText(raw: string, type: DuckDBTypeNode | undefined): string {
  return isFloat32(type) ? formatFloat32(Number(raw)) : raw;
}

/** Significant digits that tell every float32 apart. */
const FLOAT32_MAX_DIGITS = 9;

/** A decimal as integer digits (no trailing zeros) and the power of ten of the last one. */
interface Decimal {
  readonly digits: string;
  readonly exponent: number;
}

const FLOAT32_VIEW = new Float32Array(1);
const FLOAT32_BITS = new Uint32Array(FLOAT32_VIEW.buffer);

/** `digits × 10^exponent` without the trailing zeros of `digits`. */
function decimalOf(digits: string, exponent: number): Decimal {
  let end = digits.length;
  while (end > 1 && digits.charCodeAt(end - 1) === DIGIT_0) end--;
  return { digits: digits.slice(0, end), exponent: exponent + digits.length - end };
}

/** The shortest decimal that reads back as the double `value`, as JavaScript writes it. */
function doubleDecimal(value: number): Decimal {
  const [mantissa = '', power = '0'] = value.toExponential().split('e');
  const digits = mantissa.replace('.', '');
  return decimalOf(digits, Number(power) - (digits.length - 1));
}

/**
 * The digits DuckDB writes for the float32 `value` (positive and finite).
 *
 * DuckDB formats a FLOAT with fmt's Grisu: the shortest decimal strictly
 * between the float's neighbours' midpoints, the one nearest the value when
 * two have that length. Grisu gives up when it cannot decide, and fmt then
 * writes the shortest decimal of the value as a double (its exact digits,
 * as a rule): when the nearest shortest decimal is exactly on a midpoint
 * (`53812810` for the float 53812808, whose neighbours are 4 away), or when
 * two shortest decimals are exactly as near (`2453185.7` and `2453185.8`
 * for 2453185.75). Both read back as the same float. Exact arithmetic
 * (BigInt) tells those ties apart; doubles would not.
 */
function float32Decimal(value: number): Decimal {
  FLOAT32_VIEW[0] = value;
  const bits = FLOAT32_BITS[0]!;
  const biased = bits >>> 23;
  const fraction = bits & 0x7fffff;
  // value = significand × 2^power2, exactly.
  const significand = BigInt(biased === 0 ? fraction : fraction | 0x800000);
  const power2 = (biased === 0 ? 1 : biased) - 150;
  // The value and its midpoints, in quarters of a step: a power of two is
  // half as far from the float below it as from the float above.
  const value4 = 4n * significand;
  const upper4 = value4 + 2n;
  const lower4 = fraction === 0 && biased > 1 ? value4 - 1n : value4 - 2n;
  const quarter = power2 - 2;
  // The power of ten of the value's first digit.
  const leading = Number(value.toExponential().split('e')[1]);

  for (let length = 1; length <= FLOAT32_MAX_DIGITS; length++) {
    // Decimals of `length` digits are multiples of 10^step. Compare n × 10^step
    // with x × 2^quarter as integers, both scaled by 10^tens × 2^twos.
    const step = leading - length + 1;
    const tens = Math.max(0, -step);
    const twos = Math.max(0, -quarter);
    const unit = 10n ** BigInt(step + tens) * 2n ** BigInt(twos);
    const scale = 2n ** BigInt(quarter + twos) * 10n ** BigInt(tens);
    const target = value4 * scale;
    const lower = lower4 * scale;
    const upper = upper4 * scale;
    const first = (lower + unit - 1n) / unit;
    const last = upper / unit;
    if (first > last) continue;
    let best = -1n;
    let bestDistance = 0n;
    let tied = false;
    for (let n = first; n <= last; n++) {
      const at = n * unit;
      const distance = at > target ? at - target : target - at;
      if (best < 0n || distance < bestDistance) {
        best = n;
        bestDistance = distance;
        tied = false;
      } else if (distance === bestDistance) {
        tied = true;
      }
    }
    const at = best * unit;
    if (tied || at === lower || at === upper) return doubleDecimal(value);
    return decimalOf(best.toString(), step);
  }
  return doubleDecimal(value);
}

/**
 * A float32 as DuckDB writes a FLOAT (`CAST(f AS VARCHAR)`, the grid's
 * text), character for character: the shortest decimal that reads back as
 * the same float32, laid out with a `.0` when it is whole (`1.0`,
 * `123456790.0`), and in scientific notation below 10^-4 and from 10^16 on
 * (`1e-05`, `1.5e+16`, `3.4028235e+38`), exponent signed and at least two
 * digits. `NaN`, `Infinity` and `-Infinity` for numbers that are not
 * finite; `-0.0` for negative zero.
 *
 * About one float in a hundred gets more digits than the shortest, because
 * DuckDB does: where two shortest decimals are exactly as near the value,
 * or the nearest lies exactly halfway to the next float, its formatter
 * writes the value's shortest double digits instead (`2453185.75`, not
 * `2453185.8`; `-53812808.0`, not `-53812810.0`). Both forms read back as
 * the same float; this one matches the cell.
 *
 * `to_json` writes a FLOAT widened to a double, `0.10000000149011612` for
 * `0.1`; this gives the text DuckDB shows for the float itself.
 *
 * @param value - Any number; it is first rounded to float32 (`Math.fround`).
 *
 * @example
 * ```ts
 * formatFloat32(0.10000000149011612); // '0.1'
 * formatFloat32(1);                   // '1.0'
 * formatFloat32(1e20);                // '1e+20'
 * formatFloat32(1.5e-5);              // '1.5e-05'
 * formatFloat32(123456789);           // '123456790.0' (float32 holds 123456792)
 * formatFloat32(2453185.75);          // '2453185.75' (as DuckDB writes it)
 * ```
 */
export function formatFloat32(value: number): string {
  const float = Math.fround(value);
  if (Number.isNaN(float)) return 'NaN';
  if (float === Infinity) return 'Infinity';
  if (float === -Infinity) return '-Infinity';
  if (float === 0) return Object.is(float, -0) ? '-0.0' : '0.0';
  const sign = float < 0 ? '-' : '';
  const { digits, exponent } = float32Decimal(Math.abs(float));
  // The power of ten of the first digit.
  const magnitude = exponent + digits.length - 1;
  if (magnitude < -4 || magnitude >= 16) {
    const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    const power = String(Math.abs(magnitude)).padStart(2, '0');
    return `${sign}${mantissa}e${magnitude < 0 ? '-' : '+'}${power}`;
  }
  if (exponent >= 0) return `${sign}${digits}${'0'.repeat(exponent)}.0`;
  const point = digits.length + exponent;
  return point > 0
    ? `${sign}${digits.slice(0, point)}.${digits.slice(point)}`
    : `${sign}0.${'0'.repeat(-point)}${digits}`;
}

// ---------------------------------------------------------------------------
// Reading JSON as a type
// ---------------------------------------------------------------------------

/** Scalars, other than the date and time kinds, whose values `to_json` writes as DuckDB text. */
const TEXT_SCALAR_NAMES = new Set([
  'BLOB',
  'BYTEA',
  'BINARY',
  'VARBINARY',
  'BIT',
  'BITSTRING',
  'BIT VARYING',
  'ENUM',
  'GEOMETRY',
  'BIGNUM',
  'VARINT',
]);

/** Whether a string of this type is DuckDB's text for a value that is not text, shown unquoted. */
function isTextType(type: DuckDBTypeNode | undefined): boolean {
  if (type?.kind !== 'scalar') return false;
  switch (type.dataType) {
    case 'date':
    case 'timestamp':
    case 'time':
    case 'interval':
    case 'uuid':
      return true;
    default:
      return TEXT_SCALAR_NAMES.has(type.name);
  }
}

/** How a container's children are read. */
type Shape =
  /** A LIST or ARRAY: JSON items, each of the element type. */
  | { readonly kind: 'list'; readonly items: readonly JsonNode[]; readonly element: DuckDBTypeNode }
  /** A STRUCT: JSON entries, matched to the fields by position (`to_json` keeps their order). */
  | {
      readonly kind: 'struct';
      readonly entries: readonly JsonEntry[];
      readonly fields: readonly DuckDBStructField[];
    }
  /** A MAP as `to_json` writes it: `{"key": value}`. */
  | {
      readonly kind: 'mapObject';
      readonly entries: readonly JsonEntry[];
      readonly map: DuckDBMapTypeNode;
    }
  /** A MAP read through VARIANT: `[{"key": k, "value": v}]`. */
  | {
      readonly kind: 'mapEntries';
      readonly items: readonly JsonNode[];
      readonly map: DuckDBMapTypeNode;
    }
  /** A UNION as `to_json` writes it: `{"tag": value}`. */
  | { readonly kind: 'union'; readonly entry: JsonEntry; readonly member: DuckDBUnionMember }
  /** A JSON object, typed by the JSON alone. */
  | { readonly kind: 'object'; readonly entries: readonly JsonEntry[] }
  /** A JSON array, typed by the JSON alone. */
  | { readonly kind: 'array'; readonly items: readonly JsonNode[] };

/** How the JSON at one place is read. */
interface Reading {
  /** The DuckDB type the node shows; `undefined` when the JSON is read alone. */
  readonly type: DuckDBTypeNode | undefined;
  /** How its children are read; `undefined` for a leaf. */
  readonly shape: Shape | undefined;
  /** Whether the children of an `object` or `array` shape are path steps (keys and 0-based indexes). */
  readonly jsonSteps: boolean;
}

function jsonShape(json: JsonNode): Shape | undefined {
  if (json.kind === 'object') return { kind: 'object', entries: json.entries };
  if (json.kind === 'array') return { kind: 'array', items: json.items };
  return undefined;
}

/**
 * Read `json` at a place whose DuckDB type is `type`. `inJson` is set inside
 * a JSON or VARIANT value, where keys and indexes are path steps;
 * `throughVariant` when the whole value was read through VARIANT, so a
 * union holds its bare value.
 */
function read(
  json: JsonNode,
  type: DuckDBTypeNode | undefined,
  inJson: boolean,
  throughVariant: boolean,
): Reading {
  if (type === undefined) return { type: undefined, shape: jsonShape(json), jsonSteps: inJson };
  // A NULL keeps the type of its place.
  if (json.kind === 'null') return { type, shape: undefined, jsonSteps: false };
  switch (type.kind) {
    case 'json':
    case 'variant':
      return { type, shape: jsonShape(json), jsonSteps: true };
    case 'unknown':
      // Nothing inside a type that could not be read has a path.
      return { type, shape: jsonShape(json), jsonSteps: false };
    case 'scalar':
      if (json.kind !== 'object' && json.kind !== 'array') {
        return { type, shape: undefined, jsonSteps: false };
      }
      break;
    case 'list':
    case 'array':
      if (json.kind === 'array') {
        return {
          type,
          shape: { kind: 'list', items: json.items, element: type.element },
          jsonSteps: false,
        };
      }
      break;
    case 'struct':
      if (json.kind === 'object') {
        return {
          type,
          shape: { kind: 'struct', entries: json.entries, fields: type.fields },
          jsonSteps: false,
        };
      }
      break;
    case 'map':
      if (json.kind === 'object') {
        return {
          type,
          shape: { kind: 'mapObject', entries: json.entries, map: type },
          jsonSteps: false,
        };
      }
      if (json.kind === 'array') {
        return {
          type,
          shape: { kind: 'mapEntries', items: json.items, map: type },
          jsonSteps: false,
        };
      }
      break;
    case 'union':
      if (!throughVariant && json.kind === 'object' && json.entries.length === 1) {
        const entry = json.entries[0]!;
        const member = unionMember(type, entry.key);
        if (member) return { type, shape: { kind: 'union', entry, member }, jsonSteps: false };
      }
      break;
  }
  // JSON that does not fit its type, or a union read through VARIANT, which
  // lost its tag: read from the JSON alone. No path names anything inside.
  return { type: undefined, shape: jsonShape(json), jsonSteps: false };
}

/** A map key's text as a path step: a number for whole-number keys (while exact), else the text. */
function mapKeyStep(text: string, keyType: DuckDBTypeNode): ValueTreePathStep {
  if (keyType.kind === 'scalar' && keyType.dataType === 'integer' && /^-?\d+$/.test(text)) {
    const n = Number(text);
    if (Number.isSafeInteger(n)) return n;
  }
  return text;
}

/** A map key as shown: a FLOAT key read through VARIANT at float32 precision. */
function mapKeyShown(text: string, key: JsonNode | undefined, map: DuckDBMapTypeNode): string {
  return key?.kind === 'number' && isDigits(key.raw) && isFloat32(map.key)
    ? formatFloat32(Number(key.raw))
    : text;
}

function childTotal(shape: Shape): number {
  switch (shape.kind) {
    case 'list':
    case 'mapEntries':
    case 'array':
      return shape.items.length;
    case 'struct':
    case 'mapObject':
    case 'object':
      return shape.entries.length;
    case 'union':
      return 1;
  }
}

/** Whether every field of a struct is unnamed: `row(1, 'a')`, shown as `(1, "a")`. */
function allUnnamed(fields: readonly DuckDBStructField[]): boolean {
  return fields.length > 0 && fields.every((f) => f.name === null);
}

// ---------------------------------------------------------------------------
// Previews
// ---------------------------------------------------------------------------

interface Context {
  readonly messages: ValueTreeMessages;
  readonly bucketSize: number;
  readonly stringCap: number;
  readonly previewChars: number;
  /** The value was read through VARIANT: its unions hold bare values. */
  readonly throughVariant: boolean;
}

/**
 * `count` items between `open` and `close`, joined by `, `, in at most
 * `room` characters. Items that do not fit end the list as `…`:
 * `[56, 3, …]`, `[…]`. `undefined` when not even `[…]` fits.
 */
function joinItems(
  open: string,
  close: string,
  count: number,
  room: number,
  item: (index: number, room: number) => string | undefined,
): string | undefined {
  if (count === 0) return open.length + close.length <= room ? open + close : undefined;
  if (open.length + ELLIPSIS.length + close.length > room) return undefined;
  let out = open;
  for (let i = 0; i < count; i++) {
    const separator = i === 0 ? '' : ', ';
    // After an item that is not the last, `, …` and the close must still fit.
    const reserve = i === count - 1 ? close.length : 2 + ELLIPSIS.length + close.length;
    const text = item(i, room - out.length - separator.length - reserve);
    if (text === undefined) return out + separator + ELLIPSIS + close;
    out += separator + text;
  }
  return out + close;
}

/** `key`, `separator`, and the compact text of the value, in at most `room` characters. */
function keyed(
  key: string,
  separator: string,
  json: JsonNode,
  type: DuckDBTypeNode | undefined,
  room: number,
  context: Context,
): string | undefined {
  const value = compact(json, type, room - key.length - separator.length, context);
  return value === undefined ? undefined : key + separator + value;
}

/** A leaf's compact text, in at most `room` characters. */
function compactLeaf(
  json: JsonNode,
  type: DuckDBTypeNode | undefined,
  room: number,
): string | undefined {
  let text: string;
  switch (json.kind) {
    case 'string':
      return shortText(json.value, room, !isTextType(type));
    case 'number':
      text = isDigits(json.raw) ? numberText(json.raw, type) : nonFiniteText(json.raw);
      break;
    case 'boolean':
      text = json.value ? 'true' : 'false';
      break;
    case 'null':
      text = 'null';
      break;
    default:
      return undefined;
  }
  // A number cut short would read as another number.
  return text.length <= room ? text : undefined;
}

/**
 * The compact text of `json`, read as `type`, in at most `room` characters,
 * for a preview; `undefined` when nothing fits. Each level of nesting takes
 * at least two characters of the room, so the recursion stays shallow.
 */
function compact(
  json: JsonNode,
  type: DuckDBTypeNode | undefined,
  room: number,
  context: Context,
): string | undefined {
  if (room < 1) return undefined;
  const reading = read(json, type, false, context.throughVariant);
  return reading.shape
    ? compactShape(reading.shape, room, context)
    : compactLeaf(json, reading.type, room);
}

function compactShape(shape: Shape, room: number, context: Context): string | undefined {
  // A key longer than the room cannot fit anyway: cut it there, without reading the rest.
  const cap = Math.min(context.stringCap, room);
  switch (shape.kind) {
    case 'list':
      return joinItems('[', ']', shape.items.length, room, (i, r) =>
        compact(shape.items[i]!, shape.element, r, context),
      );
    case 'array':
      return joinItems('[', ']', shape.items.length, room, (i, r) =>
        compact(shape.items[i]!, undefined, r, context),
      );
    case 'struct': {
      const { entries, fields } = shape;
      if (allUnnamed(fields)) {
        return joinItems('(', ')', entries.length, room, (i, r) =>
          compact(entries[i]!.value, fields[i]?.type, r, context),
        );
      }
      return joinItems('{', '}', entries.length, room, (i, r) => {
        const field = fields[i];
        const name = field ? (field.name ?? String(i + 1)) : entries[i]!.key;
        return keyed(keyText(name, cap), ': ', entries[i]!.value, field?.type, r, context);
      });
    }
    case 'mapObject': {
      const { entries, map } = shape;
      return joinItems('{', '}', entries.length, room, (i, r) =>
        keyed(keyText(entries[i]!.key, cap), ' → ', entries[i]!.value, map.value, r, context),
      );
    }
    case 'mapEntries': {
      const { items, map } = shape;
      return joinItems('{', '}', items.length, room, (i, r) => {
        const entry = mapEntryOf(items[i]!);
        if (!entry) return compact(items[i]!, undefined, r, context);
        const key = keyText(mapKeyShown(mapKeyText(entry.key), entry.key, map), cap);
        return keyed(key, ' → ', entry.value, map.value, r, context);
      });
    }
    case 'union':
      return joinItems('{', '}', 1, room, (_, r) =>
        keyed(
          keyText(shape.member.tag, cap),
          ': ',
          shape.entry.value,
          shape.member.type,
          r,
          context,
        ),
      );
    case 'object':
      return joinItems('{', '}', shape.entries.length, room, (i, r) =>
        keyed(
          keyText(shape.entries[i]!.key, cap),
          ': ',
          shape.entries[i]!.value,
          undefined,
          r,
          context,
        ),
      );
  }
}

// ---------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------

/** `text` cut at the cap and shown in `style`. */
function cappedValue(text: string, style: ValueStyle, context: Context): ValueTreeValue {
  const end = cutPoint(text, context.stringCap);
  const head = end < text.length ? text.slice(0, end) : text;
  const omitted = end < text.length ? codePointsFrom(text, end) : 0;
  let shown: string;
  if (style === 'string') {
    shown = `"${escapeText(head, true)}${omitted > 0 ? ELLIPSIS : ''}"`;
  } else {
    shown = (style === 'text' ? escapeText(head, false) : head) + (omitted > 0 ? ELLIPSIS : '');
  }
  return omitted > 0
    ? { text: shown, style, more: context.messages.moreCharacters(omitted) }
    : { text: shown, style };
}

/** A leaf's value: `json` is a string, number, boolean or null, read as `type`. */
function leafValue(
  json: JsonNode,
  type: DuckDBTypeNode | undefined,
  context: Context,
): ValueTreeValue {
  switch (json.kind) {
    case 'string':
      return cappedValue(json.value, isTextType(type) ? 'text' : 'string', context);
    case 'number':
      return isDigits(json.raw)
        ? cappedValue(numberText(json.raw, type), 'number', context)
        : { text: nonFiniteText(json.raw), style: 'keyword' };
    case 'boolean':
      return { text: json.value ? 'true' : 'false', style: 'keyword' };
    default:
      // `null`; never an object or array, which are containers.
      return { text: 'null', style: 'null' };
  }
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/**
 * The size of the buckets `count` children are split into: the smallest
 * `size^k` (k ≥ 1) that makes at most `size` buckets.
 */
function bucketUnit(count: number, size: number): number {
  let unit = size;
  while (Math.ceil(count / unit) > size) unit *= size;
  return unit;
}

/** Where a node sits: what {@link TreeNode} builds an item node from. */
interface Place {
  readonly id: string;
  readonly key: ValueTreeKey | null;
  readonly json: JsonNode;
  /** The DuckDB type at this place; `undefined` inside JSON or VARIANT. */
  readonly type: DuckDBTypeNode | undefined;
  /** Inside a JSON or VARIANT value whose keys and indexes are path steps. */
  readonly inJson: boolean;
  /** The container whose child this is (for the path); `null` for the root. */
  readonly container: TreeNode | null;
  /** The step from the container; `null` when no step reaches this node. */
  readonly step: ValueTreePathStep | null;
}

/** Everything a node holds, computed by the factories below. */
interface NodeInit {
  readonly id: string;
  readonly key: ValueTreeKey | null;
  readonly type: DuckDBTypeNode | undefined;
  readonly json: JsonNode;
  readonly typeLabel: string;
  readonly label: string;
  readonly value: ValueTreeValue | undefined;
  readonly count: number | undefined;
  readonly countText: string | undefined;
  readonly preview: string | undefined;
  readonly bucket: ValueTreeBucket | undefined;
  readonly expandable: boolean;
  readonly context: Context;
  readonly container: TreeNode | null;
  readonly step: ValueTreePathStep | null;
  readonly pathless: boolean;
  readonly shape: Shape | undefined;
  readonly jsonSteps: boolean;
  readonly owner: TreeNode | null;
}

/** `key: rest`, or `rest` alone without a key. */
function labelOf(key: ValueTreeKey | null, rest: string): string {
  return key ? `${key.text}: ${rest}` : rest;
}

class TreeNode implements ValueTreeNode {
  readonly id: string;
  readonly key: ValueTreeKey | null;
  readonly type: DuckDBTypeNode | undefined;
  readonly json: JsonNode;
  readonly typeLabel: string;
  readonly label: string;
  // Declared, not defined: each is an own property only on the nodes that have it.
  declare readonly value?: ValueTreeValue;
  declare readonly count?: number;
  declare readonly countText?: string;
  declare readonly preview?: string;
  declare readonly bucket?: ValueTreeBucket;
  declare readonly children?: () => readonly ValueTreeNode[];

  readonly #context: Context;
  /** The container this node is a child of, for its path. */
  readonly #container: TreeNode | null;
  readonly #step: ValueTreePathStep | null;
  /** No path reaches this node. */
  readonly #pathless: boolean;
  /** How a container's children are read. */
  readonly #shape: Shape | undefined;
  readonly #jsonSteps: boolean;
  /** For a bucket: the container whose children it spans. */
  readonly #owner: TreeNode | null;
  #loaded: readonly TreeNode[] | null = null;

  private constructor(init: NodeInit) {
    this.id = init.id;
    this.key = init.key;
    this.type = init.type;
    this.json = init.json;
    this.typeLabel = init.typeLabel;
    this.label = init.label;
    if (init.value !== undefined) this.value = init.value;
    if (init.count !== undefined) this.count = init.count;
    if (init.countText !== undefined) this.countText = init.countText;
    if (init.preview !== undefined) this.preview = init.preview;
    if (init.bucket !== undefined) this.bucket = init.bucket;
    if (init.expandable) this.children = () => this.#children();
    this.#context = init.context;
    this.#container = init.container;
    this.#step = init.step;
    this.#pathless = init.pathless;
    this.#shape = init.shape;
    this.#jsonSteps = init.jsonSteps;
    this.#owner = init.owner;
  }

  get path(): readonly ValueTreePathStep[] | null {
    if (this.#pathless) return null;
    // Up the containers to the root, one step each, then in root-first order.
    const steps: ValueTreePathStep[] = [];
    let step = this.#step;
    for (let container = this.#container; container !== null; container = container.#container) {
      steps.push(step!);
      step = container.#step;
    }
    return steps.reverse();
  }

  /** A node for the JSON at `place`. */
  static item(place: Place, context: Context): TreeNode {
    const { id, key, json, container, step } = place;
    const reading = read(json, place.type, place.inJson, context.throughVariant);
    const { type, shape } = reading;
    // A value read from its JSON alone is typed by its JSON kind: `object`, `number`, …
    const typeLabel = type ? typeOutline(type, 'label') : json.kind;
    const pathless = container !== null && (container.#pathless || step === null);
    const common = {
      id,
      key,
      type,
      json,
      typeLabel,
      bucket: undefined,
      context,
      container,
      step,
      pathless,
      shape,
      jsonSteps: reading.jsonSteps,
      owner: null,
    };

    if (!shape) {
      const value = leafValue(json, type, context);
      return new TreeNode({
        ...common,
        label: labelOf(key, value.more === undefined ? value.text : `${value.text}, ${value.more}`),
        value,
        count: undefined,
        countText: undefined,
        preview: undefined,
        expandable: false,
      });
    }

    const total = childTotal(shape);
    const preview = compactShape(shape, context.previewChars, context) ?? ELLIPSIS;
    let countText: string | undefined;
    const messages = context.messages;
    switch (shape.kind) {
      case 'list':
      case 'array':
        countText = messages.itemCount(total);
        break;
      case 'struct':
        countText = messages.fieldCount(total);
        break;
      case 'mapObject':
      case 'mapEntries':
        countText = messages.entryCount(total);
        break;
      case 'object':
        countText = messages.keyCount(total);
        break;
      case 'union':
        countText = undefined;
        break;
    }
    return new TreeNode({
      ...common,
      label: labelOf(key, `${typeLabel}, ${countText ?? preview}`),
      value: undefined,
      count: shape.kind === 'union' ? undefined : total,
      countText,
      preview,
      expandable: total > 0,
    });
  }

  /** A bucket of `owner`'s children `start` to `end - 1`. */
  static #bucket(owner: TreeNode, start: number, end: number): TreeNode {
    const base = owner.#numbering();
    const text = owner.#context.messages.bucketLabel(start + base, end - 1 + base);
    const key: ValueTreeKey = { text, kind: 'bucket' };
    return new TreeNode({
      id: `${owner.id}/${start}-${end - 1}`,
      key,
      type: owner.type,
      json: owner.json,
      typeLabel: '',
      label: text,
      value: undefined,
      count: end - start,
      countText: undefined,
      preview: undefined,
      bucket: { start, end },
      expandable: true,
      context: owner.#context,
      container: null,
      step: null,
      pathless: true,
      shape: undefined,
      jsonSteps: false,
      owner,
    });
  }

  /** The number of a container's first child: 1 in DuckDB's numbering, 0 in JSON's. */
  #numbering(): number {
    const kind = this.#shape?.kind;
    return kind === 'object' || kind === 'array' ? 0 : 1;
  }

  #children(): readonly TreeNode[] {
    if (this.#loaded) return this.#loaded;
    const size = this.#context.bucketSize;
    const owner = this.#owner;
    let loaded: TreeNode[];
    if (owner) {
      const { start, end } = this.bucket!;
      loaded = end - start > size ? owner.#buckets(start, end) : owner.#items(start, end);
    } else {
      const total = childTotal(this.#shape!);
      loaded = total > size ? this.#buckets(0, total) : this.#items(0, total);
    }
    this.#loaded = loaded;
    return loaded;
  }

  #buckets(start: number, end: number): TreeNode[] {
    const unit = bucketUnit(end - start, this.#context.bucketSize);
    const buckets: TreeNode[] = [];
    for (let s = start; s < end; s += unit) {
      buckets.push(TreeNode.#bucket(this, s, Math.min(end, s + unit)));
    }
    return buckets;
  }

  #items(start: number, end: number): TreeNode[] {
    const items: TreeNode[] = [];
    for (let i = start; i < end; i++) items.push(this.#child(i));
    return items;
  }

  /** The node for this container's child at 0-based index `i`. */
  #child(i: number): TreeNode {
    const shape = this.#shape!;
    const context = this.#context;
    const cap = context.stringCap;
    const id = `${this.id}/${i}`;
    // Typed children: their own type decides whether JSON steps follow.
    const typed = (
      key: ValueTreeKey,
      json: JsonNode,
      type: DuckDBTypeNode | undefined,
      step: ValueTreePathStep | null,
    ): TreeNode =>
      TreeNode.item({ id, key, json, type, inJson: false, container: this, step }, context);

    switch (shape.kind) {
      case 'list':
        return typed(
          { text: String(i + 1), kind: 'position' },
          shape.items[i]!,
          shape.element,
          i + 1,
        );
      case 'struct': {
        const { key: jsonKey, value } = shape.entries[i]!;
        const field = shape.fields[i];
        if (!field) {
          // An entry beyond the type's fields keeps its own key and has no path.
          return typed({ text: keyText(jsonKey, cap), kind: 'jsonKey' }, value, undefined, null);
        }
        if (field.name === null) {
          return typed({ text: String(i + 1), kind: 'position' }, value, field.type, i + 1);
        }
        const key: ValueTreeKey = { text: keyText(field.name, cap), kind: 'field' };
        return typed(key, value, field.type, field.name);
      }
      case 'mapObject': {
        const entry = shape.entries[i]!;
        const key: ValueTreeKey = { text: keyText(entry.key, cap), kind: 'mapKey' };
        return typed(key, entry.value, shape.map.value, mapKeyStep(entry.key, shape.map.key));
      }
      case 'mapEntries': {
        const item = shape.items[i]!;
        const entry = mapEntryOf(item);
        // An item that is not an entry (a value cut short) shows as it is, by position.
        if (!entry) return typed({ text: String(i + 1), kind: 'position' }, item, undefined, null);
        const text = mapKeyText(entry.key);
        const key: ValueTreeKey = {
          text: keyText(mapKeyShown(text, entry.key, shape.map), cap),
          kind: 'mapKey',
        };
        return typed(key, entry.value, shape.map.value, mapKeyStep(text, shape.map.key));
      }
      case 'union':
        return typed(
          { text: keyText(shape.member.tag, cap), kind: 'tag' },
          shape.entry.value,
          shape.member.type,
          shape.member.tag,
        );
      case 'object': {
        const entry = shape.entries[i]!;
        return TreeNode.item(
          {
            id,
            key: { text: keyText(entry.key, cap), kind: 'jsonKey' },
            json: entry.value,
            type: undefined,
            inJson: this.#jsonSteps,
            container: this,
            step: this.#jsonSteps ? entry.key : null,
          },
          context,
        );
      }
      case 'array':
        return TreeNode.item(
          {
            id,
            key: { text: String(i), kind: 'jsonIndex' },
            json: shape.items[i]!,
            type: undefined,
            inJson: this.#jsonSteps,
            container: this,
            step: this.#jsonSteps ? i : null,
          },
          context,
        );
    }
  }

  /**
   * How many rows expanding `node` adds: its children, or its buckets. For
   * {@link defaultExpansion}, without building them.
   */
  static shownChildCount(node: ValueTreeNode): number {
    if (!(node instanceof TreeNode)) return node.children?.().length ?? 0;
    if (node.#loaded) return node.#loaded.length;
    if (!node.children) return 0;
    const size = node.#context.bucketSize;
    const total = node.bucket ? node.bucket.end - node.bucket.start : childTotal(node.#shape!);
    return total > size ? Math.ceil(total / bucketUnit(total, size)) : total;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** A positive whole number from an option, or `fallback`. */
function wholeOption(value: number | undefined, min: number, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= min
    ? Math.floor(value)
    : fallback;
}

/**
 * Build the tree for one value: `json` (from `parseJsonTree` over
 * `jsonValueSQL`'s text) read as `type` (the column's parsed type). Returns
 * the root node; its children, and theirs, are built when first asked for.
 *
 * The JSON is read the way `jsonValueSQL` writes it for `type`: from
 * `to_json`, or through VARIANT when `type` holds a VARIANT inside (its maps
 * then `[{"key": …, "value": …}]` lists, its unions bare values, its unnamed
 * struct fields keyed `"1"`, `"2"`, …). STRUCT fields are matched to the
 * JSON's entries by position. JSON that does not fit its type is shown from
 * the JSON alone. A tree cut short (`parseJsonTree(…).truncated`) builds
 * from what was read.
 *
 * @param json - The value's JSON tree.
 * @param type - The column's DuckDB type; `undefined` reads the JSON alone,
 *   and then nothing below the root has a path.
 * @param messages - The words the tree shows.
 *
 * @example
 * ```ts
 * const type = parseDuckDBType('STRUCT(x DOUBLE, tags VARCHAR[])');
 * const { root: json } = parseJsonTree('{"x":1.25,"tags":["a","b"]}');
 * const root = buildValueTree(json, type, messages, { rootKey: 'point' });
 * root.label; // 'point: struct(2), 2 fields'
 * root.preview; // '{x: 1.25, tags: ["a", "b"]}'
 * const [x, tags] = root.children!();
 * x.label; // 'x: 1.25'
 * tags.children!()[1].path; // ['tags', 2]
 * ```
 */
export function buildValueTree(
  json: JsonNode,
  type: DuckDBTypeNode | undefined,
  messages: ValueTreeMessages,
  options: ValueTreeOptions = {},
): ValueTreeNode {
  const throughVariant = readsThroughVariant(type);
  const context: Context = {
    messages,
    bucketSize: wholeOption(options.bucketSize, 2, VALUE_TREE_BUCKET_SIZE),
    stringCap: wholeOption(options.stringCap, 1, VALUE_TREE_STRING_CAP),
    previewChars: wholeOption(options.previewChars, 3, VALUE_TREE_PREVIEW_CHARS),
    throughVariant,
  };
  const key: ValueTreeKey | null =
    options.rootKey === undefined
      ? null
      : { text: keyText(options.rootKey, context.stringCap), kind: 'column' };
  return TreeNode.item(
    { id: '$', key, json, type, inJson: false, container: null, step: null },
    context,
  );
}

/**
 * Which nodes a tree view should open with: the root, and its children too
 * when that shows {@link VALUE_TREE_EXPANDED_ROWS} rows or fewer in all (the
 * root, its children, and the children of each of those that expands).
 * Builds the root's children to decide; nothing deeper.
 *
 * The returned function fits `TreeViewOptions.initiallyExpanded` once the
 * panel maps its tree nodes back to these (it ignores `level` and knows the
 * nodes of this tree by identity).
 *
 * @example
 * ```ts
 * const expand = defaultExpansion(root);
 * new TreeView([toTreeViewNode(root)], {
 *   initiallyExpanded: (node, level) => expand(node.data!, level),
 * });
 * ```
 */
export function defaultExpansion(
  root: ValueTreeNode,
): (node: ValueTreeNode, level: number) => boolean {
  const open = new Set<ValueTreeNode>();
  if (root.children) {
    open.add(root);
    const children = root.children();
    const expandable = children.filter((child) => child.children !== undefined);
    let rows = 1 + children.length;
    for (const child of expandable) {
      rows += TreeNode.shownChildCount(child);
      if (rows > VALUE_TREE_EXPANDED_ROWS) break;
    }
    if (rows <= VALUE_TREE_EXPANDED_ROWS) for (const child of expandable) open.add(child);
  }
  return (node) => open.has(node);
}

/**
 * The JSON of what a node shows, as standard JSON for the clipboard
 * (`prettyJson`: numbers as written, `NaN` and `±Infinity` as `null`, keys
 * in order). A bucket gives its slice of the container (an array of its
 * items, or an object of its entries); a map entry its value; a union member
 * its value; a union the `{"tag": value}` object.
 *
 * @param indent - Spaces per level, as `JSON.stringify` takes them; 0 for one line.
 *
 * @example
 * ```ts
 * nodeJsonText(root); // '{\n  "x": 1.25,\n  "tags": [\n    "a",\n    "b"\n  ]\n}'
 * nodeJsonText(root.children!()[1], 0); // '["a","b"]'
 * ```
 */
export function nodeJsonText(node: ValueTreeNode, indent = 2): string {
  const { bucket, json } = node;
  if (bucket) {
    if (json.kind === 'array') {
      return prettyJson(
        { kind: 'array', items: json.items.slice(bucket.start, bucket.end) },
        indent,
      );
    }
    if (json.kind === 'object') {
      return prettyJson(
        { kind: 'object', entries: json.entries.slice(bucket.start, bucket.end) },
        indent,
      );
    }
  }
  return prettyJson(json, indent);
}
