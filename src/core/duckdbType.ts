/**
 * DuckDB type names as trees.
 *
 * `ColumnSchema.originalType` holds a type the way `DESCRIBE` and `typeof()`
 * print it: `INTEGER[]`, `STRUCT(x DOUBLE, "my field" VARCHAR)[]`,
 * `MAP(VARCHAR, INTEGER[3])`, `UNION(num INTEGER, str VARCHAR)`. Every part
 * of the table that has to treat a nested column differently from a scalar
 * one (the grid's text, the header's label, filters, exports, the value
 * inspector) reads that text through {@link parseDuckDBType} rather than
 * matching it with a pattern of its own.
 *
 * Imports only a type, so the worker can use it too.
 */

import type { DataType } from './types';

/**
 * A scalar type: a number, text, a date, a BLOB, an ENUM, …
 *
 * @example
 * ```ts
 * import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';
 *
 * const node = parseDuckDBType('DECIMAL(18,4)');
 * if (node.kind === 'scalar') {
 *   node.name; // 'DECIMAL'
 *   node.args; // ['18', '4']
 *   node.dataType; // 'decimal'
 * }
 * ```
 */
export interface DuckDBScalarTypeNode {
  readonly kind: 'scalar';
  /** The type as written, arguments included: `DECIMAL(18,4)`. */
  readonly sqlType: string;
  /** Upper case, without arguments: `DECIMAL`, `TIMESTAMP WITH TIME ZONE`, `ENUM`. */
  readonly name: string;
  /**
   * The arguments as written, outer parentheses removed and split at the
   * commas between them: `['18', '4']` for `DECIMAL(18,4)`, `["'it''s'",
   * "'y,z'"]` for an ENUM. Empty when there are none.
   */
  readonly args: readonly string[];
  /** The library's type for it. Never `'nested'`. */
  readonly dataType: Exclude<DataType, 'nested'>;
}

/**
 * DuckDB's `JSON` type: text the json extension knows to be JSON.
 *
 * @example
 * ```ts
 * import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';
 *
 * parseDuckDBType('JSON').kind; // 'json'
 * parseDuckDBType('JSON[]').kind; // 'list', of 'json'
 * ```
 */
export interface DuckDBJsonTypeNode {
  readonly kind: 'json';
  readonly sqlType: string;
}

/**
 * DuckDB's `VARIANT` type, whose every value carries a type of its own.
 *
 * @example
 * ```ts
 * import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';
 *
 * parseDuckDBType('VARIANT').kind; // 'variant'
 * ```
 */
export interface DuckDBVariantTypeNode {
  readonly kind: 'variant';
  readonly sqlType: string;
}

/**
 * A LIST: `INTEGER[]`.
 *
 * @example
 * ```ts
 * import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';
 *
 * const node = parseDuckDBType('VARCHAR[]');
 * if (node.kind === 'list') node.element.sqlType; // 'VARCHAR'
 * ```
 */
export interface DuckDBListTypeNode {
  readonly kind: 'list';
  readonly sqlType: string;
  readonly element: DuckDBTypeNode;
}

/**
 * A fixed-size ARRAY: `FLOAT[768]`.
 *
 * @example
 * ```ts
 * import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';
 *
 * const node = parseDuckDBType('FLOAT[768]');
 * if (node.kind === 'array') {
 *   node.size; // 768
 *   node.element.sqlType; // 'FLOAT'
 * }
 * ```
 */
export interface DuckDBArrayTypeNode {
  readonly kind: 'array';
  readonly sqlType: string;
  readonly size: number;
  readonly element: DuckDBTypeNode;
}

/**
 * One field of a STRUCT.
 *
 * @example
 * ```ts
 * import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';
 *
 * const named = parseDuckDBType('STRUCT(x DOUBLE, "my field" VARCHAR)');
 * if (named.kind === 'struct') named.fields.map((f) => f.name); // ['x', 'my field']
 * const unnamed = parseDuckDBType('STRUCT(INTEGER, VARCHAR)');
 * if (unnamed.kind === 'struct') unnamed.fields.map((f) => f.name); // [null, null]
 * ```
 */
