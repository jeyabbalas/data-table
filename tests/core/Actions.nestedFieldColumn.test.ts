/**
 * `actions.addNestedFieldColumn`: a part of a nested or JSON column added as
 * a derived expression column, placed right after its source (past the
 * extracts already made of it, after the pinned block for a pinned source),
 * as one undo entry; and derived-column names compared as DuckDB compares
 * them, ignoring the case of ASCII letters.
 *
 * The bridge is a mock that answers type detection from a table of
 * expressions; the SQL it is sent is checked against real DuckDB in
 * `tests/DataTable.nested.duckdb.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { UndoManager } from '@/core/UndoManager';

const VIEW = '__dt_view_t__';

const POINT_TYPE = 'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)';

const SCHEMA: ColumnSchema[] = [
  { name: '__rowid__', type: 'integer', nullable: false, originalType: 'BIGINT', system: true },
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'label', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'point', type: 'nested', nullable: true, originalType: POINT_TYPE },
  { name: 'tags', type: 'nested', nullable: true, originalType: 'VARCHAR[]' },
  { name: 'attrs', type: 'nested', nullable: true, originalType: 'MAP(VARCHAR, INTEGER)' },
  { name: 'doc', type: 'string', nullable: true, originalType: 'JSON' },
  { name: 'score', type: 'float', nullable: true, originalType: 'DOUBLE' },
];

/** What DuckDB's DESCRIBE gives each expression; VARCHAR for any other. */
const TYPES: Record<string, string> = {
  [`"point"['x']`]: 'DOUBLE',
  [`"point"['y']`]: 'DOUBLE',
  'len("tags")': 'BIGINT',
  'cardinality("attrs")': 'UBIGINT',
  [`TRY_CAST(json_extract_string("doc", '$.score') AS DOUBLE)`]: 'DOUBLE',
  [`{'a': 1, 'b': 'x'}`]: 'STRUCT(a INTEGER, b VARCHAR)',
};

interface Harness {
  state: TableState;
  actions: StateActions;
  undoManager: UndoManager;
  /** Every SQL statement sent, in order. */
  queries: string[];
}

/**
 * A table `t` with {@link SCHEMA} loaded. With `failOn`, DuckDB refuses to
 * bind any expression whose SQL holds that text.
 */
function setup({ failOn }: { failOn?: string } = {}): Harness {
  const state = createTableState();
  const queries: string[] = [];
  const bridge = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (failOn !== undefined && sql.startsWith('SELECT NULL FROM (') && sql.includes(failOn)) {
        throw new Error('Binder Error: that does not bind');
      }
      const describe = /^DESCRIBE SELECT \((.+)\) AS v FROM /s.exec(sql);
      if (describe) return [{ column_name: 'v', column_type: TYPES[describe[1]!] ?? 'VARCHAR' }];
      return [];
    }),
    loadData: vi.fn(),
    clearQueryCache: vi.fn(),
    dropTable: vi.fn().mockResolvedValue(undefined),
  };
  const undoManager = new UndoManager();
  const actions = new StateActions(
    state,
    bridge as unknown as ConstructorParameters<typeof StateActions>[1],
    undoManager,
  );
  initializeColumnsFromSchema(state, SCHEMA);
  state.tableName.set('t');
  state.baseTableName.set('t');
  state.totalRows.set(10);
  state.filteredRows.set(10);
  return { state, actions, undoManager, queries };
}

const order = (h: Harness) => h.state.columnOrder.get();
const visible = (h: Harness) => h.state.visibleColumns.get();
const derivedNames = (h: Harness) => h.state.derivedColumns.get().map((d) => d.name);
const schemaEntry = (h: Harness, name: string) => h.state.schema.get().find((c) => c.name === name);

/** Extract a part and expect it to land under `name`. */
async function extract(
  h: Harness,
  column: string,
  path: (string | number)[],
  name: string,
  options?: Parameters<StateActions['addNestedFieldColumn']>[2],
): Promise<void> {
  await expect(h.actions.addNestedFieldColumn(column, path, options)).resolves.toEqual({
    success: true,
    name,
  });
}

