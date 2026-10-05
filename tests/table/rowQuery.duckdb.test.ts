/**
 * Real-DuckDB proof that sorted and filtered blocks come back in the right
 * order with the right rows.
 *
 * `buildRowQuery` pages sorted/filtered views in two phases: a subquery
 * sorts only the sort keys and `__rowid__` to find the block's row ids,
 * and the outer query reads the visible columns for those ids and restores
 * the order. Each case below walks every block of a view and checks it
 * against a reference order written by hand, independently of the builder,
 * and checks every row's values against the fast path's copy of that row.
 *
 * The last test is the reason for the two phases: paging the full
 * projection makes DuckDB's top-N hold offset+limit complete rows, which
 * ran a mid-table block of a sorted 5M × 40 table out of WASM memory.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ColumnSchema, SortColumn } from '@/core/types';
import { detectSchema } from '@/data/SchemaDetector';
import type { Filter } from '@/filters/FilterTypes';
import { buildRowColumnsQuery, buildRowQuery } from '@/table/rowQuery';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { makeNodeBridge } from '../helpers/nodeBridge';

const TOTAL_ROWS = 2_000;
const BLOCK = 128;

const SCHEMA: ColumnSchema[] = [
  { name: 'grp', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'val', type: 'integer', nullable: true, originalType: 'INTEGER' },
  { name: 'label', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'wait', type: 'interval', nullable: false, originalType: 'INTERVAL' },
  { name: 'vec', type: 'integer', nullable: true, originalType: 'INTEGER' },
  { name: 'dbl', type: 'integer', nullable: true, originalType: 'INTEGER' },
];

interface OrderCase {
  label: string;
  source: 'base' | 'v';
  columns: string[];
  sortColumns: SortColumn[];
  filters: Filter[];
  /** Hand-written WHERE / ORDER BY for the reference id list. */
  referenceWhere: string;
  referenceOrder: string;
}

const BASE_COLUMNS = ['grp', 'val', 'label', 'wait'];

const CASES: OrderCase[] = [
  {
    label: 'ascending sort with ties and NULLs',
    source: 'base',
    columns: BASE_COLUMNS,
    sortColumns: [{ column: 'val', direction: 'asc' }],
    filters: [],
    referenceWhere: '',
    referenceOrder: 'val ASC NULLS LAST, "__rowid__" ASC',
  },
  {
    label: 'descending string sort',
    source: 'base',
    columns: BASE_COLUMNS,
    sortColumns: [{ column: 'label', direction: 'desc' }],
    filters: [],
    referenceWhere: '',
    referenceOrder: 'label DESC NULLS LAST, "__rowid__" ASC',
  },
  {
    label: 'multi-column sort',
    source: 'base',
    columns: BASE_COLUMNS,
    sortColumns: [
      { column: 'grp', direction: 'asc' },
      { column: 'val', direction: 'desc' },
    ],
    filters: [],
    referenceWhere: '',
    referenceOrder: 'grp ASC, val DESC NULLS LAST, "__rowid__" ASC',
  },
  {
    label: 'filter, no sort',
    source: 'base',
    columns: BASE_COLUMNS,
    sortColumns: [],
    filters: [{ type: 'range', column: 'val', min: 200, max: 700 }],
    referenceWhere: 'WHERE val >= 200 AND val < 700',
    referenceOrder: '"__rowid__" ASC',
  },
  {
    label: 'filter and sort',
    source: 'base',
    columns: BASE_COLUMNS,
    sortColumns: [{ column: 'label', direction: 'asc' }],
    filters: [{ type: 'set', column: 'grp', values: [1, 4, 6] }],
    referenceWhere: 'WHERE grp IN (1, 4, 6)',
    referenceOrder: 'label ASC NULLS LAST, "__rowid__" ASC',
  },
  {
    label: 'sort on a column that is not displayed',
    source: 'base',
    columns: ['label'],
    sortColumns: [{ column: 'val', direction: 'desc' }],
    filters: [],
    referenceWhere: '',
    referenceOrder: 'val DESC NULLS LAST, "__rowid__" ASC',
  },
  {
    label: 'descending sort on __rowid__',
    source: 'base',
    columns: BASE_COLUMNS,
    sortColumns: [{ column: '__rowid__', direction: 'desc' }],
    filters: [],
    referenceWhere: '',
    referenceOrder: '"__rowid__" DESC',
  },
  {
    // The projection casts `wait` to VARCHAR; the rows must still come back
    // in duration order ("9 days" before "100 days"), not text order.
    label: 'interval sort orders by duration',
    source: 'base',
    columns: BASE_COLUMNS,
    sortColumns: [{ column: 'wait', direction: 'asc' }],
    filters: [],
    referenceWhere: '',
    referenceOrder: 'wait ASC, "__rowid__" ASC',
  },
  {
    label: 'derived-column view: sort by expression, filter on vector column',
    source: 'v',
    columns: ['label', 'vec', 'dbl'],
    sortColumns: [{ column: 'dbl', direction: 'desc' }],
    filters: [{ type: 'not-null', column: 'vec' }],
    referenceWhere: 'WHERE vec IS NOT NULL',
    referenceOrder: 'dbl DESC NULLS LAST, "__rowid__" ASC',
  },
];

