/**
 * Filters on nested values, on real DuckDB.
 *
 * A nested column (LIST, ARRAY, STRUCT, MAP, UNION, VARIANT) shows DuckDB's
 * text for each value, and an exact filter on one compares that text:
 * `valueType: 'text'` builds `CAST(col AS VARCHAR) = '…'`. Compared as a
 * value instead, DuckDB reads the text as the column's type: text that does
 * not read as one is a Conversion Error, which broke the grid; a UNION found
 * only the member the text reads as (the text '0', not the integer 0, though
 * both show 0); and a VARIANT failed on any value of another type. The
 * pattern filters compare the same text.
 *
 * Every case runs the WHERE clause a filter builds and checks what it keeps
 * against the rows whose text, read back from DuckDB, passes the same test in
 * JavaScript. Any Conversion or Binder error fails the query, and so the case.
 * A VARIANT cannot cross Arrow, so tables are only ever read as text.
 *
 * - A table of every nested kind, row by row: each filter's rows by
 *   `__rowid__`, the values that read alike, filters combined.
 * - The nested stress fixture (Parquet and JSON, loaded by the real loaders)
 *   and its SQL-only companions (ARRAY, UNION, VARIANT, MAP with nested
 *   keys): an exact filter on every distinct value of every nested column,
 *   set and not-set filters, and the pattern filters, counted many to a
 *   query.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isNestedSqlType } from '@/core/duckdbType';
import { filtersToWhereClause, quoteIdentifier } from '@/filters/FilterSQL';
import type { Filter } from '@/filters/FilterTypes';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { MANIFEST, loadNestedFixture } from '../helpers/nestedFixture';
import { SQL_ONLY_COLUMNS, createSqlOnlyTable, createSqlOnlyView } from '../helpers/nestedSql';
import { makeNodeBridge } from '../helpers/nodeBridge';

interface NestedColumn {
  name: string;
  /** The column's DuckDB type. */
  type: string;
  /** SQL literals, cast to `type` and given to the rows in turn. */
  values: string[];
}

