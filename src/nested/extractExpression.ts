/**
 * Extract field → column: the SQL that reads one part of a nested value.
 *
 * A path into a nested column (a struct's field, a list's element, a map's
 * value, a union's member, a key inside a JSON document) becomes an ordinary
 * derived expression column, which then gets the histogram, stats and
 * filters any column gets. {@link nestedFieldExpression} writes that column's
 * expression and default name from the column's DuckDB type
 * (`ColumnSchema.originalType`) and the path; {@link resolveNestedPath} says
 * what a path reaches without writing SQL, so the value inspector and the
 * header's extract panel offer their buttons by the same rules.
 *
 * A path is a list of steps, read against the type from the column down:
 *
 * | Type | Step | SQL |
 * |---|---|---|
 * | STRUCT | a field's name, or its 1-based position (the only way to an unnamed field) | `E['name']`, `struct_extract(E, 2)`; a field named `''`, `struct_extract_at(E, 2)` |
 * | LIST, ARRAY | a 1-based position, as in SQL | `E[3]` |
 * | MAP | a key, as text or as a number | `map_extract_value(E, 'k')` |
 * | UNION | a member's tag | `union_extract(E, 'num')` |
 * | JSON, VARIANT | every step from there on: a key (a string) or a 0-based array index (a number) | `json_extract_string(E, '$.a[0]')` |
 *
 * A struct's field is read as `E['name']`, never `E."name"`: in a query whose
 * FROM clause holds a table named like the column, `"point"."x"` reads that
 * table's column `x` instead of the field.
 *
 * Pure: no DOM, no database, no text for the UI. Nothing here throws; a path
 * that does not fit the type comes back as a {@link NestedPathError}.
 */

import { columnNameKey } from '../core/columnNames';
import { needsTextMatch, parseDuckDBType } from '../core/duckdbType';
import type { DuckDBMapTypeNode, DuckDBTypeNode } from '../core/duckdbType';
import { clipText } from '../core/graphemes';
import { ROWID_COLUMN } from '../core/types';
import { formatSQLValue, quoteIdentifier } from '../filters/FilterSQL';

/**
 * One step of a path into a nested value. Strings name things: a struct
 * field, a union member, a map key, a JSON object key. Numbers count them: a
 * struct field's or a list or array element's 1-based position, a numeric
 * map key, a JSON array's 0-based index.
 */
export type NestedPathStep = string | number;

/**
 * What a nested-field column reads at the end of its path:
 *
 * - `'value'`: the value there.
 * - `'length'`: how many elements a list or array has (`len`), how many
 *   entries a map has (`cardinality`), or how many elements a JSON array has
 *   (`json_array_length`, which counts any other JSON value as 0).
 * - `'tag'`: which member a union holds (`union_tag`).
 */
export type NestedExtractKind = 'value' | 'length' | 'tag';

/**
 * How a nested-field column reads a value inside a JSON or VARIANT value,
 * whose type differs from row to row. The value inspector knows the kind of
 * the value it shows and passes it on; without one, `'string'`.
 *
 * - `'string'`: `json_extract_string`, a VARCHAR. A JSON string without its
 *   quotes; a number, boolean, object or array as its JSON text; JSON `null`
 *   as NULL.
 * - `'number'`: that text as a DOUBLE, NULL where it is not a number. A JSON
 *   string holding a number counts; a boolean does not.
 * - `'boolean'`: that text as a BOOLEAN, NULL where it is not one.
 * - `'json'`: `json_extract`, a JSON value, so objects and arrays stay
 *   inspectable.
 */
export type JsonLeafKind = 'string' | 'number' | 'boolean' | 'json';

/** Options for {@link nestedFieldExpression}. */
export interface NestedFieldExpressionOptions {
  /** What to read at the end of the path. Default `'value'`. */
  extract?: NestedExtractKind | undefined;
  /**
   * How to read the value when the path ends inside a JSON or VARIANT value;
   * ignored otherwise. Default `'string'`.
   */
  jsonLeaf?: JsonLeafKind | undefined;
}

/** The column a path starts from. A `ColumnSchema` will do. */
export interface NestedPathColumn {
  readonly name: string;
  /** The column's DuckDB type, as `DESCRIBE` prints it: `ColumnSchema.originalType`. */
  readonly originalType: string;
}

