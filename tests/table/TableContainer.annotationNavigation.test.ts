/**
 * @vitest-environment jsdom
 *
 * Annotation navigation as `TableContainer` wires it: the keys reach the
 * actions only when there are annotations, `annotationNavigation: false`
 * leaves the keys and keeps the actions, the navigator's chunk loads on
 * first use, a navigation waits for the filter cycle the facade reports, a
 * failure the keys started goes to `onError`, the live region says where
 * the cursor landed, and destroying the container leaves no navigation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnnotationStore } from '@/annotations/AnnotationStore';
import { StateActions } from '@/core/Actions';
import { ConfigurationError, QueryError, type DataTableError } from '@/core/errors';
import { __resetModalHostForTests } from '@/core/ModalHost';
import { createTableState, initializeColumnsFromSchema, type TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { AnnotationPopover } from '@/table/AnnotationPopover';
import { TableContainer, type TableContainerOptions } from '@/table/TableContainer';

class MockResizeObserver implements ResizeObserver {
  constructor(_: ResizeObserverCallback) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'score', type: 'float', nullable: true, originalType: 'DOUBLE' },
];
const ROWS = 40;

/** Answers the body's row reads; `navigate` answers the navigator's own queries. */
function makeBridge(navigate: (sql: string) => Record<string, unknown>[] = () => []): {
  bridge: WorkerBridge;
  queries: string[];
} {
  const queries: string[] = [];
  const query = vi.fn(async (sql: string) => {
    queries.push(sql);
    const fetch = /^SELECT "__rowid__"(?:, (.*?))? FROM "t" WHERE "__rowid__" >= (\d+) AND/.exec(
      sql,
    );
    if (fetch) {
      const from = Number(fetch[2]);
      const limit = Number(/LIMIT (\d+)/.exec(sql)![1]);
      return Array.from({ length: Math.max(0, Math.min(limit, ROWS - from)) }, (_, i) => ({
        __rowid__: from + i,
        id: from + i,
        name: `n${from + i}`,
        score: (from + i) / 2,
      }));
    }
    return navigate(sql);
  });
  const bridge = {
    query,
    initialize: vi.fn(),
    terminate: vi.fn(),
    clearQueryCache: vi.fn(),
    isInitialized: () => true,
  } as unknown as WorkerBridge;
  return { bridge, queries };
}

let state: TableState;
let actions: StateActions;
let table: TableContainer;
let store: AnnotationStore;
let popover: AnnotationPopover;

async function mount(
  options: TableContainerOptions = {},
  navigate?: (sql: string) => Record<string, unknown>[],
): Promise<{ queries: string[] }> {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const { bridge, queries } = makeBridge(navigate);
  state = createTableState();
  actions = new StateActions(state, bridge);
  state.schema.set(SCHEMA);
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(ROWS);
  state.filteredRows.set(ROWS);
  state.tableName.set('t');
  state.baseTableName.set('t');
  store = new AnnotationStore();
  popover = new AnnotationPopover();
  table = new TableContainer(host, state, actions, bridge, {
    annotations: store,
    annotationPopover: popover,
    ...options,
  });
  const scroll = table.getElement().querySelector<HTMLElement>('.dt-body-scroll')!;
  Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 320 });
  await table.whenBodyReady();
  table.getTableBody()!.getVirtualScroller().refresh();
  return { queries };
}

/** Press `key` on the grid; returns whether its default was prevented. */
function press(init: KeyboardEventInit): boolean {
  const grid = table.getGridElement();
  grid.focus();
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  grid.dispatchEvent(event);
  return event.defaultPrevented;
}

const announced = (): string => table.getElement().querySelector('.dt-announce')?.textContent ?? '';

