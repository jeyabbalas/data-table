/**
 * @vitest-environment jsdom
 *
 * Extract field → column through `createDataTable`, against real DuckDB, on
 * the nested stress fixture (`nested-stress-tests.parquet`, 1,000 rows).
 * `actions.addNestedFieldColumn` adds ordinary derived columns that read a
 * struct's field (odd names, four levels down), a list's length, a map's
 * size and a JSON key. Each holds what SQL reads there, gets the chart and
 * the filters of its type, sits right after its source, comes and goes with
 * undo and redo, and returns with a saved session, as do a text filter and
 * a sort on a nested column. The derived columns' VIEW holds every column
 * under its schema name: none is renamed `…_1` beside a name that differs
 * from it only in letter case.
 */
import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Filter } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import {
  createDataTable,
  quoteIdentifier,
  SessionStore,
  VisualizationRegistry,
  type DataTable,
  type NestedFieldColumnOptions,
  type TableEvents,
} from '@/index';
import type { BaseVisualization } from '@/visualizations/BaseVisualization';
import { Histogram } from '@/visualizations/histogram/Histogram';

import { createNodeDuckDB, type NodeDuckDBHarness } from './helpers/duckdbNode';
import { readBinaryFixture } from './helpers/fixtures';
import { SHOWCASE } from './helpers/nestedFixture';
import { makeNodeBridge } from './helpers/nodeBridge';

const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
const originalGetRect = HTMLElement.prototype.getBoundingClientRect;
const originalGetContext = HTMLCanvasElement.prototype.getContext;

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
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 500;
    },
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      width: 150,
      height: 60,
      top: 0,
      left: 0,
      bottom: 60,
      right: 150,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
  const ctx = new Proxy(
    { measureText: () => ({ width: 30 }) },
    {
      get: (target, key) =>
        key in target
          ? target[key as keyof typeof target]
          : typeof key === 'string'
            ? vi.fn()
            : undefined,
      set: () => true,
    },
  );
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(ctx) as never;

  harness = await createNodeDuckDB();
}, 30_000);

afterEach(async () => {
  for (const table of tables.splice(0)) {
    if (!table.isDestroyed()) await table.destroy();
  }
  document.body.innerHTML = '';
});

afterAll(async () => {
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  }
  HTMLElement.prototype.getBoundingClientRect = originalGetRect;
  HTMLCanvasElement.prototype.getContext = originalGetContext;
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

interface Mounted {
  table: DataTable;
  container: HTMLElement;
  /** The chart the registry made for each column, the latest one. */
  charts: Map<string, BaseVisualization | null>;
}

/**
 * The fixture loaded through `createDataTable` as table `tableName`.
 *
 * With `charts`, its registry has histograms only: the charts the extracted
 * numeric columns get, and few enough that jsdom, where every chart is made
 * at once (no IntersectionObserver), stays quick on 37 columns. Without, it
 * has none: a chart reads its stats and then its bins, and a derived-column
 * change that drops the VIEW in between (an undo, a destroy) fails the
 * second read, which the tests of those leave out.
 */
async function mount(
  tableName: string,
  {
    sessionStore,
    charts: withCharts = false,
  }: { sessionStore?: SessionStore; charts?: boolean } = {},
): Promise<Mounted> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const registry = new VisualizationRegistry();
  for (const name of registry.getRegisteredTypes()) {
    if (name !== 'histogram') registry.unregister(name);
  }
  const charts = new Map<string, BaseVisualization | null>();
  const create = registry.create.bind(registry);
  registry.create = (el, column, options) => {
    const viz = create(el, column, options);
    charts.set(column.name, viz);
    return viz;
  };
  const table = await createDataTable({
    container,
    bridge: facadeBridge(),
    // Read for each table: DuckDB takes over an ArrayBuffer it loads.
    source: await readBinaryFixture('parquet', 'nested-stress-tests'),
    sourceFormat: 'parquet',
    tableName,
    persistence: sessionStore ? { sessionStore } : false,
    presets: false,
    expressionFilter: false,
    exportDialog: false,
    ...(withCharts ? { visualizationRegistry: registry } : { visualizations: false }),
  });
  tables.push(table);
  return { table, container, charts };
}

