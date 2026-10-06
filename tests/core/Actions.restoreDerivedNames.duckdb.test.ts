/**
 * A derived column that a session restore, an undo or a redo brings back
 * takes its name only as an added one does: not a name another column has
 * in any letter case (see `columnNames`), since DuckDB binds names that way.
 * Restored without that check, a derived `Total` beside a base column
 * `total` was renamed `Total_1` in the VIEW, and every read of "Total",
 * the grid's included, returned `total`'s values. A 0.8.x session, which
 * took `LABEL` beside `label`, did the same. Such a column is dropped as one
 * that cannot be rebuilt is: with a warning, and with the filters, sort and
 * layout the snapshot gave it.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { createTableState } from '@/core/State';
import { captureSnapshot, UndoManager } from '@/core/UndoManager';
import { filtersToWhereClause } from '@/filters/FilterSQL';
import { snapshotFromState } from '@/persistence/serialization';
import type { SessionStore } from '@/persistence/SessionStore';
import type { SessionSnapshot } from '@/persistence/types';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { makeNodeBridge } from '../helpers/nodeBridge';

let harness: NodeDuckDBHarness;
let bridge: ReturnType<typeof makeNodeBridge>;

beforeAll(async () => {
  harness = await createNodeDuckDB();
  bridge = { ...makeNodeBridge(harness.conn, harness.db), clearQueryCache: () => {} } as ReturnType<
    typeof makeNodeBridge
  >;
}, 30_000);

afterAll(async () => {
  await harness?.cleanup();
});

/** A store that hands back `snapshot` for any table. */
function storeWith(snapshot: () => SessionSnapshot | null): SessionStore {
  return { load: async () => snapshot() } as unknown as SessionStore;
}

function derivedNames(state: ReturnType<typeof createTableState>): string[] {
  return state.schema
    .get()
    .filter((c) => c.isDerived)
    .map((c) => c.name);
}

/** The rows the table's filters keep, counted as the filtered-row count is. */
async function filteredCount(state: ReturnType<typeof createTableState>): Promise<number> {
  const where = filtersToWhereClause(state.filters.get());
  const [row] = await bridge.query<{ n: number }>(
    `SELECT count(*) AS n FROM "${state.tableName.get()}"${where ? ` WHERE ${where}` : ''}`,
  );
  return row!.n;
}

/** Load `csv` as `tableName` with `snapshot` to restore, catching what it warns. */
async function restore(csv: string, tableName: string, snapshot: SessionSnapshot | null) {
  const state = createTableState();
  const undoManager = new UndoManager();
  const actions = new StateActions(state, bridge, undoManager);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await actions.loadData(csv, {
      tableName,
      format: 'csv',
      sessionStore: storeWith(() => snapshot),
    });
    return { state, actions, undoManager, warnings: warn.mock.calls.map((call) => call[0]) };
  } finally {
    warn.mockRestore();
  }
}