describe('buildRowQuery on real DuckDB: sorted and filtered blocks', () => {
  let harness: NodeDuckDBHarness;
  let bridge: ReturnType<typeof makeNodeBridge>;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);

    // Deterministic data with heavy ties (grp, val), NULLs (val, label)
    // and intervals whose text order differs from their duration order.
    await harness.conn.query(
      `CREATE TABLE base AS
         SELECT CAST(range AS BIGINT) AS "__rowid__",
                CAST(range % 7 AS INTEGER) AS grp,
                CASE WHEN range % 11 = 0 THEN NULL ELSE CAST((range * 7919) % 1000 AS INTEGER) END AS val,
                CASE WHEN range % 13 = 0 THEN NULL ELSE 'r' || ((range * 104729) % 5000) END AS label,
                to_days(CAST((range * 31) % 400 AS INTEGER)) AS wait
         FROM range(${TOTAL_ROWS})`,
    );
    // DerivedColumnManager.recreateView's shape: a sparse vector helper
    // LEFT-JOINed on __rowid__, then an expression layer.
    await harness.conn.query(
      `CREATE TABLE helper AS
         SELECT "__rowid__", CAST("__rowid__" % 5 AS INTEGER) AS vec
         FROM base WHERE "__rowid__" % 3 = 0`,
    );
    await harness.conn.query(
      `CREATE VIEW v AS
         WITH __dt_base AS (
           SELECT t.*, h1.vec FROM base t LEFT JOIN helper h1 ON t.__rowid__ = h1.__rowid__
         ),
         __dt_layer_1 AS (SELECT *, (val * 2) AS dbl FROM __dt_base)
         SELECT * FROM __dt_layer_1`,
    );
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  for (const c of CASES) {
    it(c.label, async () => {
      const reference = (
        await bridge.query<{ __rowid__: number }>(
          `SELECT "__rowid__" FROM ${c.source} ${c.referenceWhere} ORDER BY ${c.referenceOrder}`,
        )
      ).map((r) => r.__rowid__);
      expect(reference.length).toBeGreaterThan(3 * BLOCK);

      // Every row as the fast path projects it, to check values against.
      const allRows = await bridge.query<Record<string, unknown>>(
        buildRowQuery({
          tableName: c.source,
          columns: c.columns,
          sortColumns: [],
          filters: [],
          offset: 0,
          limit: TOTAL_ROWS,
          schema: SCHEMA,
          rowidFastPath: true,
        }),
      );
      const byId = new Map(allRows.map((row) => [row.__rowid__ as number, row]));

      for (let offset = 0; offset < reference.length; offset += BLOCK) {
        const limit = Math.min(BLOCK, reference.length - offset);
        const rows = await bridge.query<Record<string, unknown>>(
          buildRowQuery({
            tableName: c.source,
            columns: c.columns,
            sortColumns: c.sortColumns,
            filters: c.filters,
            offset,
            limit,
            schema: SCHEMA,
            rowidFastPath: false,
          }),
        );
        expect(rows.map((row) => row.__rowid__)).toEqual(reference.slice(offset, offset + limit));
        for (const row of rows) {
          expect(row).toEqual(byId.get(row.__rowid__ as number));
        }
      }
    });
  }
});

