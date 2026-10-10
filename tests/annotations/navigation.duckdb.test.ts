/**
 * Annotation navigation against real DuckDB: the SQL search finds what the
 * grid shows.
 *
 * The oracle is the grid's own order: the view's rows paged through
 * `buildRowQuery`, block by block, exactly as `TableBody` fetches them. For
 * every sort the navigator compares rows in its own way (key by key, by
 * sort key for nested and VARIANT columns, by numbering the view for a type
 * the parser cannot read), and for every filter, it must find, from every
 * row, the next and the previous annotated row and its position as that
 * order has them, and `revealRow` must find every row where it is.
 *
 * The body holds only the cursor's row, so every search past it is SQL
 * (the binary search over positions is checked once, unfiltered and
 * unsorted). The helper table is built with the statement
 * `AnnotatedRowsTable` sends, which this exercises too, and one filter
 * reads it the way the `annotated` filter does.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AnnotationNavigator } from '@/annotations/AnnotationNavigator';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import type { AnnotationSeverity, NewAnnotation } from '@/annotations/types';
import type { ColumnSchema, Filter, SortColumn } from '@/core/types';
import { detectSchema } from '@/data/SchemaDetector';
import { buildRowQuery } from '@/table/rowQuery';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { BIT, makeHost, ModelStore } from '../helpers/navigationFakes';
import { makeNodeBridge } from '../helpers/nodeBridge';
import { TestAnnotatedRowsSource } from '../helpers/testAnnotatedRowsSource';

const ROWS = 64;
const BLOCK = 128;
const HELPER = '"__dt_annot_base__"';

/**
 * Annotations on about a third of the rows, of every severity, in the row
 * and in hidden cells: in the store the navigator reads, and in the model
 * the expectations are worked out from.
 */
function annotations(): { store: AnnotationStore; model: ModelStore } {
  const list: NewAnnotation[] = [];
  const severities: AnnotationSeverity[] = ['error', 'warning', 'info'];
  for (let r = 0; r < ROWS; r++) {
    if (r % 7 === 3) {
      list.push({ scope: 'row', rowId: r, severity: severities[r % 3]!, message: `row ${r}` });
    }
    // Some of the rows whose `val` is NULL, which sort last.
    if (r % 22 === 0) list.push({ scope: 'row', rowId: r, severity: 'info', message: `null ${r}` });
    // `label` is never shown, and `gone` is not a column at all.
    if (r % 11 === 5) {
      list.push({
        scope: 'cell',
        rowId: r,
        column: 'label',
        severity: 'error',
        message: `label ${r}`,
      });
    }
    if (r % 13 === 8) {
      list.push({
        scope: 'cell',
        rowId: r,
        column: 'gone',
        severity: 'warning',
        message: `gone ${r}`,
      });
    }
  }
  // Rows the table does not have, and a column annotation: none is a stop.
  list.push(
    { scope: 'row', rowId: ROWS + 5, severity: 'error', message: 'past the end' },
    { scope: 'row', rowId: -3, severity: 'error', message: 'negative' },
    { scope: 'row', rowId: 2.5, severity: 'info', message: 'fractional' },
    { scope: 'column', column: 'grp', severity: 'error', message: 'a column' },
  );
  const store = new AnnotationStore();
  store.addMany(list);
  return { store, model: new ModelStore(list as ConstructorParameters<typeof ModelStore>[0]) };
}

interface Case {
  label: string;
  table: 'base' | 'v_view';
  sort: SortColumn[];
  filters: Filter[];
  /** The body's rows are its positions: the binary search answers, not SQL. */
  positions?: boolean;
  /** Also search for errors only. */
  errorsOnly?: boolean;
}