async function sql(text: string): Promise<Record<string, unknown>[]> {
  return (await harness!.conn.query(text)).toArray().map((row) => row.toJSON());
}

/** The columns of `relation`, as DuckDB names them. */
async function columnsOf(relation: string): Promise<string[]> {
  return (await sql(`DESCRIBE ${quoteIdentifier(relation)}`)).map((r) => String(r.column_name));
}

const schemaNames = (table: DataTable): string[] => table.state.schema.get().map((c) => c.name);

/** Values as text, as `CAST(… AS VARCHAR)` writes them; NULL as `null`. */
function asText(values: ArrayLike<unknown>): (string | null)[] {
  return Array.from(values, (v) => (v === null ? null : String(v)));
}

function nextEvent<K extends keyof TableEvents>(
  table: DataTable,
  name: K,
): Promise<TableEvents[K]> {
  return new Promise((resolve) => {
    const off = table.on(name, (payload) => {
      off();
      resolve(payload);
    });
  });
}

/** The `__rowid__`s of the body's rendered rows, top first. */
function renderedRowIds(container: HTMLElement): number[] {
  return [...container.querySelectorAll<HTMLElement>('.dt-row[data-row-id]')]
    .sort((a, b) => Number(a.dataset.rowIndex) - Number(b.dataset.rowIndex))
    .map((row) => Number(row.dataset.rowId));
}

/** `count` columns of `names` from `name` on: `name` and what follows it. */
function after(names: readonly string[], name: string, count: number): string[] {
  const at = names.indexOf(name);
  return names.slice(at, at + count);
}