export interface DuckDBStructField {
  /**
   * The field's name: `null` for a field of an unnamed struct
   * (`STRUCT(INTEGER, VARCHAR)`, what `row(1, 'a')` makes), `''` for a
   * field named with the empty string, which DuckDB writes as nothing in a
   * struct whose first field has a name: `STRUCT(b BIGINT,  BIGINT)`, from
   * the JSON `{"b": 2, "": 1}`.
   */
  readonly name: string | null;
  readonly type: DuckDBTypeNode;
}

/**
 * A STRUCT: `STRUCT(x DOUBLE, y DOUBLE)`.
 *
 * @example
 * ```ts
 * import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';
 *
 * const node = parseDuckDBType('STRUCT(x DOUBLE, tags VARCHAR[])');
 * if (node.kind === 'struct') {
 *   node.fields.map((f) => `${f.name}: ${f.type.kind}`); // ['x: scalar', 'tags: list']
 * }
 * ```
 */
export interface DuckDBStructTypeNode {
  readonly kind: 'struct';
  readonly sqlType: string;
  readonly fields: readonly DuckDBStructField[];
}

/**
 * A MAP: `MAP(VARCHAR, INTEGER)`.
 *
 * @example
 * ```ts
 * import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';
 *
 * const node = parseDuckDBType('MAP(DATE, INTEGER[])');
 * if (node.kind === 'map') {
 *   node.key.sqlType; // 'DATE'
 *   node.value.kind; // 'list'
 * }
 * ```
 */
export interface DuckDBMapTypeNode {
  readonly kind: 'map';
  readonly sqlType: string;
  readonly key: DuckDBTypeNode;
  readonly value: DuckDBTypeNode;
}

/**
 * One member of a UNION.
 *
 * @example
 * ```ts
 * import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';
 *
 * const node = parseDuckDBType('UNION(num INTEGER, "my tag" VARCHAR)');
 * if (node.kind === 'union') node.members.map((m) => m.tag); // ['num', 'my tag']
 * ```
 */
export interface DuckDBUnionMember {
  readonly tag: string;
  readonly type: DuckDBTypeNode;
}

/**
 * A UNION: `UNION(num INTEGER, str VARCHAR)`.
 *
 * @example
 * ```ts
 * import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';
 *
 * const node = parseDuckDBType('UNION(num INTEGER, str VARCHAR)');
 * if (node.kind === 'union') node.members[1]!.type.sqlType; // 'VARCHAR'
 * ```
 */
export interface DuckDBUnionTypeNode {
  readonly kind: 'union';
  readonly sqlType: string;
  readonly members: readonly DuckDBUnionMember[];
}

/**
 * A type the parser could not read: text it does not understand, or nesting
 * deeper than `MAX_TYPE_DEPTH` (256) levels.
 *
 * @example
 * ```ts
 * import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';
 *
 * const node = parseDuckDBType('STRUCT(a INTEGER');
 * node.kind; // 'unknown'
 * node.sqlType; // 'STRUCT(a INTEGER'
 * ```
 */
export interface DuckDBUnknownTypeNode {
  readonly kind: 'unknown';
  readonly sqlType: string;
}

/**
 * A DuckDB type, as a tree. Every node keeps the text of its own type in
 * `sqlType`.
 *
 * @example
 * ```ts
 * import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';
 *
 * const node = parseDuckDBType('STRUCT(x DOUBLE, tags VARCHAR[])');
 * if (node.kind === 'struct') {
 *   node.fields.map((f) => f.name); // ['x', 'tags']
 * }
 * ```
 */
export type DuckDBTypeNode =
  | DuckDBScalarTypeNode
  | DuckDBJsonTypeNode
  | DuckDBVariantTypeNode
  | DuckDBListTypeNode
  | DuckDBArrayTypeNode
  | DuckDBStructTypeNode
  | DuckDBMapTypeNode
  | DuckDBUnionTypeNode
  | DuckDBUnknownTypeNode;