/** Add an expression column (last, as addDerivedColumn puts it). */
async function addExpression(h: Harness, name: string, expression: string): Promise<void> {
  await expect(
    h.actions.addDerivedColumn({ kind: 'expression', name, expression }),
  ).resolves.toEqual({ success: true });
}

let h: Harness;

beforeEach(() => {
  h = setup();
});

describe('addNestedFieldColumn: the column it adds', () => {
  it('adds a struct field as a derived expression column named after it', async () => {
    await extract(h, 'point', ['x'], 'point_x');

    expect(h.state.derivedColumns.get()).toEqual([
      { kind: 'expression', name: 'point_x', expression: `"point"['x']` },
    ]);
    expect(schemaEntry(h, 'point_x')).toEqual({
      name: 'point_x',
      type: 'float',
      nullable: true,
      originalType: 'DOUBLE',
      isDerived: true,
      expression: `"point"['x']`,
    });
    expect(h.state.tableName.get()).toBe(VIEW);
    expect(h.queries.at(-1)).toContain(`("point"['x']) AS "point_x"`);
  });

  it('reads a list length, a map size, a JSON key, and a JSON leaf as a number', async () => {
    await extract(h, 'tags', [], 'tags_length', { extract: 'length' });
    await extract(h, 'attrs', [], 'attrs_size', { extract: 'length' });
    await extract(h, 'doc', ['a.b'], 'doc_a_b');
    await extract(h, 'doc', ['score'], 'doc_score', { jsonLeaf: 'number' });

    const expressions = Object.fromEntries(
      h.state.derivedColumns.get().map((d) => [d.name, d.kind === 'expression' && d.expression]),
    );
    expect(expressions).toEqual({
      tags_length: 'len("tags")',
      attrs_size: 'cardinality("attrs")',
      doc_a_b: `json_extract_string("doc", '$."a.b"')`,
      doc_score: `TRY_CAST(json_extract_string("doc", '$.score') AS DOUBLE)`,
    });
    expect(schemaEntry(h, 'tags_length')?.type).toBe('integer');
    expect(schemaEntry(h, 'doc_score')?.type).toBe('float');
  });

  it('takes the name it is given', async () => {
    await extract(h, 'point', ['x'], 'longitude', { name: 'longitude' });
    expect(derivedNames(h)).toEqual(['longitude']);
  });

  it('makes a default name unique, ignoring letter case', async () => {
    await extract(h, 'point', ['x'], 'point_x');
    await extract(h, 'point', ['x'], 'point_x_2');
    await addExpression(h, 'POINT_X_3', '1');
    await extract(h, 'point', ['x'], 'point_x_4');
    expect(derivedNames(h)).toEqual(['point_x', 'point_x_2', 'POINT_X_3', 'point_x_4']);
  });

  it('reads from a derived nested column too', async () => {
    await addExpression(h, 'pair', `{'a': 1, 'b': 'x'}`);
    expect(schemaEntry(h, 'pair')?.type).toBe('nested');
    await extract(h, 'pair', ['b'], 'pair_b');
    expect(h.state.derivedColumns.get().at(-1)).toEqual({
      kind: 'expression',
      name: 'pair_b',
      expression: `"pair"['b']`,
    });
    expect(order(h).slice(-2)).toEqual(['pair', 'pair_b']);
  });
});

