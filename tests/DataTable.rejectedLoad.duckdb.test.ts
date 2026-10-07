/**
 * @vitest-environment jsdom
 *
 * A load the worker rejects for its source options, against DuckDB: an
 * unknown time zone, or Parquet columns the file lacks. Both reach the
 * worker, past the main thread's checks, and are turned away there before
 * any table is created or replaced. The table used to be reset first, so it
 * came back empty: no rows, filters, derived columns or annotations. It now
 * keeps the data it had, as for an option the main thread turns away.
 */
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createDataTable, type DataTable } from '@/index';
import type { WorkerBridge } from '@/data/WorkerBridge';

import { createNodeDuckDB, type NodeDuckDBHarness } from './helpers/duckdbNode';
import { makeNodeBridge } from './helpers/nodeBridge';

let harness: NodeDuckDBHarness;
const files: string[] = [];

beforeAll(async () => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  harness = await createNodeDuckDB();
}, 30_000);

afterAll(async () => {
  for (const path of files) await unlink(path).catch(() => {});
  await harness?.cleanup();
});

beforeEach(async () => {
  for (const name of await objects()) {
    await harness.conn.query(`DROP VIEW IF EXISTS "${name}"`);
    await harness.conn.query(`DROP TABLE IF EXISTS "${name}"`);
  }
});

/** The tables and views in the database. */
async function objects(): Promise<string[]> {
  const result = await harness.conn.query(
    `SELECT table_name AS name FROM duckdb_tables() WHERE NOT internal
     UNION ALL SELECT view_name FROM duckdb_views() WHERE NOT internal ORDER BY 1`,
  );
  return result.toArray().map((row) => String(row.toJSON().name));
}

async function parquet(select: string): Promise<ArrayBuffer> {
  const path = join(tmpdir(), `dt_rejected_load_${process.pid}_${files.length}.parquet`);
  files.push(path);
  await harness.conn.query(`COPY (${select}) TO '${path}' (FORMAT parquet)`);
  const bytes = await readFile(path);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function bridge(): WorkerBridge {
  const base = makeNodeBridge(harness.conn, harness.db);
  return {
    ...base,
    initialize: async () => {},
    isInitialized: () => true,
    clearQueryCache: () => {},
    terminate: () => {},
    dropTable: async (name: string) => {
      await harness.conn.query(`DROP TABLE IF EXISTS "${name}"`);
    },
  } as unknown as WorkerBridge;
}

const tables: DataTable[] = [];

afterEach(async () => {
  for (const table of tables.splice(0)) {
    if (!table.isDestroyed()) await table.destroy();
  }
  document.body.innerHTML = '';
});

async function mount(): Promise<DataTable> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const table = await createDataTable({
    container,
    bridge: bridge(),
    persistence: false,
    presets: false,
    expressionFilter: false,
    visualizations: false,
    exportDialog: false,
  });
  tables.push(table);
  return table;
}

/** What a rejected load must leave as it was. */
function view(table: DataTable) {
  const { state } = table;
  return {
    tableName: state.tableName.get(),
    baseTableName: state.baseTableName.get(),
    totalRows: state.totalRows.get(),
    schema: state.schema.get().map((c) => c.name),
    filters: state.filters.get(),
    sortColumns: state.sortColumns.get(),
    visibleColumns: state.visibleColumns.get(),
    derivedColumns: state.derivedColumns.get().map((d) => d.name),
    annotations: table.annotations.getAll().map((a) => a.id),
  };
}

/** A table of 3 rows with a filter, a sort, a derived column and an annotation. */
async function prepare(table: DataTable, load: () => Promise<void>) {
  await load();
  table.actions.addFilter({ type: 'range', column: 'id', min: 1, max: 2, maxInclusive: true });
  table.actions.setSort([{ column: 'id', direction: 'desc' }]);
  await expect(
    table.actions.addDerivedColumn({ kind: 'expression', name: 'x2', expression: 'id * 2' }),
  ).resolves.toEqual({ success: true });
  table.annotations.add({ scope: 'column', column: 'id', severity: 'info', message: 'kept' });
  return view(table);
}

describe('a load rejected for its source options keeps the table', () => {
  it('for a time zone DuckDB does not know', async () => {
    const table = await mount();
    const before = await prepare(table, () =>
      table.loadData('id\n1\n2\n3\n', { sourceFormat: 'csv', tableName: 'trips' }),
    );
    expect(before).toMatchObject({ tableName: '__dt_view_trips__', totalRows: 3 });
    const loadErrors: unknown[] = [];
    table.on('loadError', (payload) => loadErrors.push(payload));

    await expect(
      table.loadData('id\n9\n', {
        sourceFormat: 'csv',
        tableName: 'other',
        sourceOptions: { timezone: 'Mars/Olympus' },
      }),
    ).rejects.toMatchObject({ code: 'LOAD_INVALID_TIMEZONE' });

    expect(loadErrors).toHaveLength(1);
    expect(view(table)).toEqual(before);
    // The base table and the derived columns' VIEW are still there, and read.
    expect(await objects()).toEqual(['__dt_view_trips__', 'trips']);
    await expect(table.actions.getColumnValues('x2', { scope: 'filtered' })).resolves.toEqual(
      BigInt64Array.from([2n, 4n]),
    );
    // So is the undo history: the last step undone is the sort.
    await expect(table.actions.undo()).resolves.toBe(true);
    expect(table.state.derivedColumns.get()).toEqual([]);

    // The next load that lands drops what the rejected one left in place.
    await table.loadData('id\n5\n', { sourceFormat: 'csv', tableName: 'next' });
    expect(await objects()).toEqual(['next']);
  });

  it('for Parquet columns the file lacks, loading into the same table name', async () => {
    const data = await parquet('SELECT range::INTEGER AS id FROM range(1, 4)');
    const table = await mount();
    const before = await prepare(table, () =>
      table.loadData(data.slice(0), { sourceFormat: 'parquet', tableName: 'trips' }),
    );

    await expect(
      table.loadData(data.slice(0), {
        sourceFormat: 'parquet',
        tableName: 'trips',
        sourceOptions: { parquet: { columns: ['id', 'fare'] } },
      }),
    ).rejects.toMatchObject({
      code: 'LOAD_INVALID_OPTIONS',
      details: { option: 'parquet.columns', missing: ['fare'] },
    });

    expect(view(table)).toEqual(before);
    expect(await objects()).toEqual(['__dt_view_trips__', 'trips']);
    await expect(table.actions.getColumnValues('id')).resolves.toEqual(Int32Array.from([1, 2, 3]));

    await table.destroy();
    expect(await objects()).toEqual([]);
  });

  it('but not for a load that fails as it reads the source', async () => {
    const table = await mount();
    await prepare(table, () =>
      table.loadData('id\n1\n2\n3\n', { sourceFormat: 'csv', tableName: 'trips' }),
    );

    await expect(
      table.loadData('{"id": ', { sourceFormat: 'json', tableName: 'other' }),
    ).rejects.toMatchObject({ name: 'LoadError' });

    expect(view(table)).toMatchObject({
      tableName: null,
      totalRows: 0,
      filters: [],
      derivedColumns: [],
      annotations: [],
    });
  });
});
