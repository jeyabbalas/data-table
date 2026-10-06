/**
 * Every nested cell of the nested stress fixture, fetched the way the grid
 * fetches it, against an oracle.
 *
 * Three sources: the Parquet and JSON fixture files loaded through the real
 * loaders, and the SQL-only companions (ARRAY, UNION, VARIANT, MAP with
 * nested keys, an unnamed struct, …) in a view, as derived columns would be.
 * For every nested, JSON and BLOB column, each row's cell must equal the
 * text `nestedExpectations` works out from DuckDB's facts by the cell rule:
 *
 * - in fast-path blocks, sorted and filtered blocks, and top-ups by row id,
 *   for all 1,000 rows (the long-list and cap-edge showcase rows 5–8 among
 *   them);
 * - sorted ascending and descending by each of those columns, MAP, UNION,
 *   VARIANT and JSON included, where the rows must also come in the order
 *   `ORDER BY "col" ASC|DESC, "__rowid__"` gives, though the cells show
 *   text.
 *
 * Then a block of 768-float embeddings must stay within 128 × (TEXT_CAP + 1)
 * characters, and the showcase rows' types, cell text and exact JSON are
 * pinned in `__snapshots__/nestedCells.showcase.json`, so that a DuckDB
 * upgrade that changes any of them shows up as a diff.
 */
import { createHash } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dataTypeOf, parseDuckDBType } from '@/core/duckdbType';
import { toStandardJson } from '@/core/jsonTree';
import type { ColumnSchema, SortColumn } from '@/core/types';
import { detectSchema } from '@/data/SchemaDetector';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { TEXT_CAP, jsonValueSQL } from '@/data/valueSql';
import { quoteIdentifier } from '@/filters/FilterSQL';
import type { Filter } from '@/filters/FilterTypes';
import { buildRowColumnsQuery, buildRowQuery } from '@/table/rowQuery';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { expectedCellTexts } from '../helpers/nestedExpectations';
import { MANIFEST, SHOWCASE, loadNestedFixture } from '../helpers/nestedFixture';
import { SQL_ONLY_COLUMNS, createSqlOnlyTable, createSqlOnlyView } from '../helpers/nestedSql';
import { makeNodeBridge } from '../helpers/nodeBridge';

const BLOCK = 128;
const ROWS = MANIFEST.rowCount;
const SHOWCASE_ROWS = Object.values(SHOWCASE);

type SourceName = 'parquet' | 'json' | 'sql';

/**
 * The columns under test, by source, known before anything loads so each
 * gets tests of its own: every column but the scalars, and the Parquet
 * file's top-level BLOB.
 */
const COLUMNS: Record<SourceName, string[]> = {
  parquet: MANIFEST.parquet.columns
    .filter((c) => c.kind !== 'scalar' || c.duckdbType === 'BLOB')
    .map((c) => c.name),
  json: MANIFEST.json.columns.filter((c) => c.kind !== 'scalar').map((c) => c.name),
  sql: SQL_ONLY_COLUMNS.map((c) => c.name),
};

/** The DESCRIBE type each column under test is expected to have. */
const TYPES: Record<SourceName, Map<string, string>> = {
  parquet: new Map(MANIFEST.parquet.columns.map((c) => [c.name, c.duckdbType])),
  json: new Map(MANIFEST.json.columns.map((c) => [c.name, c.duckdbType])),
  sql: new Map(SQL_ONLY_COLUMNS.map((c) => [c.name, c.type])),
};

interface Source {
  table: string;
  schema: ColumnSchema[];
  /** By column, the text each row's cell should show, by `__rowid__`. */
  expected: Map<string, Map<number, string | null>>;
}

type Row = Record<string, unknown>;

/** Up to 120 characters of `value`, for a failure message. */
function brief(value: unknown): string {
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 120 ? `${text.slice(0, 100)}… (${text.length} chars)` : text;
}

