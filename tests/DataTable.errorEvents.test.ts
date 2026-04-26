// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema, type TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import {
  DataTableError,
  DerivedColumnError,
  ExportError,
  LoadError,
  PersistenceError,
  SQLValidationError,
} from '@/core/errors';
import { EventEmitter } from '@/core/EventEmitter';
import type { TableEvents } from '@/core/TableEvents';
import { exportToCSV } from '@/export/CSVExport';
import type { ExportContext } from '@/export/ExportQuery';
import { copyRowsToClipboard } from '@/export/Clipboard';
import { AutoSave } from '@/persistence/AutoSave';
import type { SessionStore } from '@/persistence/SessionStore';
import type { WorkerBridge } from '@/data/WorkerBridge';

const createMockBridge = () =>
  ({
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    loadData: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
    clearQueryCache: vi.fn(),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
  }) as unknown as WorkerBridge;

const schema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

function setupState(): TableState {
  const state = createTableState();
  state.totalRows.set(10);
  state.filteredRows.set(10);
  initializeColumnsFromSchema(state, schema);
  return state;
}

describe('SQL validation errors (Actions)', () => {
  let actions: StateActions;

  beforeEach(() => {
    const state = setupState();
    state.tableName.set('t1');
    actions = new StateActions(state, createMockBridge());
  });

  it('addRawSQLFilter throws SQLValidationError on empty input', () => {
    expect(() => actions.addRawSQLFilter('   ')).toThrow(SQLValidationError);
    try {
      actions.addRawSQLFilter('');
    } catch (err) {
      expect(err).toBeInstanceOf(DataTableError);
      expect((err as SQLValidationError).code).toBe('SQL_SYNTAX');
    }
  });

  it('updateRawSQLFilter throws SQLValidationError on empty input', () => {
    expect(() => actions.updateRawSQLFilter('some-id', '')).toThrow(SQLValidationError);
  });

  it('removeDerivedColumn throws DerivedColumnError when column is not derived', async () => {
    await expect(actions.removeDerivedColumn('id')).rejects.toBeInstanceOf(DerivedColumnError);
  });
});

describe('Export errors', () => {
  it('exportToCSV throws ExportError/NO_TABLE_LOADED when tableName is empty', async () => {
    const context: ExportContext = {
      bridge: createMockBridge(),
      filters: [],
      sortColumns: [],
      selectedRows: new Set<number>(),
      columnOrder: [],
      schema: [],
    };
    await expect(exportToCSV('', { scope: 'all' }, context)).rejects.toMatchObject({
      name: 'ExportError',
      code: 'NO_TABLE_LOADED',
    });
  });

  it('copyRowsToClipboard throws ExportError when no table loaded', async () => {
    const state = setupState();
    // Leave tableName unset
    await expect(copyRowsToClipboard([0, 1, 2], state, createMockBridge())).rejects.toBeInstanceOf(
      ExportError,
    );
  });
});

describe('AutoSave surfaces PersistenceError via onError', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('wraps SessionStore.save rejection in PersistenceError and delivers to onError', async () => {
    const state = setupState();
    state.tableName.set('t1');

    const underlying = new Error('quota exceeded');
    const store = {
      open: vi.fn().mockResolvedValue(true),
      save: vi.fn().mockRejectedValue(underlying),
      saveSync: vi.fn(),
      load: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      close: vi.fn(),
    } as unknown as SessionStore;

    const onError = vi.fn();
    const autoSave = new AutoSave(state, store, { onError });
    autoSave.enable();

    // Trigger a schedule-save + debounce flush.
    state.filters.set([{ type: 'null', column: 'name' }]);
    vi.advanceTimersByTime(1000);

    // Await the microtask where the promise rejection is observed.
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });
    const err = onError.mock.calls[0][0] as PersistenceError;
    expect(err).toBeInstanceOf(PersistenceError);
    expect(err.code).toBe('SAVE_FAILED');
    expect(err.cause).toBe(underlying);

    autoSave.destroy();
  });

  it('wraps synchronous saveSync throws in PersistenceError', () => {
    const state = setupState();
    state.tableName.set('t1');

    const store = {
      open: vi.fn().mockResolvedValue(true),
      save: vi.fn().mockResolvedValue(undefined),
      saveSync: vi.fn(() => {
        throw new Error('sync failure');
      }),
      load: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      close: vi.fn(),
    } as unknown as SessionStore;

    const onError = vi.fn();
    const autoSave = new AutoSave(state, store, { onError });
    autoSave.enable();

    // Queue a save, then fire the beforeunload/visibility hook which runs saveSync.
    state.filters.set([{ type: 'null', column: 'name' }]);

    // Instead of triggering visibilitychange, trigger a flush via beforeunload
    window.dispatchEvent(new Event('beforeunload'));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(PersistenceError);
    expect((onError.mock.calls[0][0] as PersistenceError).code).toBe('SAVE_FAILED');

    autoSave.destroy();
  });
});

describe('TableEvents error/warning event map is well-typed', () => {
  it('accepts a DataTableError on the error event', () => {
    const emitter = new EventEmitter<TableEvents>();
    const spy = vi.fn();
    emitter.on('error', spy);
    const err = new LoadError('bad', { code: 'PARSE_FAILED' });
    emitter.emit('error', { error: err, source: 'load' });
    expect(spy).toHaveBeenCalledWith({ error: err, source: 'load' });
  });

  it('accepts a warning payload with optional details', () => {
    const emitter = new EventEmitter<TableEvents>();
    const spy = vi.fn();
    emitter.on('warning', spy);
    emitter.emit('warning', {
      code: 'STYLESHEET_MISSING',
      message: 'nope',
      details: { x: 1 },
    });
    expect(spy).toHaveBeenCalledWith({
      code: 'STYLESHEET_MISSING',
      message: 'nope',
      details: { x: 1 },
    });
  });
});
