/**
 * A session restore brings back the snapshot's filters, sort and column
 * layout in one change with its derived columns. Written first, a filter or
 * sort naming a derived column started reads and a filtered-row count
 * against the base table, before the VIEW that has the column existed: the
 * count failed, and with visualizations off nothing counted again, so the
 * rows past the true count stayed placeholders.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createTableState } from '@/core/State';
import { UndoManager } from '@/core/UndoManager';
import type { FilterPresetManager } from '@/filters/FilterPresets';
import type { ColumnSchema, Filter } from '@/core/types';
import { serializeFilter, type SessionStore } from '@/persistence/SessionStore';
import { SNAPSHOT_VERSION, type SessionSnapshot } from '@/persistence/types';
import { CrossfilterCoordinator } from '@/visualizations/CrossfilterCoordinator';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { makeNodeBridge } from '../helpers/nodeBridge';
import { makeRowFetchBridge, type CapturedQuery } from '../helpers/rowFetchBridge';

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
];

const X2_FILTER: Filter = { type: 'range', column: 'x2', min: 30, max: 100, maxInclusive: true };

function snapshotWith(
  derived: { name: string; expression: string },
  filter: Filter,
): SessionSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    timestamp: Date.now(),
    tableName: 't',
    filters: [serializeFilter(filter)],
    sortColumns: [{ column: derived.name, direction: 'desc' }],
    visibleColumns: ['id', derived.name],
    columnOrder: ['id', derived.name],
    columnWidths: {},
    pinnedColumns: [],
    hiddenColumnInfo: {},
    derivedColumns: [{ kind: 'expression', ...derived }],
  };
}

function storeWith(snapshot: unknown): SessionStore {
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

describe('a session restore with derived columns, in steps', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const state = createTableState();
    const { bridge, queries } = makeRowFetchBridge();
    bridge.loadData.mockResolvedValue({
      tableName: 't',
      rowCount: 20,
      columns: ['id'],
      schema: SCHEMA,
    });
    const actions = new StateActions(
      state,
      bridge as unknown as ConstructorParameters<typeof StateActions>[1],
    );
    const coordinator = new CrossfilterCoordinator(
      state,
      actions,
      bridge as unknown as ConstructorParameters<typeof CrossfilterCoordinator>[2],
    );
    return { state, actions, coordinator, queries };
  }

  async function drain(): Promise<void> {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  }

  const counts = (queries: CapturedQuery[]) =>
    queries.filter((q) => q.sql.startsWith('SELECT COUNT(*)'));

  it('writes the filters and sort while the rebuild holds reads, and counts the VIEW', async () => {
    const { state, actions, coordinator, queries } = setup();
    // Whether reads of the relation could go ahead as the restore wrote its
    // filters and sort (the load's reset writes them empty first).
    const readableAtWrite: boolean[] = [];
    state.filters.subscribe((filters) => {
      if (filters.length > 0) readableAtWrite.push(actions.isRelationReadable());
    });
    state.sortColumns.subscribe((sort) => {
      if (sort.length > 0) readableAtWrite.push(actions.isRelationReadable());
    });

    const loading = actions.loadData('id\n1', {
      format: 'csv',
      sessionStore: storeWith(snapshotWith({ name: 'x2', expression: 'id * 2' }, X2_FILTER)),
    });
    // The rebuild: validation, type detection, the VIEW. No count goes out
    // before the VIEW does.
    for (const rows of [[], [{ t: 'INTEGER' }], []]) {
      await drain();
      await vi.advanceTimersByTimeAsync(0);
      expect(counts(queries)).toEqual([]);
      queries.at(-1)!.deferred.resolve(rows);
    }
    await loading;
    expect(readableAtWrite).toEqual([false, false]);
    expect(state.tableName.get()).toBe('__dt_view_t__');

    await vi.advanceTimersByTimeAsync(0);
    const [count] = counts(queries);
    expect(count!.sql).toContain('FROM "__dt_view_t__"');
    count!.deferred.resolve([{ cnt: 6 }]);
    await drain();
    expect(state.filteredRows.get()).toBe(6);
    expect(state.filters.get()).toEqual([X2_FILTER]);
    expect(state.sortColumns.get()).toEqual([{ column: 'x2', direction: 'desc' }]);
    coordinator.destroy();
  });

  it('drops what the snapshot restored for derived columns that do not come back', async () => {
    const { state, actions, coordinator, queries } = setup();
    const loading = actions.loadData('id\n1', {
      format: 'csv',
      sessionStore: storeWith(
        snapshotWith(
          { name: 'bad', expression: 'nope * 2' },
          { type: 'range', column: 'bad', min: 1, max: 9 },
        ),
      ),
    });
    await drain();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    queries.at(-1)!.deferred.reject(new Error('Binder Error: Referenced column "nope" not found'));
    await loading;
    warn.mockRestore();

    expect(state.derivedColumns.get()).toEqual([]);
    expect(state.filters.get()).toEqual([]);
    expect(state.sortColumns.get()).toEqual([]);
    expect(state.visibleColumns.get()).toEqual(['id']);
    expect(state.columnOrder.get()).toEqual(['id']);
    expect(state.tableName.get()).toBe('t');
    coordinator.destroy();
  });

  it('drops the tooltip, width, filter and sort of a derived column that does not come back', async () => {
    const { state, actions, coordinator, queries } = setup();
    const snapshot = {
      ...snapshotWith(
        { name: 'x2', expression: 'id * 2' },
        { type: 'range', column: 'bad', min: 1, max: 9 },
      ),
      sortColumns: [{ column: 'bad', direction: 'asc' }],
      visibleColumns: ['id', 'x2', 'bad'],
      columnOrder: ['id', 'x2', 'bad'],
      columnWidths: { bad: 200, x2: 120 },
      columnHeaderTooltips: { bad: 'about bad', x2: 'about x2' },
      derivedColumns: [
        { kind: 'expression', name: 'x2', expression: 'id * 2' },
        { kind: 'expression', name: 'bad', expression: 'nope * 2' },
      ],
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loading = actions.loadData('id\n1', { format: 'csv', sessionStore: storeWith(snapshot) });
    // x2: validation, type detection, the VIEW; then bad's validation fails.
    for (const step of ['ok', 'type', 'ok', 'fail'] as const) {
      await drain();
      await vi.advanceTimersByTimeAsync(0);
      const query = queries.at(-1)!;
      if (step === 'fail') query.deferred.reject(new Error('Binder Error: nope'));
      else query.deferred.resolve(step === 'type' ? [{ t: 'INTEGER' }] : []);
    }
    await loading;
    warn.mockRestore();

    expect(state.derivedColumns.get().map((d) => d.name)).toEqual(['x2']);
    expect(state.tableName.get()).toBe('__dt_view_t__');
    expect(state.filters.get()).toEqual([]);
    expect(state.sortColumns.get()).toEqual([]);
    expect(state.visibleColumns.get()).toEqual(['id', 'x2']);
    expect([...state.columnWidths.get().keys()]).toEqual(['x2']);
    expect([...state.columnHeaderTooltips.get().keys()]).toEqual(['x2']);
    coordinator.destroy();
  });
});

describe('a session restore with derived columns, against DuckDB', () => {
  let harness: NodeDuckDBHarness;

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    await harness.conn.query(
      'CREATE TABLE t AS SELECT range::INTEGER AS id, range - 1 AS __rowid__ FROM range(1, 21)',
    );
  }, 30_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  it('counts the rows a restored filter on a derived column keeps, with nothing failing', async () => {
    const state = createTableState();
    const failed: string[] = [];
    const base = makeNodeBridge(harness.conn);
    const bridge = {
      ...base,
      query: async (sql: string) => {
        try {
          return await base.query(sql);
        } catch (err) {
          failed.push(sql);
          throw err;
        }
      },
      loadData: async () => ({ tableName: 't', rowCount: 20, columns: ['id'], schema: SCHEMA }),
      clearQueryCache: () => {},
    } as unknown as ConstructorParameters<typeof StateActions>[1];
    const actions = new StateActions(state, bridge);
    const coordinator = new CrossfilterCoordinator(state, actions, bridge);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await actions.loadData('id\n1', {
        format: 'csv',
        sessionStore: storeWith(snapshotWith({ name: 'x2', expression: 'id * 2' }, X2_FILTER)),
      });
      // x2 = 2, 4, …, 40: from 30 on, the 6 rows of ids 15 to 20.
      await vi.waitFor(() => expect(state.filteredRows.get()).toBe(6), { timeout: 5_000 });
      expect(failed).toEqual([]);
      expect(error).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
      coordinator.destroy();
    }
  });
});

describe('a saved session that cannot be read', () => {
  function setup() {
    const state = createTableState();
    const { bridge, queries } = makeRowFetchBridge();
    bridge.loadData.mockResolvedValue({
      tableName: 't',
      rowCount: 20,
      columns: ['id'],
      schema: SCHEMA,
    });
    const undoManager = new UndoManager();
    const actions = new StateActions(
      state,
      bridge as unknown as ConstructorParameters<typeof StateActions>[1],
      undoManager,
    );
    return { state, actions, queries, undoManager };
  }

  /** Load with `snapshot`; returns the warnings logged, and fails on a rejected load. */
  async function load(
    snapshot: unknown,
  ): Promise<{ h: ReturnType<typeof setup>; warnings: string[] }> {
    const h = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await h.actions.loadData('id\n1', { format: 'csv', sessionStore: storeWith(snapshot) });
      return { h, warnings: warn.mock.calls.map((call) => String(call[0])) };
    } finally {
      warn.mockRestore();
    }
  }

  const malformed = {
    ...snapshotWith({ name: 'x2', expression: 'id * 2' }, X2_FILTER),
    columnWidths: null,
  };

  it.each([
    ['with derived columns', malformed],
    ['without derived columns', { ...malformed, filters: [], sortColumns: [], derivedColumns: [] }],
    [
      // Its derived columns are written before the undo stack is read.
      'with derived columns, part-way',
      { ...snapshotWith({ name: 'x2', expression: 'id * 2' }, X2_FILTER), undoStack: [null] },
    ],
  ])('loads without it, %s, and says so', async (_, snapshot) => {
    const { h, warnings } = await load(snapshot);
    expect(warnings).toEqual([
      '[data-table] Could not restore the saved session; loading without it:',
    ]);
    expect(h.state.tableName.get()).toBe('t');
    expect(h.state.derivedColumns.get()).toEqual([]);
    expect(h.state.filters.get()).toEqual([]);
    expect(h.state.visibleColumns.get()).toEqual(['id']);
    // Nothing went to DuckDB for the derived column.
    expect(h.queries).toEqual([]);
  });

  it('takes back what it had written when it fails part-way', async () => {
    // The layout and filters are written before the undo stack is read.
    const { h, warnings } = await load({
      ...snapshotWith(
        { name: 'x2', expression: 'id * 2' },
        { type: 'range', column: 'id', min: 1, max: 9 },
      ),
      derivedColumns: [],
      visibleColumns: ['id'],
      columnOrder: ['id'],
      columnHeaderTooltips: { id: 'the id' },
      undoStack: [null],
    });
    expect(warnings).toHaveLength(1);
    expect(h.state.filters.get()).toEqual([]);
    expect(h.state.sortColumns.get()).toEqual([]);
    expect(h.state.columnHeaderTooltips.get().size).toBe(0);
    expect(h.undoManager.canUndo).toBe(false);
    // And the load's own state is what a reset goes back to.
    h.actions.addFilter({ type: 'range', column: 'id', min: 2, max: 5 });
    await expect(h.actions.resetToInitial()).resolves.toBe(true);
    expect(h.state.filters.get()).toEqual([]);
  });

  it('takes back the undo stacks it had loaded when a later part fails', async () => {
    const h = setup();
    const layout = {
      sortColumns: [],
      visibleColumns: ['id'],
      columnOrder: ['id'],
      columnWidths: {},
      pinnedColumns: [],
      hiddenColumnInfo: {},
      derivedColumns: [],
    };
    const presetManager = {
      loadPresets: vi.fn(() => {
        throw new TypeError('malformed presets');
      }),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await h.actions.loadData('id\n1', {
        format: 'csv',
        sessionStore: storeWith({
          ...layout,
          version: SNAPSHOT_VERSION,
          timestamp: Date.now(),
          tableName: 't',
          filters: [],
          undoStack: [{ ...layout, filters: [] }],
          filterPresets: [{ id: 'p', name: 'p', filters: [], createdAt: 0, updatedAt: 0 }],
        }),
        presetManager: presetManager as unknown as FilterPresetManager,
      });
    } finally {
      warn.mockRestore();
    }
    expect(presetManager.loadPresets).toHaveBeenCalled();
    expect(h.undoManager.canUndo).toBe(false);
  });
});
