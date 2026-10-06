/**
 * Extract field → column, on real DuckDB.
 *
 * Every expression `nestedFieldExpression` writes for the nested stress
 * fixture's columns (odd_names, nested_struct, people, attrs, int_keys,
 * date_keys, map_of_structs, doc, json_list, the JSON file's depth5,
 * odd_keys, props, …), for the SQL-only companions (UNION, VARIANT, ARRAY,
 * maps keyed by STRUCT and LIST, an unnamed struct) and for documents of odd
 * JSON keys runs over every row, and each value is compared with the same
 * part read another way: the whole column through `to_json`, parsed and
 * walked in JavaScript. Then the expressions go through DerivedColumnManager's
 * own view, over a table named like the struct column it reads, beside
 * columns named `t` and `h1` (the view's aliases).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  parseDuckDBType,
  type DuckDBStructField,
  type DuckDBTypeNode,
  type DuckDBUnionMember,
} from '@/core/duckdbType';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { DerivedColumnManager } from '@/derived/DerivedColumnManager';
import {
  nestedFieldExpression,
  uniqueColumnName,
  type NestedFieldExpressionOptions,
  type NestedPathStep,
} from '@/nested/extractExpression';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { loadNestedFixture } from '../helpers/nestedFixture';
import { createSqlOnlyTable, createSqlOnlyView } from '../helpers/nestedSql';
import { makeNodeBridge } from '../helpers/nodeBridge';

let harness: NodeDuckDBHarness;
let parquet: string;
let json: string;

/** Rows of the SQL-only table: every residue of id % 7, % 5, % 4, % 3 and % 2. */
const SQL_ONLY_ROWS = 42;

beforeAll(async () => {
  harness = await createNodeDuckDB();
  parquet = (await loadNestedFixture(harness, 'parquet')).tableName;
  json = (await loadNestedFixture(harness, 'json')).tableName;
  await createSqlOnlyTable(harness.conn, 'sql_only', SQL_ONLY_ROWS);
  await createSqlOnlyView(harness.conn, 'sql_only_view', 'sql_only');
}, 60_000);

afterAll(async () => {
  await harness?.cleanup();
});

const qi = (name: string): string => `"${name.replace(/"/g, '""')}"`;
const lit = (text: string): string => `'${text.replace(/'/g, "''")}'`;

async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const result = await harness.conn.query(sql);
  return result.toArray().map((row) => row.toJSON() as T);
}

/** The column's type, as DESCRIBE prints it. */
async function typeOf(table: string, column: string): Promise<string> {
  const [row] = await query<{ column_type: string }>(
    `DESCRIBE SELECT ${qi(column)} FROM ${qi(table)}`,
  );
  return row!.column_type;
}

// ---------------------------------------------------------------------------
// The oracle
// ---------------------------------------------------------------------------

/** No value: SQL NULL, a missing key, a position past the end. */
const MISSING = Symbol('missing');

/**
 * JSON.parse, reading DuckDB's bare `NaN`, `Infinity` and `-Infinity` (which
 * `to_json` writes for those doubles) as strings, the same on both sides.
 */
function parseDuckJson(text: string): unknown {
  let out = '';
  for (let i = 0; i < text.length;) {
    if (text[i] === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    const special = /^(-?Infinity|NaN)/.exec(text.slice(i, i + 9));
    if (special) {
      out += `"${special[0]}"`;
      i += special[0].length;
      continue;
    }
    out += text[i];
    i++;
  }
  return JSON.parse(out);
}

function own(value: unknown, key: string): unknown {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, key)
    ? (value as Record<string, unknown>)[key]
    : MISSING;
}

/**
 * The part of `whole` (a column's value as `to_json` writes it, parsed) that
 * `path` reaches, read by the column's type; and whether the path ended in
 * JSON. Outside JSON, `null` is SQL NULL; inside, it is JSON's `null`. A
 * VARIANT that is NULL has no value, whatever its JSON says.
 */
