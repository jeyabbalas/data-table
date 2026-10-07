/**
 * @vitest-environment jsdom
 *
 * A table holding `infinity` timestamps, through `createDataTable` against
 * real DuckDB: its rows load and its cells show `infinity`.
 *
 * DuckDB stores a TIMESTAMP's `infinity` as the largest int64, which Arrow
 * would not turn into a number (`9223372036854775 is not safe to convert to
 * a number`). The worker read every value of a row block that way, so the
 * whole block failed: the grid logged `Error fetching rows` and kept its
 * placeholder rows, and `getCellValue` failed too. A DATE's `infinity`
 * showed as 185542587100800000.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { WorkerBridge } from '@/data/WorkerBridge';
import { createDataTable, quoteIdentifier, type DataTable } from '@/index';

import { createNodeDuckDB, type NodeDuckDBHarness } from './helpers/duckdbNode';
import { makeNodeBridge } from './helpers/nodeBridge';

const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

let harness: NodeDuckDBHarness | undefined;
const tables: DataTable[] = [];

beforeAll(async () => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  // jsdom lays nothing out: without a height the body renders no rows.
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 500;
    },
  });
  harness = await createNodeDuckDB();
}, 30_000);

afterEach(async () => {
  for (const table of tables.splice(0)) {
    if (!table.isDestroyed()) await table.destroy();
  }
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

afterAll(async () => {
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  }
  await harness?.cleanup();
});

/** A bridge over the node connection, with the lifecycle `createDataTable` touches. */
function facadeBridge(): WorkerBridge {
  const conn = harness!.conn;
  return {
    ...makeNodeBridge(conn, harness!.db),
    initialize: async () => {},
    isInitialized: () => true,
    clearQueryCache: () => {},
    terminate: () => {},
    dropTable: async (name: string) => {
      await conn.query(`DROP TABLE IF EXISTS ${quoteIdentifier(name)}`);
    },
  } as unknown as WorkerBridge;
}

/** The rows of `sql`, as a Parquet file DuckDB writes. */
async function parquetOf(sql: string): Promise<ArrayBuffer> {
  const bytes = await makeNodeBridge(harness!.conn, harness!.db).exportToBuffer(sql, 'parquet');
  return bytes.slice().buffer;
}

/** The text of the rendered cell of `column` in the row at `rowIndex`. */
function cellText(container: HTMLElement, rowIndex: number, column: string): string | null {
  const cell = container.querySelector(
    `.dt-row[data-row-index="${rowIndex}"] .dt-cell[data-column="${column}"]`,
  );
  return cell?.textContent ?? null;
}

describe('a table holding infinite timestamps (real DuckDB)', () => {
  it('loads its rows, and its cells show infinity as DuckDB writes it', async () => {
    const errors = vi.spyOn(console, 'error');
    await harness!.conn.query(`SET TimeZone = 'UTC'`);
    const source = await parquetOf(
      `SELECT * FROM (VALUES
         (1, TIMESTAMP 'infinity', TIMESTAMPTZ 'infinity', DATE 'infinity'),
         (2, TIMESTAMP '-infinity', TIMESTAMPTZ '-infinity', DATE '-infinity'),
         (3, NULL, NULL, NULL),
         (4, TIMESTAMP '2024-01-02 03:04:05.123456', TIMESTAMPTZ '2024-01-02 03:04:05.5+00',
             DATE '2024-01-02'),
         (5, TIMESTAMP '294247-01-10 04:00:54.775806', TIMESTAMPTZ '290309-12-22 (BC) 00:00:00+00',
             DATE '5881580-07-10')
       ) AS t(id, ts, tstz, d)`,
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const table = await createDataTable({
      container,
      bridge: facadeBridge(),
      source,
      sourceFormat: 'parquet',
      tableName: 'infinite_timestamps',
      persistence: false,
      presets: false,
      expressionFilter: false,
      exportDialog: false,
      visualizations: false,
    });
    tables.push(table);

    expect(table.state.schema.get().map((c) => [c.name, c.type, c.originalType])).toEqual([
      ['__rowid__', 'integer', 'BIGINT'],
      ['id', 'integer', 'INTEGER'],
      ['ts', 'timestamp', 'TIMESTAMP'],
      ['tstz', 'timestamp', 'TIMESTAMP WITH TIME ZONE'],
      ['d', 'date', 'DATE'],
    ]);

    // The block loaded: a row for each, none of them a placeholder.
    expect(container.querySelectorAll('.dt-row[data-row-index]')).toHaveLength(5);
    expect(container.querySelector('.dt-row[data-placeholder]')).toBeNull();
    const rows = [0, 1, 2, 3, 4].map((row) =>
      ['id', 'ts', 'tstz', 'd'].map((column) => cellText(container, row, column)),
    );
    expect(rows).toEqual([
      ['1', 'infinity', 'infinity', 'infinity'],
      ['2', '-infinity', '-infinity', '-infinity'],
      ['3', 'null', 'null', 'null'],
      ['4', '2024-01-02 03:04:05.123', '2024-01-02 03:04:05.5 +00:00', '2024-01-02'],
      ['5', '+294247-01-10 04:00:54.776', '-290308-12-22 00:00:00 +00:00', '+5881580-07-10'],
    ]);
    expect(errors).not.toHaveBeenCalledWith('Error fetching rows:', expect.anything());

    // The values read the same way.
    expect(await table.actions.getCellValue(0, 'ts')).toBe(Infinity);
    expect(await table.actions.getCellValue(1, 'tstz')).toBe(-Infinity);
    expect(await table.actions.getColumnValues('d')).toEqual([
      Infinity,
      -Infinity,
      null,
      1_704_153_600_000,
      185_542_587_014_400_000,
    ]);
  });

  it('sorts infinity last and -infinity first, as DuckDB orders them', async () => {
    await harness!.conn.query(`SET TimeZone = 'UTC'`);
    const source = await parquetOf(
      `SELECT * FROM (VALUES (1, TIMESTAMP 'infinity'), (2, TIMESTAMP '2024-01-02'),
                             (3, TIMESTAMP '-infinity')) AS t(id, ts)`,
    );
    const container = document.createElement('div');
    document.body.appendChild(container);
    const table = await createDataTable({
      container,
      bridge: facadeBridge(),
      source,
      sourceFormat: 'parquet',
      tableName: 'infinite_sorted',
      persistence: false,
      presets: false,
      expressionFilter: false,
      exportDialog: false,
      visualizations: false,
    });
    tables.push(table);

    const rendered = new Promise<void>((resolve) => {
      const off = table.on('sortChange', () => {
        off();
        resolve();
      });
    });
    table.actions.setSort([{ column: 'ts', direction: 'asc' }]);
    await rendered;
    await vi.waitFor(() =>
      expect([0, 1, 2].map((row) => cellText(container, row, 'ts'))).toEqual([
        '-infinity',
        '2024-01-02 00:00:00',
        'infinity',
      ]),
    );
  });
});
