/**
 * @vitest-environment jsdom
 *
 * The annotated filter through the facade, over a bridge that logs every
 * statement: the DuckDB table of annotated rows is built before anything
 * reads it (the grid, the filtered-row count), whether the filter is added
 * or restored with a session; a change to the annotations under the filter
 * refreshes the view in place, without writing `state.filters`, which would
 * scroll the grid to the top and clear the cursor; a failed sync is an
 * `error` event from `'query'`, and does not hold the view.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDataTable, type DataTable } from '@/index';
import type { ColumnSchema, Filter } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import type { SessionStore } from '@/persistence/SessionStore';
import { SNAPSHOT_VERSION, type SessionSnapshot } from '@/persistence/types';

const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  // A visible range, so that the body fetches its rows.
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 500;
    },
  });
});

afterAll(() => {
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  }
});

const SCHEMA: ColumnSchema[] = [
  { name: '__rowid__', type: 'integer', nullable: false, originalType: 'BIGINT', system: true },
  { name: 'a', type: 'integer', nullable: true, originalType: 'INTEGER' },
];

const HELPER = '__dt_annot_data__';

interface LoggingBridge {
  bridge: WorkerBridge;
  /** Every statement sent, in order. */
  log: string[];
  /** The next sync of the annotated rows fails with this. */
  failSync: (error: Error) => void;
  /** The filtered-row count every count query returns. */
  setCount: (count: number) => void;
}

function makeBridge(): LoggingBridge {
  const log: string[] = [];
  let syncError: Error | null = null;
  let count = 0;
  const bridge = {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(async (sql: string) => {
      log.push(sql);
      if (sql.startsWith('CREATE OR REPLACE TEMP TABLE')) {
        const error = syncError;
        syncError = null;
        if (error) throw error;
        return [];
      }
      if (/^SELECT COUNT\(\*\) as cnt/.test(sql)) return [{ cnt: count }];
      return [];
    }),
    loadData: vi.fn().mockResolvedValue({
      tableName: 'data',
      rowCount: 1000,
      columns: SCHEMA.map((c) => c.name),
      schema: SCHEMA,
    }),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    clearQueryCache: vi.fn(),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
    dropTable: vi.fn().mockResolvedValue(undefined),
  } as unknown as WorkerBridge;
  return {
    bridge,
    log,
    failSync: (error) => (syncError = error),
    setCount: (value) => (count = value),
  };
}

function makeSessionStore(snapshot: SessionSnapshot | null = null): SessionStore {
  return {
    open: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue(undefined),
    saveSync: vi.fn(),
    load: vi.fn().mockResolvedValue(snapshot),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  } as unknown as SessionStore;
}

const tables: DataTable[] = [];

const SOURCE = new File(['a\n1'], 'data.csv');

async function makeTable(
  logging: LoggingBridge,
  { persistence = false, load = true }: { persistence?: SessionStore | false; load?: boolean } = {},
): Promise<DataTable> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const table = await createDataTable({
    container,
    bridge: logging.bridge,
    ...(load ? { source: SOURCE, tableName: 'data' } : {}),
    presets: false,
    expressionFilter: false,
    visualizations: false,
    exportDialog: false,
    persistence: persistence === false ? false : { sessionStore: persistence },
  });
  tables.push(table);
  return table;
}

/** Statements that read the table of annotated rows, as opposed to build it. */
function readsOfHelper(log: string[]): number[] {
  return log.flatMap((sql, i) =>
    sql.includes(HELPER) && !sql.startsWith('CREATE OR REPLACE TEMP TABLE') ? [i] : [],
  );
}

function syncsIn(log: string[]): number[] {
  return log.flatMap((sql, i) => (sql.startsWith('CREATE OR REPLACE TEMP TABLE') ? [i] : []));
}

function nextFilterChange(table: DataTable): Promise<{ filters: Filter[]; count: number }> {
  return new Promise((resolve) => {
    const off = table.on('filterChange', ({ filters, filteredRowCount }) => {
      off();
      resolve({ filters, count: filteredRowCount });
    });
  });
}

afterEach(async () => {
  for (const table of tables.splice(0)) await table.destroy();
  document.body.innerHTML = '';
});