function walkValue(
  whole: unknown,
  type: DuckDBTypeNode,
  path: readonly NestedPathStep[],
): { value: unknown; json: boolean } {
  let value = whole;
  let node: DuckDBTypeNode | null = type;
  const enter = (): void => {
    if (node && (node.kind === 'json' || node.kind === 'variant')) {
      if (node.kind === 'variant' && value === null) value = MISSING;
      node = null;
    }
  };
  enter();
  for (const step of path) {
    if (value === MISSING) break;
    if (node === null) {
      value =
        typeof step === 'number'
          ? Array.isArray(value) && step < value.length
            ? value[step]
            : MISSING
          : own(value, step);
      continue;
    }
    if (value === null) {
      value = MISSING;
      break;
    }
    const current: DuckDBTypeNode = node;
    switch (current.kind) {
      case 'struct': {
        const field: DuckDBStructField | undefined =
          typeof step === 'number'
            ? current.fields[step - 1]
            : current.fields.find((f) => f.name === step);
        if (!field || field.name === null) throw new Error(`oracle: no named field ${step}`);
        value = own(value, field.name);
        node = field.type;
        break;
      }
      case 'list':
      case 'array':
        value =
          Array.isArray(value) && typeof step === 'number' && step <= value.length
            ? value[step - 1]
            : MISSING;
        node = current.element;
        break;
      case 'map':
        value = own(value, String(step));
        node = current.value;
        break;
      case 'union': {
        const member: DuckDBUnionMember | undefined = current.members.find((m) => m.tag === step);
        if (!member) throw new Error(`oracle: no member ${step}`);
        value = own(value, member.tag);
        node = member.type;
        break;
      }
      default:
        throw new Error(`oracle: cannot step into ${current.sqlType}`);
    }
    enter();
  }
  return { value, json: node === null };
}

/** DuckDB's TRY_CAST of text to DOUBLE, for the texts the fixtures hold. */
function textToDouble(text: string): number | null {
  return /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(text) ? Number(text) : null;
}

/** DuckDB's TRY_CAST of text to BOOLEAN, for the texts the fixtures hold. */
function textToBoolean(text: string): boolean | null {
  const t = text.trim().toLowerCase();
  if (['true', 't', '1', 'yes'].includes(t)) return true;
  if (['false', 'f', '0', 'no'].includes(t)) return false;
  return null;
}

/**
 * What an extract column should hold for one row: a value its `to_json`
 * parses to, or (`jsonText`) a string whose JSON parses to the value, as
 * `json_extract_string` gives a number, boolean, object or array.
 */
type Expectation = { equal: unknown } | { jsonText: unknown };

function expectation(
  whole: unknown,
  type: DuckDBTypeNode,
  path: readonly NestedPathStep[],
  options: NestedFieldExpressionOptions = {},
): Expectation {
  const extract = options.extract ?? 'value';
  const { value, json } = walkValue(whole, type, path);
  if (!json) {
    if (value === MISSING || value === null) return { equal: null };
    if (extract === 'length') {
      return { equal: Array.isArray(value) ? value.length : Object.keys(value as object).length };
    }
    if (extract === 'tag') return { equal: Object.keys(value as object)[0] };
    return { equal: value };
  }
  if (extract === 'length') {
    return { equal: value === MISSING ? null : Array.isArray(value) ? value.length : 0 };
  }
  if (value === MISSING) return { equal: null };
  switch (options.jsonLeaf ?? 'string') {
    case 'json':
      return { equal: value };
    case 'number':
      return {
        equal:
          typeof value === 'number'
            ? value
            : typeof value === 'string'
              ? textToDouble(value)
              : null,
      };
    case 'boolean':
      return {
        equal:
          typeof value === 'boolean'
            ? value
            : typeof value === 'string' || typeof value === 'number'
              ? textToBoolean(String(value))
              : null,
      };
    default:
      if (value === null) return { equal: null };
      return typeof value === 'string' ? { equal: value } : { jsonText: value };
  }
}

function meets(expected: Expectation, actual: unknown): boolean {
  if ('equal' in expected) return isEqual(actual, expected.equal);
  return typeof actual === 'string' && isEqual(JSON.parse(actual), expected.jsonText);
}

