/**
 * DATE and TIMESTAMP cells on real DuckDB, at `infinity` and at the ends of
 * each type's range: the grid's row query (`buildRowQuery`) and the cell's
 * text (`CellRenderer.formatValue`), together.
 *
 * The grid reads a date or timestamp as a number, epoch milliseconds. Arrow
 * could not read `infinity`, which DuckDB stores as the largest int64, nor a
 * year near 294247, so a block of rows holding one failed to load, every
 * row of it left a placeholder. Now the cell shows `infinity` and
 * `-infinity`, as DuckDB writes them, and a date a JavaScript `Date` cannot
 * hold (past ±275,760 years) as the ISO text a `Date` would write for it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ColumnSchema } from '@/core/types';
import { mapDuckDBType } from '@/data/SchemaDetector';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { CellRenderer } from '@/table/Cell';
import { buildRowQuery } from '@/table/rowQuery';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { makeNodeBridge } from '../helpers/nodeBridge';

describe('date and timestamp cells on real DuckDB', () => {
  let harness: NodeDuckDBHarness;
  let bridge: WorkerBridge;
  let schema: ColumnSchema[];

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);
    await bridge.query(`SET TimeZone = 'UTC'`);
    // Rows: the infinities, NULL, an ordinary value, the type's last and
    // first values (past what a Date holds, except for TIMESTAMP_NS).
    await bridge.query(
      `CREATE TABLE temporals AS SELECT * FROM (VALUES
        (0, TIMESTAMP 'infinity', 'infinity'::TIMESTAMP_S, 'infinity'::TIMESTAMP_MS,
            'infinity'::TIMESTAMP_NS, TIMESTAMPTZ 'infinity', DATE 'infinity'),
        (1, TIMESTAMP '-infinity', '-infinity'::TIMESTAMP_S, '-infinity'::TIMESTAMP_MS,
            '-infinity'::TIMESTAMP_NS, TIMESTAMPTZ '-infinity', DATE '-infinity'),
        (2, NULL, NULL, NULL, NULL, NULL, NULL),
        (3, TIMESTAMP '2024-01-02 03:04:05.123456', '2024-01-02 03:04:05'::TIMESTAMP_S,
            '2024-01-02 03:04:05.12'::TIMESTAMP_MS, '2024-01-02 03:04:05.123456789'::TIMESTAMP_NS,
            TIMESTAMPTZ '2024-01-02 03:04:05.5+00', DATE '2024-01-02'),
        (4, TIMESTAMP '294247-01-10 04:00:54.775806', '294247-01-10 04:00:54'::TIMESTAMP_S,
            '294247-01-10 04:00:54.775'::TIMESTAMP_MS, '2262-04-11 23:47:16.854775806'::TIMESTAMP_NS,
            TIMESTAMPTZ '294247-01-10 04:00:54.775806+00', DATE '5881580-07-10'),
        (5, TIMESTAMP '290309-12-22 (BC) 00:00:00', '290309-12-22 (BC) 00:00:00'::TIMESTAMP_S,
            '290309-12-22 (BC) 00:00:00'::TIMESTAMP_MS, '1677-09-22'::TIMESTAMP_NS,
            TIMESTAMPTZ '290309-12-22 (BC) 00:00:00+00', DATE '5877642-06-25 (BC)')
      ) AS t("__rowid__", ts, ts_s, ts_ms, ts_ns, tstz, d)`,
    );
    const columns = await bridge.query<{ column_name: string; column_type: string }>(
      'DESCRIBE temporals',
    );
    schema = columns.map(({ column_name, column_type }) => ({
      name: column_name,
      type: mapDuckDBType(column_type),
      nullable: true,
      originalType: column_type,
    }));
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  /** Each row's cell text for `columns`, as the grid fetches and shows them. */
  async function cells(...columns: string[]): Promise<string[][]> {
    const rows = await bridge.query<Record<string, unknown>>(
      buildRowQuery({
        tableName: 'temporals',
        columns,
        sortColumns: [],
        filters: [],
        offset: 0,
        limit: 128,
        schema,
        rowidFastPath: true,
      }),
    );
    const renderer = new CellRenderer();
    return rows.map((row) =>
      columns.map((name) => {
        const column = schema.find((c) => c.name === name)!;
        return renderer.formatValue(row[name], column.type, column.originalType);
      }),
    );
  }

  it('load as date and timestamp columns', () => {
    expect(schema.map((c) => [c.name, c.type, c.originalType])).toEqual([
      ['__rowid__', 'integer', 'INTEGER'],
      ['ts', 'timestamp', 'TIMESTAMP'],
      ['ts_s', 'timestamp', 'TIMESTAMP_S'],
      ['ts_ms', 'timestamp', 'TIMESTAMP_MS'],
      ['ts_ns', 'timestamp', 'TIMESTAMP_NS'],
      ['tstz', 'timestamp', 'TIMESTAMP WITH TIME ZONE'],
      ['d', 'date', 'DATE'],
    ]);
  });

  it('a block of rows holding infinity loads, every column of it', async () => {
    // One fetch of every column, as the grid fetches a block.
    const block = await cells('ts', 'ts_s', 'ts_ms', 'ts_ns', 'tstz', 'd');
    expect(block).toHaveLength(6);
    expect(block[0]).toEqual(Array(6).fill('infinity'));
    expect(block[1]).toEqual(Array(6).fill('-infinity'));
    expect(block[2]).toEqual(Array(6).fill('null'));
  });

  it('a TIMESTAMP cell shows its time to the millisecond, past year 275760 too', async () => {
    expect((await cells('ts')).flat()).toEqual([
      'infinity',
      '-infinity',
      'null',
      '2024-01-02 03:04:05.123',
      // 9223372036854775.806 ms, read as the nearest number: 9223372036854776.
      '+294247-01-10 04:00:54.776',
      // 290309 BC is year -290308, as JavaScript and ISO 8601 count years.
      '-290308-12-22 00:00:00',
    ]);
  });

  it('TIMESTAMP_S, _MS and _NS cells read their own units', async () => {
    expect(await cells('ts_s', 'ts_ms', 'ts_ns')).toEqual([
      ['infinity', 'infinity', 'infinity'],
      ['-infinity', '-infinity', '-infinity'],
      ['null', 'null', 'null'],
      ['2024-01-02 03:04:05', '2024-01-02 03:04:05.12', '2024-01-02 03:04:05.123'],
      ['+294247-01-10 04:00:54', '+294247-01-10 04:00:54.776', '2262-04-11 23:47:16.854'],
      ['-290308-12-22 00:00:00', '-290308-12-22 00:00:00', '1677-09-22 00:00:00'],
    ]);
  });

  it('a TIMESTAMP WITH TIME ZONE cell shows UTC, and infinity as DuckDB does, without a zone', async () => {
    expect((await cells('tstz')).flat()).toEqual([
      'infinity',
      '-infinity',
      'null',
      '2024-01-02 03:04:05.5 +00:00',
      '+294247-01-10 04:00:54.776 +00:00',
      '-290308-12-22 00:00:00 +00:00',
    ]);
  });

  it('a DATE cell shows infinity, and dates to year 5881580 either way', async () => {
    expect((await cells('d')).flat()).toEqual([
      'infinity',
      '-infinity',
      'null',
      '2024-01-02',
      '+5881580-07-10',
      // 5877642 BC.
      '-5877641-06-25',
    ]);
  });
});