/**
 * Why a path does not lead anywhere:
 *
 * - `INVALID_COLUMN`: the column's name is empty or holds a NUL, or it has
 *   no type text.
 * - `INVALID_STEP`: a step of the wrong kind: not a string or a finite
 *   number, a fraction where a position goes, text where a list position
 *   goes, a number where a union member goes, a string with a NUL.
 * - `NOT_A_CONTAINER`: a step into a scalar value.
 * - `NO_SUCH_FIELD`: a struct field or union member the type does not have.
 * - `POSITION_OUT_OF_RANGE`: a position below 1 (0 for a JSON array), past
 *   a struct's last field, or past a fixed-size array's end.
 * - `UNSUPPORTED_MAP_KEY`: a map whose key type holds a UNION or a VARIANT,
 *   or a type that could not be read: no literal matches its keys.
 * - `INVALID_MAP_KEY`: a key that cannot be one of the map's keys, such as
 *   `1.5` or `"abc"` for whole-number keys.
 * - `UNKNOWN_TYPE`: a step into a type that could not be read.
 * - `EMPTY_PATH`: the value of an empty path is the column itself (unless
 *   the column is JSON or VARIANT, which it reads as the leaf kind asks).
 * - `NOT_APPLICABLE`: an extract kind the end of the path does not offer,
 *   such as the length of a struct, or a kind that does not exist.
 */
export type NestedPathErrorCode =
  | 'INVALID_COLUMN'
  | 'INVALID_STEP'
  | 'NOT_A_CONTAINER'
  | 'NO_SUCH_FIELD'
  | 'POSITION_OUT_OF_RANGE'
  | 'UNSUPPORTED_MAP_KEY'
  | 'INVALID_MAP_KEY'
  | 'UNKNOWN_TYPE'
  | 'EMPTY_PATH'
  | 'NOT_APPLICABLE';

/** A path that does not fit its column's type. */
export interface NestedPathError {
  readonly code: NestedPathErrorCode;
  /** What is wrong, in English, for logs and error results. */
  readonly message: string;
  /**
   * The index in the path of the step at fault; `-1` when no single step is
   * (the column, an empty path, an extract kind the end does not offer).
   */
  readonly step: number;
}

/** Where a path leads: {@link resolveNestedPath}. */
export interface NestedPathTarget {
  /**
   * The DuckDB type at the end of the path. A path into a JSON or VARIANT
   * value ends at that JSON or VARIANT type, whatever keys follow: the shape
   * inside differs from row to row.
   */
  readonly type: DuckDBTypeNode;
  /** Whether the path ends at or inside a JSON or VARIANT value. */
  readonly json: boolean;
  /**
   * The index of the first step read as a JSON key or index: the path's
   * length when it ends at the JSON or VARIANT value itself, `-1` when it
   * never reaches one.
   */
  readonly jsonStart: number;
  /** The extract kinds the end of the path offers, `'value'` first when it does. */
  readonly extracts: readonly NestedExtractKind[];
}

/** {@link resolveNestedPath}'s answer: where the path leads, or why it leads nowhere. */
export type NestedPathResolution =
  | ({ readonly ok: true } & NestedPathTarget)
  | { readonly ok: false; readonly error: NestedPathError };

/** A nested-field column: {@link nestedFieldExpression}. */
export interface NestedFieldExpression extends NestedPathTarget {
  /** The SQL expression that reads the value, over the column by its quoted name. */
  readonly expression: string;
  /**
   * The column's default name: lowercase ASCII letters, digits and `_`, so
   * it needs no quoting in SQL. Not yet unique: pass it through
   * {@link uniqueColumnName}.
   */
  readonly name: string;
}

/** {@link nestedFieldExpression}'s answer: the column to add, or why there is none. */
export type NestedFieldExpressionResult =
  | ({ readonly ok: true } & NestedFieldExpression)
  | { readonly ok: false; readonly error: NestedPathError };

// ---------------------------------------------------------------------------
// Walking a path
// ---------------------------------------------------------------------------

/** A path followed to its end. */
interface Walked {
  /** The type at the end, or the JSON or VARIANT type the path entered. */
  type: DuckDBTypeNode;
  /** The SQL for the value of `type`, before any JSON step. */
  sql: string;
  /** Name parts, the column's first. */
  parts: string[];
  /** As {@link NestedPathTarget.jsonStart}. */
  jsonStart: number;
  /** The steps read inside the JSON or VARIANT value. */
  jsonSteps: readonly NestedPathStep[];
}

