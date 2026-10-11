/**
 * Annotation navigation without DuckDB: which tier answers (the cursor's
 * row, the rows the grid holds, the binary search, SQL) counted by the
 * queries a fake bridge sees, aborts, wrapping, which severities are sought,
 * where the cursor lands and what the live region says, and `revealRow`.
 *
 * The SQL tier's answers are checked against real DuckDB in
 * `navigation.duckdb.test.ts`; here the bridge answers by the query's shape.
 */
import { describe, expect, it, vi } from 'vitest';

import { AnnotationNavigator } from '@/annotations/AnnotationNavigator';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import type { AnnotationSeverity, NewAnnotation } from '@/annotations/types';
import { defaultStrings, mergeStrings } from '@/core/Strings';
import type { ColumnSchema } from '@/core/types';

import { makeHost, ModelStore, NAV_SCHEMA } from '../helpers/navigationFakes';

/** Settle the microtasks and timers a navigation's waits take. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('AnnotationNavigator: which tier answers', () => {
  it("(0) the cursor's own row: its next annotated visible cell, without a query", async () => {
    const store = new ModelStore([
      { scope: 'cell', rowId: 5, column: 'c', severity: 'error', message: 'too big' },
      { scope: 'cell', rowId: 5, column: 'a', severity: 'error' },
    ]);
    const host = makeHost({ store });
    host.body.hold(0, 50);
    host.actions.setFocusedCell({ row: 5, column: 'a' });
    const nav = new AnnotationNavigator(host);

    const landed = await nav.next();

    expect(landed).toMatchObject({ rowId: 5, row: 5, column: 'c', wrapped: false });
    expect(landed!.annotations.map((a) => a.message)).toEqual(['too big']);
    expect(host.state.focusedCell.get()).toEqual({ row: 5, column: 'c' });
    expect(host.body.scrollToRow).toHaveBeenCalledWith(5, 'center');
    expect(host.revealColumn).toHaveBeenCalledWith('c');
    expect(host.closeOverlays).toHaveBeenCalled();
    expect(host.queries).toEqual([]);
    expect(host.source.ensureFresh).not.toHaveBeenCalled();
    // The rows around it are never read: the cell was in the cursor's row.
    expect(host.body.reads).toBe(1);
  });

  it('(1) the rows the grid holds, without a query', async () => {
    const store = new ModelStore([{ scope: 'row', rowId: 30, severity: 'warning' }]);
    const host = makeHost({ store });
    host.body.hold(0, 50);
    host.actions.setFocusedCell({ row: 5, column: 'b' });

    const landed = await new AnnotationNavigator(host).next();

    // Row annotations only: the cursor keeps its column.
    expect(landed).toMatchObject({ rowId: 30, row: 30, column: 'b', wrapped: false });
    expect(host.queries).toEqual([]);
    expect(store.builds).toBe(0);
  });

  it('(1) a grid holding every row answers "none" itself, and wraps without a query', async () => {
    const store = new ModelStore([{ scope: 'row', rowId: 3, severity: 'info' }]);
    const host = makeHost({ store, rows: 40 });
    host.body.hold(0, 40);
    host.actions.setFocusedCell({ row: 20, column: 'a' });

    const landed = await new AnnotationNavigator(host).next();

    expect(landed).toMatchObject({ rowId: 3, row: 3, wrapped: true });
    expect(host.queries).toEqual([]);
    expect(host.source.ensureFresh).not.toHaveBeenCalled();
  });

  it('(2) unfiltered and unsorted: a binary search of the annotated rows, without a query', async () => {
    const store = new ModelStore([
      { scope: 'row', rowId: 2, severity: 'error' },
      { scope: 'cell', rowId: 80, column: 'd', severity: 'error' },
      { scope: 'row', rowId: 95, severity: 'error' },
    ]);
    const host = makeHost({ store });
    host.body.positions = true;
    host.body.hold(0, 50);
    host.actions.setFocusedCell({ row: 10, column: 'a' });
    const nav = new AnnotationNavigator(host);

    expect(await nav.next()).toMatchObject({ rowId: 80, row: 80, column: 'd' });
    expect(await nav.next()).toMatchObject({ rowId: 95, row: 95, column: 'd' });
    expect(await nav.previous()).toMatchObject({ rowId: 80, row: 80, column: 'd' });
    expect(host.queries).toEqual([]);
    expect(store.builds).toBe(1);
  });

  it('(2) skips rowIds no row has: negative, fractional, past the end', async () => {
    const store = new ModelStore([
      { scope: 'row', rowId: -4, severity: 'error' },
      // Between -1 and 0: first in a search from before the first row.
      { scope: 'row', rowId: -0.5, severity: 'error' },
      { scope: 'row', rowId: 12.5, severity: 'error' },
      { scope: 'row', rowId: 40, severity: 'error' },
      { scope: 'row', rowId: 1e9, severity: 'error' },
    ]);
    const host = makeHost({ store, rows: 60 });
    host.body.positions = true;
    host.actions.setFocusedCell({ row: 0, column: 'a' });
    const nav = new AnnotationNavigator(host);

    expect(await nav.next()).toMatchObject({ row: 40, wrapped: false });
    expect(await nav.next()).toMatchObject({ row: 40, wrapped: true });
    expect(await nav.previous()).toMatchObject({ row: 40, wrapped: true });
    expect(host.queries).toEqual([]);
  });

  it('(3) filtered and unsorted: the nearest rowid past the cursor, and a count of the rows before it', async () => {
    const store = new ModelStore([{ scope: 'row', rowId: 150, severity: 'error' }]);
    const host = makeHost({
      store,
      answer: (sql) =>
        sql.startsWith('SELECT min(') ? [{ r: 150 }] : sql.includes('count(*)') ? [{ n: 65 }] : [],
    });
    host.state.filters.set([{ type: 'range', column: 'a', min: 0, max: 10 }]);
    host.state.filteredRows.set(90);
    // The filtered view's first 50 rows, each the even rowid.
    host.body.hold(0, 50, (p) => p * 2);
    host.actions.setFocusedCell({ row: 40, column: 'a' });

    const landed = await new AnnotationNavigator(host).next();

    expect(landed).toMatchObject({ rowId: 150, row: 65 });
    expect(host.source.ensureFresh).toHaveBeenCalledTimes(1);
    expect(host.queries).toHaveLength(2);
    expect(host.queries[0]).toBe(
      'SELECT min("__rowid__") AS r FROM "t" WHERE (("a" >= 0 AND "a" < 10)) AND' +
        ' "__rowid__" IN (SELECT "__rowid__" FROM "helper") AND "__rowid__" > 80',
    );
    // Counted from the start of the view, never reckoned from the cursor's
    // position, which an in-place refresh may have made another row's.
    expect(host.queries[1]).toBe(
      'SELECT count(*) AS n FROM "t" WHERE (("a" >= 0 AND "a" < 10)) AND "__rowid__" < 150',
    );
  });

  it('(3) only the severities sought: the helper is tested by its mask', async () => {
    const store = new ModelStore([{ scope: 'row', rowId: 150, severity: 'warning' }]);
    const host = makeHost({ store, answer: () => [] });
    host.state.filters.set([{ type: 'null', column: 'b' }]);
    host.actions.setFocusedCell({ row: 0, column: 'a' });
    host.body.hold(0, 1);

    expect(await new AnnotationNavigator(host).next({ severities: ['error', 'warning'] })).toBe(
      null,
    );
    expect(host.queries[0]).toContain(
      '"__rowid__" IN (SELECT "__rowid__" FROM "helper" WHERE ("__mask__" & 3) <> 0)',
    );
  });

  it('(3) sorted: the first row past the cursor in the grid order, and a count before it', async () => {
    const store = new ModelStore([{ scope: 'row', rowId: 77, severity: 'error' }]);
    const host = makeHost({
      store,
      answer: (sql) => (sql.includes('count(*)') ? [{ n: 61 }] : [{ r: 77 }]),
    });
    host.state.sortColumns.set([
      { column: 'a', direction: 'desc' },
      { column: 'd', direction: 'asc' },
    ]);
    host.body.hold(0, 40, (p) => 1000 + p);
    host.actions.setFocusedCell({ row: 39, column: 'a' });

    const landed = await new AnnotationNavigator(host).next();

    expect(landed).toMatchObject({ rowId: 77, row: 61 });
    expect(host.queries).toHaveLength(2);
    const [find, count] = host.queries as [string, string];
    // The anchor's keys, then a key-by-key comparison: plain for the
    // INTEGER, by sort key for the list, `__rowid__` last.
    expect(find).toContain(
      'WITH "__dt_a__" AS (SELECT "a" AS "__dt_k0__", "d" AS "__dt_k1__", "__rowid__" AS "__dt_k2__" FROM "t" WHERE "__rowid__" = 1039)',
    );
    expect(find).toContain(
      'CASE WHEN "__dt_a__"."__dt_k0__" IS NULL THEN FALSE ELSE ("t"."a" IS NULL OR "t"."a" < "__dt_a__"."__dt_k0__") END',
    );
    expect(find).toContain(
      `create_sort_key("t"."d", 'ASC NULLS LAST') > create_sort_key("__dt_a__"."__dt_k1__", 'ASC NULLS LAST')`,
    );
    expect(find).toContain(
      `ORDER BY "t"."a" DESC NULLS LAST, create_sort_key("t"."d", 'ASC NULLS LAST') ASC, "t"."__rowid__" ASC NULLS LAST LIMIT 1`,
    );
    expect(count).toContain('WHERE "__rowid__" = 77)');
    expect(count).toMatch(/^WITH "__dt_a__" AS .* SELECT count\(\*\) AS n FROM "t", "__dt_a__"/);
  });

  it('(3) a sort column of a type the parser cannot read numbers the view instead', async () => {
    const schema: ColumnSchema[] = [
      ...NAV_SCHEMA,
      { name: 'odd', type: 'string', nullable: true, originalType: 'MYSTERY(' },
    ];
    const store = new ModelStore([{ scope: 'row', rowId: 7, severity: 'error' }]);
    const host = makeHost({ store, schema, answer: () => [{ r: 7, p: 33 }] });
    host.state.sortColumns.set([{ column: 'odd', direction: 'asc' }]);
    host.actions.setFocusedCell({ row: 10, column: 'a' });
    host.body.hold(10, 11, () => 500);

    expect(await new AnnotationNavigator(host).next()).toMatchObject({ rowId: 7, row: 33 });
    expect(host.queries).toHaveLength(1);
    expect(host.queries[0]).toContain(
      'row_number() OVER (ORDER BY "odd" ASC, "__rowid__" ASC) - 1 AS "__dt_p__"',
    );
    expect(host.queries[0]).toContain('AND "__dt_p__" > 10 ORDER BY "__dt_p__" ASC LIMIT 1');
  });

  it("a cursor row the grid no longer holds is found by the grid's own query", async () => {
    const store = new ModelStore([{ scope: 'row', rowId: 9, severity: 'error' }]);
    const host = makeHost({
      store,
      answer: (sql) =>
        sql.includes('OFFSET 60')
          ? [{ __rowid__: 121 }]
          : sql.startsWith('SELECT min(')
            ? [{ r: null }]
            : [],
    });
    host.state.filters.set([{ type: 'not-null', column: 'b' }]);
    host.state.filteredRows.set(100);
    host.actions.setFocusedCell({ row: 60, column: 'a' });

    expect(await new AnnotationNavigator(host).next({ wrap: false })).toBe(null);
    expect(host.queries[0]).toContain('LIMIT 1 OFFSET 60');
    expect(host.queries[1]).toContain('"__rowid__" > 121');
    expect(host.announce).toHaveBeenLastCalledWith('No more annotations below');
  });

  it('the row it just showed needs no query to be found again, in the same view', async () => {
    const store = new ModelStore([
      { scope: 'row', rowId: 70, severity: 'error' },
      { scope: 'row', rowId: 90, severity: 'error' },
    ]);
    let next = 70;
    const host = makeHost({
      store,
      answer: (sql) =>
        sql.includes('OFFSET')
          ? [{ __rowid__: 70 }]
          : sql.startsWith('SELECT min(')
            ? [{ r: sql.includes('> 70') ? 90 : next }]
            : [{ n: sql.includes('< 90') ? 11 : 5 }],
    });
    host.state.filters.set([{ type: 'not-null', column: 'b' }]);
    host.state.filteredRows.set(50);
    const nav = new AnnotationNavigator(host);

    expect(await nav.next()).toMatchObject({ rowId: 70, row: 5 });
    // The grid has not fetched the row yet: the navigation knows it.
    expect(await nav.next()).toMatchObject({ rowId: 90, row: 11 });
    expect(host.queries.some((sql) => sql.includes('OFFSET'))).toBe(false);

    // Refreshed in place, the view may hold another row there: it is asked for.
    host.view.version++;
    await nav.next();
    expect(host.queries.some((sql) => sql.includes('LIMIT 1 OFFSET 11'))).toBe(true);
    host.queries.length = 0;

    // In another view, the same position is another row: it is asked for.
    host.actions.setFocusedCell({ row: 11, column: 'a' });
    host.state.filters.set([{ type: 'null', column: 'c' }]);
    host.actions.setFocusedCell({ row: 11, column: 'a' });
    next = 90;
    await nav.next();
    expect(host.queries.some((sql) => sql.includes('LIMIT 1 OFFSET 11'))).toBe(true);
  });
});

describe('AnnotationNavigator: aborts', () => {
  function pending(): { host: ReturnType<typeof makeHost>; nav: AnnotationNavigator } {
    const store = new ModelStore([{ scope: 'row', rowId: 30, severity: 'error' }]);
    const host = makeHost({ store });
    host.body.positions = true;
    host.holdFilterCycle();
    return { host, nav: new AnnotationNavigator(host) };
  }

  it('a newer call aborts the older', async () => {
    const { host, nav } = pending();
    const first = nav.next();
    const second = nav.previous();
    host.settleFilterCycle();
    await expect(first).rejects.toMatchObject({ code: 'QUERY_ABORTED' });
    await expect(second).resolves.toMatchObject({ row: 30 });
  });

  it('a cursor move aborts it', async () => {
    const { host, nav } = pending();
    const run = nav.next();
    host.actions.setFocusedCell({ row: 3, column: 'a' });
    await expect(run).rejects.toMatchObject({ code: 'QUERY_ABORTED' });
    // Its own landing does not abort it.
    host.settleFilterCycle();
    await expect(nav.next()).resolves.toMatchObject({ row: 30 });
  });

  it.each([
    [
      'filters',
      (host: ReturnType<typeof makeHost>) =>
        host.state.filters.set([{ type: 'null', column: 'b' }]),
    ],
    [
      'sort',
      (host: ReturnType<typeof makeHost>) =>
        host.state.sortColumns.set([{ column: 'a', direction: 'asc' }]),
    ],
    ['table', (host: ReturnType<typeof makeHost>) => host.state.tableName.set('t_view')],
  ])('a change of the %s aborts it', async (_, change) => {
    const { host, nav } = pending();
    const run = nav.next();
    change(host);
    await expect(run).rejects.toMatchObject({ code: 'QUERY_ABORTED' });
  });

  it("the caller's signal aborts it, before it starts or while it waits", async () => {
    const { host, nav } = pending();
    const early = new AbortController();
    early.abort();
    await expect(nav.next({ signal: early.signal })).rejects.toMatchObject({
      code: 'QUERY_ABORTED',
    });
    const late = new AbortController();
    const run = nav.next({ signal: late.signal });
    late.abort();
    await expect(run).rejects.toMatchObject({ code: 'QUERY_ABORTED' });
    expect(host.state.focusedCell.get()).toBe(null);
  });

  it('a query in flight is aborted with it', async () => {
    const store = new ModelStore([{ scope: 'row', rowId: 30, severity: 'error' }]);
    let seen: AbortSignal | undefined;
    const host = makeHost({
      store,
      bridge: {
        query: vi.fn(
          (_sql: string, signal?: AbortSignal) =>
            new Promise((_resolve, reject) => {
              seen = signal;
              signal?.addEventListener('abort', () =>
                reject(Object.assign(new Error('aborted'), { code: 'QUERY_ABORTED' })),
              );
            }),
        ) as never,
      },
    });
    host.state.filters.set([{ type: 'null', column: 'b' }]);
    host.actions.setFocusedCell({ row: 1, column: 'a' });
    host.body.hold(1, 2);
    const nav = new AnnotationNavigator(host);
    const run = nav.next();
    await vi.waitFor(() => expect(seen).toBeDefined());
    nav.destroy();
    await expect(run).rejects.toMatchObject({ code: 'QUERY_ABORTED' });
    expect(seen!.aborted).toBe(true);
  });

  it('options it does not take reject without aborting the one running', async () => {
    const { host, nav } = pending();
    const run = nav.next();
    await expect(nav.next({ severities: ['fatal' as 'error'] })).rejects.toMatchObject({
      code: 'OPTIONS_INVALID',
    });
    await expect(nav.next({ wrap: 'yes' as unknown as boolean })).rejects.toMatchObject({
      code: 'OPTIONS_INVALID',
    });
    host.settleFilterCycle();
    await expect(run).resolves.toMatchObject({ row: 30 });
  });
});

describe('AnnotationNavigator: wrapping and severities', () => {
  function table(): ReturnType<typeof makeHost> {
    const store = new ModelStore([
      { scope: 'row', rowId: 10, severity: 'warning', message: 'w10' },
      { scope: 'row', rowId: 20, severity: 'error', message: 'e20' },
    ]);
    const host = makeHost({ store, rows: 30 });
    host.body.positions = true;
    return host;
  }

  it('goes round the end, and says so', async () => {
    const host = table();
    host.actions.setFocusedCell({ row: 20, column: 'a' });
    const nav = new AnnotationNavigator(host);

    expect(await nav.next()).toMatchObject({ row: 10, wrapped: true });
    expect(host.announce).toHaveBeenLastCalledWith(
      'Wrapped to the first annotation. Row 11 of 30: warning, w10',
    );
    expect(await nav.previous()).toMatchObject({ row: 20, wrapped: true });
    expect(host.announce).toHaveBeenLastCalledWith(
      'Wrapped to the last annotation. Row 21 of 30: error, e20',
    );
  });

  it('stops at the end with wrap: false', async () => {
    const host = table();
    host.actions.setFocusedCell({ row: 20, column: 'a' });
    const nav = new AnnotationNavigator(host);
    expect(await nav.next({ wrap: false })).toBe(null);
    expect(host.announce).toHaveBeenLastCalledWith('No more annotations below');
    expect(host.state.focusedCell.get()).toEqual({ row: 20, column: 'a' });
    host.actions.setFocusedCell({ row: 10, column: 'a' });
    expect(await nav.previous({ wrap: false })).toBe(null);
    expect(host.announce).toHaveBeenLastCalledWith('No more annotations above');
  });

  it('without a cursor, goes to the first annotation, or back to the last; from the header, back wraps', async () => {
    const host = table();
    const nav = new AnnotationNavigator(host);
    expect(await nav.next()).toMatchObject({ row: 10, wrapped: false });
    host.actions.clearFocusedCell();
    expect(await nav.previous()).toMatchObject({ row: 20, wrapped: false });
    host.actions.setFocusedCell({ row: -1, column: 'b' });
    expect(await nav.next()).toMatchObject({ row: 10, column: 'b', wrapped: false });
    host.actions.setFocusedCell({ row: -1, column: 'b' });
    expect(await nav.previous()).toMatchObject({ row: 20, wrapped: true });
  });

  it('seeks the severities the severity filter shows, unless told which', async () => {
    const host = table();
    const store = host.store as ModelStore;
    const nav = new AnnotationNavigator(host);
    store.filter = { error: true, warning: false, info: true };
    expect(await nav.next()).toMatchObject({ row: 20 });
    host.actions.clearFocusedCell();
    expect(await nav.next({ severities: ['warning'] })).toMatchObject({ row: 10 });
  });

  it('finds nothing, without a query, when the severity filter hides every severity', async () => {
    const host = table();
    (host.store as ModelStore).filter = { error: false, warning: false, info: false };
    expect(await new AnnotationNavigator(host).next()).toBe(null);
    expect(await new AnnotationNavigator(host).next({ severities: [] })).toBe(null);
    expect(host.announce).toHaveBeenLastCalledWith('No annotations shown');
    expect(host.queries).toEqual([]);
  });

  it('finds nothing in a table without annotations, or without a store', async () => {
    const host = makeHost({ store: null });
    expect(await new AnnotationNavigator(host).next()).toBe(null);
    expect(host.announce).toHaveBeenLastCalledWith('No annotations shown');
  });

  it('column annotations single out no row', async () => {
    const store = new ModelStore([{ scope: 'column', column: 'a', severity: 'error' }]);
    const host = makeHost({ store, rows: 20 });
    host.body.positions = true;
    expect(await new AnnotationNavigator(host).next()).toBe(null);
  });
});

describe('AnnotationNavigator: where the cursor lands', () => {
  function annotated(
    ...annotations: ConstructorParameters<typeof ModelStore>[0] & object
  ): ReturnType<typeof makeHost> {
    const host = makeHost({ store: new ModelStore(annotations), rows: 50 });
    host.body.positions = true;
    return host;
  }

  it('on the first annotated visible cell going forward, the last going back; pinned columns first', async () => {
    const host = annotated(
      { scope: 'cell', rowId: 10, column: 'a', severity: 'error' },
      { scope: 'cell', rowId: 10, column: 'c', severity: 'info' },
    );
    // `c` pinned: it leads the visible order.
    host.actions.toggleColumnPin('c');
    expect(host.state.visibleColumns.get()).toEqual(['c', 'a', 'b', 'd']);
    const nav = new AnnotationNavigator(host);

    expect(await nav.next()).toMatchObject({ row: 10, column: 'c' });
    expect(await nav.next()).toMatchObject({ row: 10, column: 'a', wrapped: false });
    host.actions.setFocusedCell({ row: 30, column: 'd' });
    expect(await nav.previous()).toMatchObject({ row: 10, column: 'a' });
    expect(await nav.previous()).toMatchObject({ row: 10, column: 'c' });
  });

  it("keeps the cursor's column for the row's own annotations", async () => {
    const host = annotated({ scope: 'row', rowId: 12, severity: 'warning', message: 'check' });
    host.actions.setFocusedCell({ row: 0, column: 'b' });
    const landed = await new AnnotationNavigator(host).next();
    expect(landed).toMatchObject({ row: 12, column: 'b' });
    expect(landed!.annotations.map((a) => a.message)).toEqual(['check']);
    expect(host.announce).toHaveBeenLastCalledWith('Row 13 of 50: warning, check');
  });

  it("keeps the cursor's column for a cell in a hidden column, and names the column", async () => {
    const host = annotated({
      scope: 'cell',
      rowId: 12,
      column: 'b',
      severity: 'error',
      message: 'bad b',
    });
    host.actions.hideColumn('b');
    host.actions.setFocusedCell({ row: 0, column: 'c' });
    const landed = await new AnnotationNavigator(host).next();
    expect(landed).toMatchObject({ row: 12, column: 'c' });
    expect(landed!.annotations.map((a) => a.message)).toEqual(['bad b']);
    expect(host.announce).toHaveBeenLastCalledWith('Row 13 of 50, b (hidden): error, bad b');
  });

  it('names a column the table does not have', async () => {
    const host = annotated({
      scope: 'cell',
      rowId: 7,
      column: 'gone',
      severity: 'info',
      message: 'old',
    });
    const landed = await new AnnotationNavigator(host).next();
    expect(landed).toMatchObject({ row: 7, column: 'a' });
    expect(host.announce).toHaveBeenLastCalledWith('Row 8 of 50, gone (hidden): info, old');
  });

  it("lists the row's and the cell's annotations of the severities sought, as getByCell sorts them", async () => {
    const host = annotated(
      { scope: 'cell', rowId: 4, column: 'b', severity: 'info', message: 'i' },
      { scope: 'row', rowId: 4, severity: 'warning', message: 'w' },
      { scope: 'column', column: 'b', severity: 'error', message: 'column' },
      { scope: 'cell', rowId: 4, column: 'b', severity: 'error', message: 'e' },
      { scope: 'cell', rowId: 4, column: 'd', severity: 'error', message: 'other cell' },
    );
    host.actions.setFocusedCell({ row: 4, column: 'a' });
    const landed = await new AnnotationNavigator(host).next();
    expect(landed).toMatchObject({ row: 4, column: 'b' });
    expect(landed!.annotations.map((a) => a.message)).toEqual(['e', 'w', 'i']);
    expect(host.announce).toHaveBeenLastCalledWith('Row 5 of 50, b: error, e, and 2 more');

    host.actions.setFocusedCell({ row: 4, column: 'a' });
    const errors = await new AnnotationNavigator(host).next({ severities: ['error'] });
    expect(errors!.annotations.map((a) => a.message)).toEqual(['e']);
  });

  it('says it in the messages the table was given', async () => {
    const messages = mergeStrings(defaultStrings, {
      annotations: {
        severityNames: { error: 'Fehler' },
        navigation: {
          landed: (row, total, place, severity, message, more) =>
            `Zeile ${row}/${total} ${place ?? '-'} ${severity}: ${message} +${more}`,
        },
      },
    });
    const store = new ModelStore([
      { scope: 'cell', rowId: 1, column: 'a', severity: 'error', message: 'x' },
    ]);
    const host = makeHost({ store, messages, rows: 5 });
    host.body.positions = true;
    await new AnnotationNavigator(host).next();
    expect(host.announce).toHaveBeenLastCalledWith('Zeile 2/5 a Fehler: x +0');
  });

  it('ends the scroll back to the top a filter change animates, before it reads the rows held', async () => {
    const host = annotated({ scope: 'row', rowId: 40, severity: 'error' });
    const order: string[] = [];
    host.body.cancelScrollAnimation.mockImplementation(() => void order.push('cancel'));
    host.body.scrollToRow.mockImplementation(() => void order.push('scroll'));
    await new AnnotationNavigator(host).next();
    expect(order).toEqual(['cancel', 'cancel', 'scroll']);
  });

  it('waits for the filters to have their row count', async () => {
    const host = annotated({ scope: 'row', rowId: 40, severity: 'error' });
    host.holdFilterCycle();
    const run = new AnnotationNavigator(host).next();
    await tick();
    expect(host.body.scrollToRow).not.toHaveBeenCalled();
    host.settleFilterCycle();
    await expect(run).resolves.toMatchObject({ row: 40 });
  });

  it('rejects with NO_TABLE when no table is loaded', async () => {
    const host = annotated({ scope: 'row', rowId: 1, severity: 'error' });
    host.state.tableName.set(null);
    await expect(new AnnotationNavigator(host).next()).rejects.toMatchObject({ code: 'NO_TABLE' });
  });
});

describe('AnnotationNavigator: a view refreshed in place', () => {
  const ANNOTATED_FILTER = { type: 'annotated', column: '__annotated__', table: 't' } as const;

  /**
   * The annotated view [3, 5, 7, 9]: rows 3, 7 and 9 annotated, row 5 in
   * cells `b` and `d`, and row 9 in cells `a` and `d` too. The grid holds
   * all four.
   */
  function annotatedView(): ReturnType<typeof makeHost> {
    const store = new ModelStore([
      { scope: 'row', rowId: 3, severity: 'error', message: 'r3' },
      { scope: 'cell', rowId: 5, column: 'b', severity: 'error', message: 'b5' },
      { scope: 'cell', rowId: 5, column: 'd', severity: 'error', message: 'd5' },
      { scope: 'row', rowId: 7, severity: 'error', message: 'r7' },
      { scope: 'row', rowId: 9, severity: 'error', message: 'r9' },
      { scope: 'cell', rowId: 9, column: 'a', severity: 'error', message: 'a9' },
      { scope: 'cell', rowId: 9, column: 'd', severity: 'error', message: 'd9' },
    ]);
    const host = makeHost({ store, rows: 10 });
    host.state.filters.set([ANNOTATED_FILTER]);
    host.state.filteredRows.set(4);
    host.body.hold(0, 4, (p) => [3, 5, 7, 9][p]!);
    return host;
  }

  /** A promise for the test to resolve, and its resolver. */
  function gate(): { promise: Promise<void>; open: () => void } {
    let open!: () => void;
    const promise = new Promise<void>((resolve) => (open = resolve));
    return { promise, open };
  }

  it('brings the annotated rows up to date, and waits for the refresh in place, before it reads the rows', async () => {
    const host = annotatedView();
    const refresh = gate();
    host.view.settled = refresh.promise;
    host.actions.setFocusedCell({ row: 0, column: 'a' });
    const run = new AnnotationNavigator(host).next();
    await tick();
    expect(host.source.ensureFresh).toHaveBeenCalledTimes(1);
    expect(host.whenAnnotatedViewSettled).toHaveBeenCalledTimes(1);
    expect(host.body.reads).toBe(0);

    // The refresh lands: row 3's annotations went, and the rows moved up.
    host.body.cache.clear();
    host.body.hold(0, 3, (p) => [5, 7, 9][p]!);
    host.state.filteredRows.set(3);
    refresh.open();
    // From row 5, now at the cursor's position: its next cell, then row 7.
    await expect(run).resolves.toMatchObject({ rowId: 5, row: 0, column: 'b' });
  });

  it("the table's own move of the cursor, following its row, aborts nothing; the user's does", async () => {
    const host = annotatedView();
    const nav = new AnnotationNavigator(host);
    let refresh = gate();
    host.view.settled = refresh.promise;
    host.actions.setFocusedCell({ row: 2, column: 'c' });
    const run = nav.next();
    await tick();
    // A row above went: the table moves the cursor up with row 7.
    host.body.cache.clear();
    host.body.hold(0, 3, (p) => [5, 7, 9][p]!);
    host.view.following = true;
    host.actions.setFocusedCell({ row: 1, column: 'c' });
    host.view.following = false;
    refresh.open();
    await expect(run).resolves.toMatchObject({ rowId: 9, row: 2 });

    refresh = gate();
    host.view.settled = refresh.promise;
    const dropped = nav.next();
    await tick();
    host.actions.setFocusedCell({ row: 0, column: 'c' });
    refresh.open();
    await expect(dropped).rejects.toMatchObject({ code: 'QUERY_ABORTED' });
  });

  it('from the gap before the cursor’s row: forward, that row first, whole; back, the row before it', async () => {
    const host = annotatedView();
    const nav = new AnnotationNavigator(host);
    // Row 4 went from between 3 and 5: row 5 slid under the cursor.
    host.actions.setFocusedCell({ row: 1, column: 'c' });
    host.view.gap = 'before';
    expect(await nav.next()).toMatchObject({ rowId: 5, row: 1, column: 'b', wrapped: false });
    expect(host.announce).toHaveBeenLastCalledWith('Row 2 of 4, b: error, b5');

    host.actions.setFocusedCell({ row: 1, column: 'c' });
    expect(await nav.previous()).toMatchObject({ rowId: 3, row: 0, wrapped: false });

    // Without the gap, the cursor's own row: its next and previous cells.
    host.view.gap = null;
    host.actions.setFocusedCell({ row: 1, column: 'c' });
    expect(await nav.next()).toMatchObject({ rowId: 5, row: 1, column: 'd' });
    host.actions.setFocusedCell({ row: 1, column: 'c' });
    expect(await nav.previous()).toMatchObject({ rowId: 5, row: 1, column: 'b' });
  });

  it('from the gap after the cursor’s row, the last: back, that row first, whole; forward, round to the first', async () => {
    const host = annotatedView();
    const nav = new AnnotationNavigator(host);
    // The last row went, and the cursor went up to row 9.
    host.actions.setFocusedCell({ row: 3, column: 'b' });
    host.view.gap = 'after';
    expect(await nav.previous()).toMatchObject({ rowId: 9, row: 3, column: 'd', wrapped: false });

    host.actions.setFocusedCell({ row: 3, column: 'b' });
    expect(await nav.next()).toMatchObject({ rowId: 3, row: 0, wrapped: true });
  });

  it('in SQL, the row on the far side of the gap is one the search may find', async () => {
    const host = makeHost({
      store: new ModelStore([{ scope: 'row', rowId: 150, severity: 'error' }]),
      answer: (sql) => (sql.includes('count(*)') ? [{ n: 20 }] : [{ r: 150 }]),
    });
    host.state.filters.set([ANNOTATED_FILTER]);
    host.state.filteredRows.set(50);
    const nav = new AnnotationNavigator(host);
    const fromGap = (): void => {
      // The grid holds the cursor's row only, row 40: the rows past it are SQL's.
      host.body.cache.clear();
      host.body.hold(12, 13, () => 40);
      host.actions.setFocusedCell({ row: 12, column: 'a' });
      host.view.gap = 'before';
    };

    fromGap();
    expect(await nav.next()).toMatchObject({ rowId: 150, row: 20 });
    expect(host.queries[0]).toContain(' AND "__rowid__" >= 40');

    host.state.sortColumns.set([{ column: 'a', direction: 'desc' }]);
    host.queries.length = 0;
    fromGap();
    expect(await nav.next()).toMatchObject({ rowId: 150, row: 20 });
    expect(host.queries[0]).toContain(' OR "t"."__rowid__" = 40) ORDER BY ');
  });

  it('searches again when the view is refreshed in place while it searches, and gives up on a view that keeps changing', async () => {
    let refreshes = 1;
    const host = makeHost({
      store: new ModelStore([{ scope: 'row', rowId: 150, severity: 'error' }]),
      answer: (sql) => {
        if (sql.startsWith('SELECT min(')) {
          // A sync lands, and the view is refreshed, as the search runs.
          if (refreshes > 0) {
            refreshes--;
            host.view.version++;
          }
          return [{ r: 150 }];
        }
        return [{ n: host.view.version === 0 ? 70 : 65 }];
      },
    });
    host.state.filters.set([{ type: 'null', column: 'b' }]);
    host.state.filteredRows.set(90);
    host.actions.setFocusedCell({ row: 0, column: 'a' });
    host.body.hold(0, 1, () => 0);
    const nav = new AnnotationNavigator(host);

    expect(await nav.next()).toMatchObject({ rowId: 150, row: 65 });
    expect(host.queries.filter((sql) => sql.startsWith('SELECT min('))).toHaveLength(2);

    refreshes = Infinity;
    host.queries.length = 0;
    host.actions.setFocusedCell({ row: 0, column: 'a' });
    await expect(nav.next()).rejects.toMatchObject({ code: 'QUERY_ABORTED' });
    expect(host.queries.filter((sql) => sql.startsWith('SELECT min('))).toHaveLength(3);
    expect(host.state.focusedCell.get()).toEqual({ row: 0, column: 'a' });
  });
});