describe('nested cells on real DuckDB, against the oracle', () => {
  let harness: NodeDuckDBHarness;
  let bridge: WorkerBridge;
  const sources = new Map<SourceName, Source>();

  async function makeSource(table: string, schema: ColumnSchema[], names: string[]) {
    const expected = new Map<string, Map<number, string | null>>();
    for (const name of names) {
      const column = schema.find((c) => c.name === name);
      if (!column) throw new Error(`${table} has no column ${name}`);
      expected.set(name, await expectedCellTexts(bridge, table, column));
    }
    return { table, schema, expected };
  }

  /** The cells of `rows` that differ from the oracle, as messages. */
  function mismatches(source: SourceName, rows: Row[], columns: readonly string[]): string[] {
    const { expected } = sources.get(source)!;
    const found: string[] = [];
    for (const row of rows) {
      const id = row.__rowid__ as number;
      for (const column of columns) {
        const want = expected.get(column)!.get(id);
        if (row[column] !== want) {
          found.push(`${source}.${column} row ${id}: ${brief(row[column])} ≠ ${brief(want)}`);
        }
      }
    }
    return found;
  }

  /** Every block of a view of `source`'s table, in order, by `buildRowQuery`. */
  async function blocks(
    source: SourceName,
    view: {
      columns: readonly string[];
      sortColumns?: SortColumn[];
      filters?: Filter[];
      rowidFastPath?: boolean;
      total?: number;
    },
  ): Promise<Row[]> {
    const { table, schema } = sources.get(source)!;
    const total = view.total ?? ROWS;
    const rows: Row[] = [];
    for (let offset = 0; offset < total; offset += BLOCK) {
      rows.push(
        ...(await bridge.query<Row>(
          buildRowQuery({
            tableName: table,
            columns: [...view.columns],
            sortColumns: view.sortColumns ?? [],
            filters: view.filters ?? [],
            offset,
            limit: Math.min(BLOCK, total - offset),
            schema,
            rowidFastPath: view.rowidFastPath ?? false,
          }),
        )),
      );
    }
    return rows;
  }

  async function rowidsOf(sql: string): Promise<number[]> {
    return (await bridge.query<{ __rowid__: number }>(sql)).map((r) => r.__rowid__);
  }

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn, harness.db);
    const parquet = await loadNestedFixture(harness, 'parquet');
    const json = await loadNestedFixture(harness, 'json');
    // The companions in a view, as derived columns sit in the derived-column
    // view; the unnamed struct exists only there.
    await createSqlOnlyTable(harness.conn, 'nested_sql_table', ROWS);
    await createSqlOnlyView(harness.conn, 'nested_sql', 'nested_sql_table');
    sources.set('parquet', await makeSource(parquet.tableName, parquet.schema, COLUMNS.parquet));
    sources.set('json', await makeSource(json.tableName, json.schema, COLUMNS.json));
    sources.set(
      'sql',
      await makeSource('nested_sql', await detectSchema('nested_sql', bridge), COLUMNS.sql),
    );
  }, 120_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  describe.each(['parquet', 'json', 'sql'] as const)('%s', (source) => {
    it('the columns under test have the types DuckDB reports for them', () => {
      const { schema } = sources.get(source)!;
      for (const name of COLUMNS[source]) {
        const column = schema.find((c) => c.name === name)!;
        expect(column.originalType, name).toBe(TYPES[source].get(name));
        const node = parseDuckDBType(column.originalType);
        const readAsText =
          dataTypeOf(node) === 'nested' ||
          node.kind === 'json' ||
          (node.kind === 'scalar' && node.name === 'BLOB');
        expect(readAsText, `${name} (${column.originalType})`).toBe(true);
      }
    });

    it('fast-path blocks: every cell of every row', async () => {
      const rows = await blocks(source, { columns: COLUMNS[source], rowidFastPath: true });
      expect(rows.map((r) => r.__rowid__)).toEqual(Array.from({ length: ROWS }, (_, i) => i));
      expect(mismatches(source, rows, COLUMNS[source])).toEqual([]);
    });

    it('sorted blocks: every cell of every row, in order', async () => {
      const rows = await blocks(source, {
        columns: COLUMNS[source],
        sortColumns: [{ column: 'id', direction: 'desc' }],
      });
      expect(rows.map((r) => r.__rowid__)).toEqual(
        Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i),
      );
      expect(mismatches(source, rows, COLUMNS[source])).toEqual([]);
    });

    it('filtered blocks: every cell of the rows left', async () => {
      const rows = await blocks(source, {
        columns: COLUMNS[source],
        filters: [{ type: 'range', column: 'id', min: 3, max: 903 }],
        total: 900,
      });
      expect(rows.map((r) => r.__rowid__)).toEqual(Array.from({ length: 900 }, (_, i) => i + 3));
      expect(mismatches(source, rows, COLUMNS[source])).toEqual([]);
    });

    it('top-ups by row id: the showcase rows and a few more', async () => {
      const { table, schema } = sources.get(source)!;
      const rowids = [...SHOWCASE_ROWS, 128, 500, 999];
      const rows = await bridge.query<Row>(
        buildRowColumnsQuery({ tableName: table, columns: COLUMNS[source], rowids, schema }),
      );
      expect(rows.map((r) => r.__rowid__).sort((a, b) => Number(a) - Number(b))).toEqual(rowids);
      expect(mismatches(source, rows, COLUMNS[source])).toEqual([]);
    });

    describe.each(COLUMNS[source])('sorted by %s', (column) => {
      it.each(['asc', 'desc'] as const)(
        '%s: rows in value order, cells as the oracle',
        async (direction) => {
          const { table } = sources.get(source)!;
          const reference = await rowidsOf(
            `SELECT "__rowid__" FROM ${quoteIdentifier(table)}` +
              ` ORDER BY ${quoteIdentifier(column)} ${direction.toUpperCase()}, "__rowid__" ASC`,
          );
          const rows = await blocks(source, {
            columns: [column],
            sortColumns: [{ column, direction }],
          });
          expect(rows.map((r) => r.__rowid__)).toEqual(reference);
          expect(mismatches(source, rows, [column])).toEqual([]);
        },
      );
    });
  });

  it('a block of 768-float embeddings stays within 128 × (TEXT_CAP + 1) characters', async () => {
    const { table } = sources.get('sql')!;
    const rows = await blocks('sql', { columns: ['embedding768'], rowidFastPath: true });
    const whole = await bridge.query<{ t: string | null }>(
      `SELECT CAST("embedding768" AS VARCHAR) AS t FROM ${quoteIdentifier(table)}` +
        ` WHERE "__rowid__" < ${BLOCK}`,
    );
    const wholeChars = whole.reduce((sum, r) => sum + (r.t?.length ?? 0), 0);
    for (let start = 0; start < ROWS; start += BLOCK) {
      const block = rows.slice(start, start + BLOCK);
      const chars = block.reduce(
        (sum, r) => sum + ((r.embedding768 as string | null)?.length ?? 0),
        0,
      );
      expect(chars, `block at ${start}`).toBeLessThanOrEqual(BLOCK * (TEXT_CAP + 1));
      // Guard: the whole text of the same rows is over ten times larger.
      if (start === 0) expect(wholeChars).toBeGreaterThan(10 * chars);
    }
  });

  it('the showcase rows: types, cell text and exact JSON', async () => {
    const [{ v: version }] = (await bridge.query<{ v: string }>('SELECT version() AS v')) as [
      { v: string },
    ];
    const snapshot: Record<string, unknown> = {
      duckdb: version,
      about:
        'Showcase rows 0-11 of the nested stress fixture: the DESCRIBE type, the grid cell ' +
        '(gridValueSQL through buildRowColumnsQuery), the exact value (jsonValueSQL), and its ' +
        'standard JSON (toStandardJson) where that differs. Text over 240 characters is ' +
        'summarised as its start, end, length and SHA-256.',
    };
    for (const source of ['parquet', 'json', 'sql'] as const) {
      const { table, schema } = sources.get(source)!;
      const cells = new Map<number, Row>();
      const rows = await bridge.query<Row>(
        buildRowColumnsQuery({
          tableName: table,
          columns: COLUMNS[source],
          rowids: SHOWCASE_ROWS,
          schema,
        }),
      );
      for (const row of rows) cells.set(row.__rowid__ as number, row);
      const columns: Record<string, unknown> = {};
      for (const name of COLUMNS[source]) {
        const column = schema.find((c) => c.name === name)!;
        const json = await bridge.query<{ id: number; j: string | null }>(
          `SELECT "__rowid__" AS id, ${jsonValueSQL(column, quoteIdentifier(name))} AS j` +
            ` FROM ${quoteIdentifier(table)} WHERE "__rowid__" < ${SHOWCASE_ROWS.length}` +
            ` ORDER BY "__rowid__"`,
        );
        const showcase: Record<string, unknown> = {};
        for (const { id, j } of json) {
          const standard = j === null ? null : toStandardJson(j);
          showcase[String(id)] = {
            cell: summarise(cells.get(id)![name] as string | null),
            json: summarise(j),
            ...(standard !== j ? { standardJson: summarise(standard) } : {}),
          };
        }
        columns[name] = { type: column.originalType, rows: showcase };
      }
      snapshot[source] = columns;
    }
    await expect(`${JSON.stringify(snapshot, null, 2)}\n`).toMatchFileSnapshot(
      './__snapshots__/nestedCells.showcase.json',
    );
  });
});

/** `text`, or for text over 240 characters its start, end, length and hash. */
function summarise(text: string | null): unknown {
  if (text === null) return null;
  const chars = Array.from(text);
  if (chars.length <= 240) return text;
  return {
    start: chars.slice(0, 160).join(''),
    end: chars.slice(-60).join(''),
    length: chars.length,
    sha256: createHash('sha256').update(text, 'utf8').digest('hex'),
  };
}