describe('addNestedFieldColumn: where the column goes', () => {
  it('goes right after its source, in the order and among the visible columns', async () => {
    await extract(h, 'point', ['x'], 'point_x');
    expect(order(h)).toEqual([
      '__rowid__',
      'id',
      'label',
      'point',
      'point_x',
      'tags',
      'attrs',
      'doc',
      'score',
    ]);
    expect(visible(h)).toEqual([
      'id',
      'label',
      'point',
      'point_x',
      'tags',
      'attrs',
      'doc',
      'score',
    ]);
  });

  it('goes after the extracts already made of its source, in the order they were made', async () => {
    await extract(h, 'point', ['x'], 'point_x');
    await extract(h, 'tags', [], 'tags_length', { extract: 'length' });
    await extract(h, 'point', ['y'], 'point_y');
    await extract(h, 'tags', [1], 'tags_1');
    await extract(h, 'point', ['tier'], 'point_tier');
    expect(visible(h)).toEqual([
      'id',
      'label',
      'point',
      'point_x',
      'point_y',
      'point_tier',
      'tags',
      'tags_length',
      'tags_1',
      'attrs',
      'doc',
      'score',
    ]);
  });

  it('counts a derived column as reading its source when it opens with its quoted name, however wrapped', async () => {
    // Added last, then moved behind `tags`: `n`, `m` and `w` read tags (`m`
    // through parentheses and another letter case, as DuckDB binds it); `u`
    // reads `label`, and ends the run.
    await addExpression(h, 'n', 'len("tags")');
    await addExpression(h, 'm', '("TAGS"[2])');
    await addExpression(h, 'w', `list_filter("tags", x -> x <> '')`);
    await addExpression(h, 'u', 'upper("label")');
    await addExpression(h, 'k', 'len(tags)');
    const rest = ['attrs', 'doc', 'score'];
    h.actions.setColumnOrder(['id', 'label', 'point', 'tags', 'n', 'm', 'w', 'u', 'k', ...rest]);

    await extract(h, 'tags', [1], 'tags_1');
    expect(visible(h).slice(3, 10)).toEqual(['tags', 'n', 'm', 'w', 'tags_1', 'u', 'k']);

    // A column naming the source unquoted does not count: `k` ends the run.
    h.actions.setColumnOrder(['id', 'label', 'point', 'tags', 'k', 'n', 'm', 'w', 'u', ...rest]);
    await extract(h, 'tags', [2], 'tags_2');
    expect(visible(h).slice(3, 6)).toEqual(['tags', 'tags_2', 'k']);
  });

  it('goes after the pinned block for a pinned source, and is not pinned', async () => {
    h.actions.toggleColumnPin('id');
    h.actions.toggleColumnPin('point');
    expect(order(h).slice(0, 3)).toEqual(['id', 'point', '__rowid__']);

    await extract(h, 'point', ['x'], 'point_x');
    await extract(h, 'point', ['y'], 'point_y');

    expect(h.state.pinnedColumns.get()).toEqual(['id', 'point']);
    expect(order(h).slice(0, 5)).toEqual(['id', 'point', 'point_x', 'point_y', '__rowid__']);
    expect(visible(h).slice(0, 5)).toEqual(['id', 'point', 'point_x', 'point_y', 'label']);
  });

  it('goes after the pinned block, past the run there, when the run is pinned too', async () => {
    h.actions.toggleColumnPin('point');
    await extract(h, 'point', ['x'], 'point_x');
    h.actions.toggleColumnPin('point_x');
    await extract(h, 'point', ['y'], 'point_y');
    expect(h.state.pinnedColumns.get()).toEqual(['point', 'point_x']);
    expect(visible(h).slice(0, 4)).toEqual(['point', 'point_x', 'point_y', 'id']);
  });

  it('keeps its place among hidden columns, and where a hidden source would show', async () => {
    h.actions.hideColumn('label');
    h.actions.hideColumn('tags');
    await extract(h, 'point', ['x'], 'point_x');
    expect(order(h)).toEqual([
      '__rowid__',
      'id',
      'label',
      'point',
      'point_x',
      'tags',
      'attrs',
      'doc',
      'score',
    ]);
    expect(visible(h)).toEqual(['id', 'point', 'point_x', 'attrs', 'doc', 'score']);

    // A hidden source: its column shows where it would.
    h.actions.hideColumn('point');
    await extract(h, 'point', ['y'], 'point_y');
    expect(visible(h)).toEqual(['id', 'point_x', 'point_y', 'attrs', 'doc', 'score']);

    // A hidden extract still counts in the run.
    h.actions.hideColumn('point_x');
    await extract(h, 'point', ['tier'], 'point_tier');
    expect(order(h).slice(3, 8)).toEqual(['point', 'point_x', 'point_y', 'point_tier', 'tags']);
    expect(visible(h)).toEqual(['id', 'point_y', 'point_tier', 'attrs', 'doc', 'score']);

    // Shown again, the source goes back before its extracts.
    h.actions.showColumn('point');
    expect(visible(h)).toEqual(['id', 'point', 'point_y', 'point_tier', 'attrs', 'doc', 'score']);
  });

  it('goes first among the visible columns when none before it is shown', async () => {
    h.actions.hideColumn('id');
    h.actions.hideColumn('label');
    h.actions.hideColumn('point');
    await extract(h, 'point', ['x'], 'point_x');
    expect(visible(h)).toEqual(['point_x', 'tags', 'attrs', 'doc', 'score']);
    expect(order(h).indexOf('point_x')).toBe(order(h).indexOf('point') + 1);
  });

  it('leaves addDerivedColumn putting its column last', async () => {
    await addExpression(h, 'p2', `"point"['x'] * 2`);
    expect(order(h).at(-1)).toBe('p2');
    expect(visible(h).at(-1)).toBe('p2');
  });
});