describe('AnnotationNavigator: revealRow', () => {
  it('unfiltered and unsorted, a row is where its rowid says', async () => {
    const host = makeHost({ rows: 100 });
    host.body.positions = true;
    host.actions.setFocusedCell({ row: 3, column: 'b' });
    const nav = new AnnotationNavigator(host);

    expect(await nav.reveal(42)).toEqual({ row: 42, column: 'b' });
    expect(host.body.scrollToRow).toHaveBeenLastCalledWith(42, 'center');
    expect(host.state.focusedCell.get()).toEqual({ row: 42, column: 'b' });
    expect(await nav.reveal(43n, 'c', { align: 'start' })).toEqual({ row: 43, column: 'c' });
    expect(host.body.scrollToRow).toHaveBeenLastCalledWith(43, 'start');
    await expect(nav.reveal(100)).rejects.toMatchObject({
      code: 'INVALID_ROWID',
      details: { rowId: 100 },
    });
    expect(host.queries).toEqual([]);
  });

  it('a row the grid holds needs no query', async () => {
    const host = makeHost();
    host.state.sortColumns.set([{ column: 'a', direction: 'asc' }]);
    host.body.hold(0, 30, (p) => 500 + p);
    expect(await new AnnotationNavigator(host).reveal(517)).toEqual({ row: 17, column: 'a' });
    expect(host.queries).toEqual([]);
  });

  it('asks DuckDB whether the filters show it, and where', async () => {
    const shown = new Map([
      [7, true],
      [8, false],
    ]);
    const host = makeHost({
      answer: (sql) => {
        const id = Number(/"__rowid__" = (\d+)$/.exec(sql)?.[1]);
        if (sql.includes(' AS shown ')) return shown.has(id) ? [{ shown: shown.get(id) }] : [];
        return [{ n: 3 }];
      },
    });
    host.state.filters.set([{ type: 'not-null', column: 'b' }]);
    const nav = new AnnotationNavigator(host);

    expect(await nav.reveal(7)).toEqual({ row: 3, column: 'a' });
    expect(host.queries).toEqual([
      'SELECT coalesce(("b" IS NOT NULL), false) AS shown FROM "t" WHERE "__rowid__" = 7',
      'SELECT count(*) AS n FROM "t" WHERE ("b" IS NOT NULL) AND "__rowid__" < 7',
    ]);
    expect(await nav.reveal(8)).toBe(null);
    await expect(nav.reveal(9)).rejects.toMatchObject({ code: 'INVALID_ROWID' });
  });

  it('with focus: false, scrolls and leaves the cursor', async () => {
    const host = makeHost();
    host.body.positions = true;
    host.actions.setFocusedCell({ row: 1, column: 'a' });
    expect(await new AnnotationNavigator(host).reveal(60, 'c', { focus: false })).toEqual({
      row: 60,
      column: 'c',
    });
    expect(host.state.focusedCell.get()).toEqual({ row: 1, column: 'a' });
    expect(host.revealColumn).toHaveBeenLastCalledWith('c');
  });

  it("a hidden column leaves the cursor's", async () => {
    const host = makeHost();
    host.body.positions = true;
    host.actions.hideColumn('c');
    host.actions.setFocusedCell({ row: 1, column: 'b' });
    expect(await new AnnotationNavigator(host).reveal(9, 'c')).toEqual({ row: 9, column: 'b' });
  });

  it('refuses what it cannot take', async () => {
    const host = makeHost();
    const nav = new AnnotationNavigator(host);
    await expect(nav.reveal(-1)).rejects.toMatchObject({ code: 'INVALID_ROWID' });
    await expect(nav.reveal(1.5)).rejects.toMatchObject({ code: 'INVALID_ROWID' });
    await expect(nav.reveal(1, 'nope')).rejects.toMatchObject({ code: 'COLUMN_NOT_FOUND' });
    await expect(nav.reveal(1, undefined, { align: 'middle' as 'center' })).rejects.toMatchObject({
      code: 'OPTIONS_INVALID',
    });
    await expect(
      nav.reveal(1, undefined, { focus: 'yes' as unknown as boolean }),
    ).rejects.toMatchObject({ code: 'OPTIONS_INVALID' });
  });
});