type Walk = { ok: true; walked: Walked } | { ok: false; error: NestedPathError };

function failure(code: NestedPathErrorCode, step: number, message: string): Walk {
  return { ok: false, error: { code, message, step } };
}

/** A step as a message shows it: `"name"` or `3`. */
function showStep(step: NestedPathStep): string {
  return typeof step === 'string' ? JSON.stringify(step) : String(step);
}

/** A type as a message shows it, cut short between graphemes. */
function showType(node: DuckDBTypeNode): string {
  return clipText(node.sqlType, 60);
}

/** DuckDB's spelling of `text` as a string literal. */
function sqlString(text: string): string {
  return formatSQLValue(text);
}

/** Follow `path` from `column`, writing the SQL and name parts as it goes. */
function walk(column: NestedPathColumn, path: readonly NestedPathStep[]): Walk {
  if (
    typeof column !== 'object' ||
    column === null ||
    typeof column.name !== 'string' ||
    column.name === '' ||
    column.name.includes('\0') ||
    typeof column.originalType !== 'string'
  ) {
    return failure(
      'INVALID_COLUMN',
      -1,
      'The column needs a name (not empty, without NUL characters) and a type',
    );
  }
  if (!Array.isArray(path)) {
    return failure('INVALID_STEP', -1, 'The path must be an array of steps');
  }

  const bad = path.findIndex((s) =>
    typeof s === 'string' ? s.includes('\0') : !Number.isFinite(s),
  );
  if (bad >= 0) {
    return failure(
      'INVALID_STEP',
      bad,
      typeof path[bad] === 'string'
        ? `Step ${bad} holds a NUL character, which SQL text cannot carry`
        : `Step ${bad} must be a string or a finite number`,
    );
  }

  let type = parseDuckDBType(column.originalType);
  let sql = quoteIdentifier(column.name);
  const parts = [namePart(column.name, 'column')];

  for (let i = 0; i < path.length; i++) {
    const s = path[i]!;
    switch (type.kind) {
      case 'json':
      case 'variant':
        return walkJson(type, sql, parts, path, i);

      case 'struct': {
        let index: number;
        if (typeof s === 'number') {
          if (!Number.isSafeInteger(s)) {
            return failure('INVALID_STEP', i, `A field position must be a whole number, not ${s}`);
          }
          if (s < 1 || s > type.fields.length) {
            return failure(
              'POSITION_OUT_OF_RANGE',
              i,
              `Field position ${s} is outside 1–${type.fields.length} of ${showType(type)}`,
            );
          }
          index = s - 1;
        } else {
          // As DuckDB binds `E['name']`: the exact name, else the name in any
          // ASCII case (DuckDB keeps a struct's names unique that way).
          index = type.fields.findIndex((f) => f.name === s);
          if (index < 0) {
            const key = columnNameKey(s);
            index = type.fields.findIndex((f) => f.name !== null && columnNameKey(f.name) === key);
          }
          if (index < 0) {
            return failure(
              'NO_SUCH_FIELD',
              i,
              type.fields.length > 0 && type.fields.every((f) => f.name === null)
                ? `${showType(type)} has unnamed fields, reached by position (a number), not ${showStep(s)}`
                : `${showType(type)} has no field ${showStep(s)}`,
            );
          }
        }
        const field = type.fields[index]!;
        // DuckDB reads a field by name only when it has one: an empty name is
        // an error in `E['']`, and a position one in `struct_extract` on a
        // struct with names, so a field named '' is read by `struct_extract_at`.
        if (field.name === null) sql = `struct_extract(${sql}, ${index + 1})`;
        else if (field.name === '') sql = `struct_extract_at(${sql}, ${index + 1})`;
        else sql = `${sql}[${sqlString(field.name)}]`;
        parts.push(namePart(field.name ?? String(index + 1), 'field'));
        type = field.type;
        break;
      }

      case 'list':
      case 'array': {
        if (typeof s !== 'number' || !Number.isSafeInteger(s)) {
          return failure(
            'INVALID_STEP',
            i,
            `A ${type.kind} element is reached by its 1-based position (a whole number), not ${showStep(s)}`,
          );
        }
        if (s < 1 || (type.kind === 'array' && s > type.size)) {
          return failure(
            'POSITION_OUT_OF_RANGE',
            i,
            type.kind === 'array'
              ? `Position ${s} is outside 1–${type.size} of ${showType(type)}`
              : `List positions start at 1, not ${s}`,
          );
        }
        sql = `${sql}[${s}]`;
        parts.push(String(s));
        type = type.element;
        break;
      }

      case 'map': {
        const key = mapKeyLiteral(type, s, i);
        if (typeof key !== 'string') return key;
        sql = `map_extract_value(${sql}, ${key})`;
        parts.push(namePart(String(s), 'field'));
        type = type.value;
        break;
      }

      case 'union': {
        if (typeof s !== 'string') {
          return failure('INVALID_STEP', i, `A union member is reached by its tag, not ${s}`);
        }
        const key = columnNameKey(s);
        const member =
          type.members.find((m) => m.tag === s) ??
          type.members.find((m) => columnNameKey(m.tag) === key);
        if (!member) {
          return failure('NO_SUCH_FIELD', i, `${showType(type)} has no member ${showStep(s)}`);
        }
        sql = `union_extract(${sql}, ${sqlString(member.tag)})`;
        parts.push(namePart(member.tag, 'field'));
        type = member.type;
        break;
      }

      case 'unknown':
        return failure(
          'UNKNOWN_TYPE',
          i,
          `The type ${showType(type)} could not be read, so step ${i} cannot go into it`,
        );

      case 'scalar':
        return failure(
          'NOT_A_CONTAINER',
          i,
          `Step ${i} (${showStep(s)}) goes into a ${type.name} value, which has no parts`,
        );
    }
  }

  const json = type.kind === 'json' || type.kind === 'variant';
  return {
    ok: true,
    walked: { type, sql, parts, jsonStart: json ? path.length : -1, jsonSteps: [] },
  };
}