const CASES: Case[] = [
  { label: 'unsorted, unfiltered, by SQL', table: 'base', sort: [], filters: [], errorsOnly: true },
  {
    label: 'unsorted, unfiltered, by position',
    table: 'base',
    sort: [],
    filters: [],
    positions: true,
  },
  {
    label: 'ascending, with ties and NULLs',
    table: 'base',
    sort: [{ column: 'val', direction: 'asc' }],
    filters: [],
    errorsOnly: true,
  },
  {
    label: 'descending, with ties and NULLs',
    table: 'base',
    sort: [{ column: 'val', direction: 'desc' }],
    filters: [],
  },
  {
    label: 'three columns, mixed directions',
    table: 'base',
    sort: [
      { column: 'grp', direction: 'asc' },
      { column: 'label', direction: 'desc' },
      { column: 'val', direction: 'asc' },
    ],
    filters: [],
  },
  {
    label: '__rowid__ descending',
    table: 'base',
    sort: [{ column: '__rowid__', direction: 'desc' }],
    filters: [],
  },
  {
    label: 'a column, then __rowid__ descending',
    table: 'base',
    sort: [
      { column: 'grp', direction: 'desc' },
      { column: '__rowid__', direction: 'desc' },
    ],
    filters: [],
  },
  {
    label: 'NaN, ±0 and ±inf ascending',
    table: 'base',
    sort: [{ column: 'dbl', direction: 'asc' }],
    filters: [],
  },
  {
    label: 'NaN, ±0 and ±inf descending',
    table: 'base',
    sort: [{ column: 'dbl', direction: 'desc' }],
    filters: [],
  },
  {
    label: 'INTERVAL, with equal values written differently',
    table: 'base',
    sort: [{ column: 'wait', direction: 'asc' }],
    filters: [],
  },
  {
    label: 'LIST<INTERVAL> descending',
    table: 'base',
    sort: [{ column: 'waits', direction: 'desc' }],
    filters: [],
  },
  {
    label: 'VARIANT of mixed kinds',
    table: 'base',
    sort: [{ column: 'v', direction: 'asc' }],
    filters: [],
    errorsOnly: true,
  },
  {
    label: 'a type the parser cannot read: the numbered view',
    table: 'base',
    sort: [{ column: 'odd', direction: 'desc' }],
    filters: [],
  },
  {
    label: 'range filter, unsorted',
    table: 'base',
    sort: [],
    filters: [{ type: 'range', column: 'val', min: 3, max: 15 }],
    errorsOnly: true,
  },
  {
    label: 'set filter, sorted',
    table: 'base',
    sort: [{ column: 'label', direction: 'asc' }],
    filters: [{ type: 'set', column: 'grp', values: [1, 2, 5] }],
  },
  {
    label: 'raw-sql filter, sorted on NaN',
    table: 'base',
    sort: [{ column: 'dbl', direction: 'desc' }],
    filters: [{ type: 'raw-sql', column: '__raw_sql_1__', id: '1', sql: '"__rowid__" % 4 <> 1' }],
  },
  {
    label: 'the annotated rows themselves, as the annotated filter selects them',
    table: 'base',
    sort: [{ column: 'v', direction: 'desc' }],
    filters: [
      {
        type: 'raw-sql',
        column: '__raw_sql_2__',
        id: '2',
        sql: `"__rowid__" IN (SELECT "__rowid__" FROM ${HELPER} WHERE ("__mask__" & 3) <> 0)`,
      },
    ],
    errorsOnly: true,
  },
  {
    label: 'a derived-column view: sort by expression, filter on a vector column',
    table: 'v_view',
    sort: [{ column: 'dbl2', direction: 'desc' }],
    filters: [{ type: 'not-null', column: 'vec' }],
  },
];