/**
 * The kinds of {@link DuckDBTypeNode}.
 *
 * @example
 * ```ts
 * import { parseDuckDBType, type DuckDBTypeKind } from '@jeyabbalas/data-table/advanced';
 *
 * const lists: readonly DuckDBTypeKind[] = ['list', 'array'];
 * lists.includes(parseDuckDBType('FLOAT[768]').kind); // true
 * ```
 */
export type DuckDBTypeKind = DuckDBTypeNode['kind'];

/**
 * How deep a type may nest before the parser gives up on it and returns an
 * `unknown` node. Deeper than any type a file is likely to hold, and shallow
 * enough that code walking the tree recursively cannot run out of stack.
 */
export const MAX_TYPE_DEPTH = 256;

/** How many parsed types are kept for reuse. */
const MEMO_LIMIT = 1024;

const memo = new Map<string, DuckDBTypeNode>();

// ---------------------------------------------------------------------------
// Scalar names
// ---------------------------------------------------------------------------

const INTEGER_NAMES = new Set([
  'BIGINT',
  'INT8',
  'LONG',
  'INTEGER',
  'INT4',
  'INT',
  'SIGNED',
  'SMALLINT',
  'INT2',
  'SHORT',
  'TINYINT',
  'INT1',
  'UBIGINT',
  'UINTEGER',
  'USMALLINT',
  'UTINYINT',
  'HUGEINT',
  'UHUGEINT',
]);
const FLOAT_NAMES = new Set(['FLOAT', 'FLOAT4', 'REAL', 'DOUBLE', 'FLOAT8', 'DOUBLE PRECISION']);
const DECIMAL_NAMES = new Set(['DECIMAL', 'NUMERIC']);
const BOOLEAN_NAMES = new Set(['BOOLEAN', 'BOOL', 'LOGICAL']);
const TIMESTAMP_NAMES = new Set([
  'TIMESTAMP',
  'DATETIME',
  'TIMESTAMP WITH TIME ZONE',
  'TIMESTAMP WITHOUT TIME ZONE',
  'TIMESTAMPTZ',
  'TIMESTAMP_S',
  'TIMESTAMP_MS',
  'TIMESTAMP_NS',
  'TIMESTAMP_US',
]);
const TIME_NAMES = new Set([
  'TIME',
  'TIME WITH TIME ZONE',
  'TIME WITHOUT TIME ZONE',
  'TIMETZ',
  'TIME_NS',
]);

/**
 * Type names of more than one word. A struct field's type follows its name,
 * so this is also how `STRUCT(TIMESTAMP WITH TIME ZONE)` (one unnamed field)
 * is told from `STRUCT(ts TIMESTAMP)` (a field named `ts`).
 */
const MULTI_WORD_NAMES: readonly (readonly string[])[] = [
  ['TIMESTAMP', 'WITH', 'TIME', 'ZONE'],
  ['TIMESTAMP', 'WITHOUT', 'TIME', 'ZONE'],
  ['TIME', 'WITH', 'TIME', 'ZONE'],
  ['TIME', 'WITHOUT', 'TIME', 'ZONE'],
  ['DOUBLE', 'PRECISION'],
  ['CHARACTER', 'VARYING'],
  ['BIT', 'VARYING'],
];

