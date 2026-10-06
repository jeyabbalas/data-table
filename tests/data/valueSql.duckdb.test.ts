/**
 * `gridValueSQL` and `jsonValueSQL` on real DuckDB.
 *
 * The grid's text: lists and maps of every length around the 32-item
 * preview come out exactly as DuckDB writes them, with one closing bracket
 * cut and `… +N` added; NULL stays NULL in every form; the 1,000-grapheme
 * cap cuts long text by grapheme, keeps an emoji whole, and adds `…` only
 * when it cut something; a BLOB shows 256 bytes. Lists inside a value are
 * cut before DuckDB formats them, yet each cell is still the whole value's
 * text cut by the cell rule (the oracle in `nestedExpectations`), and a
 * 200,000-item list inside costs about FORMATTED_ITEMS items of text. Then
 * the types the grid leaves uncapped are given their widest values, to
 * check that their text really cannot pass the cap.
 *
 * The exact values: every route's text is JSON that `parseJsonTree` reads
 * completely, NULL stays NULL, and the values `to_json` gets wrong or cannot
 * read (VARIANT, inside a container or not) come out right.
 *
 * Never send `to_json` or `CAST(… AS JSON)` of a type holding a VARIANT to
 * the shared database here: DuckDB 1.5.4 answers the cast with an INTERNAL
 * error that invalidates the database for every later test.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseJsonTree, toStandardJson } from '@/core/jsonTree';
import type { ColumnSchema } from '@/core/types';
import { mapDuckDBType } from '@/data/SchemaDetector';
import type { WorkerBridge } from '@/data/WorkerBridge';
import {
  BLOB_PREVIEW,
  FORMATTED_ITEMS,
  PREVIEW_ITEMS,
  TEXT_CAP,
  gridValueSQL,
  jsonValueSQL,
} from '@/data/valueSql';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { expectedCellTexts } from '../helpers/nestedExpectations';
import { makeNodeBridge } from '../helpers/nodeBridge';

/** The man, woman, girl, boy family: seven code points, one grapheme. */
const FAMILY = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}';
/** `e` and a combining acute accent: two code points, one grapheme. */
const E_ACUTE = 'é';

function col(originalType: string): ColumnSchema {
  return { name: 'v', type: mapDuckDBType(originalType), nullable: true, originalType };
}

/**
 * SQL rows `(i, v)` with each of `values` cast to `type`, in order. A type
 * holding an unnamed struct cannot be written in a CAST, so its values are
 * taken as they are: write them with that type.
 */