const COLUMNS: NestedColumn[] = [
  {
    name: 'tags',
    type: 'VARCHAR[]',
    values: [
      `['red', 'green']`,
      `[NULL]`,
      `['NULL']`,
      `[]`,
      `NULL`,
      `['it''s', 'a, b', '"dq"']`,
      `['[x]', 'k=v']`,
      `['', ' ']`,
      `['ünï', 'emoji😀']`,
      `['back\\slash', 'tab\tin']`,
      `['%', '_']`,
      `['RED', 'Green']`,
    ],
  },
  {
    // A NULL element and the text 'NULL' read apart: [NULL] and ['NULL'].
    name: 'tier_list',
    type: 'VARCHAR[]',
    values: [
      `[NULL]`,
      `['NULL']`,
      `['bronze']`,
      `['silver', 'gold']`,
      `['NULL', NULL]`,
      `[]`,
      `['null']`,
      `['Bronze']`,
    ],
  },
  {
    name: 'scores',
    type: 'INTEGER[]',
    values: [`[56, 3, 91]`, `[4, NULL, 17]`, `[]`, `NULL`, `[-2147483648, 2147483647]`, `[0]`],
  },
  {
    name: 'matrix',
    type: 'SMALLINT[][]',
    values: [`[[1, 2], [3]]`, `[[]]`, `[]`, `[NULL]`, `[[NULL]]`, `NULL`, `[[-32768, 32767]]`],
  },
  {
    name: 'fixed',
    type: 'INTEGER[3]',
    values: [`[1, 2, 3]`, `[NULL, NULL, NULL]`, `[0, 0, 0]`, `NULL`, `[1, NULL, 3]`],
  },
  {
    name: 'point',
    type: 'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)',
    values: [
      `{'x': 1.25, 'y': 0.58, 'tier': 'bronze'}`,
      `{'x': NULL, 'y': NULL, 'tier': NULL}`,
      `NULL`,
      `{'x': -0.0, 'y': 1e300, 'tier': 'it''s'}`,
      `{'x': 'nan'::DOUBLE, 'y': 'inf'::DOUBLE, 'tier': ''}`,
      `{'x': 2.0, 'y': 1.5, 'tier': 'NULL'}`,
    ],
  },
  {
    name: 'odd_names',
    type: `STRUCT("my field" INTEGER, "x,y" VARCHAR, "it's" BOOLEAN, "quote""d" VARCHAR, "1" INTEGER, "SELECT" VARCHAR)`,
    values: [
      `{'my field': 1, 'x,y': 'a, b', 'it''s': true, 'quote"d': '"', '1': 2, 'SELECT': 'FROM'}`,
      `{'my field': NULL, 'x,y': NULL, 'it''s': NULL, 'quote"d': NULL, '1': NULL, 'SELECT': NULL}`,
      `NULL`,
      `{'my field': -1, 'x,y': '{k=v}', 'it''s': false, 'quote"d': 'it''s', '1': 0, 'SELECT': ''}`,
    ],
  },
  {
    name: 'attrs',
    type: 'MAP(VARCHAR, INTEGER)',
    values: [
      `MAP {'k1': 1, 'k2': 2}`,
      `MAP {}`,
      `NULL`,
      `MAP {'k=v': 3, 'size': 4, 'toJSON': 5}`,
      `MAP {'a': NULL}`,
      `MAP {'2': 1, '1': 2}`,
    ],
  },
  {
    name: 'int_keys',
    type: 'MAP(INTEGER, VARCHAR)',
    values: [`MAP {1: 'a', 2: NULL}`, `MAP {}`, `NULL`, `MAP {-1: 'it''s'}`],
  },
  {
    // The integer 0 and the text '0' both read 0, as do 42 and '42'.
    name: 'u',
    type: 'UNION(i INTEGER, s VARCHAR)',
    values: [
      `union_value(i := 0)`,
      `union_value(s := '0')`,
      `NULL`,
      `union_value(s := 'x')`,
      `union_value(i := 42)`,
      `union_value(s := '42')`,
      `union_value(s := 'it''s')`,
    ],
  },
  {
    name: 'list_or_struct',
    type: 'UNION(l INTEGER[], st STRUCT(a INTEGER))',
    values: [
      `union_value(l := [1, 2])`,
      `union_value(st := {'a': 1})`,
      `union_value(l := [])`,
      `NULL`,
      `union_value(st := {'a': NULL})`,
    ],
  },
  {
    // So do the VARIANTs 42 and '42'; the text 'NULL' reads NULL, a NULL
    // value has no text.
    name: 'v',
    type: 'VARIANT',
    values: [`42`, `'x'`, `NULL`, `[1, 2]`, `{'a': 1}`, `'NULL'`, `'42'`, `true`, `1.5`],
  },
  {
    name: 'vl',
    type: 'VARIANT[]',
    values: [
      `[42::VARIANT, 'a'::VARIANT]`,
      `[NULL::VARIANT]`,
      `NULL`,
      `[]::VARIANT[]`,
      `['42'::VARIANT]`,
    ],
  },
  {
    name: 'sv',
    type: 'STRUCT(k VARIANT)',
    values: [
      `{'k': 1::VARIANT}`,
      `{'k': NULL::VARIANT}`,
      `NULL`,
      `{'k': 'z'::VARIANT}`,
      `{'k': [1]::VARIANT}`,
    ],
  },
  {
    name: 'jl',
    type: 'JSON[]',
    values: [
      `['{"a":1}'::JSON, '[1,2]'::JSON]`,
      `[NULL::JSON]`,
      `NULL`,
      `['"s"'::JSON]`,
      `[]::JSON[]`,
      `['null'::JSON]`,
    ],
  },
  {
    name: 'people',
    type: 'STRUCT(name VARCHAR, langs VARCHAR[])[]',
    values: [
      `[{'name': 'Ana', 'langs': ['en', 'pt']}, {'name': 'Bo', 'langs': []}]`,
      `[]`,
      `NULL`,
      `[{'name': NULL, 'langs': NULL}]`,
    ],
  },
];