describe('buildRowQuery on real DuckDB: memory at depth', () => {
  let harness: NodeDuckDBHarness;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('a deep sorted block fits a memory limit that paging the full projection exceeds', async () => {
    const rows = 400_000;
    const columns = Array.from({ length: 40 }, (_, i) => `c${i}`);
    await harness.conn.query(
      `CREATE TABLE wide AS
         SELECT CAST(range AS BIGINT) AS "__rowid__", ${columns
           .map((c, i) => `hash(range, ${i}) % 1000000 AS ${c}`)
           .join(', ')}
         FROM range(${rows})`,
    );
    // Leave 40 MiB above what the table holds. Measured on DuckDB 1.5.4 for
    // a mid-table block: the two-phase query needs 16–24 MiB, the
    // single-phase one 64–96 MiB. Recalibrate here if a DuckDB upgrade
    // moves either figure.
    const [usage] = (
      await harness.conn.query('SELECT sum(memory_usage_bytes) AS used FROM duckdb_memory()')
    ).toArray();
    const tableMiB = Math.ceil(Number(usage.toJSON().used) / 2 ** 20);
    await harness.conn.query(`SET memory_limit = '${tableMiB + 40}MiB'`);

    const sortColumns: SortColumn[] = [{ column: 'c0', direction: 'asc' }];
    const offset = rows / 2;
    const block = await harness.conn.query(
      buildRowQuery({
        tableName: 'wide',
        columns,
        sortColumns,
        filters: [],
        offset,
        limit: BLOCK,
        rowidFastPath: false,
      }),
    );
    expect(block.numRows).toBe(BLOCK);

    // Guard against the limit drifting loose enough to prove nothing: the
    // single-phase query that the two phases replaced must still fail.
    const projection = ['"__rowid__"', ...columns].join(', ');
    await expect(
      harness.conn.query(
        `SELECT ${projection} FROM wide ORDER BY c0 ASC, "__rowid__" ASC LIMIT ${BLOCK} OFFSET ${offset}`,
      ),
    ).rejects.toThrow(/Out of Memory/);
  }, 60_000);
});