describe('annotation navigation on real DuckDB', () => {
  let harness: NodeDuckDBHarness;
  let bridge: ReturnType<typeof makeNodeBridge>;
  const schemas = new Map<string, ColumnSchema[]>();

  beforeAll(async () => {
    harness = await createNodeDuckDB();
    bridge = makeNodeBridge(harness.conn);
    await harness.conn.query(
      `CREATE TABLE base AS
         SELECT CAST(range AS BIGINT) AS "__rowid__",
                CAST(range % 7 AS INTEGER) AS grp,
                CASE WHEN range % 11 = 0 THEN NULL ELSE CAST((range * 7919) % 23 AS INTEGER) END AS val,
                CASE WHEN range % 13 = 0 THEN NULL ELSE 'r' || ((range * 104729) % 17) END AS label,
                CASE range % 9
                  WHEN 0 THEN 'NaN'::DOUBLE WHEN 1 THEN '-0.0'::DOUBLE WHEN 2 THEN 0.0::DOUBLE
                  WHEN 3 THEN NULL WHEN 4 THEN 'inf'::DOUBLE WHEN 5 THEN '-inf'::DOUBLE
                  ELSE (range % 4) * 1.5 END AS dbl,
                CASE range % 7
                  WHEN 0 THEN INTERVAL 30 DAY WHEN 1 THEN INTERVAL 1 MONTH WHEN 2 THEN INTERVAL 720 HOUR
                  WHEN 3 THEN INTERVAL 31 DAY WHEN 4 THEN NULL
                  ELSE to_days(CAST(range % 40 AS INTEGER)) END AS wait,
                CASE range % 7
                  WHEN 0 THEN [INTERVAL 30 DAY] WHEN 1 THEN [INTERVAL 1 MONTH] WHEN 2 THEN [INTERVAL 720 HOUR]
                  WHEN 3 THEN [INTERVAL 31 DAY] WHEN 4 THEN NULL WHEN 5 THEN []::INTERVAL[]
                  ELSE [to_days(CAST(range % 3 AS INTEGER)), NULL] END AS waits,
                CASE range % 5
                  WHEN 0 THEN 1::VARIANT WHEN 1 THEN 'x'::VARIANT WHEN 2 THEN CAST(range % 4 AS VARIANT)
                  WHEN 3 THEN NULL::VARIANT ELSE CAST([range % 3] AS VARIANT) END AS v,
                CAST(range % 3 AS INTEGER) AS odd
         FROM range(${ROWS})`,
    );
    // DerivedColumnManager's VIEW: a sparse vector helper LEFT-JOINed on
    // __rowid__, then an expression layer.
    await harness.conn.query(
      `CREATE TABLE vec AS SELECT "__rowid__", CAST("__rowid__" % 5 AS INTEGER) AS vec
         FROM base WHERE "__rowid__" % 3 = 0`,
    );
    await harness.conn.query(
      `CREATE VIEW v_view AS
         WITH __dt_base AS (SELECT t.*, h1.vec FROM base t LEFT JOIN vec h1 ON t.__rowid__ = h1.__rowid__),
         __dt_layer_1 AS (SELECT *, (val * 2) AS dbl2 FROM __dt_base)
         SELECT * FROM __dt_layer_1`,
    );
    for (const table of ['base', 'v_view']) {
      // A type the parser cannot read, for the column that tests the numbered view.
      schemas.set(
        table,
        (await detectSchema(table, bridge)).map((c) =>
          c.name === 'odd' ? { ...c, originalType: 'MYSTERY(' } : c,
        ),
      );
    }
  }, 60_000);

  afterAll(async () => {
    await harness?.cleanup();
  });

  /** The view's `__rowid__`s in the grid's order, block by block as the grid fetches them. */
  async function gridOrder(c: Case): Promise<number[]> {
    const ids: number[] = [];
    for (let offset = 0; ; offset += BLOCK) {
      const rows = await bridge.query<{ __rowid__: number }>(
        buildRowQuery({
          tableName: c.table,
          columns: ['grp'],
          sortColumns: c.sort,
          filters: c.filters,
          offset,
          limit: BLOCK,
          schema: schemas.get(c.table),
          rowidFastPath: c.sort.length === 0 && c.filters.length === 0,
        }),
      );
      ids.push(...rows.map((row) => row.__rowid__));
      if (rows.length < BLOCK) return ids;
    }
  }

  function setup(c: Case, store: AnnotationStore) {
    const schema = schemas.get(c.table)!;
    let source: TestAnnotatedRowsSource | null = null;
    const host = makeHost({
      store,
      schema,
      rows: ROWS,
      bridge,
      source: { ensureFresh: (signal) => source!.ensureFresh(signal) },
    });
    host.state.tableName.set(c.table);
    host.state.baseTableName.set('base');
    host.state.visibleColumns.set(['grp']);
    host.state.sortColumns.set(c.sort);
    host.state.filters.set(c.filters);
    host.body.positions = c.positions ?? false;
    source = new TestAnnotatedRowsSource(bridge, host.state, store);
    return { host, source, nav: new AnnotationNavigator(host) };
  }

  for (const c of CASES) {
    it(
      c.label,
      async () => {
        const { store, model } = annotations();
        const { host, source, nav } = setup(c, store);
        // The annotated filter reads the helper: it has to exist first.
        await source.ensureFresh();
        const order = await gridOrder(c);
        host.state.filteredRows.set(order.length);
        expect(order.length).toBeGreaterThan(10);

        const selections: [string, AnnotationSeverity[] | undefined, number][] = [
          ['every severity', undefined, 7],
        ];
        if (c.errorsOnly) selections.push(['errors only', ['error'], BIT.error]);

        for (const [what, severities, mask] of selections) {
          const stop = (q: number): boolean => (model.annotatedRowMask(order[q]!) & mask) !== 0;
          const expected = (from: number, dir: 1 | -1): number | null => {
            for (let q = from + dir; q >= 0 && q < order.length; q += dir) if (stop(q)) return q;
            return null;
          };
          const at = (q: number | null) => (q === null ? null : { row: q, rowId: order[q] });

          // From every row: the cursor there, and the grid holding that row only.
          for (let p = 0; p < order.length; p++) {
            for (const dir of [1, -1] as const) {
              host.body.cache.clear();
              host.body.cache.set(p, order[p]!);
              host.actions.setFocusedCell({ row: p, column: 'grp' });
              const landed = await (dir > 0 ? nav.next : nav.previous).call(nav, {
                severities,
                wrap: false,
              });
              expect(
                landed && { row: landed.row, rowId: landed.rowId },
                `${what}, ${dir > 0 ? 'next' : 'previous'} from row ${p}`,
              ).toEqual(at(expected(p, dir)));
            }
          }

          // Without a cursor: the first, and back from the end, the last.
          host.body.cache.clear();
          for (const dir of [1, -1] as const) {
            host.actions.clearFocusedCell();
            const landed = await (dir > 0 ? nav.next : nav.previous).call(nav, { severities });
            expect(
              landed && { row: landed.row, rowId: landed.rowId },
              `${what}, no cursor`,
            ).toEqual(at(expected(dir > 0 ? -1 : order.length, dir)));
          }

          // Going round: from the last annotated row to the first.
          const first = expected(-1, 1);
          const last = expected(order.length, -1);
          if (first !== null && last !== null) {
            host.body.cache.set(last, order[last]!);
            host.actions.setFocusedCell({ row: last, column: 'grp' });
            expect(await nav.next({ severities })).toMatchObject({ row: first, wrapped: true });
            host.body.cache.set(first, order[first]!);
            host.actions.setFocusedCell({ row: first, column: 'grp' });
            expect(await nav.previous({ severities })).toMatchObject({ row: last, wrapped: true });
          }
        }

        // revealRow, for every row of the table, and rows it does not have.
        host.body.cache.clear();
        const positions = new Map(order.map((id, p) => [id, p]));
        for (let id = 0; id < ROWS; id++) {
          const shown = await nav.reveal(id, undefined, { focus: false });
          expect(shown && shown.row, `reveal ${id}`).toBe(positions.get(id) ?? null);
        }
        for (const id of [ROWS, ROWS + 5, 2n ** 62n]) {
          await expect(nav.reveal(id), `reveal ${id}`).rejects.toMatchObject({
            code: 'INVALID_ROWID',
          });
        }
      },
      60_000,
    );
  }

  it('the helper skips rows no rowid can name, and is rebuilt only when the annotated rows change', async () => {
    const { store, model } = annotations();
    const queries: string[] = [];
    const counting = {
      query: (sql: string, signal?: AbortSignal) => {
        queries.push(sql);
        return bridge.query(sql, signal);
      },
    };
    const source = new TestAnnotatedRowsSource(
      counting,
      { baseTableName: { get: () => 'base' } } as never,
      store,
    );
    expect(await source.ensureFresh()).toBe('__dt_annot_base__');
    expect(await source.ensureFresh()).toBe('__dt_annot_base__');
    expect(queries).toHaveLength(1);
    const rows = await bridge.query<{ __rowid__: number; __mask__: number }>(
      `SELECT * FROM ${HELPER} ORDER BY "__rowid__"`,
    );
    const { rowIds, masks } = model.annotatedRows();
    const expected = [...rowIds]
      .map((id, i) => ({ __rowid__: id, __mask__: masks[i]! }))
      .filter((row) => Number.isInteger(row.__rowid__) && row.__rowid__ >= 0);
    expect(rows).toEqual(expected);

    // A new message, or a column annotation, moves no row: nothing is rebuilt.
    store.update(store.getByCell(3, 'grp').find((a) => a.scope === 'row')!.id, {
      message: 'edited',
    });
    store.add({ scope: 'column', column: 'val', severity: 'info', message: 'another column' });
    await source.ensureFresh();
    expect(queries).toHaveLength(1);

    store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'one more' });
    await source.ensureFresh();
    expect(queries).toHaveLength(2);
    store.clear('all');
    await source.ensureFresh();
    expect(await bridge.query(`SELECT count(*) AS n FROM ${HELPER}`)).toEqual([{ n: 0 }]);
  });
});