describe('addNestedFieldColumn: undo and redo', () => {
  it('is one undo entry: undo takes the column out, redo puts it back in place', async () => {
    h.actions.hideColumn('label');
    const depth = h.undoManager.undoDepth;
    const before = { order: order(h), visible: visible(h) };

    await extract(h, 'point', ['x'], 'point_x');
    expect(h.undoManager.undoDepth).toBe(depth + 1);
    const after = { order: order(h), visible: visible(h) };

    await expect(h.actions.undo()).resolves.toBe(true);
    expect(derivedNames(h)).toEqual([]);
    expect(schemaEntry(h, 'point_x')).toBeUndefined();
    expect({ order: order(h), visible: visible(h) }).toEqual(before);
    expect(h.state.tableName.get()).toBe('t');
    expect(h.undoManager.undoDepth).toBe(depth);

    await expect(h.actions.redo()).resolves.toBe(true);
    expect(derivedNames(h)).toEqual(['point_x']);
    expect(schemaEntry(h, 'point_x')?.type).toBe('float');
    expect({ order: order(h), visible: visible(h) }).toEqual(after);
    expect(h.state.tableName.get()).toBe(VIEW);
  });

  it('restores a second extract’s place behind the first, and a pinned source’s', async () => {
    h.actions.toggleColumnPin('point');
    await extract(h, 'point', ['x'], 'point_x');
    await extract(h, 'point', ['y'], 'point_y');
    const placed = order(h);

    await h.actions.undo();
    expect(order(h).slice(0, 3)).toEqual(['point', 'point_x', '__rowid__']);
    await h.actions.redo();
    expect(order(h)).toEqual(placed);
    expect(h.state.pinnedColumns.get()).toEqual(['point']);
  });
});