describe('buildRowQuery on real DuckDB: nested columns', () => {
  let harness: NodeDuckDBHarness;
  let bridge: ReturnType<typeof makeNodeBridge>;
  let schema: ColumnSchema[];
  const NESTED_COLUMNS = ['tags', 'trio', 'point', 'attrs'];

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);
    // Lists of 0–2 items and NULLs, so that their text order ("[12]" before
    // "[5]") differs from their value order.
    await harness.conn.query(
      `CREATE TABLE nested AS
         SELECT CAST(range AS BIGINT) AS "__rowid__",
                CAST(range AS INTEGER) AS id,
                CASE range % 4
                  WHEN 0 THEN []::INTEGER[]
                  WHEN 1 THEN [CAST(range % 97 AS INTEGER)]
                  WHEN 2 THEN [CAST(range % 97 AS INTEGER), CAST((range * 7) % 97 AS INTEGER)]
                  ELSE NULL
                END AS tags,
                [CAST(range AS INTEGER), 2, 3]::INTEGER[3] AS trio,
                {'x': range / 4, 'tier': CASE WHEN range % 2 = 0 THEN 'gold' ELSE 'bronze' END} AS point,
                MAP {'k': CAST(range AS INTEGER)} AS attrs
         FROM range(${TOTAL_ROWS})`,
    );
    // The schema as the loaders build it, from DuckDB's own type names.
    schema = await detectSchema('nested', bridge);
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('the schema names the nested types as DuckDB prints them', () => {
    const types = Object.fromEntries(schema.map((c) => [c.name, c.originalType]));
    expect(types).toMatchObject({
      tags: 'INTEGER[]',
      trio: 'INTEGER[3]',
      point: 'STRUCT(x DOUBLE, tier VARCHAR)',
      attrs: 'MAP(VARCHAR, INTEGER)',
    });
  });

  it('a block and a top-up read nested columns as DuckDB text', async () => {
    const block = await bridge.query<Record<string, unknown>>(
      buildRowQuery({
        tableName: 'nested',
        columns: ['id', ...NESTED_COLUMNS],
        sortColumns: [],
        filters: [],
        offset: BLOCK,
        limit: BLOCK,
        schema,
        rowidFastPath: true,
      }),
    );
    expect(block).toHaveLength(BLOCK);
    for (const row of block) {
      expect(typeof row.id).toBe('number');
      for (const column of NESTED_COLUMNS) {
        if (row[column] !== null) expect(typeof row[column], column).toBe('string');
      }
    }
    const byId = new Map(block.map((row) => [row.__rowid__ as number, row]));
    expect(byId.get(129)).toEqual({
      __rowid__: 129,
      id: 129,
      tags: '[32]',
      trio: '[129, 2, 3]',
      point: "{'x': 32.25, 'tier': bronze}",
      attrs: '{k=129}',
    });
    expect(byId.get(130)).toMatchObject({ tags: '[33, 37]' });
    expect(byId.get(131)).toMatchObject({ tags: null });
    expect(byId.get(132)).toMatchObject({ tags: '[]' });

    // Columns of rows already cached, read by __rowid__.
    const topUp = await bridge.query<Record<string, unknown>>(
      buildRowColumnsQuery({
        tableName: 'nested',
        columns: NESTED_COLUMNS,
        rowids: [129, 130, 131, 132],
        schema,
      }),
    );
    expect(topUp).toHaveLength(4);
    for (const row of topUp) {
      const { id: _id, ...expected } = byId.get(row.__rowid__ as number)!;
      expect(row).toEqual(expected);
    }
  });

  for (const direction of ['asc', 'desc'] as const) {
    it(`a block sorted ${direction} on a list column orders by value, not by text`, async () => {
      const order = `tags ${direction.toUpperCase()} NULLS LAST, "__rowid__" ASC`;
      const ids = async (sql: string) =>
        (await bridge.query<{ __rowid__: number }>(sql)).map((r) => r.__rowid__);
      const reference = await ids(`SELECT "__rowid__" FROM nested ORDER BY ${order}`);
      // Guard: by text, the order would be different.
      const byText = await ids(
        `SELECT "__rowid__" FROM nested ORDER BY CAST(tags AS VARCHAR) ${direction.toUpperCase()} NULLS LAST, "__rowid__" ASC`,
      );
      expect(byText).not.toEqual(reference);

      for (let offset = 0; offset < reference.length; offset += BLOCK) {
        const limit = Math.min(BLOCK, reference.length - offset);
        const rows = await bridge.query<Record<string, unknown>>(
          buildRowQuery({
            tableName: 'nested',
            columns: NESTED_COLUMNS,
            sortColumns: [{ column: 'tags', direction }],
            filters: [],
            offset,
            limit,
            schema,
            rowidFastPath: false,
          }),
        );
        expect(rows.map((row) => row.__rowid__)).toEqual(reference.slice(offset, offset + limit));
      }
    });
  }
});
