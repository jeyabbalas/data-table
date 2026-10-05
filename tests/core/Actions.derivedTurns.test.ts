/**
 * Derived-column changes take turns: an add, edit, replacement or removal,
 * an undo or redo, a reset and a load run one at a time, in call order, and
 * each validates against the state the ones before it left. Two changes
 * running together shared the manager's list of columns and the VIEW.
 */
import { describe, expect, it, vi } from 'vitest';
import { StateActions } from '@/core/Actions';
import { DerivedColumnError } from '@/core/errors';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import { UndoManager } from '@/core/UndoManager';
import { serializeFilter, type SessionStore } from '@/persistence/SessionStore';
import { SNAPSHOT_VERSION, type SessionSnapshot } from '@/persistence/types';

import { makeRowFetchBridge, type CapturedQuery } from '../helpers/rowFetchBridge';

const VIEW = '__dt_view_t__';

function setup(undoManager?: UndoManager) {
  const state = createTableState();
  state.tableName.set('t');
  state.baseTableName.set('t');
  state.totalRows.set(3);
  initializeColumnsFromSchema(state, [
    { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  ]);
  const { bridge, queries } = makeRowFetchBridge();
  const actions = new StateActions(
    state,
    bridge as unknown as ConstructorParameters<typeof StateActions>[1],
    undoManager,
  );
  return { state, actions, queries, bridge, answered: new Set<CapturedQuery>() };
}

type Harness = ReturnType<typeof setup>;

async function drain(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

/** What DuckDB would answer: a type for `DESCRIBE SELECT (…)`, no rows otherwise. */
function reply(query: CapturedQuery): unknown[] {
  return /^DESCRIBE SELECT \(/.test(query.sql)
    ? [{ column_name: 'v', column_type: 'INTEGER' }]
    : [];
}

/** Answer one query and let what it unblocks run. */
async function answer(h: Harness, query: CapturedQuery): Promise<void> {
  h.answered.add(query);
  query.deferred.resolve(reply(query));
  await drain();
}

/** Answer the oldest query not yet answered, until none is left. */
async function answerAll(h: Harness): Promise<void> {
  await drain();
  for (let query = pending(h)[0]; query; query = pending(h)[0]) await answer(h, query);
}

function pending(h: Harness): CapturedQuery[] {
  return h.queries.filter((q) => !h.answered.has(q));
}

/** Add `x2 = id * 2` and let it land. */
async function landX2(h: Harness): Promise<void> {
  const add = h.actions.addDerivedColumn({ kind: 'expression', name: 'x2', expression: 'id * 2' });
  await answerAll(h);
  await expect(add).resolves.toEqual({ success: true });
}

const vector = (name: string) =>
  ({ kind: 'vector', name, vectorType: 'integer', values: [1, 2, 3] }) as const;

/** Start a vector add and answer it up to its one INSERT, which it waits on. */
async function vectorAddAtInsert(h: Harness, name: string) {
  const add = h.actions.addDerivedColumn(vector(name));
  await drain();
  for (let query = pending(h)[0]; query && !/^INSERT/.test(query.sql); query = pending(h)[0]) {
    await answer(h, query);
  }
  const insert = pending(h)[0]!;
  expect(insert.sql).toMatch(/^INSERT INTO "__dt_vec_/);
  return { add, insert };
}

function derivedNames(h: Harness): string[] {
  return h.state.schema
    .get()
    .filter((c) => c.isDerived)
    .map((c) => c.name);
}

/** Hold the next load at the worker, as a large file does, until `finish()`. */
function stubLoad(h: Harness) {
  let finish!: () => void;
  h.bridge.loadData.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = () =>
          resolve({
            tableName: 't2',
            rowCount: 5,
            columns: ['n'],
            schema: [{ name: 'n', type: 'integer', nullable: true, originalType: 'INTEGER' }],
          });
      }),
  );
  return { finish: () => finish() };
}

describe('derived-column changes take turns', () => {
  it('holds a removal back until a vector add at its last INSERT has landed', async () => {
    const h = setup();
    await landX2(h);
    const { add, insert } = await vectorAddAtInsert(h, 'v');

    const removal = h.actions.removeDerivedColumn('x2');
    await drain();
    // Nothing goes out for the removal while the add runs, and reads of the
    // relation in force go on.
    expect(pending(h)).toEqual([insert]);
    expect(h.actions.isRelationReadable()).toBe(true);
    expect(h.actions.isRelationChanging()).toBe(true);

    await answer(h, insert);
    const addView = pending(h)[0]!;
    expect(addView.sql).toMatch(/^CREATE OR REPLACE VIEW/);
    await answer(h, addView);
    await expect(add).resolves.toEqual({ success: true });
    expect(h.state.tableName.get()).toBe(VIEW);
    expect(derivedNames(h)).toEqual(['x2', 'v']);

    // Its turn: x2 goes, and the VIEW is rebuilt around v.
    const removalView = pending(h)[0]!;
    expect(removalView.sql).toMatch(/^CREATE OR REPLACE VIEW/);
    expect(removalView.sql).not.toContain('id * 2');
    expect(h.actions.isRelationReadable()).toBe(false);
    await answer(h, removalView);
    await removal;
    expect(pending(h)).toEqual([]);
    expect(h.state.tableName.get()).toBe(VIEW);
    expect(derivedNames(h)).toEqual(['v']);
    expect(h.state.derivedColumns.get().map((d) => d.name)).toEqual(['v']);
    expect(h.actions.isRelationReadable()).toBe(true);
    expect(h.actions.isRelationChanging()).toBe(false);
  });

  it('refuses an add of a name an add ahead of it has taken, once that one lands', async () => {
    const h = setup();
    const first = h.actions.addDerivedColumn(vector('v'));
    await drain();
    const sent = h.queries.length;
    let second: unknown = null;
    void h.actions.addDerivedColumn(vector('v')).then((result) => (second = result));
    await drain();
    expect(h.queries).toHaveLength(sent);
    expect(second).toBeNull();

    await answerAll(h);
    await expect(first).resolves.toEqual({ success: true });
    expect(second).toEqual({ success: false, error: 'Column name "v" already exists' });
    // One helper table, built once.
    expect(h.queries.filter((q) => /^CREATE TABLE/.test(q.sql))).toHaveLength(1);
  });

  it('runs an add of a name once the add ahead of it has failed', async () => {
    const h = setup();
    const first = h.actions.addDerivedColumn(vector('v'));
    await drain();
    const second = h.actions.addDerivedColumn(vector('v'));
    await drain();
    expect(h.queries).toHaveLength(1);

    h.answered.add(h.queries[0]!);
    h.queries[0]!.deferred.reject(new Error('Out of Memory'));
    await expect(first).resolves.toMatchObject({ success: false });
    await answerAll(h);
    await expect(second).resolves.toEqual({ success: true });
    expect(derivedNames(h)).toEqual(['v']);
  });

  it('refuses a rename to a name an add ahead of it has taken', async () => {
    const h = setup();
    await landX2(h);
    const { add } = await vectorAddAtInsert(h, 'v');
    const sent = h.queries.length;

    const rename = h.actions.updateDerivedColumn('x2', {
      kind: 'expression',
      name: 'v',
      expression: 'id * 2',
    });
    await drain();
    expect(h.queries).toHaveLength(sent);

    await answerAll(h);
    await expect(add).resolves.toEqual({ success: true });
    await expect(rename).resolves.toEqual({
      success: false,
      error: 'Column name "v" already exists',
    });
    expect(derivedNames(h)).toEqual(['x2', 'v']);
  });

  it('keeps a column added while an edit waited: the edit reads the schema in its turn', async () => {
    const h = setup();
    await landX2(h);
    const { add, insert } = await vectorAddAtInsert(h, 'a');

    const edit = h.actions.updateDerivedColumn('x2', {
      kind: 'expression',
      name: 'x2',
      expression: 'id * 3',
    });
    await drain();
    // Land the add first, then whatever the edit sends.
    await answer(h, insert);
    const addView = h.queries.findLast((q) => /^CREATE OR REPLACE VIEW/.test(q.sql))!;
    await answer(h, addView);
    await expect(add).resolves.toEqual({ success: true });
    await answerAll(h);
    await expect(edit).resolves.toEqual({ success: true });

    expect(derivedNames(h)).toEqual(['x2', 'a']);
    expect(h.state.schema.get().find((c) => c.name === 'x2')?.expression).toBe('id * 3');
    expect(h.state.visibleColumns.get()).toEqual(['id', 'x2', 'a']);
  });

  it('undoes the add an undo was pressed during', async () => {
    const h = setup(new UndoManager());
    h.actions.addFilter({ type: 'range', column: 'id', min: 1 });
    const add = h.actions.addDerivedColumn({
      kind: 'expression',
      name: 'x2',
      expression: 'id * 2',
    });
    await drain();

    const undo = h.actions.undo();
    await drain();
    // The filter is still there: the undo waits for the add.
    expect(h.state.filters.get()).toHaveLength(1);

    await answerAll(h);
    await expect(add).resolves.toEqual({ success: true });
    await expect(undo).resolves.toBe(true);
    expect(derivedNames(h)).toEqual([]);
    expect(h.state.tableName.get()).toBe('t');
    expect(h.state.filters.get()).toHaveLength(1);
    expect(h.actions.getUndoManager()!.canUndo).toBe(true);
    expect(h.actions.getUndoManager()!.canRedo).toBe(true);
  });

  it('keeps an edit made while an add ran when the add is undone', async () => {
    const h = setup(new UndoManager());
    const add = h.actions.addDerivedColumn({
      kind: 'expression',
      name: 'x2',
      expression: 'id * 2',
    });
    await drain();
    h.actions.addFilter({ type: 'range', column: 'id', min: 1 });
    await answerAll(h);
    await expect(add).resolves.toEqual({ success: true });

    const undo = h.actions.undo();
    await answerAll(h);
    await expect(undo).resolves.toBe(true);
    expect(derivedNames(h)).toEqual([]);
    expect(h.state.filters.get()).toHaveLength(1);

    // And the next undo takes the filter away.
    await expect(h.actions.undo()).resolves.toBe(true);
    expect(h.state.filters.get()).toHaveLength(0);
  });

  it('drops an undo asked for while another waits, and redoes in turn', async () => {
    const h = setup(new UndoManager());
    await landX2(h);
    const removal = h.actions.removeDerivedColumn('x2');
    await drain();
    const undo = h.actions.undo();
    await expect(h.actions.undo()).resolves.toBe(false);
    await expect(h.actions.redo()).resolves.toBe(false);
    await answerAll(h);
    await removal;
    await expect(undo).resolves.toBe(true);
    expect(derivedNames(h)).toEqual(['x2']);

    const redo = h.actions.redo();
    await answerAll(h);
    await expect(redo).resolves.toBe(true);
    expect(derivedNames(h)).toEqual([]);
  });

  it('applies an undo that restores no derived column at once, with nothing in line', async () => {
    const h = setup(new UndoManager());
    h.actions.addFilter({ type: 'range', column: 'id', min: 1 });
    h.actions.addFilter({ type: 'range', column: 'id', min: 2 });
    void h.actions.undo();
    expect(h.state.filters.get()[0]).toMatchObject({ min: 1 });
    void h.actions.undo();
    expect(h.state.filters.get()).toEqual([]);
    void h.actions.redo();
    expect(h.state.filters.get()[0]).toMatchObject({ min: 1 });
  });

  it('starts the next change at once after a reset that dropped no derived column', async () => {
    const h = setup(new UndoManager());
    void h.actions.resetToInitial();
    void h.actions.addDerivedColumn({ kind: 'expression', name: 'x2', expression: 'id * 2' });
    expect(h.queries).toHaveLength(1);
    expect(h.actions.isRelationChanging()).toBe(true);
    await answerAll(h);
    expect(derivedNames(h)).toEqual(['x2']);
  });

  it('emits no derivedChange when it empties a table without derived columns', async () => {
    const h = setup(new UndoManager());
    const kinds: string[] = [];
    h.actions.setOnDerivedChange(({ kind }) => kinds.push(kind));
    await expect(h.actions.clearData()).resolves.toBe('t');
    await expect(h.actions.clearData()).resolves.toBeNull();
    expect(kinds).toEqual([]);
  });

  it('emits derivedChange when a reset drops the derived columns', async () => {
    const h = setup(new UndoManager());
    h.bridge.loadData.mockResolvedValueOnce({
      tableName: 't',
      rowCount: 3,
      columns: ['id'],
      schema: [{ name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' }],
    });
    await h.actions.loadData('id\n1\n2\n3', { format: 'csv' });
    const kinds: string[] = [];
    h.actions.setOnDerivedChange(({ kind }) => kinds.push(kind));
    h.actions.addFilter({ type: 'range', column: 'id', min: 1, max: 2 });
    await expect(h.actions.resetToInitial()).resolves.toBe(true);
    expect(kinds).toEqual([]);

    await landX2(h);
    const reset = h.actions.resetToInitial();
    await answerAll(h);
    await expect(reset).resolves.toBe(true);
    expect(kinds).toEqual(['added', 'updated']);
  });

  it('resolves an add, edit or replacement asked for after destroy at once', async () => {
    const h = setup();
    await landX2(h);
    void h.actions.addDerivedColumn({ kind: 'expression', name: 'x3', expression: 'id * 3' });
    await drain();
    h.actions.markDestroyed();
    const settled: unknown[] = [];
    void h.actions
      .addDerivedColumn({ kind: 'expression', name: 'x4', expression: 'id' })
      .then((r) => settled.push(r));
    void h.actions
      .updateDerivedColumn('x2', { kind: 'expression', name: 'x2', expression: 'id' })
      .then((r) => settled.push(r));
    void h.actions
      .replaceDerivedColumn('x2', { kind: 'expression', name: 'x2', expression: 'id' })
      .then((r) => settled.push(r));
    await drain();
    // The add running ahead of them has not landed.
    expect(settled).toEqual([
      { success: false, error: 'DataTable is destroyed' },
      { success: false, error: 'DataTable is destroyed' },
      { success: false, error: expect.objectContaining({ code: 'DESTROYED' }) },
    ]);
  });

  it('empties the table once a change running as the table is cleared has ended', async () => {
    const h = setup(new UndoManager());
    // Loaded through the actions, so that there is an initial state to forget.
    h.bridge.loadData.mockResolvedValueOnce({
      tableName: 't',
      rowCount: 3,
      columns: ['id'],
      schema: [{ name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' }],
    });
    await h.actions.loadData('id\n1\n2\n3', { format: 'csv' });
    await landX2(h);
    const add = h.actions.addDerivedColumn({
      kind: 'expression',
      name: 'x3',
      expression: 'id * 3',
    });
    await drain();
    const kinds: { kind: string; derivedColumns: unknown[] }[] = [];
    h.actions.setOnDerivedChange(({ kind, derivedColumns }) =>
      kinds.push({ kind, derivedColumns }),
    );
    const clearing = h.actions.clearData();
    await answerAll(h);
    await expect(add).resolves.toEqual({
      success: false,
      error: 'New data was loaded, or the table cleared, before the change was applied',
    });
    // It names the base table it emptied, for the facade to drop.
    await expect(clearing).resolves.toBe('t');
    // One derivedChange, for x2 going: the add turned away emits none.
    expect(kinds).toEqual([{ kind: 'updated', derivedColumns: [] }]);

    expect(h.state.tableName.get()).toBeNull();
    expect(h.state.schema.get()).toEqual([]);
    expect(h.state.visibleColumns.get()).toEqual([]);
    expect(h.state.derivedColumns.get()).toEqual([]);
    expect(h.actions.getUndoManager()!.canUndo).toBe(false);
    await expect(h.actions.resetToInitial()).resolves.toBe(false);
    // The derived columns' VIEW went with the rest.
    expect(h.queries.at(-1)!.sql).toMatch(/^DROP VIEW IF EXISTS "__dt_view_t__"/);
  });
});

describe('a load while derived-column changes wait or run', () => {
  it('starts once the change running now has ended, which then writes no state', async () => {
    const h = setup(new UndoManager());
    const load = stubLoad(h);
    const add = h.actions.addDerivedColumn({
      kind: 'expression',
      name: 'x2',
      expression: 'id * 2',
    });
    await drain();

    const loading = h.actions.loadData('n\n1\n2', { format: 'csv' });
    await drain();
    expect(h.bridge.loadData).not.toHaveBeenCalled();

    await answerAll(h);
    await expect(add).resolves.toEqual({
      success: false,
      error: 'New data was loaded, or the table cleared, before the change was applied',
    });
    await drain();
    expect(h.bridge.loadData).toHaveBeenCalledTimes(1);
    load.finish();
    await answerAll(h);
    await loading;

    expect(h.state.tableName.get()).toBe('t2');
    expect(h.state.schema.get().map((c) => c.name)).toEqual(['n']);
    expect(h.state.derivedColumns.get()).toEqual([]);
    expect(h.actions.getUndoManager()!.canUndo).toBe(false);
    // The add's VIEW, built for the old data, is dropped with its manager.
    expect(h.queries.at(-1)!.sql).toMatch(/^DROP VIEW IF EXISTS "__dt_view_t__"/);
  });

  it('turns away the changes waiting behind it, sending nothing for them', async () => {
    const h = setup(new UndoManager());
    // Load through the actions, so that a reset has a state to go back to.
    h.bridge.loadData.mockResolvedValueOnce({
      tableName: 't',
      rowCount: 3,
      columns: ['id'],
      schema: [{ name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' }],
    });
    await h.actions.loadData('id\n1\n2\n3', { format: 'csv' });
    await landX2(h);
    const load = stubLoad(h);
    const sentBefore = h.queries.length;
    const running = h.actions.addDerivedColumn({
      kind: 'expression',
      name: 'x3',
      expression: 'id * 3',
    });
    await drain();
    const waitingAdd = h.actions.addDerivedColumn({
      kind: 'expression',
      name: 'x4',
      expression: 'id * 4',
    });
    const waitingRemoval = h.actions.removeDerivedColumn('x2');
    const waitingReplace = h.actions.replaceDerivedColumn('x2', {
      kind: 'expression',
      name: 'x2',
      expression: 'id * 5',
    });
    const waitingUndo = h.actions.undo();
    const waitingReset = h.actions.resetToInitial();
    const loading = h.actions.loadData('n\n1\n2', { format: 'csv' });

    await answerAll(h);
    await expect(running).resolves.toMatchObject({ success: false });
    await expect(waitingAdd).resolves.toEqual({
      success: false,
      error: 'New data was loaded, or the table cleared, before the change was applied',
    });
    const removalError = await waitingRemoval.catch((err: unknown) => err);
    expect(removalError).toBeInstanceOf(DerivedColumnError);
    expect(removalError).toMatchObject({ code: 'NOT_FOUND', details: { column: 'x2' } });
    const replaced = await waitingReplace;
    expect(replaced.success).toBe(false);
    expect(!replaced.success && replaced.error.code).toBe('NOT_FOUND');
    await expect(waitingUndo).resolves.toBe(false);
    await expect(waitingReset).resolves.toBe(false);

    load.finish();
    await answerAll(h);
    await loading;
    // The running add's three statements, then the old manager's DROP: none
    // for the changes that waited.
    expect(h.queries.slice(sentBefore).map((q) => q.sql.slice(0, 32))).toEqual([
      expect.stringMatching(/^SELECT NULL FROM \(SELECT \(id \* 3/),
      expect.stringMatching(/^DESCRIBE SELECT \(id \* 3\) AS v/),
      expect.stringMatching(/^CREATE OR REPLACE VIEW/),
      expect.stringMatching(/^DROP VIEW IF EXISTS/),
    ]);
    expect(h.state.tableName.get()).toBe('t2');
    expect(h.state.derivedColumns.get()).toEqual([]);
  });

  it("resolves once the old data's derived tables are dropped", async () => {
    const h = setup();
    const add = h.actions.addDerivedColumn(vector('v'));
    await answerAll(h);
    await expect(add).resolves.toEqual({ success: true });
    const load = stubLoad(h);

    let loaded = false;
    const loading = h.actions.loadData('n\n1\n2', { format: 'csv' });
    void loading.then(() => (loaded = true));
    await drain();
    load.finish();
    await drain();
    const dropHelper = pending(h)[0]!;
    expect(dropHelper.sql).toMatch(/^DROP TABLE IF EXISTS "__dt_vec_0_v_0__"/);
    // A derived column added to the new data next would build a helper table
    // of the same name, which a DROP landing late would take away.
    expect(loaded).toBe(false);

    await answerAll(h);
    await loading;
    expect(h.queries.at(-1)!.sql).toMatch(/^DROP VIEW IF EXISTS "__dt_view_t__"/);
    expect(h.state.tableName.get()).toBe('t2');
  });

  /**
   * Start `change` on landed x2, let its DuckDB work begin, ask for a load,
   * and settle both. Returns how the change ended; it emits no
   * `derivedChange`, and the state is the new data's.
   */
  async function loadWhileRunning(
    h: Harness,
    change: () => Promise<unknown>,
  ): Promise<{ value?: unknown; error?: unknown }> {
    const kinds: string[] = [];
    h.actions.setOnDerivedChange(({ kind }) => kinds.push(kind));
    const load = stubLoad(h);
    const running = change();
    await drain();
    expect(pending(h).length).toBeGreaterThan(0);
    const loading = h.actions.loadData('n\n1\n2', { format: 'csv' });
    await answerAll(h);
    const outcome = await running.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    load.finish();
    await answerAll(h);
    await loading;
    expect(kinds).toEqual([]);
    expect(h.state.tableName.get()).toBe('t2');
    expect(h.state.derivedColumns.get()).toEqual([]);
    return outcome;
  }

  it('leaves the state to the load when an edit is running as it is called', async () => {
    const h = setup(new UndoManager());
    await landX2(h);
    const outcome = await loadWhileRunning(h, () =>
      h.actions.updateDerivedColumn('x2', { kind: 'expression', name: 'x2', expression: 'id * 3' }),
    );
    expect(outcome.value).toEqual({
      success: false,
      error: 'New data was loaded, or the table cleared, before the change was applied',
    });
  });

  it('leaves the state to the load when a replacement is running as it is called', async () => {
    const h = setup(new UndoManager());
    await landX2(h);
    const outcome = await loadWhileRunning(h, () =>
      h.actions.replaceDerivedColumn('x2', {
        kind: 'expression',
        name: 'x2',
        expression: 'id * 3',
      }),
    );
    expect(outcome.value).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('leaves the state to the load when a removal is running as it is called', async () => {
    const h = setup(new UndoManager());
    await landX2(h);
    const outcome = await loadWhileRunning(h, () => h.actions.removeDerivedColumn('x2'));
    expect(outcome.error).toBeInstanceOf(DerivedColumnError);
    expect(outcome.error).toMatchObject({ code: 'NOT_FOUND', details: { column: 'x2' } });
  });

  it('leaves the state to the load when an undo is rebuilding the VIEW as it is called', async () => {
    const h = setup(new UndoManager());
    await landX2(h);
    const outcome = await loadWhileRunning(h, () => h.actions.undo());
    expect(outcome.value).toBe(false);
  });

  it('leaves the state to the load when a reset is dropping the VIEW as it is called', async () => {
    const h = setup(new UndoManager());
    h.bridge.loadData.mockResolvedValueOnce({
      tableName: 't',
      rowCount: 3,
      columns: ['id'],
      schema: [{ name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' }],
    });
    await h.actions.loadData('id\n1\n2\n3', { format: 'csv' });
    await landX2(h);
    const outcome = await loadWhileRunning(h, () => h.actions.resetToInitial());
    expect(outcome.value).toBe(false);
  });

  it('refuses an undo, redo or reset asked for while a load restores a session', async () => {
    const h = setup(new UndoManager());
    const load = stubLoad(h);
    const layout = {
      sortColumns: [],
      visibleColumns: ['n'],
      columnOrder: ['n'],
      columnWidths: {},
      pinnedColumns: [],
      hiddenColumnInfo: {},
      derivedColumns: [],
    };
    const session: SessionSnapshot = {
      ...layout,
      version: SNAPSHOT_VERSION,
      timestamp: Date.now(),
      tableName: 't2',
      filters: [serializeFilter({ type: 'range', column: 'n', min: 1, max: 3 })],
      // Undoing the session's last step would take the filter away.
      undoStack: [{ ...layout, filters: [] }],
      redoStack: [{ ...layout, filters: [] }],
    };
    const sessionStore = { load: vi.fn().mockResolvedValue(session) } as unknown as SessionStore;

    const loading = h.actions.loadData('n\n1\n2', { format: 'csv', sessionStore });
    await drain();
    // Cmd+Z, Cmd+Shift+Z and Reset while the file loads.
    await expect(h.actions.undo()).resolves.toBe(false);
    await expect(h.actions.redo()).resolves.toBe(false);
    await expect(h.actions.resetToInitial()).resolves.toBe(false);
    load.finish();
    await loading;
    await drain();

    expect(h.state.filters.get()).toEqual([{ type: 'range', column: 'n', min: 1, max: 3 }]);
    expect(h.actions.getUndoManager()!.canUndo).toBe(true);
    expect(h.actions.getUndoManager()!.canRedo).toBe(true);
    // Once the load has ended, they work again.
    await expect(h.actions.undo()).resolves.toBe(true);
    expect(h.state.filters.get()).toEqual([]);
  });
});

describe('dropping the derived columns of a destroyed table', () => {
  it('waits for a change at work in DuckDB, then drops what it built', async () => {
    const h = setup();
    await landX2(h);
    const { add, insert } = await vectorAddAtInsert(h, 'v');
    h.actions.markDestroyed();
    let dropped = false;
    const dropping = h.actions.dropDerived().then(() => (dropped = true));
    await drain();
    // Nothing is dropped while the add can still build its VIEW.
    expect(pending(h)).toEqual([insert]);
    expect(dropped).toBe(false);

    await answerAll(h);
    await dropping;
    await expect(add).resolves.toEqual({ success: false, error: 'DataTable is destroyed' });
    const statements = h.queries.map((q) => q.sql.slice(0, 40));
    // The add's CREATE VIEW, then the helper table's DROP and the VIEW's.
    expect(statements.slice(-3)).toEqual([
      expect.stringMatching(/^CREATE OR REPLACE VIEW/),
      expect.stringMatching(/^DROP TABLE IF EXISTS "__dt_vec_0_v_0__"/),
      expect.stringMatching(/^DROP VIEW IF EXISTS "__dt_view_t__"/),
    ]);
  });

  it('does not wait for a load in flight, which stops before it builds any', async () => {
    const h = setup();
    await landX2(h);
    h.bridge.loadData.mockImplementation(() => new Promise(() => {}));
    void h.actions.loadData('n\n1', { format: 'csv' }).catch(() => {});
    await drain();
    h.actions.markDestroyed();
    const dropping = h.actions.dropDerived();
    await answerAll(h);
    await dropping;
    expect(h.queries.at(-1)!.sql).toMatch(/^DROP VIEW IF EXISTS "__dt_view_t__"/);
  });
});

describe('isRelationChanging and the settled callback with changes in line', () => {
  it('holds between two changes in line, and reports one settle, after the last', async () => {
    const h = setup();
    const settled = vi.fn();
    h.actions.setOnRelationSettled(settled);
    const first = h.actions.addDerivedColumn({
      kind: 'expression',
      name: 'x2',
      expression: 'id * 2',
    });
    const second = h.actions.addDerivedColumn({
      kind: 'expression',
      name: 'x3',
      expression: 'id * 3',
    });
    await drain();
    // The first's three statements, one at a time; the second's wait.
    for (let i = 0; i < 3; i++) {
      expect(pending(h)).toHaveLength(1);
      expect(pending(h)[0]!.sql).not.toContain('id * 3');
      await answer(h, pending(h)[0]!);
    }
    await expect(first).resolves.toEqual({ success: true });
    expect(settled).not.toHaveBeenCalled();
    expect(h.actions.isRelationChanging()).toBe(true);

    await answerAll(h);
    await expect(second).resolves.toEqual({ success: true });
    expect(settled).toHaveBeenCalledTimes(1);
    expect(h.actions.isRelationChanging()).toBe(false);
  });

  it('reports the settle when the last change in line ends without DuckDB work', async () => {
    const h = setup();
    const settled = vi.fn();
    h.actions.setOnRelationSettled(settled);
    const first = h.actions.addDerivedColumn({
      kind: 'expression',
      name: 'x2',
      expression: 'id * 2',
    });
    const refused = h.actions.addDerivedColumn({
      kind: 'expression',
      name: 'x2',
      expression: 'id * 9',
    });
    await drain();
    expect(h.actions.isRelationChanging()).toBe(true);
    await answerAll(h);
    await expect(first).resolves.toEqual({ success: true });
    await expect(refused).resolves.toMatchObject({ success: false });
    expect(settled).toHaveBeenCalledTimes(1);
    expect(h.actions.isRelationChanging()).toBe(false);
  });

  it('reports nothing for an undo that waited for nothing and touched no derived column', async () => {
    const h = setup(new UndoManager());
    const settled = vi.fn();
    h.actions.setOnRelationSettled(settled);
    h.actions.addFilter({ type: 'range', column: 'id', min: 1 });
    await expect(h.actions.undo()).resolves.toBe(true);
    expect(settled).not.toHaveBeenCalled();
    expect(h.actions.isRelationChanging()).toBe(false);
  });

  it('keeps later changes running after one throws', async () => {
    const h = setup();
    const removal = h.actions.removeDerivedColumn('nope');
    const add = h.actions.addDerivedColumn({
      kind: 'expression',
      name: 'x2',
      expression: 'id * 2',
    });
    await expect(removal).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await answerAll(h);
    await expect(add).resolves.toEqual({ success: true });
  });
});