describe('addNestedFieldColumn: errors', () => {
  /** Resolve `{ success: false, error }` and change nothing: no state, no undo entry, no query. */
  async function refused(
    call: Promise<{ success: boolean; name?: string; error?: string }>,
    error: string | RegExp,
  ): Promise<void> {
    const result = await call;
    expect(result.success).toBe(false);
    expect(result.name).toBeUndefined();
    if (typeof error === 'string') expect(result.error).toBe(error);
    else expect(result.error).toMatch(error);
  }

  function expectUnchanged(): void {
    expect(derivedNames(h)).toEqual([]);
    expect(order(h)).toEqual(SCHEMA.map((c) => c.name));
    expect(h.undoManager.undoDepth).toBe(0);
    expect(h.queries).toEqual([]);
  }

  it('refuses a column that is not there, and one that is neither nested nor JSON', async () => {
    await refused(h.actions.addNestedFieldColumn('nope', ['x']), 'Column "nope" not found');
    await refused(
      h.actions.addNestedFieldColumn('label', []),
      'Column "label" is neither nested nor JSON: it has no parts to extract',
    );
    await refused(h.actions.addNestedFieldColumn('score', ['x']), /neither nested nor JSON/);
    await refused(h.actions.addNestedFieldColumn('__rowid__', ['x']), /neither nested nor JSON/);
    expectUnchanged();
  });

  it('refuses a path that does not fit the type, and a kind its end does not offer', async () => {
    await refused(h.actions.addNestedFieldColumn('point', ['z']), `${POINT_TYPE} has no field "z"`);
    await refused(h.actions.addNestedFieldColumn('tags', ['first']), /1-based position/);
    await refused(h.actions.addNestedFieldColumn('tags', [0]), 'List positions start at 1, not 0');
    await refused(h.actions.addNestedFieldColumn('point', ['x', 'y']), /has no parts/);
    await refused(h.actions.addNestedFieldColumn('point', []), /path is empty/);
    await refused(
      h.actions.addNestedFieldColumn('point', [], { extract: 'length' }),
      /"length" cannot be read at STRUCT/,
    );
    await refused(
      h.actions.addNestedFieldColumn('point', 'x' as unknown as string[]),
      'The path must be an array of steps',
    );
    expectUnchanged();
  });

  it('refuses options it does not know', async () => {
    await refused(
      h.actions.addNestedFieldColumn('tags', [], { extract: 'size' as never }),
      `extract must be 'value', 'length' or 'tag', not "size"`,
    );
    await refused(
      h.actions.addNestedFieldColumn('doc', ['a'], { jsonLeaf: 'int' as never }),
      `jsonLeaf must be 'string', 'number', 'boolean' or 'json', not "int"`,
    );
    await refused(
      h.actions.addNestedFieldColumn('point', ['x'], { name: 7 as never }),
      'The column name must be a string',
    );
    expectUnchanged();
  });

  it('refuses a name another column has, in any letter case, the reserved row id, and no name', async () => {
    await refused(
      h.actions.addNestedFieldColumn('point', ['x'], { name: 'label' }),
      'Column name "label" already exists',
    );
    await refused(
      h.actions.addNestedFieldColumn('point', ['x'], { name: 'LABEL' }),
      'Column name "LABEL" already exists as "label" (column names ignore letter case)',
    );
    await refused(
      h.actions.addNestedFieldColumn('point', ['x'], { name: '__rowid__' }),
      'Column name "__rowid__" is reserved for the synthetic row id',
    );
    await refused(
      h.actions.addNestedFieldColumn('point', ['x'], { name: '__ROWID__' }),
      'Column name "__ROWID__" is reserved for the synthetic row id',
    );
    await refused(
      h.actions.addNestedFieldColumn('point', ['x'], { name: '  ' }),
      'Column name cannot be empty',
    );
    expectUnchanged();
  });

  it('passes on an expression DuckDB refuses', async () => {
    h = setup({ failOn: '"attrs"' });
    const result = await h.actions.addNestedFieldColumn('attrs', ['k']);
    expect(result).toEqual({ success: false, error: 'Binder Error: that does not bind' });
    expect(derivedNames(h)).toEqual([]);
    expect(order(h)).toEqual(SCHEMA.map((c) => c.name));
    expect(h.undoManager.undoDepth).toBe(0);
  });

  it('refuses on a destroyed table, before or while it runs', async () => {
    const running = h.actions.addNestedFieldColumn('point', ['x']);
    h.actions.markDestroyed();
    await refused(running, 'DataTable is destroyed');
    await refused(h.actions.addNestedFieldColumn('point', ['y']), 'DataTable is destroyed');
    expect(derivedNames(h)).toEqual([]);
    expect(h.undoManager.undoDepth).toBe(0);
  });

  it('refuses when new data comes before it lands', async () => {
    const running = h.actions.addNestedFieldColumn('point', ['x']);
    const cleared = h.actions.clearData();
    await refused(
      running,
      'New data was loaded, or the table cleared, before the change was applied',
    );
    await cleared;
    expect(derivedNames(h)).toEqual([]);
  });
});