describe('a restored derived column named as another column, ignoring case', () => {
  it('is dropped when the new data has a base column of that name', async () => {
    // Session 1: file A, with a derived Total, a filter and a sort on it,
    // and a derived column whose name no other column has.
    const first = await restore('price,qty\n2,3\n5,7\n', 'orders', null);
    await first.actions.addDerivedColumn({
      kind: 'expression',
      name: 'Total',
      expression: 'price * qty',
    });
    await first.actions.addDerivedColumn({
      kind: 'expression',
      name: 'double_price',
      expression: 'price * 2',
    });
    first.actions.addFilter({ type: 'range', column: 'Total', min: 30, max: 40 });
    first.actions.toggleSort('Total');
    first.actions.setColumnWidth('Total', 180);
    const saved = snapshotFromState(first.state);

    // Session 2: file B, saved under the same name, has a base column total.
    const second = await restore('price,qty,total\n2,3,999\n5,7,888\n', 'orders', saved);
    expect(second.warnings).toEqual([expect.stringContaining('"Total"')]);
    expect(derivedNames(second.state)).toEqual(['double_price']);
    expect(second.state.derivedColumns.get().map((d) => d.name)).toEqual(['double_price']);
    expect(second.state.filters.get()).toEqual([]);
    expect(second.state.sortColumns.get()).toEqual([]);
    expect(second.state.columnOrder.get()).not.toContain('Total');
    expect(second.state.visibleColumns.get()).not.toContain('Total');
    expect(second.state.columnWidths.get().has('Total')).toBe(false);

    // total reads its own values, in the VIEW the other column is in.
    expect(second.state.tableName.get()).toBe('__dt_view_orders__');
    expect(await second.actions.getColumnValues('total')).toEqual(new BigInt64Array([999n, 888n]));
    expect(await second.actions.getColumnValues('double_price')).toEqual(
      new BigInt64Array([4n, 10n]),
    );
    expect(await filteredCount(second.state)).toBe(2);
  });

  it('is dropped from a 0.8.x session, which took LABEL beside label', async () => {
    const snapshot: SessionSnapshot = {
      version: 5,
      timestamp: 0,
      tableName: 'people',
      filters: [{ type: 'point', column: 'LABEL', value: 'ANN' }],
      sortColumns: [],
      visibleColumns: ['label', 'total', 'LABEL'],
      columnOrder: ['__rowid__', 'label', 'total', 'LABEL'],
      columnWidths: {},
      pinnedColumns: [],
      hiddenColumnInfo: {},
      derivedColumns: [{ kind: 'expression', name: 'LABEL', expression: 'upper(label)' }],
    };
    const { state, actions, warnings } = await restore(
      'label,total\nann,1\nbob,2\n',
      'people',
      snapshot,
    );
    expect(warnings).toEqual([expect.stringContaining('"LABEL"')]);
    expect(derivedNames(state)).toEqual([]);
    expect(state.derivedColumns.get()).toEqual([]);
    expect(state.tableName.get()).toBe('people');
    expect(state.filters.get()).toEqual([]);
    expect(state.visibleColumns.get()).toEqual(['label', 'total']);
    expect(await actions.getColumnValues('label')).toEqual(['ann', 'bob']);
    expect(await filteredCount(state)).toBe(2);
  });

  it('is dropped when another derived column of the snapshot took the name first', async () => {
    const snapshot: SessionSnapshot = {
      version: 5,
      timestamp: 0,
      tableName: 'pairs',
      filters: [],
      sortColumns: [],
      visibleColumns: ['n', 'x', 'X'],
      columnOrder: ['__rowid__', 'n', 'x', 'X'],
      columnWidths: {},
      pinnedColumns: [],
      hiddenColumnInfo: {},
      derivedColumns: [
        { kind: 'expression', name: 'x', expression: 'n + 1' },
        { kind: 'expression', name: 'X', expression: 'n + 2' },
      ],
    };
    const { state, actions, warnings } = await restore('n\n1\n2\n', 'pairs', snapshot);
    expect(warnings).toEqual([expect.stringContaining('"X"')]);
    expect(derivedNames(state)).toEqual(['x']);
    expect(state.visibleColumns.get()).toEqual(['n', 'x']);
    expect(await actions.getColumnValues('x')).toEqual(new BigInt64Array([2n, 3n]));
  });

  it('is dropped by an undo to a state that had it', async () => {
    const { state, actions, undoManager } = await restore(
      'label,n\nann,1\nbob,2\n',
      'undone',
      null,
    );
    await actions.addDerivedColumn({ kind: 'expression', name: 'n2', expression: 'n * 2' });
    // An undo entry a 0.8.x session saved: LABEL beside label, filtered.
    const entry = captureSnapshot(state);
    entry.derivedColumns = [
      { kind: 'expression', name: 'n2', expression: 'n * 2' },
      { kind: 'expression', name: 'LABEL', expression: 'upper(label)' },
    ];
    entry.filters = [{ type: 'point', column: 'LABEL', value: 'ANN' }];
    entry.visibleColumns = [...entry.visibleColumns, 'LABEL'];
    entry.columnOrder = [...entry.columnOrder, 'LABEL'];
    undoManager.push(entry);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(actions.undo()).resolves.toBe(true);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('"LABEL"'), expect.anything());
    } finally {
      warn.mockRestore();
    }
    expect(derivedNames(state)).toEqual(['n2']);
    expect(state.derivedColumns.get().map((d) => d.name)).toEqual(['n2']);
    expect(state.filters.get()).toEqual([]);
    expect(state.visibleColumns.get()).not.toContain('LABEL');
    expect(state.columnOrder.get()).not.toContain('LABEL');
    expect(await actions.getColumnValues('label')).toEqual(['ann', 'bob']);
    expect(await filteredCount(state)).toBe(2);
  });
});
