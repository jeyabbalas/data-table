/**
 * @vitest-environment jsdom
 *
 * The table container keeps the DuckDB table of annotated rows in a chunk of
 * its own, loaded the first time an annotated filter of its table comes into
 * force or a reader asks for the table. Until the chunk is in, the reads the
 * filter makes wait; a chunk that fails to load is reported as
 * `CHUNK_LOAD_FAILED` and lets them go, and is asked for again the next time
 * the filters change.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnnotationStore } from '@/annotations/AnnotationStore';
import { StateActions } from '@/core/Actions';
import { ConfigurationError, type DataTableError } from '@/core/errors';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { TableContainer } from '@/table/TableContainer';

class MockResizeObserver implements ResizeObserver {
  constructor(_: ResizeObserverCallback) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const SCHEMA: ColumnSchema[] = [
  { name: '__rowid__', type: 'integer', nullable: false, originalType: 'BIGINT', system: true },
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
];

let table: TableContainer;
let state: TableState;
let actions: StateActions;
let store: AnnotationStore;
let sql: string[];
let onError: ReturnType<typeof vi.fn<(error: DataTableError) => void>>;

const syncs = (): string[] => sql.filter((s) => s.startsWith('CREATE OR REPLACE TEMP TABLE'));

beforeEach(async () => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  const container = document.createElement('div');
  document.body.appendChild(container);
  sql = [];
  const bridge = {
    query: vi.fn(async (statement: string) => {
      sql.push(statement);
      if (statement.includes('COUNT(')) return [{ cnt: 1 }];
      return [];
    }),
    initialize: vi.fn(),
    terminate: vi.fn(),
    clearQueryCache: vi.fn(),
    isInitialized: () => true,
  } as unknown as WorkerBridge;
  state = createTableState();
  actions = new StateActions(state, bridge);
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(20);
  state.filteredRows.set(20);
  state.tableName.set('t');
  state.baseTableName.set('t');
  store = new AnnotationStore();
  store.add({ scope: 'row', rowId: 3, severity: 'error', message: 'x' });
  onError = vi.fn();
  table = new TableContainer(container, state, actions, bridge, {
    annotations: store,
    onError,
  });
  await table.whenBodyReady();
});

afterEach(() => {
  table.destroy();
  vi.doUnmock('@/annotations/AnnotatedRowsTable');
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('TableContainer — the table of annotated rows', () => {
  it('is built once an annotated filter of this table comes into force, holding the reads till then', async () => {
    store.add({ scope: 'cell', rowId: 4, column: 'id', severity: 'info', message: 'y' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(syncs()).toEqual([]);
    expect(actions.isRelationReadable()).toBe(true);

    actions.showAnnotatedRows();
    expect(actions.isRelationReadable()).toBe(false);
    await vi.waitFor(() => expect(actions.isRelationReadable()).toBe(true));
    expect(syncs()).toHaveLength(1);
    expect(syncs()[0]).toContain(`"__dt_annot_t__"`);
    expect(syncs()[0]).toContain(`string_split('25,36', ',')`);
    expect(onError).not.toHaveBeenCalled();
  });

  it('is loaded and synced by a reader asking for it, with no filter in force', async () => {
    const source = table.getAnnotatedRows()!;
    await expect(source.ensureFresh()).resolves.toBe('__dt_annot_t__');
    expect(syncs()).toHaveLength(1);
    await expect(source.ensureFresh()).resolves.toBe('__dt_annot_t__');
    expect(syncs()).toHaveLength(1);
  });

  it('a chunk that fails to load is reported, lets the reads go, and is asked for again', async () => {
    vi.doMock('@/annotations/AnnotatedRowsTable', () => {
      throw new Error('chunk offline');
    });
    actions.showAnnotatedRows();
    expect(actions.isRelationReadable()).toBe(false);
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    const error = onError.mock.calls[0]![0];
    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error).toMatchObject({ code: 'CHUNK_LOAD_FAILED', details: { panel: 'annotatedRows' } });
    expect(error.message).toMatch(/^The annotatedRows chunk did not load: /);
    expect(actions.isRelationReadable()).toBe(true);
    await expect(table.getAnnotatedRows()!.ensureFresh()).rejects.toMatchObject({
      code: 'CHUNK_LOAD_FAILED',
    });
    expect(syncs()).toEqual([]);

    vi.doUnmock('@/annotations/AnnotatedRowsTable');
    actions.showAnnotatedRows({ severities: ['error'] });
    expect(actions.isRelationReadable()).toBe(false);
    await vi.waitFor(() => expect(actions.isRelationReadable()).toBe(true));
    expect(syncs()).toHaveLength(1);
  });

  it('opens the gate held for its chunk on destroy', async () => {
    vi.doMock('@/annotations/AnnotatedRowsTable', () => new Promise(() => undefined));
    actions.showAnnotatedRows();
    let readable = false;
    void actions.whenRelationReadable().then(() => (readable = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(readable).toBe(false);
    table.destroy();
    await vi.waitFor(() => expect(readable).toBe(true));
  });
});