describe('the model these tests navigate agrees with the annotation store', () => {
  it('on every mask, the annotated rows, getByCell and getByRow', () => {
    // A seeded mix: every scope and severity, rowIds negative, fractional
    // and past the rows, ties of createdAt broken by insertion.
    let seed = 7;
    const random = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const severities: AnnotationSeverity[] = ['error', 'warning', 'info'];
    const rowIds = [-2, -0.5, 0, 1, 2, 2.5, 3, 5, 8, 13, 21, 40];
    const columns = ['a', 'b', 'c', 'gone'];
    const list: NewAnnotation[] = [];
    for (let i = 0; i < 400; i++) {
      const severity = severities[random(3)]!;
      const createdAt = `2026-01-0${1 + random(3)}T00:00:00.000Z`;
      const rowId = rowIds[random(rowIds.length)]!;
      const column = columns[random(columns.length)]!;
      const message = `m${i}`;
      const scope = random(3);
      list.push(
        scope === 0
          ? { scope: 'row', rowId, severity, createdAt, message }
          : scope === 1
            ? { scope: 'column', column, severity, createdAt, message }
            : { scope: 'cell', rowId, column, severity, createdAt, message },
      );
    }
    const store = new AnnotationStore();
    store.addMany(list);
    const model = new ModelStore(list as ConstructorParameters<typeof ModelStore>[0]);
    const ids = (anns: { message: string }[]): string[] => anns.map((a) => a.message);

    const real = store.annotatedRows();
    const modeled = model.annotatedRows();
    expect([...real.rowIds]).toEqual([...modeled.rowIds]);
    expect([...real.masks]).toEqual([...modeled.masks]);
    for (const rowId of [...rowIds, 4, 100]) {
      expect(store.rowScopeMask(rowId), `row ${rowId}`).toBe(model.rowScopeMask(rowId));
      expect(store.annotatedRowMask(rowId), `row ${rowId}`).toBe(model.annotatedRowMask(rowId));
      expect(ids(store.getByRow(rowId)), `getByRow ${rowId}`).toEqual(ids(model.getByRow(rowId)));
      for (const column of [...columns, 'none']) {
        const at = `${rowId}/${column}`;
        expect(store.cellScopeMask(rowId, column), at).toBe(model.cellScopeMask(rowId, column));
        expect(ids(store.getByCell(rowId, column)), at).toEqual(
          ids(model.getByCell(rowId, column)),
        );
      }
    }
  });
});