describe('the annotated filter through createDataTable', () => {
  it('builds the table of annotated rows before the grid or the count reads it', async () => {
    const logging = makeBridge();
    const table = await makeTable(logging);
    table.annotations.add({ scope: 'row', rowId: 3, severity: 'error', message: 'row' });
    table.annotations.add({ scope: 'cell', rowId: 7, column: 'a', severity: 'info', message: 'x' });
    table.annotations.add({ scope: 'column', column: 'a', severity: 'warning', message: 'col' });
    logging.log.length = 0;
    logging.setCount(2);

    const changed = nextFilterChange(table);
    table.actions.showAnnotatedRows();
    await expect(changed).resolves.toEqual({
      filters: [{ type: 'annotated', column: '__annotated__', table: 'data' }],
      count: 2,
    });
    await table.container.whenBodyReady();

    const [sync] = syncsIn(logging.log);
    expect(sync).toBeDefined();
    // Row 3 (error, 1) and row 7 (info, 4); the column's annotation singles out none.
    expect(logging.log[sync!]).toContain(`string_split('25,60', ',')`);
    const reads = readsOfHelper(logging.log);
    expect(reads.length).toBeGreaterThanOrEqual(2);
    expect(reads.every((i) => i > sync!)).toBe(true);
    expect(syncsIn(logging.log)).toHaveLength(1);
  });

  it('refreshes the view in place when the annotations change under the filter', async () => {
    const logging = makeBridge();
    const table = await makeTable(logging);
    table.annotations.add({ scope: 'row', rowId: 3, severity: 'error', message: 'row' });
    logging.setCount(1);
    const first = nextFilterChange(table);
    table.actions.showAnnotatedRows();
    await first;
    await table.container.whenBodyReady();
    table.actions.setFocusedCell({ row: 0, column: 'a' });

    const filtersWritten = vi.fn();
    table.state.filters.subscribe(filtersWritten);
    logging.log.length = 0;
    logging.setCount(2);
    const refreshed = nextFilterChange(table);
    table.annotations.add({ scope: 'row', rowId: 9, severity: 'warning', message: 'more' });
    await expect(refreshed).resolves.toMatchObject({ count: 2 });

    const [sync] = syncsIn(logging.log);
    expect(logging.log[sync!]).toContain(`string_split('25,74', ',')`);
    // The count and the grid's rows, read again after the sync.
    const reads = readsOfHelper(logging.log);
    expect(reads.length).toBeGreaterThanOrEqual(2);
    expect(reads.every((i) => i > sync!)).toBe(true);
    // In place: the filters were not written, and the cursor stays.
    expect(filtersWritten).not.toHaveBeenCalled();
    expect(table.state.focusedCell.get()).toEqual({ row: 0, column: 'a' });
    expect(table.state.filteredRows.get()).toBe(2);
  });

  it('reports a failed sync as an error from the query source, and lets the view read', async () => {
    const logging = makeBridge();
    const table = await makeTable(logging);
    const errors: { source: string; message: string }[] = [];
    table.on('error', ({ error, source }) => errors.push({ source, message: error.message }));
    logging.failSync(new Error('Out of Memory Error'));
    logging.setCount(0);

    const changed = nextFilterChange(table);
    table.actions.showAnnotatedRows({ severities: ['error'] });
    await changed;
    expect(errors).toEqual([{ source: 'query', message: 'Out of Memory Error' }]);
    expect(table.actions.isRelationReadable()).toBe(true);
  });

  it('restores a session’s annotated filter without reading the table before it is built', async () => {
    const logging = makeBridge();
    logging.setCount(1);
    const snapshot: SessionSnapshot = {
      version: SNAPSHOT_VERSION,
      timestamp: 0,
      tableName: 'data',
      filters: [{ type: 'annotated', column: '__annotated__', table: 'data' }],
      sortColumns: [],
      visibleColumns: ['a'],
      columnOrder: ['__rowid__', 'a'],
      columnWidths: {},
      pinnedColumns: [],
      hiddenColumnInfo: {},
      derivedColumns: [],
      annotations: {
        version: 1,
        annotations: [
          { id: 'a1', scope: 'cell', rowId: 4, column: 'a', severity: 'warning', message: 'w' },
        ],
      },
    };
    const errors: unknown[] = [];
    const table = await makeTable(logging, {
      persistence: makeSessionStore(snapshot),
      load: false,
    });
    table.on('error', (event) => errors.push(event));
    await table.loadData(SOURCE, { tableName: 'data' });

    expect(table.state.filters.get()).toEqual(snapshot.filters);
    expect(table.state.filteredRows.get()).toBe(1);
    const syncs = syncsIn(logging.log);
    expect(syncs).toHaveLength(1);
    expect(logging.log[syncs[0]!]).toContain(`string_split('34', ',')`);
    const reads = readsOfHelper(logging.log);
    expect(reads.length).toBeGreaterThanOrEqual(2);
    expect(reads.every((i) => i > syncs[0]!)).toBe(true);
    expect(errors).toEqual([]);
  });

  it('reads the filtered rows by the annotations in the store, syncing first', async () => {
    const logging = makeBridge();
    const table = await makeTable(logging);
    const first = nextFilterChange(table);
    table.actions.showAnnotatedRows();
    await first;

    logging.log.length = 0;
    table.annotations.add({ scope: 'row', rowId: 1, severity: 'error', message: 'now' });
    await table.actions.getColumnValues('a', { scope: 'filtered' });
    const [sync] = syncsIn(logging.log);
    const read = logging.log.findIndex((sql) => sql.includes('AS val FROM "data"'));
    expect(sync).toBeDefined();
    expect(read).toBeGreaterThan(sync!);
  });
});