/** The library's type for a scalar DuckDB type, by its upper-case name. */
function scalarDataType(name: string): Exclude<DataType, 'nested'> {
  if (INTEGER_NAMES.has(name)) return 'integer';
  if (FLOAT_NAMES.has(name)) return 'float';
  if (DECIMAL_NAMES.has(name)) return 'decimal';
  if (BOOLEAN_NAMES.has(name)) return 'boolean';
  if (name === 'DATE') return 'date';
  if (TIMESTAMP_NAMES.has(name)) return 'timestamp';
  if (TIME_NAMES.has(name)) return 'time';
  if (name === 'INTERVAL') return 'interval';
  if (name === 'UUID') return 'uuid';
  // VARCHAR, CHAR, TEXT, BLOB, BIT, ENUM, GEOMETRY, BIGNUM, and any type
  // this list does not know
  return 'string';
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type TokenKind = 'word' | 'ident' | 'string' | '(' | ')' | '[' | ']' | ',';

interface Token {
  kind: TokenKind;
  /** A word as written; a quoted identifier or string with its quotes removed and unescaped. */
  value: string;
  /** Offset of the token's first character in the text. */
  start: number;
  /** Offset just past the token. */
  end: number;
}

const PUNCTUATION = new Set(['(', ')', '[', ']', ',']);

/** Split `text` into tokens, or `null` when a quote is never closed. */
function tokenize(text: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }
    if (PUNCTUATION.has(ch)) {
      tokens.push({ kind: ch as TokenKind, value: ch, start: i, end: i + 1 });
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      // A doubled quote stands for one; anything else, newlines and
      // brackets included, is part of the name or string.
      let value = '';
      let j = i + 1;
      let closed = false;
      while (j < text.length) {
        const c = text[j]!;
        if (c === ch) {
          if (text[j + 1] === ch) {
            value += ch;
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        value += c;
        j++;
      }
      if (!closed) return null;
      tokens.push({ kind: ch === '"' ? 'ident' : 'string', value, start: i, end: j });
      i = j;
      continue;
    }
    let j = i + 1;
    while (j < text.length) {
      const c = text[j]!;
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') break;
      if (PUNCTUATION.has(c) || c === '"' || c === "'") break;
      j++;
    }
    tokens.push({ kind: 'word', value: text.slice(i, j), start: i, end: j });
    i = j;
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** A container whose closing parenthesis the parser has not reached yet. */
type Frame =
  | { kind: 'struct'; start: number; fields: DuckDBStructField[]; name: string | null }
  | { kind: 'union'; start: number; members: DuckDBUnionMember[]; tag: string }
  | { kind: 'map'; start: number; key: DuckDBTypeNode | null }
  | { kind: 'list'; start: number };

/** Thrown inside the parser only; {@link parseDuckDBType} turns it into an `unknown` node. */
class ParseFailure extends Error {}

function fail(): never {
  throw new ParseFailure();
}

/**
 * Parse a DuckDB type name into a tree.
 *
 * Reads the types `DESCRIBE` and `typeof()` print: scalars with their
 * arguments (`DECIMAL(18,4)`, `ENUM('a', 'b')`, `TIMESTAMP WITH TIME ZONE`),
 * `JSON`, `VARIANT`, lists and arrays (`INTEGER[]`, `FLOAT[768]`, stacked as
 * in `INTEGER[2][]`, a list of 2-integer arrays), `STRUCT(…)` with quoted,
 * unquoted or no field names (a field named with the empty string, which
 * DuckDB writes as nothing, is named `''`), `MAP(K, V)`, `UNION(tag T, …)`
 * and `LIST(T)`. Keywords are matched in any case.
 *
 * Never throws: text it cannot read, and types nested deeper than
 * `MAX_TYPE_DEPTH` (256) levels, come back as an `unknown` node. Results are
 * memoized, so the same text gives back the same (frozen) node.
 *
 * @example
 * ```ts
 * import { parseDuckDBType } from '@jeyabbalas/data-table/advanced';
 *
 * parseDuckDBType('INTEGER[]');
 * // { kind: 'list', sqlType: 'INTEGER[]',
 * //   element: { kind: 'scalar', sqlType: 'INTEGER', name: 'INTEGER', args: [], dataType: 'integer' } }
 * parseDuckDBType('MAP(VARCHAR, DOUBLE)').kind; // 'map'
 * ```
 */
export function parseDuckDBType(text: string): DuckDBTypeNode {
  const cached = memo.get(text);
  if (cached) return cached;
  let node: DuckDBTypeNode;
  try {
    node = parseOrFail(text);
  } catch {
    node = freeze({ kind: 'unknown', sqlType: text.trim() });
  }
  if (memo.size >= MEMO_LIMIT) {
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }
  memo.set(text, node);
  return node;
}

function parseOrFail(text: string): DuckDBTypeNode {
  const tokens = tokenize(text);
  if (!tokens || tokens.length === 0) fail();

  const depths = new WeakMap<DuckDBTypeNode, number>();
  const depthOf = (node: DuckDBTypeNode): number => depths.get(node) ?? 1;
  const made = <T extends DuckDBTypeNode>(node: T, depth: number): T => {
    if (depth > MAX_TYPE_DEPTH) fail();
    depths.set(node, depth);
    return freeze(node);
  };

  const stack: Frame[] = [];
  let pos = 0;
  const peek = (offset = 0): Token | undefined => tokens[pos + offset];
  const slice = (start: number, end: number): string => text.slice(start, end).trim();

  /** Whether a multi-word type name starts at token `at`, and how many words it has. */
  const multiWordAt = (at: number): number => {
    for (const words of MULTI_WORD_NAMES) {
      let matches = true;
      for (let k = 0; k < words.length; k++) {
        const token = tokens[at + k];
        if (token?.kind !== 'word' || token.value.toUpperCase() !== words[k]) {
          matches = false;
          break;
        }
      }
      if (matches) return words.length;
    }
    return 0;
  };

  /**
   * Read a struct field's name, if it has one, leaving `pos` on its type.
   * A quoted identifier is always a name. A bare word is one unless it
   * starts the type itself: followed by `(`, `[`, `,` or `)`, or by the rest
   * of a multi-word type name.
   */
  const readFieldName = (): string | null => {
    const first = peek();
    if (!first) fail();
    if (first.kind === 'ident') {
      pos++;
      return first.value;
    }
    if (first.kind !== 'word') fail();
    const next = peek(1);
    if (!next || next.kind !== 'word') return null;
    if (multiWordAt(pos) > 0) return null;
    pos++;
    return first.value;
  };

  /** Read a union member's tag, leaving `pos` on its type. */
  const readTag = (): string => {
    const first = peek();
    if (!first || (first.kind !== 'ident' && first.kind !== 'word')) fail();
    pos++;
    return first.value;
  };

  /** Read a scalar, JSON or VARIANT type at `pos`, without suffixes. */
  const readNamedType = (): DuckDBTypeNode => {
    const first = peek()!;
    const start = first.start;
    const words = multiWordAt(pos) || 1;
    const name = tokens
      .slice(pos, pos + words)
      .map((t) => t.value.toUpperCase())
      .join(' ');
    pos += words;
    let end = tokens[pos - 1]!.end;

    const args: string[] = [];
    if (peek()?.kind === '(') {
      pos++;
      let depth = 1;
      let argStart = -1;
      let argEnd = -1;
      for (;;) {
        const token = peek();
        if (!token) fail();
        pos++;
        if (token.kind === '(') depth++;
        if (token.kind === ')') {
          depth--;
          if (depth === 0) {
            if (argStart >= 0) args.push(slice(argStart, argEnd));
            end = token.end;
            break;
          }
        }
        if (token.kind === ',' && depth === 1) {
          if (argStart < 0) fail();
          args.push(slice(argStart, argEnd));
          argStart = -1;
          continue;
        }
        if (argStart < 0) argStart = token.start;
        argEnd = token.end;
      }
    }

    const sqlType = slice(start, end);
    if (args.length === 0 && name === 'JSON') return made({ kind: 'json', sqlType }, 1);
    if (args.length === 0 && name === 'VARIANT') return made({ kind: 'variant', sqlType }, 1);
    return made(
      { kind: 'scalar', sqlType, name, args: freeze(args), dataType: scalarDataType(name) },
      1,
    );
  };

  /** Wrap `node`, which started at offset `start`, in the `[]` and `[N]` that follow it. */
  const readSuffixes = (node: DuckDBTypeNode, start: number): DuckDBTypeNode => {
    let result = node;
    while (peek()?.kind === '[') {
      const next = peek(1);
      if (next?.kind === ']') {
        pos += 2;
        result = made(
          { kind: 'list', sqlType: slice(start, next.end), element: result },
          depthOf(result) + 1,
        );
        continue;
      }
      const close = peek(2);
      if (next?.kind === 'word' && /^\d+$/.test(next.value) && close?.kind === ']') {
        pos += 3;
        result = made(
          {
            kind: 'array',
            sqlType: slice(start, close.end),
            size: Number(next.value),
            element: result,
          },
          depthOf(result) + 1,
        );
        continue;
      }
      fail();
    }
    return result;
  };

  // The type just read, waiting to be handed to the container around it.
  let result: DuckDBTypeNode | null = null;

  for (;;) {
    if (result === null) {
      // Expecting a type at `pos`.
      const token = peek();
      if (token?.kind !== 'word') fail();
      const keyword = token.value.toUpperCase();
      if (
        peek(1)?.kind === '(' &&
        (keyword === 'STRUCT' || keyword === 'UNION' || keyword === 'MAP' || keyword === 'LIST')
      ) {
        if (stack.length >= MAX_TYPE_DEPTH) fail();
        pos += 2;
        if (keyword === 'STRUCT' || keyword === 'UNION') {
          // An empty STRUCT() or UNION() closes at once.
          if (peek()?.kind === ')') {
            const close = peek()!;
            pos++;
            const sqlType = slice(token.start, close.end);
            const empty: DuckDBTypeNode =
              keyword === 'STRUCT'
                ? made({ kind: 'struct', sqlType, fields: freeze([]) }, 1)
                : made({ kind: 'union', sqlType, members: freeze([]) }, 1);
            result = readSuffixes(empty, token.start);
            continue;
          }
          if (keyword === 'STRUCT') {
            stack.push({ kind: 'struct', start: token.start, fields: [], name: readFieldName() });
          } else {
            stack.push({ kind: 'union', start: token.start, members: [], tag: readTag() });
          }
        } else if (keyword === 'MAP') {
          stack.push({ kind: 'map', start: token.start, key: null });
        } else {
          stack.push({ kind: 'list', start: token.start });
        }
        continue;
      }
      result = readSuffixes(readNamedType(), token.start);
      continue;
    }

    // A type is complete: hand it to the container it belongs to.
    const frame = stack[stack.length - 1];
    if (!frame) {
      if (pos !== tokens.length) fail();
      return result;
    }
    const child: DuckDBTypeNode = result;
    result = null;
    const next = peek();
    if (!next || (next.kind !== ',' && next.kind !== ')')) fail();

    switch (frame.kind) {
      case 'struct':
        frame.fields.push(freeze({ name: frame.name, type: child }));
        break;
      case 'union':
        frame.members.push(freeze({ tag: frame.tag, type: child }));
        break;
      case 'map':
        if (frame.key === null) {
          if (next.kind !== ',') fail();
          frame.key = child;
          pos++;
          continue;
        }
        if (next.kind !== ')') fail();
        break;
      case 'list':
        if (next.kind !== ')') fail();
        break;
    }

    pos++;
    if (next.kind === ',') {
      // Only a struct or a union takes another entry.
      if (frame.kind === 'struct') {
        // DuckDB takes a struct for unnamed when its first field's name is
        // empty, and then writes only the fields' types. Past a first field
        // with a name, a field written without one is named '': DuckDB
        // writes the empty name as nothing (`STRUCT(b BIGINT,  BIGINT)`).
        const name = readFieldName();
        frame.name = name === null && frame.fields[0]!.name !== null ? '' : name;
      } else if (frame.kind === 'union') frame.tag = readTag();
      else fail();
      continue;
    }

    // `)`: the container is complete.
    stack.pop();
    const sqlType = slice(frame.start, next.end);
    let node: DuckDBTypeNode;
    switch (frame.kind) {
      case 'struct':
        node = made(
          { kind: 'struct', sqlType, fields: freeze(frame.fields) },
          1 + frame.fields.reduce((max, f) => Math.max(max, depthOf(f.type)), 0),
        );
        break;
      case 'union':
        node = made(
          { kind: 'union', sqlType, members: freeze(frame.members) },
          1 + frame.members.reduce((max, m) => Math.max(max, depthOf(m.type)), 0),
        );
        break;
      case 'map':
        node = made(
          { kind: 'map', sqlType, key: frame.key!, value: child },
          1 + Math.max(depthOf(frame.key!), depthOf(child)),
        );
        break;
      case 'list':
        node = made({ kind: 'list', sqlType, element: child }, 1 + depthOf(child));
        break;
    }
    result = readSuffixes(node, frame.start);
  }
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

// ---------------------------------------------------------------------------
// Questions about a type
// ---------------------------------------------------------------------------

/** The child types of `node`, in order. */
export function childTypes(node: DuckDBTypeNode): DuckDBTypeNode[] {
  switch (node.kind) {
    case 'list':
    case 'array':
      return [node.element];
    case 'struct':
      return node.fields.map((f) => f.type);
    case 'map':
      return [node.key, node.value];
    case 'union':
      return node.members.map((m) => m.type);
    default:
      return [];
  }
}

const LOOKS_NESTED = /[[\]]|^(STRUCT|MAP|UNION|LIST|VARIANT)\b/i;

/**
 * The library's {@link DataType} for a parsed type: a scalar's own,
 * `'string'` for JSON, and `'nested'` for lists, arrays, structs, maps,
 * unions and VARIANT. A type the parser could not read is `'nested'` when
 * its text looks like a container and `'string'` otherwise.
 *
 * @example
 * ```ts
 * dataTypeOf(parseDuckDBType('DOUBLE'));        // 'float'
 * dataTypeOf(parseDuckDBType('JSON'));          // 'string'
 * dataTypeOf(parseDuckDBType('VARCHAR[]'));     // 'nested'
 * ```
 */
export function dataTypeOf(node: DuckDBTypeNode): DataType {
  switch (node.kind) {
    case 'scalar':
      return node.dataType;
    case 'json':
      return 'string';
    case 'unknown':
      return LOOKS_NESTED.test(node.sqlType) ? 'nested' : 'string';
    default:
      return 'nested';
  }
}

/**
 * Whether `node`, or any type inside it, is of one of `kinds`.
 *
 * @example
 * ```ts
 * containsKind(parseDuckDBType('STRUCT(v VARIANT)[]'), 'variant'); // true
 * ```
 */
export function containsKind(
  node: DuckDBTypeNode,
  kinds: DuckDBTypeKind | readonly DuckDBTypeKind[],
): boolean {
  const wanted: readonly DuckDBTypeKind[] = typeof kinds === 'string' ? [kinds] : kinds;
  const pending: DuckDBTypeNode[] = [node];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (wanted.includes(current.kind)) return true;
    pending.push(...childTypes(current));
  }
  return false;
}

/**
 * Whether a value of `node`'s type is, or holds, a VARIANT: `VARIANT`,
 * `VARIANT[]`, `STRUCT(v VARIANT)`. A type the parser could not read does
 * when its text names VARIANT.
 *
 * @example
 * ```ts
 * holdsVariant(parseDuckDBType('VARIANT'));             // true
 * holdsVariant(parseDuckDBType('STRUCT(v VARIANT)[]')); // true
 * holdsVariant(parseDuckDBType('INTEGER[]'));           // false
 * ```
 */
export function holdsVariant(node: DuckDBTypeNode): boolean {
  return node.kind === 'unknown'
    ? /\bVARIANT\b/i.test(node.sqlType)
    : containsKind(node, 'variant');
}

/**
 * Whether values of this type can only be compared as text: types holding a
 * UNION, a VARIANT, or a type the parser could not read. DuckDB casts text
 * to every other type and back without loss, so `col = '[1, 2]'` matches;
 * text cast to a UNION reads as one member only (its VARCHAR member when it
 * has one: `'0'` matches the text `'0'` but not the integer `0`, though both
 * show `0`), and text cast to VARIANT throws.
 */
export function needsTextMatch(node: DuckDBTypeNode): boolean {
  return containsKind(node, ['union', 'variant', 'unknown']);
}