/** The rest of a path, from step `start` on, inside a JSON or VARIANT value. */
function walkJson(
  type: DuckDBTypeNode,
  sql: string,
  parts: string[],
  path: readonly NestedPathStep[],
  start: number,
): Walk {
  for (let i = start; i < path.length; i++) {
    const step = path[i]!;
    if (typeof step === 'string') {
      parts.push(namePart(step, 'field'));
      continue;
    }
    if (!Number.isSafeInteger(step)) {
      return failure('INVALID_STEP', i, `A JSON array index must be a whole number, not ${step}`);
    }
    if (step < 0) {
      return failure('POSITION_OUT_OF_RANGE', i, `JSON array indexes start at 0, not ${step}`);
    }
    parts.push(String(step));
  }
  return { ok: true, walked: { type, sql, parts, jsonStart: start, jsonSteps: path.slice(start) } };
}

/** Text types, whose keys are written as string literals. */
const TEXT_KEY = /^(VARCHAR|CHAR|BPCHAR|TEXT|STRING)$/;

/**
 * The literal for map key `step`: a bare number for whole-number keys, a
 * string literal for text keys, and for any other key type its DuckDB text
 * (the way `to_json` and the grid write map keys) read back with `TRY_CAST`.
 * `TRY_CAST`, not `CAST`: a cast of a constant is not checked when a query is
 * bound, only when it runs, so a bad key would make every later read of the
 * derived column's view fail; `TRY_CAST` makes it match nothing instead.
 */