function rowsOf(type: string, values: readonly string[]): string {
  const castable = !/STRUCT\((?![^,()]* )/i.test(type);
  return values
    .map((v, i) => `SELECT ${i} AS i, ${castable ? `CAST(${v} AS ${type})` : v} AS "v"`)
    .join(' UNION ALL ');
}

/** A SQL string literal. */
const lit = (text: string) => `'${text.replaceAll("'", "''")}'`;

/** `gridValueSQL`'s cap around the text `TEXT`. */
const CAP_FORM =
  `list_transform([TEXT], lambda txt: CASE WHEN strlen(txt) > ${TEXT_CAP}` +
  ` AND strlen(left_grapheme(txt, ${TEXT_CAP})) < strlen(txt)` +
  ` THEN concat(left_grapheme(txt, ${TEXT_CAP}), '…') ELSE txt END)[1]`;

const codePoints = (text: string) => [...text].length;

/** `[1, 2, …, n]` as DuckDB writes the first `shown` items of 1..n, then `… +rest`. */
function expectedRange(n: number): string {
  const shown = Math.min(n, PREVIEW_ITEMS);
  const items = Array.from({ length: shown }, (_, i) => String(i + 1));
  return n > PREVIEW_ITEMS
    ? `[${items.join(', ')}, … +${n - PREVIEW_ITEMS}]`
    : `[${items.join(', ')}]`;
}

describe('valueSql on real DuckDB', () => {
  let harness: NodeDuckDBHarness;
  let bridge: WorkerBridge;

  /** The grid's text for each of `values` as `type`, in order. */
  async function gridTexts(type: string, values: readonly string[]): Promise<(string | null)[]> {
    const select = gridValueSQL(col(type), '"v"');
    expect(select, `${type} is read as text`).not.toBeNull();
    const rows = await bridge.query<{ t: string | null }>(
      `SELECT ${select} AS t FROM (${rowsOf(type, values)}) ORDER BY i`,
    );
    return rows.map((r) => r.t);
  }

  /** `jsonValueSQL`'s text for each of `values` as `type`, in order. */
  async function jsonTexts(type: string, values: readonly string[]): Promise<(string | null)[]> {
    const rows = await bridge.query<{ t: string | null }>(
      `SELECT ${jsonValueSQL(col(type), '"v"')} AS t FROM (${rowsOf(type, values)}) ORDER BY i`,
    );
    return rows.map((r) => r.t);
  }

  /**
   * A view of `values` as `type`, for the oracle, which reads a table by
   * name (a view: an unnamed struct cannot be stored in a table).
   */
  async function viewOf(type: string, values: readonly string[]): Promise<string> {
    const view = 'cut_values';
    await bridge.query(
      `CREATE OR REPLACE VIEW ${view} AS SELECT i AS "__rowid__", "v" FROM (${rowsOf(type, values)})`,
    );
    return view;
  }

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  describe('gridValueSQL: lists and maps', () => {
    it('lists of 0, 1, 32, 33, 100 and 10,000 items', async () => {
      const lengths = [0, 1, 32, 33, 100, 10_000];
      const texts = await gridTexts(
        'INTEGER[]',
        lengths.map((n) => `range(1, ${n + 1})`),
      );
      expect(texts).toEqual(lengths.map(expectedRange));
      expect(texts[0]).toBe('[]');
      expect(texts[3]).toBe(
        '[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, … +1]',
      );
    });

    it('an array of more than 32 items is sliced; one of 32 or fewer is not', async () => {
      expect(await gridTexts('INTEGER[40]', ['range(1, 41)'])).toEqual([expectedRange(40)]);
      expect(await gridTexts('INTEGER[3]', ['[7, 8, 9]'])).toEqual(['[7, 8, 9]']);
      const [embedding] = await gridTexts('FLOAT[768]', [
        'list_transform(range(768), lambda x: 0.5)',
      ]);
      expect(embedding).toBe(`[${Array(32).fill('0.5').join(', ')}, … +736]`);
    });

    it('a list of lists loses exactly one closing bracket', async () => {
      const [text] = await gridTexts('INTEGER[][]', [
        'list_transform(range(40), lambda x: [x, x + 1])',
      ]);
      const pairs = Array.from({ length: 32 }, (_, x) => `[${x}, ${x + 1}]`);
      expect(text).toBe(`[${pairs.join(', ')}, … +8]`);
      // Short lists of lists keep their own text.
      expect(await gridTexts('INTEGER[][]', ['[[1, 2], [3, 4]]', '[[]]'])).toEqual([
        '[[1, 2], [3, 4]]',
        '[[]]',
      ]);
    });

    it('maps of 33 and 600 entries show 32, in key order', async () => {
      const map = (n: number) =>
        `map_from_entries(list_transform(range(${n}), lambda x: {'key': 'k' || x, 'value': x}))`;
      const entries = Array.from({ length: 32 }, (_, x) => `k${x}=${x}`).join(', ');
      expect(
        await gridTexts('MAP(VARCHAR, INTEGER)', [map(33), map(600), map(32), 'MAP {}']),
      ).toEqual([`{${entries}, … +1}`, `{${entries}, … +568}`, `{${entries}}`, '{}']);
    });

    it('a map with struct keys and list values is sliced the same way', async () => {
      const [text] = await gridTexts('MAP(STRUCT(k INTEGER), INTEGER[])', [
        `map_from_entries(list_transform(range(34), lambda x: {'key': {'k': x}, 'value': [x]}))`,
      ]);
      const entries = Array.from({ length: 32 }, (_, x) => `{'k': ${x}}=[${x}]`).join(', ');
      expect(text).toBe(`{${entries}, … +2}`);
    });
  });

  describe('gridValueSQL: NULL', () => {
    it.each([
      'INTEGER[]',
      'VARCHAR[]',
      'INTEGER[][]',
      'INTEGER[3]',
      'FLOAT[768]',
      'MAP(VARCHAR, INTEGER)',
      'MAP(INTEGER, INTEGER)',
      'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)',
      'STRUCT(x DOUBLE, y DOUBLE)',
      'UNION(i INTEGER, s VARCHAR)',
      'VARIANT',
      'VARIANT[]',
      'BLOB',
      'BIT',
      'GEOMETRY',
      'BIGNUM',
      'INTERVAL',
      'TIME_NS',
      'TIME WITH TIME ZONE',
    ])('a NULL %s stays NULL', async (type) => {
      expect(await gridTexts(type, ['NULL'])).toEqual([null]);
    });

    it('a NULL inside a value is written NULL', async () => {
      expect(await gridTexts('INTEGER[]', ['[4, NULL, 17]'])).toEqual(['[4, NULL, 17]']);
      const [text] = await gridTexts('VARCHAR[]', ['list_transform(range(40), lambda x: NULL)']);
      expect(text).toBe(`[${Array(32).fill('NULL').join(', ')}, … +8]`);
    });
  });

  describe('gridValueSQL: the text cap', () => {
    it('cuts a 20,000-character item at 1,000 graphemes and adds …', async () => {
      const [text] = await gridTexts('VARCHAR[]', [`[repeat('x', 20000)]`]);
      expect(text).toBe(`[${'x'.repeat(TEXT_CAP - 1)}…`);
    });

    it('keeps an emoji of seven code points whole across the cut', async () => {
      // '[' and 998 letters are 999 graphemes; the family is the 1,000th.
      const value = `${'a'.repeat(998)}${FAMILY}b`;
      const [text] = await gridTexts('VARCHAR[]', [`[${lit(value)}]`]);
      expect(text).toBe(`[${'a'.repeat(998)}${FAMILY}…`);
    });

    it('adds no … to 1,001 code points that are 999 graphemes', async () => {
      const value = `${'a'.repeat(995)}${E_ACUTE}${E_ACUTE}`;
      const [text] = await gridTexts('VARCHAR[]', [`[${lit(value)}]`]);
      expect(codePoints(text!)).toBe(1001);
      expect(text).toBe(`[${value}]`);
    });

    it('leaves exactly 1,000 graphemes alone and cuts 1,001', async () => {
      // `[` + 998 + `]` = 1,000; one more letter makes 1,001.
      expect(await gridTexts('VARCHAR[]', [`[repeat('é', 998)]`, `[repeat('é', 999)]`])).toEqual([
        `[${'é'.repeat(998)}]`,
        `[${'é'.repeat(999)}…`,
      ]);
    });

    it('caps a struct, a union and a VARIANT too', async () => {
      const long = `repeat('z', 3000)`;
      const texts = [
        ...(await gridTexts('STRUCT(s VARCHAR)', [`{'s': ${long}}`])),
        ...(await gridTexts('UNION(i INTEGER, s VARCHAR)', [`union_value(s := ${long})`])),
        ...(await gridTexts('VARIANT', [long])),
      ];
      expect(texts).toEqual([
        `{'s': ${'z'.repeat(TEXT_CAP - 6)}…`,
        `${'z'.repeat(TEXT_CAP)}…`,
        `${'z'.repeat(TEXT_CAP)}…`,
      ]);
    });
  });

  describe('gridValueSQL: lists inside a value are cut before they are formatted', () => {
    /** `n` copies of `item`, as SQL for a list. */
    const many = (n: number, item: string) => `list_transform(range(${n}), lambda i: ${item})`;
    const PREPEND = 'chr(1536)'; // ARABIC NUMBER SIGN: joins the `,` after it into its grapheme
    const MARK = 'chr(769)'; // COMBINING ACUTE ACCENT: joins the space before it
    const point = '[i * 0.5, -i * 0.25]';

    /** The values of each type, around FORMATTED_ITEMS and far past it. */
    const CASES: [type: string, values: string[]][] = [
      [
        'STRUCT(id BIGINT, v DOUBLE[])',
        [
          `{'id': 1, 'v': ${many(1000, '0.0')}}`,
          `{'id': 2, 'v': ${many(FORMATTED_ITEMS, '0.0')}}`,
          `{'id': 3, 'v': ${many(FORMATTED_ITEMS + 1, '0.0')}}`,
          `{'id': 4, 'v': ${many(200_000, 'i * 1.0')}}`,
          `{'id': NULL, 'v': NULL}`,
          'NULL',
        ],
      ],
      [
        'INTEGER[][]',
        [
          '[range(1000)]',
          `[range(${FORMATTED_ITEMS})]`,
          `[range(${FORMATTED_ITEMS + 1})]`,
          '[range(100000)]',
          // The cell needs the second list, but not the third.
          '[range(1000), range(1), range(5)]',
          '[[], [], range(2000), [1]]',
          '[NULL, range(1500), NULL]',
          many(40, 'range(i * 30)'),
        ],
      ],
      [
        'VARCHAR[][]',
        [999, 1000, FORMATTED_ITEMS, FORMATTED_ITEMS + 1, 3000].flatMap((n) => [
          `[${many(n, "''")}]`,
          `[${many(n, PREPEND)}]`,
          `[${many(n, MARK)}]`,
        ]),
      ],
      [
        'STRUCT("type" VARCHAR, coordinates DOUBLE[][][])',
        [
          `{'type': 'Polygon', 'coordinates': [${many(50_000, point)}]}`,
          `{'type': 'Polygon', 'coordinates': ${many(3, `[${point}, ${point}]`)}}`,
          `{'type': NULL, 'coordinates': NULL}`,
        ],
      ],
      ['FLOAT[][]', [many(50, `list_transform(range(384), lambda j: (i * 384 + j) * 0.5)`)]],
      [
        'MAP(VARCHAR, INTEGER[])',
        [
          `MAP {'a': range(2000), 'b': [1]}`,
          `map_from_entries(${many(40, `{'key': 'k' || i, 'value': range(30)}`)})`,
        ],
      ],
      [
        'MAP(VARCHAR, INTEGER)[]',
        [`[map_from_entries(${many(3000, `{'key': 'k' || i, 'value': i}`)}), MAP {}]`],
      ],
      ['STRUCT(INTEGER, BIGINT[])', ['row(1, range(3000))', 'row(NULL, NULL)']],
    ];

    it.each(CASES)(
      '%s: the cell is the whole value’s, cut by the cell rule',
      async (type, values) => {
        const expected = await expectedCellTexts(bridge, await viewOf(type, values), col(type));
        expect(await gridTexts(type, values)).toEqual(values.map((_, i) => expected.get(i)));
      },
    );

    /** The SQL of the text a column's cells are cut from: `gridValueSQL` without its cap. */
    function uncapped(type: string): string {
      const sql = gridValueSQL(col(type), '"v"')!;
      const [before, after] = CAP_FORM.split('TEXT');
      expect(sql.startsWith(before!) && sql.endsWith(after!), `${type} is capped`).toBe(true);
      return sql.slice(before!.length, sql.length - after!.length);
    }

    /** How many characters DuckDB formats for one `value` of `type` before the cap. */
    async function formatted(type: string, value: string): Promise<number> {
      const [row] = await bridge.query<{ n: number }>(
        `SELECT strlen(${uncapped(type)}) AS n FROM (${rowsOf(type, [value])})`,
      );
      return row!.n;
    }

    it('formats about FORMATTED_ITEMS items of a long list inside a value, not all of them', async () => {
      // Each item writes at most 8 characters (`199999.0`) and its `, `.
      expect(
        await formatted(
          'STRUCT(id BIGINT, v DOUBLE[])',
          `{'id': 1, 'v': ${many(200_000, 'i * 1.0')}}`,
        ),
      ).toBeLessThan(FORMATTED_ITEMS * 10 + 20);
      expect(await formatted('INTEGER[][]', '[range(200000)]')).toBeLessThan(FORMATTED_ITEMS * 8);
      // A point writes at most 20 characters (`[24999.5, -12499.75]`) and its `, `.
      expect(
        await formatted(
          'STRUCT("type" VARCHAR, coordinates DOUBLE[][][])',
          `{'type': 'Polygon', 'coordinates': [${many(200_000, point)}]}`,
        ),
      ).toBeLessThan(FORMATTED_ITEMS * 22 + 50);
    });

    it('formats only the lists of a list of lists that the cap can reach', async () => {
      // Three lists of 384 hold more than FORMATTED_ITEMS items; 32 would
      // be about 300,000 characters. Each item writes at most 8 (`9599.5`).
      expect(
        await formatted(
          'FLOAT[][]',
          many(50, 'list_transform(range(384), lambda j: (i * 384 + j) * 0.5)'),
        ),
      ).toBeLessThan(3 * 384 * 10);
    });
  });

  describe('gridValueSQL: scalars Arrow carries as bytes, INTERVAL, unions and VARIANT', () => {
    it('a BLOB shows its first 256 bytes and how many bytes more', async () => {
      const texts = await gridTexts('BLOB', [
        `CAST(repeat('ab', 150) AS VARCHAR)::BLOB`,
        `CAST(repeat('a', ${BLOB_PREVIEW}) AS VARCHAR)::BLOB`,
        `'\\xAA\\x00a\\x5Cb'::BLOB`,
        `''::BLOB`,
      ]);
      expect(texts).toEqual([
        `${'ab'.repeat(128)}… +44`,
        'a'.repeat(BLOB_PREVIEW),
        '\\xAA\\x00a\\x5Cb',
        '',
      ]);
    });

    it('a BLOB preview of 256 escaped bytes passes the cap, which cuts it', async () => {
      const [text] = await gridTexts('BLOB', [`unhex(repeat('00', 1000))`]);
      // 256 bytes are 1,024 characters of `\x00`; the cap keeps 1,000.
      expect(text).toBe(`${'\\x00'.repeat(250)}…`);
    });

    it('the cap cuts a BLOB between bytes, never inside a byte’s escape', async () => {
      const escaped = (n: number) => '\\xAA'.repeat(n);
      const texts = await gridTexts(
        'BLOB',
        ['', 'a', 'ab', 'abc', 'abcd'].map((head) => `'${head}'::BLOB || unhex(repeat('AA', 300))`),
      );
      // 1,000 characters hold 250 escapes, and with each printable byte
      // before them one more character: `\xAA` cut there would lose its end.
      expect(texts).toEqual([
        `${escaped(250)}…`,
        `a${escaped(249)}…`,
        `ab${escaped(249)}…`,
        `abc${escaped(249)}…`,
        `abcd${escaped(249)}…`,
      ]);
    });

    it('a BLOB whose count does not fit keeps its whole preview, or as much as fits', async () => {
      const escaped = (n: number) => '\\xAA'.repeat(n);
      const texts = await gridTexts('BLOB', [
        // 248 escapes and 8 letters: 256 bytes in 1,000 characters, then `… +1`.
        `unhex(repeat('AA', 248)) || 'abcdefghi'::BLOB`,
        // 247 escapes and 9 letters: 997 characters, then `… +12`, cut at `… +`.
        `unhex(repeat('AA', 247)) || 'abcdefghi'::BLOB || unhex(repeat('00', 12))`,
      ]);
      expect(texts).toEqual([`${escaped(248)}abcdefgh…`, `${escaped(247)}abcdefghi…`]);
    });

    it('a BLOB cut by the cap is the cell rule’s', async () => {
      const values = ['', 'a', 'abc', 'abcdefghi'].flatMap((head) => [
        `'${head}'::BLOB || unhex(repeat('AA', 300))`,
        `unhex(repeat('AA', 247)) || '${head}'::BLOB || unhex(repeat('00', 12))`,
      ]);
      const expected = await expectedCellTexts(bridge, await viewOf('BLOB', values), col('BLOB'));
      expect(await gridTexts('BLOB', values)).toEqual(values.map((_, i) => expected.get(i)));
    });

    it('TIME_NS keeps its nanoseconds, and TIME WITH TIME ZONE its offset', async () => {
      expect(
        await gridTexts('TIME_NS', [`'03:04:05.123456789'`, `'13:14:15'`, `'00:00:00.5'`]),
      ).toEqual(['03:04:05.123456789', '13:14:15', '00:00:00.5']);
      expect(
        await gridTexts('TIME WITH TIME ZONE', [
          `'14:05:06+05:30'`,
          `'14:05:06.123456-08'`,
          `'23:59:59.999999-15:59:59'`,
        ]),
      ).toEqual(['14:05:06+05:30', '14:05:06.123456-08', '23:59:59.999999-15:59:59']);
    });

    it('BIT, GEOMETRY, BIGNUM and INTERVAL read as DuckDB writes them', async () => {
      expect(await gridTexts('BIT', [`'0101'`])).toEqual(['0101']);
      expect(await gridTexts('GEOMETRY', [`'POINT(1 2)'`])).toEqual(['POINT (1 2)']);
      expect(await gridTexts('BIGNUM', ['123456789012345678901234567890'])).toEqual([
        '123456789012345678901234567890',
      ]);
      expect(await gridTexts('INTERVAL', ['INTERVAL 3 DAY'])).toEqual(['3 days']);
    });

    it('a union shows its member, and a VARIANT its value', async () => {
      expect(
        await gridTexts('UNION(i INTEGER, s VARCHAR)', [
          `union_value(i := 0)`,
          `union_value(s := '0')`,
          `union_value(s := 'x y')`,
        ]),
      ).toEqual(['0', '0', 'x y']);
      expect(await gridTexts('VARIANT', ['42', '[1, 2]', `{'a': 'x y'}`, `'text'`])).toEqual([
        '42',
        '[1, 2]',
        "{'a': x y}",
        'text',
      ]);
    });
  });

  describe('gridValueSQL: types left uncapped cannot pass the cap', () => {
    // The widest value of each type, 40 times: more than the preview shows.
    const WIDEST: [type: string, value: string][] = [
      ['BOOLEAN[]', 'false'],
      ['TINYINT[]', 'NULL'],
      ['BIGINT[]', '-9223372036854775808'],
      ['UBIGINT[]', '18446744073709551615'],
      ['FLOAT[]', '-1234567800000000.0::FLOAT'],
      ['DOUBLE[]', '-2.2250738585072014e-308'],
      ['DECIMAL(25,4)[]', '-999999999999999999999.9999'],
      ['DATE[]', `DATE '5877642-06-25 (BC)'`],
      ['TIME[]', `TIME '23:59:59.999999'`],
      ['TIME WITH TIME ZONE[]', `'23:59:59.999999-15:59:59'::TIMETZ`],
      ['INTEGER[2][]', '[-2147483648, -2147483648]'],
    ];

    it.each(WIDEST)('%s', async (type, value) => {
      expect(gridValueSQL(col(type), '"v"')).not.toMatch(/^list_transform/);
      const [text] = await gridTexts(type, [`list_transform(range(40), lambda x: ${value})`]);
      expect(text).toMatch(/, … \+8]$/);
      expect(codePoints(text!)).toBeLessThanOrEqual(TEXT_CAP);
    });

    it('FLOAT[768], MAP(INTEGER, INTEGER), and structs and unions of numbers', async () => {
      const cases: [type: string, value: string][] = [
        ['FLOAT[768]', 'list_transform(range(768), lambda x: -1234567800000000.0::FLOAT)'],
        [
          'MAP(INTEGER, INTEGER)',
          `map_from_entries(list_transform(range(40), lambda x: {'key': -2147483648 + x, 'value': -2147483648}))`,
        ],
        [
          'STRUCT(x DOUBLE, y DOUBLE)',
          `{'x': -2.2250738585072014e-308, 'y': -1.7976931348623157e308}`,
        ],
        [
          'STRUCT(HUGEINT, UHUGEINT)',
          `row(CAST('-170141183460469231731687303715884105728' AS HUGEINT), CAST('340282366920938463463374607431768211455' AS UHUGEINT))`,
        ],
        ['UNION(i INTEGER, d DOUBLE)', 'union_value(d := -2.2250738585072014e-308)'],
      ];
      for (const [type, value] of cases) {
        expect(gridValueSQL(col(type), '"v"'), type).not.toMatch(/^list_transform/);
        const [text] = await gridTexts(type, [value]);
        expect(codePoints(text!), type).toBeLessThanOrEqual(TEXT_CAP);
      }
    });
  });

  describe('jsonValueSQL', () => {
    /** Each kind of column, with values and NULL. */
    const KINDS: [type: string, values: string[]][] = [
      ['INTEGER[]', ['[1, NULL, 3]', '[]']],
      ['DOUBLE[]', [`[1.5, 'nan'::DOUBLE, 'inf'::DOUBLE, '-inf'::DOUBLE, -0.0]`]],
      ['DECIMAL(38,0)[]', ['[99999999999999999999999999999999999999]']],
      ['DECIMAL(10,2)[]', ['[1.25, 2.50, 3.75]']],
      ['VARCHAR[]', [`['it''s', '"dq"', 'a, b', NULL]`]],
      ['STRUCT(x DOUBLE, tier VARCHAR)', [`{'x': 1.25, 'tier': 'gold'}`]],
      ['STRUCT(INTEGER, VARCHAR)', [`row(1, 'a')`]],
      ['MAP(INTEGER, VARCHAR)', [`MAP {1: 'a', 2: NULL}`]],
      ['UNION(i INTEGER, s VARCHAR)', ['union_value(i := 0)', `union_value(s := '0')`]],
      ['HUGEINT', ['170141183460469231731687303715884105727']],
      ['BLOB', [`'\\xAA'::BLOB`]],
      ['INTERVAL[]', ['[INTERVAL 3 DAY]']],
      ['JSON', [`'{"a": [1, 2], "b": null}'`, `'null'`]],
      ['VARIANT', ['42', `'x'`, '[1, 2]', `{'k': 1.25::DECIMAL(10,2)}`]],
      ['VARIANT[]', [`[42::VARIANT, 'x'::VARIANT, NULL]`, '[]']],
      ['STRUCT(k VARIANT)', [`{'k': 1.25::DECIMAL(10,2)}`, `{'k': NULL}`]],
      ['MAP(VARCHAR, VARIANT)', [`MAP {'a': 1::VARIANT}`]],
      ['STRUCT(VARIANT, VARCHAR)[]', [`[row(1::VARIANT, 'x')]`]],
      [
        'STRUCT(v VARIANT, p STRUCT(INTEGER, DECIMAL(18,4)[2]), m MAP(VARCHAR, UNION("my tag" INTEGER)))',
        [
          `{'v': 'x', 'p': row(1, [1.5, 2.25]::DECIMAL(18,4)[2]), 'm': MAP {'k': union_value("my tag" := 7)}}`,
        ],
      ],
    ];

    /** The values of the kind of column `type`. */
    const valuesOf = (type: string): string[] => KINDS.find(([t]) => t === type)![1];
    const NESTED_WITH_VARIANT = KINDS.at(-1)![0];

    it.each(KINDS)(
      '%s: JSON that parseJsonTree reads whole, and NULL for NULL',
      async (type, values) => {
        const texts = await jsonTexts(type, [...values, 'NULL']);
        expect(texts.at(-1)).toBeNull();
        for (const text of texts.slice(0, -1)) {
          expect(text, `${type}: a value is never NULL`).not.toBeNull();
          expect(parseJsonTree(text!).truncated, text!).toBe(false);
          expect(() => JSON.parse(toStandardJson(text!)), text!).not.toThrow();
        }
      },
    );

    it('keeps every digit, and writes NaN and Infinity bare', async () => {
      expect(await jsonTexts('DOUBLE[]', valuesOf('DOUBLE[]'))).toEqual([
        '[1.5,NaN,Infinity,-Infinity,0.0]',
      ]);
      expect(toStandardJson('[1.5,NaN,Infinity,-Infinity,0.0]')).toBe('[1.5,null,null,null,0.0]');
      expect(await jsonTexts('DECIMAL(38,0)[]', valuesOf('DECIMAL(38,0)[]'))).toEqual([
        '[99999999999999999999999999999999999999]',
      ]);
      // to_json drops a DECIMAL's trailing zeros; through VARIANT they stay
      // (`1.5000`, below). Both are the exact value.
      expect(await jsonTexts('DECIMAL(10,2)[]', valuesOf('DECIMAL(10,2)[]'))).toEqual([
        '[1.25,2.5,3.75]',
      ]);
      expect(await jsonTexts('HUGEINT', valuesOf('HUGEINT'))).toEqual([
        '170141183460469231731687303715884105727',
      ]);
    });

    it('tags a union, keeps map keys in order, and writes an unnamed struct with "" keys', async () => {
      expect(
        await jsonTexts('UNION(i INTEGER, s VARCHAR)', valuesOf('UNION(i INTEGER, s VARCHAR)')),
      ).toEqual(['{"i":0}', '{"s":"0"}']);
      expect(await jsonTexts('MAP(INTEGER, VARCHAR)', valuesOf('MAP(INTEGER, VARCHAR)'))).toEqual([
        '{"1":"a","2":null}',
      ]);
      expect(
        await jsonTexts('STRUCT(INTEGER, VARCHAR)', valuesOf('STRUCT(INTEGER, VARCHAR)')),
      ).toEqual(['{"":1,"":"a"}']);
    });

    it('reads a JSON column as its own text: a JSON null is the text null, not NULL', async () => {
      expect(await jsonTexts('JSON', [...valuesOf('JSON'), 'NULL'])).toEqual([
        '{"a": [1, 2], "b": null}',
        'null',
        null,
      ]);
    });

    it('reads a VARIANT as JSON of its value', async () => {
      expect(await jsonTexts('VARIANT', [...valuesOf('VARIANT'), 'NULL'])).toEqual([
        '42',
        '"x"',
        '[1,2]',
        '{"k":1.25}',
        null,
      ]);
      // Why: to_json writes a VARIANT as its text, a string.
      const [wrong] = await bridge.query<{ t: string }>(
        'SELECT CAST(to_json(42::VARIANT) AS VARCHAR) AS t',
      );
      expect(wrong!.t).toBe('"42"');
    });

    it('reads a type holding a VARIANT through VARIANT', async () => {
      expect(await jsonTexts('VARIANT[]', valuesOf('VARIANT[]'))).toEqual(['[42,"x",null]', '[]']);
      expect(await jsonTexts('STRUCT(k VARIANT)', valuesOf('STRUCT(k VARIANT)'))).toEqual([
        '{"k":1.25}',
        '{"k":null}',
      ]);
      // Through VARIANT, a map is a list of entries.
      expect(await jsonTexts('MAP(VARCHAR, VARIANT)', valuesOf('MAP(VARCHAR, VARIANT)'))).toEqual([
        '[{"key":"a","value":1}]',
      ]);
      // An unnamed struct's fields are named by position for the cast.
      expect(
        await jsonTexts('STRUCT(VARIANT, VARCHAR)[]', valuesOf('STRUCT(VARIANT, VARCHAR)[]')),
      ).toEqual(['[{"1":1,"2":"x"}]']);
      // A union inside loses its tag; a DECIMAL keeps its scale's zeros.
      expect(await jsonTexts(NESTED_WITH_VARIANT, valuesOf(NESTED_WITH_VARIANT))).toEqual([
        '{"v":"x","p":{"1":1,"2":[1.5000,2.2500]},"m":[{"key":"k","value":7}]}',
      ]);
      // Why: to_json writes the VARIANT inside a list as a string.
      const [wrong] = await bridge.query<{ t: string }>(
        'SELECT CAST(to_json([42::VARIANT]) AS VARCHAR) AS t',
      );
      expect(wrong!.t).toBe('["42"]');
    });
  });
});