const ROWS = 16;
const TABLE = 'nested_filters';

/**
 * Text no value here shows: half a list, half a struct, a lone quote.
 * Compared as a value, most of it is a Conversion Error.
 */
const STRAY_TEXT = ['abc', '[1, 2', '{', "{'x': }", '{k1=1, k2=2', "it's", '', '\\', '[NULL'];

let harness: NodeDuckDBHarness;
let bridge: ReturnType<typeof makeNodeBridge>;
/** Each column of {@link TABLE} as text, row by row (`__rowid__`); `null` for NULL. */
const texts = new Map<string, (string | null)[]>();

beforeAll(async () => {
  harness = await createNodeDuckDB();
  bridge = makeNodeBridge(harness.conn);
}, 60_000);

afterAll(async () => {
  await harness?.cleanup();
});

/** Create {@link TABLE} and read every column's text into {@link texts}. */
async function createKindsTable(): Promise<void> {
  const columns = COLUMNS.map((c) => `${quoteIdentifier(c.name)} ${c.type}`);
  await harness.conn.query(`CREATE TABLE ${TABLE} (__rowid__ BIGINT, ${columns.join(', ')})`);
  for (let row = 0; row < ROWS; row++) {
    const values = COLUMNS.map((c) => `CAST(${c.values[row % c.values.length]} AS ${c.type})`);
    await harness.conn.query(`INSERT INTO ${TABLE} VALUES (${row}, ${values.join(', ')})`);
  }
  const casts = COLUMNS.map(
    (c) => `CAST(${quoteIdentifier(c.name)} AS VARCHAR) AS ${quoteIdentifier(c.name)}`,
  );
  const rows = await bridge.query<Record<string, string | null>>(
    `SELECT ${casts.join(', ')} FROM ${TABLE} ORDER BY __rowid__`,
  );
  for (const c of COLUMNS) {
    texts.set(
      c.name,
      rows.map((row) => row[c.name] ?? null),
    );
  }
}

/** The rows the filters keep, by the WHERE clause the grid's queries use. */
async function rowsKept(filters: Filter[]): Promise<number[]> {
  const rows = await bridge.query<{ r: number }>(
    `SELECT __rowid__ AS r FROM ${TABLE} WHERE ${filtersToWhereClause(filters)} ORDER BY __rowid__`,
  );
  return rows.map((row) => row.r);
}

/** The rows whose text in `column` passes `test`. */
function rowsWhere(column: string, test: (text: string | null) => boolean): number[] {
  const rows: number[] = [];
  texts.get(column)!.forEach((text, row) => {
    if (test(text)) rows.push(row);
  });
  return rows;
}

/** The rows given one of `literals` (from `COLUMNS`) in `column`. */
function rowsHolding(column: string, ...literals: string[]): number[] {
  const { values } = COLUMNS.find((c) => c.name === column)!;
  for (const literal of literals) expect(values).toContain(literal);
  return Array.from({ length: ROWS }, (_, row) => row).filter((row) =>
    literals.includes(values[row % values.length]!),
  );
}

/** Each text a column holds, once, in the order the rows first show it. */
function distinctTexts(column: string): string[] {
  return [...new Set(texts.get(column)!.filter((text): text is string => text !== null))];
}