function mapKeyLiteral(type: DuckDBMapTypeNode, step: NestedPathStep, i: number): string | Walk {
  const key = type.key;
  // Text cast to a UNION picks the first member that fits, and to a VARIANT
  // throws: no literal reliably equals such a key.
  if (needsTextMatch(key)) {
    return failure(
      'UNSUPPORTED_MAP_KEY',
      i,
      `Keys of type ${showType(key)} cannot be written as a literal`,
    );
  }
  if (key.kind === 'scalar' && key.dataType === 'integer') {
    const digits = typeof step === 'number' ? step : step.trim();
    if (typeof digits === 'number' ? !Number.isSafeInteger(digits) : !/^[+-]?\d+$/.test(digits)) {
      return failure(
        'INVALID_MAP_KEY',
        i,
        `The map's keys are ${key.name}: ${showStep(step)} is not a whole number` +
          (typeof step === 'number' ? ' (give keys beyond ±(2^53−1) as text)' : ''),
      );
    }
    // In canonical digits: `+7` and `007` as `7` (the literal `007` matches
    // no key).
    return BigInt(digits).toString();
  }
  const text = String(step);
  if (key.kind === 'scalar' && TEXT_KEY.test(key.name)) return sqlString(text);
  return `TRY_CAST(${sqlString(text)} AS ${key.sqlType})`;
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

/** A key JSONPath can leave unquoted. */
const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The JSON paths that read `steps`, to apply one after another: usually a
 * single JSONPath, `$.a."b.c"[0]`. JSONPath, unlike a JSON pointer
 * (`/a/b.c/0`), tells a key `"0"` from an index 0: the pointer reads an
 * object's key and an array's element alike. Inside its quotes it takes any
 * key, `"` and `\` escaped with `\`, except two: `*`, a wildcard even when
 * quoted, and the empty key, a syntax error. Those go in a JSON pointer of
 * their own (`/*`, `/`), which reads them exactly: neither is an array index.
 */
function jsonPaths(steps: readonly NestedPathStep[]): string[] {
  const paths: string[] = [];
  let current = '$';
  for (const step of steps) {
    if (step === '*' || step === '') {
      if (current.startsWith('$')) {
        if (current !== '$') paths.push(current);
        current = '';
      }
      current += `/${step}`;
      continue;
    }
    if (!current.startsWith('$')) {
      paths.push(current);
      current = '$';
    }
    if (typeof step === 'number') current += `[${step}]`;
    else if (PLAIN_KEY.test(step)) current += `.${step}`;
    else current += `."${step.replace(/["\\]/g, '\\$&')}"`;
  }
  paths.push(current);
  return paths;
}

/** The expression that reads a JSON or VARIANT value's `steps`. */
function jsonExpression(
  type: DuckDBTypeNode,
  sql: string,
  steps: readonly NestedPathStep[],
  extract: NestedExtractKind,
  leaf: JsonLeafKind,
): string {
  const variant = type.kind === 'variant';
  if (steps.length === 0 && (extract === 'length' || leaf === 'json')) {
    // A VARIANT's JSON turns a NULL into the text `null`, whose length is 0:
    // NULLIF keeps it NULL.
    const value = variant ? `NULLIF(CAST(${sql} AS JSON), 'null')` : sql;
    return extract === 'length' ? `json_array_length(${value})` : value;
  }
  let value = variant ? `CAST(${sql} AS JSON)` : sql;
  const paths = jsonPaths(steps);
  const last = sqlString(paths.pop()!);
  for (const p of paths) value = `json_extract(${value}, ${sqlString(p)})`;
  if (extract === 'length') return `json_array_length(${value}, ${last})`;
  switch (leaf) {
    case 'json':
      return `json_extract(${value}, ${last})`;
    case 'number':
      return `TRY_CAST(json_extract_string(${value}, ${last}) AS DOUBLE)`;
    case 'boolean':
      return `TRY_CAST(json_extract_string(${value}, ${last}) AS BOOLEAN)`;
    default:
      return `json_extract_string(${value}, ${last})`;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** The extract kinds offered at the end of a walked path. */
function extractsOf(walked: Walked, pathLength: number): NestedExtractKind[] {
  const { type, jsonStart } = walked;
  const kinds: NestedExtractKind[] = [];
  if (pathLength > 0 || jsonStart >= 0) kinds.push('value');
  if (jsonStart >= 0 || type.kind === 'list' || type.kind === 'array' || type.kind === 'map') {
    kinds.push('length');
  }
  if (type.kind === 'union') kinds.push('tag');
  return kinds;
}

function targetOf(walked: Walked, pathLength: number): NestedPathTarget {
  return {
    type: walked.type,
    json: walked.jsonStart >= 0,
    jsonStart: walked.jsonStart,
    extracts: extractsOf(walked, pathLength),
  };
}

/**
 * Where `path` leads in `column`'s type: the type there, whether it is at or
 * inside a JSON or VARIANT value, and which extract kinds it offers. The
 * value inspector and the extract panel offer "Add as column", "Add length
 * as column" (size, for a map) and the union tag by `extracts`.
 *
 * What is offered: `'value'` at the end of any non-empty path, and at an
 * empty one for a JSON or VARIANT column (which reads it as a leaf kind);
 * `'length'` at a list, an array, a map, and anywhere at or inside JSON or
 * VARIANT (the inspector, which knows the value, offers it on JSON arrays
 * only); `'tag'` at a union.
 *
 * @example
 * ```ts
 * const people = { name: 'people', originalType: 'STRUCT(name VARCHAR, langs VARCHAR[])[]' };
 * resolveNestedPath(people, [2, 'langs']);
 * // { ok: true, type: { kind: 'list', sqlType: 'VARCHAR[]', … }, json: false,
 * //   jsonStart: -1, extracts: ['value', 'length'] }
 * resolveNestedPath({ name: 'doc', originalType: 'JSON' }, ['a.b', 0]);
 * // { ok: true, type: { kind: 'json', … }, json: true, jsonStart: 0,
 * //   extracts: ['value', 'length'] }
 * resolveNestedPath(people, [2, 'nme']);
 * // { ok: false, error: { code: 'NO_SUCH_FIELD', step: 1, message: … } }
 * ```
 */
export function resolveNestedPath(
  column: NestedPathColumn,
  path: readonly NestedPathStep[],
): NestedPathResolution {
  const walked = walk(column, path);
  if (!walked.ok) return walked;
  return { ok: true, ...targetOf(walked.walked, path.length) };
}

/**
 * The expression and default name of a column that reads `path` in
 * `column`: what `actions.addNestedFieldColumn` adds as a derived expression
 * column.
 *
 * | Reads | Expression | Name |
 * |---|---|---|
 * | struct field `['geo', 'lat']` of `point` | `"point"['geo']['lat']` | `point_geo_lat` |
 * | unnamed struct field `[2]` of `pair` | `struct_extract("pair", 2)` | `pair_2` |
 * | field named `''`, `['']` or `[2]` of `s` | `struct_extract_at("s", 2)` | `s_field` |
 * | list element `[3]` of `tags` | `"tags"[3]` | `tags_3` |
 * | `tags`, `extract: 'length'` | `len("tags")` | `tags_length` |
 * | map value `['k']` of `m` | `map_extract_value("m", 'k')` | `m_k` |
 * | `m`, `extract: 'length'` | `cardinality("m")` | `m_size` |
 * | union member `['num']` of `u` | `union_extract("u", 'num')` | `u_num` |
 * | `u`, `extract: 'tag'` | `union_tag("u")` | `u_tag` |
 * | JSON `['a.b', 0]` of `doc` | `json_extract_string("doc", '$."a.b"[0]')` | `doc_a_b_0` |
 * | the same, `jsonLeaf: 'number'` | `TRY_CAST(json_extract_string("doc", '$."a.b"[0]') AS DOUBLE)` | `doc_a_b_0` |
 * | JSON `['tags']` of `doc`, `extract: 'length'` | `json_array_length("doc", '$.tags')` | `doc_tags_length` |
 * | VARIANT `['a']` of `v` | `json_extract_string(CAST("v" AS JSON), '$.a')` | `v_a` |
 * | VARIANT `v`, `jsonLeaf: 'json'` | `NULLIF(CAST("v" AS JSON), 'null')` | `v_json` |
 *
 * The path starts at the column, and steps chain through any mix of types:
 * `[2, 'name']` of `people` is `"people"[2]['name']`. A map key is written
 * for the map's key type: text keys as string literals (`'it''s'`), whole
 * numbers bare (`2`, from the number or the text `'2'`), and any other type
 * as its DuckDB text read back, `TRY_CAST('2024-01-31' AS DATE)`; a key that
 * does not read as the key type matches nothing (the column is NULL).
 *
 * Default names: the column's name, then one part per step (a field's name,
 * a member's tag, a map key, a position or index), then `length`, `size`,
 * `tag`, or for an empty path into JSON the leaf kind, joined by `_`. Each
 * part keeps ASCII letters (lowercased, accents dropped, `camelCase` split)
 * and digits, any other run of characters becomes one `_`, at most 64
 * characters; a part with none left is `field` (`column` for the column's
 * own). A name starting with a digit gets `c_` before it; one DuckDB keeps
 * as a reserved word (`pivot_longer`) gets `_col` after. So no name needs
 * quoting.
 *
 * @example
 * ```ts
 * const point = { name: 'point', originalType: 'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)' };
 * const built = nestedFieldExpression(point, ['x']);
 * if (built.ok) {
 *   built.expression; // `"point"['x']`
 *   built.name; // 'point_x'
 *   uniqueColumnName(built.name, ['point', 'POINT_X']); // 'point_x_2'
 * }
 * nestedFieldExpression({ name: 'tags', originalType: 'VARCHAR[]' }, [], { extract: 'length' });
 * // { ok: true, expression: 'len("tags")', name: 'tags_length', … }
 * nestedFieldExpression(point, [], { extract: 'length' });
 * // { ok: false, error: { code: 'NOT_APPLICABLE', step: -1, message: … } }
 * ```
 */
export function nestedFieldExpression(
  column: NestedPathColumn,
  path: readonly NestedPathStep[],
  options?: NestedFieldExpressionOptions,
): NestedFieldExpressionResult {
  const result = walk(column, path);
  if (!result.ok) return result;
  const walked = result.walked;
  const target = targetOf(walked, path.length);
  const extract = options?.extract ?? 'value';
  if (!target.extracts.includes(extract)) {
    const empty = extract === 'value' && path.length === 0;
    return {
      ok: false,
      error: {
        code: empty ? 'EMPTY_PATH' : 'NOT_APPLICABLE',
        message: empty
          ? 'The path is empty: its value is the column itself'
          : `${showStep(extract)} cannot be read at ${showType(walked.type)}; it offers ${
              target.extracts.map(showStep).join(', ') || 'nothing'
            }`,
        step: -1,
      },
    };
  }
  const asked = options?.jsonLeaf;
  const leaf: JsonLeafKind =
    asked === 'number' || asked === 'boolean' || asked === 'json' ? asked : 'string';

  let expression: string;
  if (target.json) {
    expression = jsonExpression(walked.type, walked.sql, walked.jsonSteps, extract, leaf);
  } else if (extract === 'length') {
    expression = `${walked.type.kind === 'map' ? 'cardinality' : 'len'}(${walked.sql})`;
  } else if (extract === 'tag') {
    expression = `union_tag(${walked.sql})`;
  } else {
    expression = walked.sql;
  }

  const parts = walked.parts;
  if (extract === 'length') parts.push(walked.type.kind === 'map' ? 'size' : 'length');
  else if (extract === 'tag') parts.push('tag');
  else if (path.length === 0) parts.push(leaf);
  let name = parts.join('_');
  if (/^\d/.test(name)) name = `c_${name}`;
  if (KEYWORD_NAMES.has(name)) name = `${name}_col`;

  return { ok: true, ...target, expression, name };
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** The longest part of a default name. */
const MAX_NAME_PART = 64;

/**
 * DuckDB's keywords that a column reference must quote and that a default
 * name can spell. Every default name has at least two parts joined by `_`;
 * of DuckDB 1.5's keywords with a `_` in them, only these two do not parse
 * as a bare column (`try_cast`, `grouping_id` and `export_state` do).
 */
const KEYWORD_NAMES = new Set(['pivot_longer', 'pivot_wider']);

/** One part of a default name, made of `text`; `fallback` when nothing is left. */
function namePart(text: string, fallback: string): string {
  const part = text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, MAX_NAME_PART)
    .replace(/_$/, '');
  return part || fallback;
}

/**
 * `base`, or `base_2`, `base_3`, … : the first that no name in
 * `existingNames` already takes, compared as DuckDB compares column names
 * (see {@link columnNameKey}: `LABEL` beside `label` collides). Never the
 * reserved `__rowid__`. An empty `base` counts as `column`.
 *
 * @example
 * ```ts
 * uniqueColumnName('point_x', ['point', 'POINT_X']); // 'point_x_2'
 * uniqueColumnName('point_x', ['point', 'point_x', 'point_x_2']); // 'point_x_3'
 * uniqueColumnName('__rowid__', []); // '__rowid___2'
 * ```
 */
export function uniqueColumnName(base: string, existingNames: Iterable<string>): string {
  const taken = new Set([ROWID_COLUMN]);
  for (const name of existingNames) taken.add(columnNameKey(name));
  const root = base === '' ? 'column' : base;
  let candidate = root;
  for (let n = 2; taken.has(columnNameKey(candidate)); n++) candidate = `${root}_${n}`;
  return candidate;
}