describe('extract field → column through createDataTable (real DuckDB)', () => {
  it('extracts point › x as a float column with a histogram, whose range filter counts as SQL does', async () => {
    const { table, charts } = await mount('nested_extract', { charts: true });
    await expect(table.actions.addNestedFieldColumn('point', ['x'])).resolves.toEqual({
      success: true,
      name: 'point_x',
    });

    expect(table.state.schema.get().find((c) => c.name === 'point_x')).toMatchObject({
      type: 'float',
      originalType: 'DOUBLE',
      isDerived: true,
      expression: `"point"['x']`,
    });
    expect(after(table.state.columnOrder.get(), 'point', 2)).toEqual(['point', 'point_x']);
    expect(after(table.state.visibleColumns.get(), 'point', 2)).toEqual(['point', 'point_x']);
    await vi.waitFor(() => expect(charts.get('point_x')).toBeInstanceOf(Histogram), {
      timeout: 10_000,
    });

    const [{ n }] = await sql(
      `SELECT COUNT(*)::INTEGER AS n FROM nested_extract WHERE "point"['x'] >= 0 AND "point"['x'] < 0.5`,
    );
    expect(n).toBeGreaterThan(0);
    const counted = nextEvent(table, 'filterChange');
    table.actions.addFilter({ type: 'range', column: 'point_x', min: 0, max: 0.5 });
    expect((await counted).filteredRowCount).toBe(n);
    expect(table.state.filteredRows.get()).toBe(n);
  }, 30_000);

  it('extracts odd field names, a deep field, a length, a map size and JSON keys, each as SQL reads it', async () => {
    const { table } = await mount('nested_extract');
    const extracts: [string, (string | number)[], NestedFieldColumnOptions, string, string][] = [
      ['odd_names', ['quote"d'], {}, 'odd_names_quote_d', `"odd_names"['quote"d']`],
      ['odd_names', ['ID'], {}, 'odd_names_id', `"odd_names"['ID']`],
      [
        'nested_struct',
        ['owner', 'contact', 'email'],
        {},
        'nested_struct_owner_contact_email',
        `"nested_struct"['owner']['contact']['email']`,
      ],
      ['tags', [], { extract: 'length' }, 'tags_length', 'len("tags")'],
      ['attrs', [], { extract: 'length' }, 'attrs_size', 'cardinality("attrs")'],
      ['doc', ['a.b'], {}, 'doc_a_b', `json_extract_string("doc", '$."a.b"')`],
      // Keys whose default names collide, in any letter case.
      ['doc', ['a_b'], {}, 'doc_a_b_2', `json_extract_string("doc", '$.a_b')`],
      ['doc', ['A_B'], {}, 'doc_a_b_3', `json_extract_string("doc", '$.A_B')`],
    ];
    for (const [column, path, options, name] of extracts) {
      await expect(table.actions.addNestedFieldColumn(column, path, options)).resolves.toEqual({
        success: true,
        name,
      });
    }

    for (const [, , , name, oracle] of extracts) {
      const expected = await sql(
        `SELECT CAST((${oracle}) AS VARCHAR) AS v FROM nested_extract ORDER BY "__rowid__"`,
      );
      const values = asText(await table.actions.getColumnValues(name));
      expect(values, name).toEqual(expected.map((r) => r.v));
      expect(values.some((v) => v !== null)).toBe(true);
    }
    expect(table.state.schema.get().find((c) => c.name === 'tags_length')?.type).toBe('integer');
    expect(table.state.schema.get().find((c) => c.name === 'attrs_size')?.type).toBe('integer');

    // The row whose keys' names collide: each column reads its own key.
    const row = SHOWCASE.NAME_COLLISIONS;
    await expect(table.actions.getCellValue(row, 'doc_a_b')).resolves.toBe('1');
    await expect(table.actions.getCellValue(row, 'doc_a_b_2')).resolves.toBe('2');
    await expect(table.actions.getCellValue(row, 'doc_a_b_3')).resolves.toBe('3');

    // Each right after its source, in the order it was made.
    const visible = table.state.visibleColumns.get();
    expect(after(visible, 'odd_names', 3)).toEqual([
      'odd_names',
      'odd_names_quote_d',
      'odd_names_id',
    ]);
    expect(after(visible, 'nested_struct', 2)).toEqual([
      'nested_struct',
      'nested_struct_owner_contact_email',
    ]);
    expect(after(visible, 'tags', 2)).toEqual(['tags', 'tags_length']);
    expect(after(visible, 'attrs', 2)).toEqual(['attrs', 'attrs_size']);
    expect(after(visible, 'doc', 4)).toEqual(['doc', 'doc_a_b', 'doc_a_b_2', 'doc_a_b_3']);
  }, 30_000);

  it('keeps the view’s columns the schema’s: a name that differs only in case is refused', async () => {
    const { table } = await mount('nested_extract');
    await table.actions.addNestedFieldColumn('point', ['x']);
    await table.actions.addNestedFieldColumn('doc', ['A_B']);

    // Added, the VIEW would name it `LABEL_1`, and `"LABEL"` would read label.
    await expect(
      table.actions.addDerivedColumn({
        kind: 'expression',
        name: 'LABEL',
        expression: 'upper("notes")',
      }),
    ).resolves.toEqual({
      success: false,
      error: 'Column name "LABEL" already exists as "label" (column names ignore letter case)',
    });
    await expect(
      table.actions.addNestedFieldColumn('point', ['y'], { name: 'Point_X' }),
    ).resolves.toEqual({
      success: false,
      error: 'Column name "Point_X" already exists as "point_x" (column names ignore letter case)',
    });
    // A rename that only changes the case of the column's own name.
    await expect(
      table.actions.updateDerivedColumn('doc_a_b', {
        kind: 'expression',
        name: 'DOC_A_B',
        expression: `json_extract_string("doc", '$.A_B')`,
      }),
    ).resolves.toEqual({ success: true });

    const view = table.state.tableName.get()!;
    expect(view).not.toBe('nested_extract');
    expect(await columnsOf(view)).toEqual(schemaNames(table));
    expect(schemaNames(table)).toContain('DOC_A_B');
    await expect(table.actions.getCellValue(SHOWCASE.NAME_COLLISIONS, 'DOC_A_B')).resolves.toBe(
      '3',
    );
    await expect(table.actions.getCellValue(SHOWCASE.NAME_COLLISIONS, 'label')).resolves.toEqual(
      (
        await sql(
          `SELECT label FROM nested_extract WHERE "__rowid__" = ${SHOWCASE.NAME_COLLISIONS}`,
        )
      )[0]!.label,
    );
  }, 30_000);

  it('undoes and redoes each extract as one step, the column back in its place', async () => {
    const { table } = await mount('nested_extract');
    const loaded = table.state.columnOrder.get();
    // The column after point as loaded.
    const next = after(loaded, 'point', 2)[1];
    await table.actions.addNestedFieldColumn('point', ['x']);
    await table.actions.addNestedFieldColumn('point', ['y']);
    const placed = table.state.columnOrder.get();
    expect(after(placed, 'point', 4)).toEqual(['point', 'point_x', 'point_y', next]);

    await expect(table.actions.undo()).resolves.toBe(true);
    expect(table.state.derivedColumns.get().map((d) => d.name)).toEqual(['point_x']);
    expect(after(table.state.columnOrder.get(), 'point', 3)).toEqual(['point', 'point_x', next]);
    expect(await columnsOf(table.state.tableName.get()!)).toEqual(schemaNames(table));

    await expect(table.actions.undo()).resolves.toBe(true);
    expect(table.state.derivedColumns.get()).toEqual([]);
    expect(table.state.columnOrder.get()).toEqual(loaded);
    expect(table.state.tableName.get()).toBe('nested_extract');

    await expect(table.actions.redo()).resolves.toBe(true);
    await expect(table.actions.redo()).resolves.toBe(true);
    expect(table.state.columnOrder.get()).toEqual(placed);
    expect(await columnsOf(table.state.tableName.get()!)).toEqual(schemaNames(table));
    const ys = asText(await table.actions.getColumnValues('point_y'));
    const expected = await sql(
      `SELECT CAST("point"['y'] AS VARCHAR) AS v FROM nested_extract ORDER BY "__rowid__"`,
    );
    expect(ys.filter((v) => v !== null)).toHaveLength(expected.filter((r) => r.v !== null).length);
  }, 30_000);

  it('restores the extracts, a text filter and a sort on a nested column from the saved session', async () => {
    const store = new SessionStore();
    await store.open();
    try {
      const first = await mount('nested_session', { sessionStore: store });
      await first.table.actions.addNestedFieldColumn('point', ['x']);
      await first.table.actions.addNestedFieldColumn('tags', [], { extract: 'length' });
      await first.table.actions.addNestedFieldColumn('doc', ['a.b']);
      const filter: Filter = {
        type: 'set',
        column: 'tier_list',
        values: ['[NULL]', '[a, b]'],
        valueType: 'text',
      };
      first.table.actions.addFilter(filter);
      first.table.actions.setSort([{ column: 'point', direction: 'asc' }]);
      const schema = first.table.state.schema.get();
      const order = first.table.state.columnOrder.get();
      // Destroying the table writes the save it had pending.
      await first.table.destroy();

      const second = await mount('nested_session', { sessionStore: store });
      const { state } = second.table;
      expect(state.derivedColumns.get().map((d) => d.name)).toEqual([
        'point_x',
        'tags_length',
        'doc_a_b',
      ]);
      expect(state.schema.get()).toEqual(schema);
      expect(state.columnOrder.get()).toEqual(order);
      expect(state.filters.get()).toEqual([filter]);
      expect(state.sortColumns.get()).toEqual([{ column: 'point', direction: 'asc' }]);
      expect(await columnsOf(state.tableName.get()!)).toEqual(schemaNames(second.table));

      const rows = await sql(
        `SELECT "__rowid__"::INTEGER AS r FROM nested_session
         WHERE CAST("tier_list" AS VARCHAR) IN ('[NULL]', '[a, b]')
         ORDER BY "point" ASC, "__rowid__" ASC`,
      );
      expect(rows).toHaveLength(250);
      await vi.waitFor(() => expect(state.filteredRows.get()).toBe(rows.length), {
        timeout: 10_000,
      });
      // The grid's first rows, in the restored sort and filter.
      await vi.waitFor(
        () =>
          expect(renderedRowIds(second.container).slice(0, 10)).toEqual(
            rows.slice(0, 10).map((r) => r.r),
          ),
        { timeout: 10_000 },
      );
    } finally {
      store.close();
    }
  }, 60_000);
});
