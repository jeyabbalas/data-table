/**
 * TIME_NS and TIME WITH TIME ZONE cells on real DuckDB: the grid's row
 * query (`buildRowQuery`, through `gridValueSQL`) and the cell's text
 * (`CellRenderer.formatValue`), together.
 *
 * Both types load as `'time'`, and Arrow carries neither as a cell can show
 * it: a TIME_NS in nanoseconds, which the cell would read as microseconds
 * (`03:04:05.123456789` as `3068:05:23.456`), and a TIME WITH TIME ZONE
 * without its offset (`14:05:06`). The grid reads both as DuckDB's text,
 * and a time that arrives as text shows as that text.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { ColumnSchema } from '@/core/types';
import { mapDuckDBType } from '@/data/SchemaDetector';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { CellRenderer } from '@/table/Cell';
import { buildRowQuery } from '@/table/rowQuery';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { makeNodeBridge } from '../helpers/nodeBridge';

describe('time cells on real DuckDB', () => {
  let harness: NodeDuckDBHarness;
  let bridge: WorkerBridge;
  let schema: ColumnSchema[];

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);
    await bridge.query(
      `CREATE TABLE times AS SELECT * FROM (VALUES
        (0, CAST('03:04:05.123456789' AS TIME_NS), '14:05:06+05:30'::TIMETZ, TIME '03:04:05.123456'),
        (1, CAST('13:14:15' AS TIME_NS), '14:05:06.5-08'::TIMETZ, TIME '13:14:15'),
        (2, NULL, NULL, NULL)
      ) AS t("__rowid__", ns, tz, plain)`,
    );
    const columns = await bridge.query<{ column_name: string; column_type: string }>(
      'DESCRIBE times',
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

  /** Each row's cell text for `column`, as the grid fetches and shows it. */
  async function cells(column: string): Promise<string[]> {
    const rows = await bridge.query<Record<string, unknown>>(
      buildRowQuery({
        tableName: 'times',
        columns: [column],
        sortColumns: [],
        filters: [],
        offset: 0,
        limit: 128,
        schema,
        rowidFastPath: true,
      }),
    );
    const type = schema.find((c) => c.name === column)!;
    const renderer = new CellRenderer();
    return rows.map((row) => renderer.formatValue(row[column], type.type, type.originalType));
  }

  it('load as time columns', () => {
    expect(schema.map((c) => [c.name, c.type, c.originalType])).toEqual([
      ['__rowid__', 'integer', 'INTEGER'],
      ['ns', 'time', 'TIME_NS'],
      ['tz', 'time', 'TIME WITH TIME ZONE'],
      ['plain', 'time', 'TIME'],
    ]);
  });

  it('a TIME_NS cell shows the time with its nanoseconds', async () => {
    expect(await cells('ns')).toEqual(['03:04:05.123456789', '13:14:15', 'null']);
  });

  it('a TIME WITH TIME ZONE cell keeps its offset', async () => {
    expect(await cells('tz')).toEqual(['14:05:06+05:30', '14:05:06.5-08', 'null']);
  });

  it('a TIME cell is read as it always was, to the millisecond', async () => {
    expect(await cells('plain')).toEqual(['03:04:05.123', '13:14:15', 'null']);
  });
});
