/**
 * Nested cells: what the grid's reads of nested columns cost on a real
 * DuckDB, at the size the 0.9.0 work was tuned for.
 *
 * A block of grid rows reads each nested column as bounded text
 * (`gridValueSQL`): a long list shows 32 items and `… +N`, and any cell at
 * most 1,000 graphemes. Before, a block of 128 rows of 2,000-item lists
 * moved megabytes through Arrow and the worker; now it moves kilobytes. The
 * cap itself must stay cheap to plan: written as a CASE that repeats the
 * full text it planned in ~150 ms for 40 columns, and the lambda form that
 * names the text once in ~18 ms. These budgets catch either regressing.
 *
 * The table is built in DuckDB (`range()`): 200,000 rows of 40 scalar and 6
 * nested columns. The nested columns are a FLOAT[64] embedding, two lists
 * that hold 2,000 items in 2 % of the rows, a struct, a map and a list of
 * structs, as `tests/browser/nested-wide.spec.ts` builds in the browser.
 * Plus 20,000 rows of FLOAT[768] embeddings.
 *
 * Gated by `RUN_DUCKDB_PERF=1`, like `benchmarks.duckdb.test.ts`: timings
 * vary too much across machines to gate CI on. Budgets are 5-6x the local
 * median (the summary counts': the slowest column's), more where the median
 * is a few milliseconds: 10x for the plan, 12x for the exact JSON.
 *
 * Local Apple-silicon medians (Node worker_threads, after warmup):
 *   - seed of both tables:                          ~4,000 ms (not budgeted)
 *   - fast-path block, top / deep (128 rows):       ~11 ms / ~10 ms
 *   - plan of the 46-column projection (LIMIT 0):   ~2.5 ms
 *   - deep page sorted by the struct:               ~35 ms
 *   - deep page sorted by the FLOAT[64] embedding:  ~400 ms
 *   - summary counts, each nested column:           ~2-4 ms (~42 ms for VARCHAR[])
 *   - exact JSON of a 2,000-item list cell:         ~2 ms
 *   - block of FLOAT[768] embeddings:               ~12 ms
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ColumnSchema, SortColumn } from '@/core/types';
import { fetchCellJson } from '@/data/cellValue';
import { detectSchema } from '@/data/SchemaDetector';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { TEXT_CAP } from '@/data/valueSql';
import { buildRowQuery } from '@/table/rowQuery';
import { nestedSummarySQL } from '@/visualizations/nested/NestedSummaryData';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { makeNodeBridge } from '../helpers/nodeBridge';

const RUN = process.env['RUN_DUCKDB_PERF'] === '1';
const describeIfPerf = RUN ? describe : describe.skip;

const ROWS = 200_000;
const EMBEDDING_ROWS = 20_000;
const BLOCK = 128;
const DEEP_OFFSET = 150_000;
const NESTED = ['embedding', 'long_ints', 'long_words', 'point', 'attrs', 'people'];
const SCALARS = Array.from({ length: 40 }, (_, i) => `c${String(i).padStart(2, '0')}`);

type Row = Record<string, unknown>;

/** A scalar column's SQL over `range`: integers, doubles and short text in turn. */
function scalarSQL(i: number): string {
  if (i % 3 === 0) return `(range * 31 + ${i * 17}) % 1000`;
  if (i % 3 === 1) return `((range * 7 + ${i}) % 1000) / 8.0`;
  return `'k' || ((range + ${i}) % 7)`;
}

/** The median of `samples`. */
function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