afterEach(() => {
  table?.destroy();
  popover?.destroy();
  __resetModalHostForTests();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('TableContainer: annotation navigation', () => {
  it('F8 takes the cursor to the next annotation, and the live region says where', async () => {
    await mount();
    store.add({
      scope: 'cell',
      rowId: 25,
      column: 'score',
      severity: 'error',
      message: 'too high',
    });
    actions.setFocusedCell({ row: 2, column: 'id' });

    expect(press({ key: 'F8' })).toBe(true);
    await vi.waitFor(() => expect(state.focusedCell.get()).toEqual({ row: 25, column: 'score' }));
    expect(announced()).toBe('Row 26 of 40, score: error, too high');
    expect(table.getTableBody()!.getVisibleRange().start).toBeLessThanOrEqual(25);
    expect(table.getTableBody()!.getVisibleRange().end).toBeGreaterThan(25);

    // Alt+↑ goes back; with one annotation, round to the same cell.
    expect(press({ key: 'ArrowUp', altKey: true })).toBe(true);
    await vi.waitFor(() =>
      expect(announced()).toBe(
        'Wrapped to the last annotation. Row 26 of 40, score: error, too high',
      ),
    );
  });

  it('leaves the keys to the page while there is no row to go to', async () => {
    await mount();
    actions.setFocusedCell({ row: 2, column: 'id' });
    expect(press({ key: 'F8' })).toBe(false);
    expect(press({ key: 'ArrowDown', altKey: true })).toBe(false);
    // A column annotation singles out no row.
    store.add({ scope: 'column', column: 'name', severity: 'info', message: 'about names' });
    expect(press({ key: 'F8' })).toBe(false);
    // Rows whose every severity the severity filter hides are not gone to either.
    store.add({ scope: 'row', rowId: 5, severity: 'warning', message: 'look' });
    store.setSeverityFilter({ error: false, warning: false, info: false });
    expect(press({ key: 'F8' })).toBe(false);
    expect(press({ key: 'ArrowUp', altKey: true })).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(announced()).toBe('');
    expect(state.focusedCell.get()).toEqual({ row: 2, column: 'id' });

    // A severity shown, of any annotation: the keys go to the rows.
    store.setSeverityFilter({ info: true });
    expect(press({ key: 'F8' })).toBe(true);
    await vi.waitFor(() => expect(announced()).toBe('No annotations shown'));
    store.setSeverityFilter({ warning: true });
    expect(press({ key: 'F8' })).toBe(true);
    await vi.waitFor(() => expect(state.focusedCell.get()).toEqual({ row: 5, column: 'id' }));
  });

  it('with annotationNavigation: false, the keys are the page’s and the actions still work', async () => {
    await mount({ annotationNavigation: false });
    store.add({ scope: 'row', rowId: 30, severity: 'warning', message: 'look' });
    actions.setFocusedCell({ row: 2, column: 'name' });
    expect(press({ key: 'F8' })).toBe(false);
    expect(state.focusedCell.get()).toEqual({ row: 2, column: 'name' });

    expect(await actions.nextAnnotation()).toMatchObject({ rowId: 30, row: 30, column: 'name' });
    expect(await actions.revealRow(7, 'score')).toEqual({ row: 7, column: 'score' });
    expect(state.focusedCell.get()).toEqual({ row: 7, column: 'score' });
  });

  it('waits for the filter cycle the facade reports before it searches', async () => {
    const { queries } = await mount({}, (sql) =>
      sql.startsWith('SELECT min(') ? [{ r: 31 }] : sql.includes('count(*)') ? [{ n: 4 }] : [],
    );
    store.add({ scope: 'row', rowId: 31, severity: 'error', message: 'far' });
    // The facade reports each cycle; until the first, nothing waits.
    table.filterCycleSettled(state.filters.get());
    actions.addFilter({ type: 'range', column: 'score', min: 3, max: 18 });
    state.filteredRows.set(30);

    const run = actions.nextAnnotation();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(queries.some((sql) => sql.includes('__dt_annot_t__'))).toBe(false);

    table.filterCycleSettled(state.filters.get());
    await expect(run).resolves.toMatchObject({ rowId: 31, row: 4 });
    expect(
      queries.some((sql) => sql.startsWith('CREATE OR REPLACE TEMP TABLE "__dt_annot_t__"')),
    ).toBe(true);
  });

  it('a navigation that stops waiting for the filter cycle leaves no wait behind', async () => {
    await mount();
    store.add({ scope: 'row', rowId: 31, severity: 'error', message: 'far' });
    table.filterCycleSettled(state.filters.get());
    actions.addFilter({ type: 'range', column: 'score', min: 3, max: 18 });
    const waits = (): number =>
      (table as unknown as { filterCycleWaiters: unknown[] }).filterCycleWaiters.length;

    // Each newer one aborts the one before: only the latest waits.
    const runs = [actions.nextAnnotation(), actions.nextAnnotation(), actions.nextAnnotation()];
    const ended = Promise.allSettled(runs);
    await vi.waitFor(() => expect(waits()).toBe(1));
    actions.setFocusedCell({ row: 0, column: 'id' });
    const outcomes = await ended;
    expect(outcomes.map((outcome) => outcome.status)).toEqual(['rejected', 'rejected', 'rejected']);
    expect(waits()).toBe(0);
  });

  it('a search the keys started that fails goes to onError; one dropped does not', async () => {
    const onError = vi.fn<(error: DataTableError) => void>();
    await mount({ onError }, (sql) => {
      if (sql.startsWith('SELECT min(')) {
        throw new QueryError('boom', { code: 'QUERY_RUNTIME' });
      }
      return [];
    });
    store.add({ scope: 'row', rowId: 35, severity: 'error', message: 'x' });
    actions.addFilter({ type: 'null', column: 'name' });
    state.filteredRows.set(40);
    actions.setFocusedCell({ row: 1, column: 'id' });
    press({ key: 'F8' });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

    onError.mockClear();
    press({ key: 'F8' });
    actions.setFocusedCell({ row: 2, column: 'id' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onError).not.toHaveBeenCalled();
  });

  it('a search the keys started that fails with an error not the library’s goes to onError as a query error', async () => {
    const onError = vi.fn<(error: DataTableError) => void>();
    const boom = new TypeError('the app’s bridge broke');
    await mount({ onError }, (sql) => {
      if (sql.startsWith('SELECT min(')) throw boom;
      return [];
    });
    store.add({ scope: 'row', rowId: 35, severity: 'error', message: 'x' });
    actions.addFilter({ type: 'null', column: 'name' });
    state.filteredRows.set(40);
    actions.setFocusedCell({ row: 1, column: 'id' });
    press({ key: 'F8' });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    const [error] = onError.mock.calls[0]!;
    expect(error).toBeInstanceOf(QueryError);
    expect(error).toMatchObject({ code: 'QUERY_RUNTIME', message: 'the app’s bridge broke' });
    expect(error.cause).toBe(boom);
  });

  it('a navigator chunk that does not load is CHUNK_LOAD_FAILED, as a panel’s is', async () => {
    vi.doMock('@/annotations/AnnotationNavigator', () => {
      throw new Error('chunk offline');
    });
    try {
      const onError = vi.fn<(error: DataTableError) => void>();
      await mount({ onError });
      store.add({ scope: 'row', rowId: 12, severity: 'info', message: 'note' });
      const failed = { code: 'CHUNK_LOAD_FAILED', details: { panel: 'annotationNavigator' } };
      // To the caller of the actions…
      await expect(actions.nextAnnotation()).rejects.toMatchObject(failed);
      expect(onError).not.toHaveBeenCalled();
      // …and to onError for the keys, which have no caller.
      expect(press({ key: 'F8' })).toBe(true);
      await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
      const [error] = onError.mock.calls[0]!;
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error).toMatchObject(failed);
      expect(error.message).toMatch(/^The annotationNavigator chunk did not load: /);
    } finally {
      vi.doUnmock('@/annotations/AnnotationNavigator');
    }
  });

  it('closes the annotation popover where it lands', async () => {
    await mount();
    store.add({ scope: 'row', rowId: 12, severity: 'info', message: 'note' });
    const hide = vi.spyOn(popover, 'hide');
    await actions.nextAnnotation();
    expect(hide).toHaveBeenCalled();
  });

  it('after destroy, the actions have no navigation to run', async () => {
    await mount();
    store.add({ scope: 'row', rowId: 12, severity: 'info', message: 'note' });
    table.destroy();
    await expect(actions.nextAnnotation()).rejects.toMatchObject({ code: 'NO_TABLE' });
    await expect(actions.revealRow(3)).rejects.toMatchObject({ code: 'NO_TABLE' });
  });

  it('actions without a table UI reject with NO_TABLE', async () => {
    await mount();
    const bare = new StateActions(createTableState(), {
      query: vi.fn(),
      clearQueryCache: vi.fn(),
    } as unknown as WorkerBridge);
    await expect(bare.nextAnnotation()).rejects.toMatchObject({ code: 'NO_TABLE' });
    await expect(bare.previousAnnotation()).rejects.toMatchObject({ code: 'NO_TABLE' });
    await expect(bare.revealRow(0)).rejects.toMatchObject({ code: 'NO_TABLE' });
    bare.markDestroyed();
    await expect(bare.nextAnnotation()).rejects.toMatchObject({ code: 'DESTROYED' });
  });
});