function isEqual(a: unknown, b: unknown): boolean {
  try {
    expect(a).toStrictEqual(b);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Checking columns
// ---------------------------------------------------------------------------

interface Case {
  path: NestedPathStep[];
  options?: NestedFieldExpressionOptions;
}

/** Every default name a check made, to prove they need no quoting. */
const madeNames = new Set<string>();

/**
 * Build each case for `column` of `table`, run them all over every row, and
 * compare each value with the oracle's. `whole` is the SQL for the whole
 * value as JSON: `to_json`, except for types holding a VARIANT, which
 * `to_json` cannot write.
 */
async function check(
  table: string,
  column: string,
  cases: readonly Case[],
  whole = `to_json(${qi(column)})`,
): Promise<number> {
  const originalType = await typeOf(table, column);
  const type = parseDuckDBType(originalType);
  const expressions = cases.map((c) => {
    const built = nestedFieldExpression({ name: column, originalType }, c.path, c.options);
    if (!built.ok) {
      throw new Error(
        `${column} ${JSON.stringify(c.path)}: ${built.error.code} ${built.error.message}`,
      );
    }
    madeNames.add(built.name);
    return built.expression;
  });

  const parts = expressions.map((e, i) => `CAST(to_json(${e}) AS VARCHAR) AS p${i}`);
  const sql =
    `SELECT CAST("__rowid__" AS INTEGER) AS r, CAST(${whole} AS VARCHAR) AS w, ${parts.join(', ')} ` +
    `FROM ${qi(table)} ORDER BY "__rowid__"`;
  let rows: Record<string, string | number | null>[];
  try {
    rows = await query(sql);
  } catch (err) {
    // Name the expression DuckDB refused.
    for (const e of expressions) {
      try {
        await query(`SELECT count(to_json(${e})) FROM ${qi(table)}`);
      } catch (inner) {
        throw new Error(`${e}: ${(inner as Error).message}`, { cause: inner });
      }
    }
    throw err;
  }

  const mismatches: unknown[] = [];
  for (const row of rows) {
    const w = row['w'] as string | null;
    const value = w === null ? MISSING : parseDuckJson(w);
    cases.forEach((c, i) => {
      const p = row[`p${i}`] as string | null;
      const actual = p === null ? null : parseDuckJson(p);
      const expected = expectation(value, type, c.path, c.options);
      if (!meets(expected, actual)) {
        mismatches.push({ row: row['r'], expression: expressions[i], expected, actual });
      }
    });
  }
  expect(mismatches.slice(0, 5)).toEqual([]);
  return rows.length;
}

/** Values of `sql` over `table`, one per distinct value, in order, at most `limit`. */
async function distinct(sql: string, table: string, limit = 1000): Promise<string[]> {
  const rows = await query<{ v: string }>(
    `SELECT DISTINCT v FROM (SELECT ${sql} AS v FROM ${qi(table)}) WHERE v IS NOT NULL ORDER BY v LIMIT ${limit}`,
  );
  return rows.map((r) => r.v);
}

const values = (paths: NestedPathStep[][], options?: NestedFieldExpressionOptions): Case[] =>
  paths.map((path) => (options ? { path, options } : { path }));

/**
 * Every field of a struct type, and every field of a field that is a struct
 * itself, as paths in declaration order (a struct before its fields). An
 * unnamed field is its 1-based position. Lists, maps and unions inside are
 * not entered: their fields are not at a fixed path.
 */
function structPaths(node: DuckDBTypeNode, prefix: NestedPathStep[] = []): NestedPathStep[][] {
  if (node.kind !== 'struct') return [];
  return node.fields.flatMap((field, i) => {
    const path = [...prefix, field.name ?? i + 1];
    return [path, ...structPaths(field.type, path)];
  });
}

/** Every struct path of the column's type (of its elements' type, for a list). */
async function structPathsOf(table: string, column: string): Promise<NestedPathStep[][]> {
  const type = parseDuckDBType(await typeOf(table, column));
  return structPaths(type.kind === 'list' ? type.element : type);
}

const LEAVES = ['string', 'number', 'boolean', 'json'] as const;

// ---------------------------------------------------------------------------
// The fixture's columns
// ---------------------------------------------------------------------------

describe('structs', () => {
  it('reads all 26 odd fields of odd_names, by name and by position', async () => {
    const type = parseDuckDBType(await typeOf(parquet, 'odd_names'));
    if (type.kind !== 'struct') throw new Error('odd_names is not a struct');
    const names = type.fields.map((f) => f.name!);
    expect(names).toHaveLength(26);
    expect(names).toContain('quote"d');
    expect(names).toContain("it's");
    const rows = await check(parquet, 'odd_names', [
      ...values(names.map((n) => [n])),
      ...values(names.map((_, i) => [i + 1])),
    ]);
    expect(rows).toBe(1000);
  });

  it('reads every struct path of nested_struct, four structs deep, and its list', async () => {
    const paths = await structPathsOf(parquet, 'nested_struct');
    expect(paths).toContainEqual(['owner', 'contact', 'email']);
    expect(paths).toContainEqual(['owner', 'contact', 'address', 'city']);
    await check(parquet, 'nested_struct', [
      ...values(paths),
      ...values([
        ['owner', 'contact', 'phones', 1],
        ['owner', 'contact', 'phones', 2],
        [2],
        [1, 2, 1],
      ]),
      { path: ['owner', 'contact', 'phones'], options: { extract: 'length' } },
    ]);
  });

  it('reads every struct path of point, typed leaves and a wide struct', async () => {
    await check(parquet, 'point', [
      ...values(await structPathsOf(parquet, 'point')),
      { path: [3] },
    ]);
    await check(parquet, 'typed_leaves', values(await structPathsOf(parquet, 'typed_leaves')));
    const wide = await structPathsOf(parquet, 'wide_struct');
    expect(wide).toHaveLength(40);
    await check(parquet, 'wide_struct', [...values(wide), { path: [40] }]);
  });

  it('reads the JSON file’s structs: depth 5, integer-like names, a JSON field', async () => {
    const depth5 = await structPathsOf(json, 'depth5');
    expect(depth5).toContainEqual(['l2', 'l3', 'l4', 'l5', 'leaf']);
    await check(json, 'depth5', values(depth5));
    await check(json, 'key_order', [
      ...values(await structPathsOf(json, 'key_order')),
      ...values([[1], [2]]),
    ]);
    await check(json, 'point', values(await structPathsOf(json, 'point')));
    await check(json, 'odd_keys', [
      ...values(await structPathsOf(json, 'odd_keys')),
      ...LEAVES.map((jsonLeaf) => ({ path: ['my field'], options: { jsonLeaf } })),
      ...values(
        [
          ['my field', 'k'],
          ['my field', 0],
        ],
        { jsonLeaf: 'json' },
      ),
    ]);
  });
});

describe('a field named ""', () => {
  it('is read by name and by position, as a JSON file names it', async () => {
    const loader = makeNodeBridge(harness.conn, harness.db);
    const { tableName, schema } = await loader.loadData(
      '{"s":{"b":2,"":1}}\n{"s":{"b":3,"":4}}\n{"s":null}\n',
      { format: 'json', tableName: 'empty_name' },
    );
    // DuckDB writes the empty name as nothing.
    expect(schema.find((c) => c.name === 's')?.originalType).toBe('STRUCT(b BIGINT,  BIGINT)');
    expect(await check(tableName, 's', values([[''], [2], ['b'], [1]]))).toBe(3);
  });
});

describe('lists and arrays', () => {
  it('reads elements and lengths of every list column', async () => {
    const lists = [
      'tags',
      'scores',
      'long_list',
      'embedding',
      'doubles',
      'decimals',
      'big_ints',
      'ubig',
      'dates',
      'timestamps_tz',
      'times',
      'uuids',
      'blobs',
      'bools',
      'strings_edge',
      'tier_list',
      'all_null_list',
      'all_empty_list',
    ];
    for (const column of lists) {
      await check(parquet, column, [
        ...values([[1], [2], [3], [32]]),
        { path: [], options: { extract: 'length' } },
      ]);
    }
    await check(parquet, 'long_list', values([[1000], [2500], [10000], [10001]]));
    await check(parquet, 'matrix', [
      ...values([[1], [1, 1], [2, 2], [3, 1]]),
      { path: [1], options: { extract: 'length' } },
    ]);
    await check(
      parquet,
      'deep_list',
      values([
        [1, 1, 1],
        [2, 1, 2],
        [1, 2],
      ]),
    );
    await check(
      json,
      'matrix',
      values([
        [1, 1],
        [2, 3],
      ]),
    );
    await check(json, 'huge', values([[1], [2]]));
  });

  it('reads every struct path of a list of structs', async () => {
    for (const table of [parquet, json]) {
      const fields = await structPathsOf(table, 'people');
      expect(fields).toEqual([['name'], ['age'], ['langs']]);
      await check(table, 'people', [
        ...values([[1], [2], [3]]),
        ...values([1, 2].flatMap((position) => fields.map((f) => [position, ...f]))),
        ...values([
          [2, 'langs', 1],
          [1, 'langs', 3],
        ]),
        { path: [], options: { extract: 'length' } },
        { path: [1, 'langs'], options: { extract: 'length' } },
      ]);
    }
  });

  it('reads fixed-size arrays and lists of them', async () => {
    await check('sql_only', 'int_array3', [
      ...values([[1], [2], [3]]),
      { path: [], options: { extract: 'length' } },
    ]);
    await check('sql_only', 'embedding768', [
      ...values([[1], [384], [768]]),
      { path: [], options: { extract: 'length' } },
    ]);
    await check('sql_only', 'int_pairs', [
      ...values([[1], [1, 1], [1, 2], [3, 2]]),
      { path: [], options: { extract: 'length' } },
      { path: [1], options: { extract: 'length' } },
    ]);
    await check('sql_only', 'intervals', values([[1], [4]]));
    await check('sql_only', 'bit_list', values([[1], [2], [3]]));
  });
});

describe('maps', () => {
  it('reads attrs at every key it holds, odd keys and escapes included', async () => {
    const keys = await distinct('unnest(map_keys("attrs"))', parquet);
    for (const key of ['size', 'toJSON', 'constructor', '__proto__', '2', '1', 'k=v', '', "it's"]) {
      expect(keys).toContain(key);
    }
    await check(parquet, 'attrs', [
      ...values(keys.map((k) => [k])),
      { path: [], options: { extract: 'length' } },
      // A number for a text key reads the key with that text.
      { path: [2] },
    ]);
  });

  it('reads whole-number keys, as numbers and as text', async () => {
    const keys = (await distinct('CAST(unnest(map_keys("int_keys")) AS VARCHAR)', parquet)).map(
      Number,
    );
    expect(keys.some((k) => k < 0)).toBe(true);
    const sample = [
      ...keys.filter((k) => k < 0).slice(0, 5),
      ...keys.filter((k) => k >= 0).slice(0, 15),
    ];
    await check(parquet, 'int_keys', [
      ...values(sample.map((k) => [k])),
      ...values(sample.slice(0, 5).map((k) => [String(k)])),
      ...values([[2], [1], [10], [100000]]),
      { path: [], options: { extract: 'length' } },
    ]);
  });

  it('reads DATE keys from their text, and the lists they hold', async () => {
    const keys = await distinct('CAST(unnest(map_keys("date_keys")) AS VARCHAR)', parquet, 12);
    expect(keys.length).toBeGreaterThan(3);
    await check(parquet, 'date_keys', [
      ...values(keys.map((k) => [k])),
      ...values(keys.slice(0, 4).map((k) => [k, 1])),
      ...values([['1999-12-31'], ['not a date']]),
      { path: [], options: { extract: 'length' } },
      { path: [keys[0]!], options: { extract: 'length' } },
    ]);
  });

  it('reads struct values of a map, and the JSON file’s maps', async () => {
    const keys = await distinct('unnest(map_keys("map_of_structs"))', parquet, 6);
    const fields = parseDuckDBType(await typeOf(parquet, 'map_of_structs'));
    if (fields.kind !== 'map') throw new Error('map_of_structs is not a map');
    const paths = structPaths(fields.value);
    expect(paths).toEqual([['qty'], ['price'], ['note']]);
    await check(
      parquet,
      'map_of_structs',
      keys.flatMap((k) => values([[k], ...paths.map((p) => [k, ...p])])),
    );
    const props = await distinct('unnest(map_keys("props"))', json, 10);
    await check(json, 'props', [
      ...values(props.map((k) => [k])),
      { path: [], options: { extract: 'length' } },
    ]);
    const empty = await distinct('unnest(map_keys("empty_obj"))', json, 10);
    await check(json, 'empty_obj', [
      ...values([...empty.map((k) => [k]), ['nope']]),
      ...values(
        empty.slice(0, 3).map((k) => [k, 'k']),
        { jsonLeaf: 'json' },
      ),
    ]);
  });

  it('reads maps keyed by structs and lists from the keys’ text', async () => {
    const structKeys = await distinct(
      'CAST(unnest(map_keys("struct_key_map")) AS VARCHAR)',
      'sql_only',
      8,
    );
    expect(structKeys.length).toBeGreaterThan(3);
    for (const key of structKeys) expect(key).toMatch(/^\{'k': \d+\}$/);
    await check('sql_only', 'struct_key_map', [
      ...values(structKeys.map((k) => [k])),
      ...values([['{k: x}']]),
      { path: [], options: { extract: 'length' } },
    ]);
    const listKeys = await distinct(
      'CAST(unnest(map_keys("list_key_map")) AS VARCHAR)',
      'sql_only',
      8,
    );
    expect(listKeys.some((k) => /^\[\d+, 0\]$/.test(k))).toBe(true);
    await check('sql_only', 'list_key_map', values(listKeys.map((k) => [k])));
  });
});

describe('unions', () => {
  it('reads members, their insides and tags', async () => {
    await check('sql_only', 'union_pair', [
      ...values([['i'], ['s']]),
      { path: [], options: { extract: 'tag' } },
    ]);
    await check('sql_only', 'union_nested', [
      ...values([['l'], ['l', 1], ['l', 2], ['st'], ['st', 'a'], ['st', 'b']]),
      { path: [], options: { extract: 'tag' } },
      { path: ['l'], options: { extract: 'length' } },
    ]);
    await check('sql_only', 'huge_struct', values([['h'], ['u']]));
    await check('sql_only', 'enum_struct', values([['e'], ['n']]));
  });

  it('reads unnamed struct fields by position', async () => {
    const built = [1, 2].map((p) => {
      const result = nestedFieldExpression(
        { name: 'unnamed_struct', originalType: 'STRUCT(INTEGER, VARCHAR)' },
        [p],
      );
      if (!result.ok) throw new Error(result.error.message);
      return result.expression;
    });
    const rows = await query<{ id: bigint; a: number | null; b: string | null }>(
      `SELECT "id", ${built[0]} AS a, ${built[1]} AS b FROM "sql_only_view" ORDER BY "id"`,
    );
    expect(rows).toHaveLength(SQL_ONLY_ROWS);
    for (const row of rows) {
      const id = Number(row.id);
      const isNull = id % 7 === 6;
      expect([row.a, row.b]).toEqual(isNull ? [null, null] : [id, `r${id}`]);
    }
  });
});

describe('JSON', () => {
  it('reads doc at every key it holds, as each leaf kind', async () => {
    const keys = await distinct(
      `unnest(CASE WHEN json_type("doc") = 'OBJECT' THEN json_keys("doc") END)`,
      parquet,
    );
    for (const key of ['k', 'score', 'kind', 'my field', 'a.b', 'q"k', 'ünï', '', 'a_b', 'A_B']) {
      expect(keys).toContain(key);
    }
    await check(parquet, 'doc', [
      ...values(keys.map((k) => [k])),
      ...values(
        keys.map((k) => [k]),
        { jsonLeaf: 'json' },
      ),
      ...values(
        [
          'score',
          'a.b',
          'max_safe',
          'unsafe',
          'i64_min',
          'i64_max',
          'u64_max',
          'dec',
          'tiny',
          'neg_zero',
          'huge',
          'k',
        ].map((k) => [k]),
        { jsonLeaf: 'number' },
      ),
      ...values([['q"k'], ['k']], { jsonLeaf: 'boolean' }),
    ]);
  });

  it('reads nested keys, 0-based indexes and lengths in doc', async () => {
    await check(parquet, 'doc', [
      ...values([
        ['ünï', 'n'],
        ['ünï', 'list', 0],
        ['ünï', 'list', 2],
        ['ünï', 'list', 3],
        [0],
        [999],
        [1000],
      ]),
      ...values([['ünï'], ['ünï', 'list'], []], { jsonLeaf: 'json' }),
      ...values([['ünï', 'list', 1]], { jsonLeaf: 'number' }),
      ...LEAVES.map((jsonLeaf) => ({ path: [], options: { jsonLeaf } })),
      { path: [], options: { extract: 'length' } },
      { path: ['ünï', 'list'], options: { extract: 'length' } },
      { path: ['k'], options: { extract: 'length' } },
    ]);
  });

  it('reads JSON lists, a type-changing JSON column and the JSON null column', async () => {
    await check(parquet, 'json_list', [
      ...values([[1], [2], [3], [1, 'k'], [2, 'ünï', 'list', 1], [1, 0]]),
      ...values([[1], [2]], { jsonLeaf: 'json' }),
      ...values([[1]], { jsonLeaf: 'number' }),
      { path: [], options: { extract: 'length' } },
      { path: [1, 'ünï', 'list'], options: { extract: 'length' } },
    ]);
    await check(json, 'shifty', [
      ...LEAVES.map((jsonLeaf) => ({ path: [], options: { jsonLeaf } })),
      ...values([[0], ['a'], ['b', 0]], { jsonLeaf: 'json' }),
      { path: [], options: { extract: 'length' } },
    ]);
    await check(json, 'mixed_list', [
      ...values([[1], [2], [1, 0], [1, 'k']], { jsonLeaf: 'json' }),
      { path: [], options: { extract: 'length' } },
    ]);
    await check(json, 'all_null', [
      ...LEAVES.map((jsonLeaf) => ({ path: ['k'], options: { jsonLeaf } })),
      { path: [], options: { extract: 'length' } },
    ]);
  });

  describe('keys JSONPath and JSON pointers spell differently', () => {
    /** Keys with every character the two path syntaxes treat specially. */
    const ODD_KEYS = [
      'k',
      'a.b',
      'q"k',
      "it's",
      's/l',
      't~l',
      'b[r',
      'c]d',
      'my field',
      'ünï',
      'emoji😀',
      '2',
      '0',
      '',
      '$',
      '*',
      'a*b',
      '**',
      'b\\s',
      'x\\"y',
      '#',
      '~1',
      '-',
      'a..b',
      'nl\nx',
      'tab\tx',
      ' lead',
      '[0]',
      'e.f[0]',
      '"',
      '\\',
      "'",
      '$.k',
      'null',
      '-1',
      '1e3',
      'é',
      'e\u0301',
    ];

    beforeAll(async () => {
      const doc = (i: number): string => {
        const object: Record<string, unknown> = {};
        ODD_KEYS.forEach((key, k) => {
          object[key] = { v: i * 100 + k, list: [k, `s${k}`, [i]] };
        });
        return JSON.stringify(object);
      };
      // Row 2 is an array where rows 0 and 1 have objects: a key "0" must
      // not read its element 0, nor an index 0 an object's key "0".
      const rows = [doc(0), doc(1), JSON.stringify([{ v: 'zero' }, 1, 2]), 'null', null];
      await query(
        `CREATE TABLE odd_json AS SELECT CAST(range AS BIGINT) AS "__rowid__", ` +
          `CAST(list_extract([${rows.map((r) => (r === null ? 'NULL' : lit(r))).join(', ')}], range + 1) AS JSON) AS doc ` +
          `FROM range(${rows.length})`,
      );
    });

    it('reads every odd key, its insides and its list', async () => {
      await check('odd_json', 'doc', [
        ...values(
          ODD_KEYS.map((k) => [k]),
          { jsonLeaf: 'json' },
        ),
        ...values(ODD_KEYS.map((k) => [k, 'v'])),
        ...values(
          ODD_KEYS.map((k) => [k, 'v']),
          { jsonLeaf: 'number' },
        ),
        ...values(ODD_KEYS.map((k) => [k, 'list', 1])),
        ...ODD_KEYS.map((k) => ({ path: [k, 'list'], options: { extract: 'length' as const } })),
      ]);
    });

    it('chains pointer and JSONPath reads through the keys JSONPath cannot spell', async () => {
      await check('odd_json', 'doc', [
        ...values([
          ['*', 'list', 2, 0],
          ['', 'list', 2, 0],
          ['*', 'v'],
          ['', 'v'],
          [0, 'v'],
          ['0', 'v'],
          [0],
        ]),
        { path: ['*', 'list'], options: { extract: 'length' } },
        { path: ['', 'list', 2], options: { extract: 'length' } },
      ]);
    });
  });
});

describe('VARIANT', () => {
  const asJson = (column: string): string => `CAST(CAST(${qi(column)} AS VARIANT) AS JSON)`;

  it('reads a VARIANT as JSON, keeping NULL', async () => {
    await check(
      'sql_only',
      'variant_value',
      [
        ...LEAVES.map((jsonLeaf) => ({ path: [], options: { jsonLeaf } })),
        ...values([['k'], ['s'], [0], [1]]),
        ...values([['k'], [0]], { jsonLeaf: 'number' }),
        { path: [], options: { extract: 'length' } },
      ],
      asJson('variant_value'),
    );
  });

  it('reads VARIANTs inside lists and structs', async () => {
    await check(
      'sql_only',
      'variant_list',
      [
        ...values([[1], [2], [3], [4]]),
        ...values([[1], [3]], { jsonLeaf: 'json' }),
        ...values([[1]], { jsonLeaf: 'number' }),
        { path: [], options: { extract: 'length' } },
        { path: [3], options: { extract: 'length' } },
      ],
      asJson('variant_list'),
    );
    await check(
      'sql_only',
      'variant_struct',
      [
        ...LEAVES.map((jsonLeaf) => ({ path: ['k'], options: { jsonLeaf } })),
        { path: ['k'], options: { extract: 'length' } },
      ],
      asJson('variant_struct'),
    );
  });
});

describe('default names', () => {
  it('need no quoting in DuckDB', async () => {
    const names = [...madeNames];
    expect(names.length).toBeGreaterThan(100);
    expect(names).toContain('odd_names_quote_d');
    expect(names).toContain('nested_struct_owner_contact_email');
    // Each name as a bare identifier, aliased and read back.
    for (let i = 0; i < names.length; i += 200) {
      const batch = names.slice(i, i + 200);
      const sql = `SELECT ${batch.join(', ')} FROM (SELECT ${batch.map((n, k) => `${k} AS ${n}`).join(', ')})`;
      const [row] = await query(sql);
      expect(Object.keys(row!)).toEqual(batch);
    }
  });

  it('avoid the keywords with a _ that do not parse as a column', async () => {
    // Every default name has two parts or more, joined by `_`: only DuckDB's
    // reserved and type-function keywords with a `_` in them could need
    // quoting. try_cast parses as a column all the same; the two reserved
    // words get `_col`.
    const keywords = await query<{ keyword_name: string }>(
      `SELECT keyword_name FROM duckdb_keywords() WHERE keyword_name LIKE '%\\_%' ESCAPE '\\' ` +
        `AND keyword_category IN ('reserved', 'type_function') ORDER BY keyword_name`,
    );
    expect(keywords.map((k) => k.keyword_name)).toEqual([
      'pivot_longer',
      'pivot_wider',
      'try_cast',
    ]);
    await expect(query(`SELECT try_cast FROM (SELECT 1 AS "try_cast")`)).resolves.toHaveLength(1);
    for (const word of ['longer', 'wider']) {
      const built = nestedFieldExpression(
        { name: 'pivot', originalType: `STRUCT(${word} INTEGER)` },
        [word],
      );
      expect(built).toMatchObject({ ok: true, name: `pivot_${word}_col` });
      const name = built.ok ? built.name : '';
      await expect(query(`SELECT ${name} FROM (SELECT 1 AS ${name})`)).resolves.toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// In the derived-column view
// ---------------------------------------------------------------------------

describe('inside DerivedColumnManager’s view', () => {
  const ROWS = 6;

  it('reads the column, not a same-named table’s, beside columns named t and h1', async () => {
    // A base table named like its struct column, with a top-level `x` that
    // "point"."x" reads instead of the field; columns named t and h1, the
    // view's aliases for the base table and a vector column's helper table;
    // and another table named t.
    await query(
      `CREATE TABLE point AS SELECT CAST(range AS BIGINT) AS "__rowid__", ` +
        `{'x': range * 10, 'y': -range} AS point, range + 1000 AS x, ` +
        `{'x': range * 100} AS t, {'x': range * 1000} AS h1, ['a' || range, 'b'] AS tags, ` +
        `MAP {'k': range} AS m FROM range(${ROWS})`,
    );
    await query(`CREATE TABLE t AS SELECT 7 AS x`);
    const [hazard] = await query<{ dotted: bigint; bracket: bigint }>(
      `SELECT "point"."x" AS dotted, "point"['x'] AS bracket FROM "point" WHERE "__rowid__" = 1`,
    );
    expect([Number(hazard!.dotted), Number(hazard!.bracket)]).toEqual([1001, 10]);

    const bridge = makeNodeBridge(harness.conn) as WorkerBridge;
    const manager = new DerivedColumnManager(bridge, 'point', () => ROWS);
    const schema = await query<{ column_name: string; column_type: string }>(`DESCRIBE "point"`);
    const typeOfColumn = new Map(schema.map((c) => [c.column_name, c.column_type]));
    const names = schema.map((c) => c.column_name);

    const add = async (
      column: string,
      path: NestedPathStep[],
      options?: NestedFieldExpressionOptions,
    ): Promise<string> => {
      const built = nestedFieldExpression(
        { name: column, originalType: typeOfColumn.get(column)! },
        path,
        options,
      );
      if (!built.ok) throw new Error(built.error.message);
      const name = uniqueColumnName(built.name, names);
      names.push(name);
      await manager.addColumn({ kind: 'expression', name, expression: built.expression });
      return name;
    };

    // The first is checked against the base table itself: FROM "point".
    const pointX = await add('point', ['x']);
    // A vector column puts h1, its helper table's alias, in the view.
    await manager.addColumn({
      kind: 'vector',
      name: 'weight',
      vectorType: 'float',
      values: Array.from({ length: ROWS }, (_, i) => i / 2),
    });
    const added = [
      pointX,
      await add('point', ['y']),
      await add('t', ['x']),
      await add('h1', ['x']),
      await add('tags', [1]),
      await add('tags', [], { extract: 'length' }),
      await add('m', ['k']),
      await add('m', [], { extract: 'length' }),
      // Again: a unique name, not a second point_x.
      await add('point', ['x']),
    ];
    expect(added).toEqual([
      'point_x',
      'point_y',
      't_x',
      'h1_x',
      'tags_1',
      'tags_length',
      'm_k',
      'm_size',
      'point_x_2',
    ]);

    const view = manager.getEffectiveTableName();
    const rows = await query<Record<string, unknown>>(
      `SELECT ${added.map(qi).join(', ')}, "weight", "x" FROM ${qi(view)} ORDER BY "__rowid__"`,
    );
    expect(rows).toHaveLength(ROWS);
    rows.forEach((row, i) => {
      expect(
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]),
        ),
      ).toEqual({
        point_x: i * 10,
        point_y: 0 - i,
        t_x: i * 100,
        h1_x: i * 1000,
        tags_1: `a${i}`,
        tags_length: 2,
        m_k: i,
        m_size: 1,
        point_x_2: i * 10,
        weight: i / 2,
        x: i + 1000,
      });
    });

    // The view's columns are the names given, in DuckDB too.
    const described = await query<{ column_name: string }>(`DESCRIBE ${qi(view)}`);
    expect(described.map((c) => c.column_name)).toEqual(expect.arrayContaining(added));
    await manager.destroy();
  });

  it('reads the fixture’s odd fields through the view as on the table', async () => {
    const bridge = makeNodeBridge(harness.conn) as WorkerBridge;
    const manager = new DerivedColumnManager(bridge, parquet, () => 1000);
    const originalType = await typeOf(parquet, 'odd_names');
    const expressions: [string, string][] = [];
    for (const field of ['quote"d', "it's", 'ID', '__proto__', 'x,y']) {
      const built = nestedFieldExpression({ name: 'odd_names', originalType }, [field]);
      if (!built.ok) throw new Error(built.error.message);
      await manager.addColumn({
        kind: 'expression',
        name: built.name,
        expression: built.expression,
      });
      expressions.push([built.name, field]);
    }
    const view = manager.getEffectiveTableName();
    const select = expressions
      .map(
        ([name, field]) =>
          `${qi(name)} IS NOT DISTINCT FROM "odd_names"[${lit(field)}] AS ${qi(name)}`,
      )
      .join(', ');
    const rows = await query<Record<string, boolean>>(`SELECT ${select} FROM ${qi(view)}`);
    expect(rows).toHaveLength(1000);
    for (const row of rows) expect(Object.values(row).every(Boolean)).toBe(true);
    await manager.destroy();
  });
});