describeIfPerf('nested cells performance budgets (opt-in via RUN_DUCKDB_PERF=1)', () => {
  let harness: NodeDuckDBHarness;
  let bridge: WorkerBridge;
  let schema: ColumnSchema[];
  let embeddingSchema: ColumnSchema[];

  /** Milliseconds `run` takes, median of `times` runs after one warmup. */
  async function time(run: () => Promise<unknown>, times = 5): Promise<number> {
    await run();
    const samples: number[] = [];
    for (let i = 0; i < times; i++) {
      const start = performance.now();
      await run();
      samples.push(performance.now() - start);
    }
    return median(samples);
  }

  /** One block of the wide table, as `TableBody.fetchBlock` asks for it. */
  function block(options: { offset: number; sortColumns?: SortColumn[]; limit?: number }) {
    const sortColumns = options.sortColumns ?? [];
    return bridge.query<Row>(
      buildRowQuery({
        tableName: 'perf_nested',
        columns: ['id', ...SCALARS, ...NESTED],
        sortColumns,
        filters: [],
        offset: options.offset,
        limit: options.limit ?? BLOCK,
        schema,
        rowidFastPath: sortColumns.length === 0,
      }),
    );
  }

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);
    const scalars = SCALARS.map((name, i) => `${scalarSQL(i)} AS ${name}`).join(',\n');
    await harness.conn.query(`
      CREATE TABLE perf_nested AS
      SELECT
        range AS __rowid__,
        range AS id,
        ${scalars},
        list_transform(range(64), lambda i: ((range % 97) + i / 64.0)::FLOAT)::FLOAT[64] AS embedding,
        range(CASE WHEN range % 50 = 0 THEN 2000 ELSE range % 8 END) AS long_ints,
        list_transform(range(CASE WHEN range % 50 = 1 THEN 2000 ELSE range % 5 END),
                       lambda i: 'w' || i) AS long_words,
        {'x': range / 4, 'y': (range % 8) / 8, 'tier': ['gold', 'silver', 'bronze'][range % 3 + 1]}
          AS point,
        map_from_entries(list_transform(range(range % 6), lambda i: {'k': 'k' || i, 'v': i}))
          AS attrs,
        list_transform(range(range % 4), lambda i: {'name': 'p' || i, 'age': (range + i) % 90})
          AS people
      FROM range(${ROWS})
    `);
    await harness.conn.query(`
      CREATE TABLE perf_embeddings AS
      SELECT range AS __rowid__,
             list_transform(range(768), lambda i: (range * 0.001 + i)::FLOAT)::FLOAT[768]
               AS embedding
      FROM range(${EMBEDDING_ROWS})
    `);
    schema = await detectSchema('perf_nested', bridge);
    embeddingSchema = await detectSchema('perf_embeddings', bridge);
  }, 120_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('reads the table the grid shows', () => {
    expect(schema.filter((c) => NESTED.includes(c.name)).map((c) => c.type)).toEqual(
      NESTED.map(() => 'nested'),
    );
  });

  it('fetches a fast-path block of every column, at the top and deep, within 60 ms', async () => {
    const top = await time(() => block({ offset: 0 }));
    const deep = await time(() => block({ offset: DEEP_OFFSET }));
    expect(top).toBeLessThan(60);
    expect(deep).toBeLessThan(60);
  }, 60_000);

  it('keeps every nested cell of a block within the text cap', async () => {
    // Offset 0 holds the 2,000-item rows 0 and 1, 50 and 51, 100 and 101.
    const rows = await block({ offset: 0 });
    expect(rows).toHaveLength(BLOCK);
    for (const name of NESTED) {
      const chars = rows.reduce((sum, row) => sum + String(row[name] ?? '').length, 0);
      expect(chars, name).toBeLessThanOrEqual(BLOCK * (TEXT_CAP + 1));
    }
    expect(String(rows[0]!['long_ints'])).toMatch(/, … \+1968\]$/);
  });

  it('plans the 46-column projection within 25 ms', async () => {
    expect(await time(() => block({ offset: 0, limit: 0 }), 9)).toBeLessThan(25);
  }, 60_000);

  it('fetches a deep page sorted by the struct within 200 ms', async () => {
    const elapsed = await time(
      () => block({ offset: DEEP_OFFSET, sortColumns: [{ column: 'point', direction: 'desc' }] }),
      3,
    );
    expect(elapsed).toBeLessThan(200);
  }, 60_000);

  it('fetches a deep page sorted by the embedding within 2 s', async () => {
    const elapsed = await time(
      () =>
        block({ offset: DEEP_OFFSET, sortColumns: [{ column: 'embedding', direction: 'asc' }] }),
      3,
    );
    expect(elapsed).toBeLessThan(2_000);
  }, 90_000);

  it('counts each nested column for its header chart within 200 ms', async () => {
    for (const name of NESTED) {
      const elapsed = await time(() => bridge.query(nestedSummarySQL('perf_nested', name, [])));
      expect(elapsed, name).toBeLessThan(200);
    }
  }, 60_000);

  it('reads the exact JSON of a 2,000-item list cell within 25 ms', async () => {
    const column = schema.find((c) => c.name === 'long_words')!;
    const cell = await fetchCellJson(bridge, 'perf_nested', column, 1);
    expect(cell?.text?.startsWith('["w0","w1",')).toBe(true);
    expect(await time(() => fetchCellJson(bridge, 'perf_nested', column, 1))).toBeLessThan(25);
  }, 60_000);

  it('fetches a block of FLOAT[768] embeddings within 60 ms, within the cap', async () => {
    const run = () =>
      bridge.query<Row>(
        buildRowQuery({
          tableName: 'perf_embeddings',
          columns: ['embedding'],
          sortColumns: [],
          filters: [],
          offset: 4_096,
          limit: BLOCK,
          schema: embeddingSchema,
          rowidFastPath: true,
        }),
      );
    const rows = await run();
    const chars = rows.reduce((sum, row) => sum + String(row['embedding']).length, 0);
    expect(chars).toBeLessThanOrEqual(BLOCK * (TEXT_CAP + 1));
    expect(await time(run)).toBeLessThan(60);
  }, 60_000);
});