describe('addNestedFieldColumn: turns', () => {
  it('lands before an add asked for right after it, which then finds its name taken', async () => {
    const first = h.actions.addNestedFieldColumn('point', ['x']);
    const second = h.actions.addDerivedColumn({
      kind: 'expression',
      name: 'Point_X',
      expression: '1',
    });
    await expect(first).resolves.toEqual({ success: true, name: 'point_x' });
    await expect(second).resolves.toEqual({
      success: false,
      error: 'Column name "Point_X" already exists as "point_x" (column names ignore letter case)',
    });
  });

  it('is undone by an undo asked for right after it', async () => {
    const added = h.actions.addNestedFieldColumn('point', ['x']);
    const undone = h.actions.undo();
    await expect(added).resolves.toEqual({ success: true, name: 'point_x' });
    await expect(undone).resolves.toBe(true);
    expect(derivedNames(h)).toEqual([]);
    expect(order(h)).toEqual(SCHEMA.map((c) => c.name));
  });

  it('names its column against the columns the changes ahead of it leave', async () => {
    const ahead = h.actions.addDerivedColumn({
      kind: 'expression',
      name: 'POINT_X',
      expression: `"point"['x']`,
    });
    const extracted = h.actions.addNestedFieldColumn('point', ['x']);
    await expect(ahead).resolves.toEqual({ success: true });
    await expect(extracted).resolves.toEqual({ success: true, name: 'point_x_2' });
  });
});

describe('derived column names collide ignoring letter case', () => {
  it('refuses an add whose name differs from another column’s only in case, before DuckDB', async () => {
    const result = await h.actions.addDerivedColumn({
      kind: 'expression',
      name: 'LABEL',
      expression: 'upper("label")',
    });
    expect(result).toEqual({
      success: false,
      error: 'Column name "LABEL" already exists as "label" (column names ignore letter case)',
    });
    expect(h.queries).toEqual([]);

    await addExpression(h, 'total', 'id * 2');
    await expect(
      h.actions.addDerivedColumn({ kind: 'expression', name: 'Total', expression: '1' }),
    ).resolves.toEqual({
      success: false,
      error: 'Column name "Total" already exists as "total" (column names ignore letter case)',
    });
  });

  it('keeps the wording for the same name, reserves __rowid__ in any case, and tells é from É', async () => {
    await expect(
      h.actions.addDerivedColumn({ kind: 'expression', name: 'label', expression: '1' }),
    ).resolves.toEqual({ success: false, error: 'Column name "label" already exists' });
    await expect(
      h.actions.addDerivedColumn({ kind: 'expression', name: '__RowId__', expression: '1' }),
    ).resolves.toEqual({
      success: false,
      error: 'Column name "__RowId__" is reserved for the synthetic row id',
    });
    await addExpression(h, 'é', '1');
    await addExpression(h, 'É', '2');
    expect(derivedNames(h)).toEqual(['é', 'É']);
  });

  it('refuses a rename to another column’s name in any case', async () => {
    await addExpression(h, 'total', 'id * 2');
    await expect(
      h.actions.updateDerivedColumn('total', {
        kind: 'expression',
        name: 'LABEL',
        expression: 'id * 2',
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Column name "LABEL" already exists as "label" (column names ignore letter case)',
    });
    await expect(
      h.actions.updateDerivedColumn('total', {
        kind: 'expression',
        name: '__ROWID__',
        expression: 'id * 2',
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Column name "__ROWID__" is reserved for the synthetic row id',
    });
    expect(derivedNames(h)).toEqual(['total']);
  });

  it('allows a rename that only changes the case of the column’s own name', async () => {
    await addExpression(h, 'total', 'id * 2');
    await expect(
      h.actions.updateDerivedColumn('total', {
        kind: 'expression',
        name: 'Total',
        expression: 'id * 2',
      }),
    ).resolves.toEqual({ success: true });
    expect(derivedNames(h)).toEqual(['Total']);
    expect(schemaEntry(h, 'Total')?.isDerived).toBe(true);
    expect(schemaEntry(h, 'total')).toBeUndefined();
    expect(order(h).at(-1)).toBe('Total');
    expect(visible(h).at(-1)).toBe('Total');
  });
});