/** `text` as a regex matching only itself, in JavaScript and in DuckDB's RE2. */
function literalRegex(text: string): string {
  return `^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
}

const lower = (text: string): string => text.toLowerCase();

describe('a table of every nested kind', () => {
  beforeAll(createKindsTable, 60_000);

  it('has a nested type for every column of the table', async () => {
    const described = await bridge.query<{ column_name: string; column_type: string }>(
      `DESCRIBE ${TABLE}`,
    );
    const nested = described
      .filter((c) => isNestedSqlType(c.column_type))
      .map((c) => c.column_name);
    expect(nested).toEqual(COLUMNS.map((c) => c.name));
  });

  describe.each(COLUMNS.map((c) => c.name))('%s', (column) => {
    it('an exact text filter on each value keeps exactly the rows showing it', async () => {
      const values = distinctTexts(column);
      expect(values.length).toBeGreaterThan(2);
      for (const value of values) {
        const kept = await rowsKept([{ type: 'point', column, value, valueType: 'text' }]);
        expect(kept, value).toEqual(rowsWhere(column, (text) => text === value));
        expect(kept.length, value).toBeGreaterThan(0);
      }
    });

    it('an exact text filter on text that reads as no value matches without an error', async () => {
      for (const value of STRAY_TEXT) {
        const kept = await rowsKept([{ type: 'point', column, value, valueType: 'text' }]);
        expect(kept, value).toEqual(rowsWhere(column, (text) => text === value));
      }
    });

    it('a set or not-set filter on the text keeps the rows it names, and NULLs on request', async () => {
      const all = distinctTexts(column);
      // The first value and the last two, so the lists differ per column.
      const values = [all[0]!, ...all.slice(-2)];
      for (const includeNull of [false, true]) {
        const set = await rowsKept([
          { type: 'set', column, values, includeNull, valueType: 'text' },
        ]);
        expect(set).toEqual(
          rowsWhere(column, (text) => (text === null ? includeNull : values.includes(text))),
        );
        const notSet = await rowsKept([
          { type: 'not-set', column, values, includeNull, valueType: 'text' },
        ]);
        expect(notSet).toEqual(
          rowsWhere(column, (text) => (text === null ? includeNull : !values.includes(text))),
        );
      }
    });

    it('contains, starts with, ends with and regex filters match the text', async () => {
      for (const value of distinctTexts(column)) {
        // Cut by code points, so an emoji's surrogate pair stays whole.
        const chars = Array.from(value);
        const middle = chars.slice(1, -1).join('') || value;
        const head = chars.slice(0, 3).join('');
        const tail = chars.slice(-3).join('');
        const cases: [Filter, (text: string) => boolean][] = [
          [
            { type: 'pattern', column, pattern: middle, mode: 'contains' },
            (text) => lower(text).includes(lower(middle)),
          ],
          [
            { type: 'pattern', column, pattern: head, mode: 'starts' },
            (text) => lower(text).startsWith(lower(head)),
          ],
          [
            { type: 'pattern', column, pattern: tail, mode: 'ends' },
            (text) => lower(text).endsWith(lower(tail)),
          ],
          [
            { type: 'pattern', column, pattern: literalRegex(value), mode: 'regex' },
            (text) => text === value,
          ],
        ];
        for (const [filter, test] of cases) {
          const kept = await rowsKept([filter]);
          expect(kept, JSON.stringify(filter)).toEqual(
            rowsWhere(column, (text) => text !== null && test(text)),
          );
        }
      }
    });
  });

  describe('values that read alike', () => {
    it('matches a UNION of the integer 0 and of the text 0 alike', async () => {
      const zero = await rowsKept([{ type: 'point', column: 'u', value: '0', valueType: 'text' }]);
      expect(zero).toEqual(rowsHolding('u', 'union_value(i := 0)', `union_value(s := '0')`));
      // A number is compared by its text too.
      const fortyTwo = await rowsKept([
        { type: 'point', column: 'u', value: 42, valueType: 'text' },
      ]);
      expect(fortyTwo).toEqual(rowsHolding('u', 'union_value(i := 42)', `union_value(s := '42')`));
    });

    it("matches a VARIANT of 42 and of '42' alike, and its text NULL apart from NULL", async () => {
      const fortyTwo = await rowsKept([
        { type: 'point', column: 'v', value: '42', valueType: 'text' },
      ]);
      expect(fortyTwo).toEqual(rowsHolding('v', '42', `'42'`));
      const nullText = await rowsKept([
        { type: 'point', column: 'v', value: 'NULL', valueType: 'text' },
      ]);
      expect(nullText).toEqual(rowsHolding('v', `'NULL'`));
      const nulls = await rowsKept([
        { type: 'point', column: 'v', value: null, valueType: 'text' },
      ]);
      expect(nulls).toEqual(rowsHolding('v', 'NULL'));
    });

    it("tells a list holding NULL from a list holding the text 'NULL'", async () => {
      const nullElement = await rowsKept([
        { type: 'point', column: 'tier_list', value: '[NULL]', valueType: 'text' },
      ]);
      expect(nullElement).toEqual(rowsHolding('tier_list', '[NULL]'));
      const nullText = await rowsKept([
        { type: 'point', column: 'tier_list', value: "['NULL']", valueType: 'text' },
      ]);
      expect(nullText).toEqual(rowsHolding('tier_list', `['NULL']`));
    });
  });

  it('combines text filters on several nested columns with other filters', async () => {
    const values = ['[]', '[NULL]'];
    const filters: Filter[] = [
      { type: 'set', column: 'tags', values, includeNull: true, valueType: 'text' },
      { type: 'not-set', column: 'u', values: ['0'], valueType: 'text' },
      { type: 'pattern', column: 'point', pattern: 'tier', mode: 'contains' },
      { type: 'range', column: '__rowid__', min: 1, max: 15 },
    ];
    const tags = texts.get('tags')!;
    const u = texts.get('u')!;
    const point = texts.get('point')!;
    const expected = Array.from({ length: ROWS }, (_, row) => row).filter(
      (row) =>
        (tags[row] === null || values.includes(tags[row]!)) &&
        u[row] !== null &&
        u[row] !== '0' &&
        point[row] !== null &&
        point[row]!.includes('tier') &&
        row >= 1 &&
        row < 15,
    );
    expect(expected.length).toBeGreaterThan(0);
    expect(await rowsKept(filters)).toEqual(expected);
  });
});

// ── The nested stress fixture and its SQL-only companions ─────────────

/** Rows of the SQL-only table: its columns repeat every 2 to 7 rows. */
const SQL_ONLY_ROWS = 70;

/** How many distinct values of a column the pattern filters are tried on. */
const PATTERN_SAMPLE = 12;

interface Source {
  id: 'parquet' | 'json' | 'sql';
  label: string;
  /** Create the table and give its name. */
  load: () => Promise<string>;
  /** Its nested columns, by name. */
  columns: string[];
}

const nestedColumnsOf = (columns: { name: string; duckdbType: string }[]): string[] =>
  columns.filter((c) => isNestedSqlType(c.duckdbType)).map((c) => c.name);

const SOURCES: Source[] = [
  {
    id: 'parquet',
    label: 'the Parquet fixture',
    load: async () => (await loadNestedFixture(harness, 'parquet')).tableName,
    columns: nestedColumnsOf(MANIFEST.parquet.columns),
  },
  {
    id: 'json',
    label: 'the JSON fixture',
    load: async () => (await loadNestedFixture(harness, 'json')).tableName,
    columns: nestedColumnsOf(MANIFEST.json.columns),
  },
  {
    id: 'sql',
    label: 'the SQL-only columns',
    load: async () => {
      await createSqlOnlyTable(harness.conn, 'sql_only_t', SQL_ONLY_ROWS);
      // The view adds the unnamed STRUCT, which a table cannot hold.
      await createSqlOnlyView(harness.conn, 'sql_only', 'sql_only_t');
      return 'sql_only';
    },
    columns: SQL_ONLY_COLUMNS.map((c) => c.name),
  },
];

/** Each source's table, once loaded. */
const sourceTables = new Map<Source['id'], string>();

/**
 * How many rows of `table` each filter keeps, many filters to a query:
 * `count(*) FILTER (WHERE …)` takes the WHERE clause a filter builds as it is.
 */
async function countKept(table: string, filters: Filter[]): Promise<number[]> {
  const counts: number[] = [];
  let batch: string[] = [];
  let length = 0;
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    const select = batch.map((where, i) => `count(*) FILTER (WHERE ${where}) AS n${i}`);
    const [row] = await bridge.query<Record<string, number>>(
      `SELECT ${select.join(', ')} FROM ${quoteIdentifier(table)}`,
    );
    for (let i = 0; i < batch.length; i++) counts.push(Number(row![`n${i}`]));
    batch = [];
    length = 0;
  };
  for (const filter of filters) {
    const where = filtersToWhereClause([filter]);
    // A list's text runs to 65,000 characters: keep each query's SQL modest.
    if (batch.length === 100 || length + where.length > 250_000) await flush();
    batch.push(where);
    length += where.length;
  }
  await flush();
  return counts;
}

/** Each row's text in `column` of `table`; `null` for a NULL value. */
async function readTexts(table: string, column: string): Promise<(string | null)[]> {
  const rows = await bridge.query<{ t: string | null }>(
    `SELECT CAST(${quoteIdentifier(column)} AS VARCHAR) AS t FROM ${quoteIdentifier(table)} ` +
      'ORDER BY __rowid__',
  );
  return rows.map((row) => row.t ?? null);
}

/** A filter in a few words, for a failure message: values can be very long. */
function describeFilter(filter: Filter): string {
  const cut = (value: unknown): string => {
    const text = String(value);
    return text.length > 60 ? `${text.slice(0, 60)}…` : text;
  };
  switch (filter.type) {
    case 'point':
      return `= ${cut(filter.value)}`;
    case 'set':
    case 'not-set':
      return `${filter.type} {${filter.values.map(cut).join(' | ')}}${filter.includeNull ? ' or null' : ''}`;
    case 'pattern':
      return `${filter.mode} ${cut(filter.pattern)}`;
    default:
      return filter.type;
  }
}

/**
 * Every filter case for one column, with the count each should keep, from the
 * column's text: an exact filter on every distinct value and on stray text,
 * set and not-set filters with and without NULLs, and the pattern filters on
 * a sample of values. Gives the cases whose count differs.
 */
async function checkColumn(
  table: string,
  column: string,
): Promise<{ filter: string; expected: number; kept: number }[]> {
  const texts = await readTexts(table, column);
  const tally = new Map<string, number>();
  for (const text of texts) if (text !== null) tally.set(text, (tally.get(text) ?? 0) + 1);
  const values = [...tally.keys()];
  const nonNull = texts.filter((text) => text !== null).length;
  const nulls = texts.length - nonNull;
  const keeping = (test: (text: string) => boolean): number =>
    texts.filter((text) => text !== null && test(text)).length;

  const cases: [Filter, number][] = [];
  for (const value of [...values, ...STRAY_TEXT]) {
    cases.push([{ type: 'point', column, value, valueType: 'text' }, tally.get(value) ?? 0]);
  }
  const some = [...new Set(values.length > 0 ? [values[0]!, ...values.slice(-2)] : [])];
  if (some.length > 0) {
    const inSome = some.reduce((n, value) => n + tally.get(value)!, 0);
    for (const includeNull of [false, true]) {
      const withNulls = includeNull ? nulls : 0;
      cases.push(
        [{ type: 'set', column, values: some, includeNull, valueType: 'text' }, inSome + withNulls],
        [
          { type: 'not-set', column, values: some, includeNull, valueType: 'text' },
          nonNull - inSome + withNulls,
        ],
      );
    }
  }
  const sample = values.filter((value) => value.length <= 2000).slice(0, PATTERN_SAMPLE);
  for (const value of sample) {
    // Cut by code points, so an emoji's surrogate pair stays whole.
    const chars = Array.from(value);
    const middle = chars.slice(1, -1).join('') || value;
    const head = chars.slice(0, 3).join('');
    const tail = chars.slice(-3).join('');
    cases.push(
      [
        { type: 'pattern', column, pattern: middle, mode: 'contains' },
        keeping((text) => lower(text).includes(lower(middle))),
      ],
      [
        { type: 'pattern', column, pattern: head, mode: 'starts' },
        keeping((text) => lower(text).startsWith(lower(head))),
      ],
      [
        { type: 'pattern', column, pattern: tail, mode: 'ends' },
        keeping((text) => lower(text).endsWith(lower(tail))),
      ],
      [{ type: 'pattern', column, pattern: literalRegex(value), mode: 'regex' }, tally.get(value)!],
    );
  }

  const kept = await countKept(
    table,
    cases.map(([filter]) => filter),
  );
  return cases.flatMap(([filter, expected], i) =>
    kept[i] === expected ? [] : [{ filter: describeFilter(filter), expected, kept: kept[i]! }],
  );
}

describe('the nested stress fixture and its SQL-only companions', () => {
  beforeAll(async () => {
    for (const source of SOURCES) sourceTables.set(source.id, await source.load());
  }, 120_000);

  describe.each(SOURCES)('$label', (source) => {
    it('has the nested columns the test goes through', async () => {
      const described = await bridge.query<{ column_name: string; column_type: string }>(
        `DESCRIBE ${quoteIdentifier(sourceTables.get(source.id)!)}`,
      );
      const nested = described
        .filter((c) => isNestedSqlType(c.column_type))
        .map((c) => c.column_name);
      expect(nested).toEqual(source.columns);
    });

    it.each(source.columns)(
      '%s: every exact, set, not-set and pattern filter keeps the rows its text says',
      async (column) => {
        expect(await checkColumn(sourceTables.get(source.id)!, column)).toEqual([]);
      },
      60_000,
    );
  });

  // A JSON column is a 'string' column, and the filter panel's exact filter
  // on one compares its text too: compared as JSON, text that is not JSON is
  // a Conversion Error, which fails every grid query.
  describe.each([
    ['parquet', 'doc'],
    ['json', 'shifty'],
  ] as const)('the JSON column of the %s fixture, %s', (source, column) => {
    it('every exact, set, not-set and pattern filter keeps the rows its text says', async () => {
      expect(await checkColumn(sourceTables.get(source)!, column)).toEqual([]);
    }, 60_000);

    it('compared as JSON, text that is not JSON fails the query', async () => {
      await expect(
        countKept(sourceTables.get(source)!, [{ type: 'point', column, value: 'abc' }]),
      ).rejects.toThrow(/Malformed JSON/);
    });
  });

  it("tells tier_list's look-alikes apart: [NULL] and ['NULL'], [] and [''], [a, b] and ['a, b']", async () => {
    const table = sourceTables.get('parquet')!;
    const texts = await readTexts(table, 'tier_list');
    const pairs = ['[NULL]', "['NULL']", '[]', "['']", '[a, b]', "['a, b']"];
    const kept = await countKept(
      table,
      pairs.map((value) => ({ type: 'point', column: 'tier_list', value, valueType: 'text' })),
    );
    pairs.forEach((value, i) => {
      expect(kept[i], value).toBe(texts.filter((text) => text === value).length);
      expect(kept[i], value).toBeGreaterThan(0);
    });
  });

  it("matches union_pair's integer 0 and text 0 alike: every row but the NULL ones", async () => {
    const filter: Filter = { type: 'point', column: 'union_pair', value: '0', valueType: 'text' };
    const rows = await bridge.query<{ id: number }>(
      `SELECT id FROM sql_only WHERE ${filtersToWhereClause([filter])} ORDER BY id`,
    );
    // Even ids hold union_value(i := 0), odd ones union_value(s := '0').
    const ids = Array.from({ length: SQL_ONLY_ROWS }, (_, id) => id).filter((id) => id % 7 !== 6);
    expect(rows.map((row) => row.id)).toEqual(ids);
  });
});
