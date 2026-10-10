/**
 * @vitest-environment jsdom
 *
 * The grid hears the annotation store once: `TableContainer`'s
 * `AnnotationOverlay` is its one subscriber, for the body and every header,
 * however many columns there are. Through it the DOM is current as soon as
 * a store call returns, which consumers read right after `add()`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnnotationStore } from '@/annotations/AnnotationStore';
import type { AnnotationChangeHandler } from '@/annotations/types';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { AnnotationPopover } from '@/table/AnnotationPopover';
import { ColumnHeader } from '@/table/ColumnHeader';
import { TableBody } from '@/table/TableBody';
import { TableContainer } from '@/table/TableContainer';

import { makeRowFetchBridge, rowsFor, type CapturedQuery } from '../helpers/rowFetchBridge';
import { MockResizeObserver } from '../helpers/tableBodyHarness';

/** Columns `c00`…`c49`: wide enough that a listener per header would show. */
const COLUMNS = Array.from({ length: 50 }, (_, i) => `c${String(i).padStart(2, '0')}`);
const SCHEMA: ColumnSchema[] = COLUMNS.map((name) => ({
  name,
  type: 'string',
  nullable: true,
  originalType: 'VARCHAR',
}));

/** Count the store's live subscriptions, by wrapping `on`. */
function countSubscriptions(store: AnnotationStore): { active: () => number } {
  let active = 0;
  const on = store.on.bind(store);
  store.on = ((event: 'change', handler: AnnotationChangeHandler) => {
    active++;
    const off = on(event, handler);
    let done = false;
    return () => {
      if (!done) active--;
      done = true;
      off();
    };
  }) as typeof store.on;
  return { active: () => active };
}

interface Harness {
  state: TableState;
  actions: StateActions;
  table: TableContainer;
  queries: CapturedQuery[];
}

/**
 * A container with a store and a popover, loaded with 50 columns × 1,000 rows,
 * its first block of rows answered.
 */
async function mount(store: AnnotationStore, popover: AnnotationPopover): Promise<Harness> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const state = createTableState();
  const { bridge, queries } = makeRowFetchBridge();
  const actions = new StateActions(state, bridge as never);
  const table = new TableContainer(host, state, actions, bridge as never, {
    annotations: store,
    annotationPopover: popover,
  });
  // Ten rows tall, before the body that reads it is built.
  Object.defineProperty(table.getScrollContainer(), 'clientHeight', {
    value: 320,
    configurable: true,
  });
  state.tableName.set('t');
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(1_000);
  for (let i = 0; i < 4; i++) await Promise.resolve();
  // The fetches still wanted; an earlier one was dropped by the row count.
  for (const query of queries) {
    if (!query.signal?.aborted) query.deferred.resolve(rowsFor(query.sql, COLUMNS));
  }
  await table.whenBodyReady();
  return { state, actions, table, queries };
}

function header(table: TableContainer, column: string): HTMLElement {
  const found = table.getColumnHeaders().find((h) => h.getColumn().name === column);
  if (!found) throw new Error(`no header for ${column}`);
  return found.getElement();
}

function cell(table: TableContainer, row: number, column: string): HTMLElement {
  const el = table
    .getElement()
    .querySelector<HTMLElement>(`.dt-row[data-row-index="${row}"] [data-column="${column}"]`);
  if (!el) throw new Error(`no cell ${row}/${column}`);
  return el;
}

/** The annotation classes on `el`, sorted: their order in the list says nothing. */
function annotationClassesOf(el: Element): string[] {
  return Array.from(el.classList)
    .filter((name) => name.includes('annot'))
    .sort();
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('TableContainer — one annotation subscription', () => {
  it('subscribes once for the body and every header, and lets go on destroy', async () => {
    const store = new AnnotationStore();
    const subscriptions = countSubscriptions(store);
    const popover = new AnnotationPopover({ portalTarget: document.body });
    const { table, actions } = await mount(store, popover);
    expect(table.getColumnHeaders()).toHaveLength(50);
    expect(subscriptions.active()).toBe(1);

    // Headers built and rebuilt on column changes subscribe to nothing either.
    actions.hideColumn('c10');
    actions.showColumn('c10');
    expect(subscriptions.active()).toBe(1);

    table.destroy();
    expect(subscriptions.active()).toBe(0);
    popover.destroy();
  });

  it('leaves a body and a header used on their own to subscribe themselves', async () => {
    const store = new AnnotationStore();
    const subscriptions = countSubscriptions(store);
    const state = createTableState();
    const { bridge } = makeRowFetchBridge();
    const actions = new StateActions(state, bridge as never);
    initializeColumnsFromSchema(state, SCHEMA);

    const standalone = new ColumnHeader(SCHEMA[0]!, state, actions, { annotations: store });
    expect(subscriptions.active()).toBe(1);
    store.add({ scope: 'column', column: 'c00', severity: 'error', message: 'e' });
    expect(annotationClassesOf(standalone.getElement())).toEqual([
      'dt-col-header--annotated',
      'dt-col-header--annotation-error',
    ]);

    const owned = new ColumnHeader(SCHEMA[0]!, state, actions, {
      annotations: store,
      annotationSync: 'owner',
    });
    expect(subscriptions.active()).toBe(1);
    // Built from the store's summary all the same.
    expect(owned.getElement().getAttribute('data-dt-annotation-count')).toBe('1');

    const body = new TableBody(document.createElement('div'), state, bridge as never, actions, {
      annotations: store,
    });
    state.tableName.set('t');
    void body.initialize();
    expect(subscriptions.active()).toBe(2);
    body.destroy();
    standalone.destroy();
    owned.destroy();
    expect(subscriptions.active()).toBe(0);
  });
});

describe('TableContainer — the DOM is current when a store call returns', () => {
  let store: AnnotationStore;
  let popover: AnnotationPopover;
  let h: Harness;

  beforeEach(async () => {
    store = new AnnotationStore();
    popover = new AnnotationPopover({ portalTarget: document.body });
    h = await mount(store, popover);
  });

  afterEach(() => {
    h.table.destroy();
    popover.destroy();
    store.destroy();
  });

  it('after add, update, remove, clear, loadJSON and setSeverityFilter', () => {
    const target = cell(h.table, 2, 'c03');

    const ann = store.add({
      scope: 'cell',
      rowId: 2,
      column: 'c03',
      severity: 'info',
      message: 'i',
    });
    expect(annotationClassesOf(target)).toEqual(['dt-cell--annotated', 'dt-cell--annotation-info']);

    store.update(ann.id, { severity: 'error' });
    expect(annotationClassesOf(target)).toEqual([
      'dt-cell--annotated',
      'dt-cell--annotation-error',
    ]);

    const column = store.add({ scope: 'column', column: 'c03', severity: 'warning', message: 'w' });
    expect(annotationClassesOf(header(h.table, 'c03'))).toEqual([
      'dt-col-header--annotated',
      'dt-col-header--annotation-warning',
    ]);
    expect(target.getAttribute('data-dt-annotation-count')).toBe('2');

    store.remove(column.id);
    expect(annotationClassesOf(header(h.table, 'c03'))).toEqual([]);
    expect(target.getAttribute('data-dt-annotation-count')).toBe('1');

    store.add({ scope: 'row', rowId: 2, severity: 'warning', message: 'r' });
    store.setSeverityFilter({ error: false });
    expect(annotationClassesOf(target)).toEqual([
      'dt-cell--annotated',
      'dt-cell--row-annotated',
      'dt-cell--row-annotation-warning',
    ]);
    store.setSeverityFilter({ error: true });

    const file = store.toJSON();
    store.clear();
    expect(annotationClassesOf(target)).toEqual([]);
    expect(target.hasAttribute('data-dt-annotation-count')).toBe(false);
    expect(target.title).toBe('c03-2');

    store.loadJSON(file);
    expect(annotationClassesOf(target)).toEqual([
      'dt-cell--annotated',
      'dt-cell--annotation-error',
      'dt-cell--row-annotated',
      'dt-cell--row-annotation-warning',
    ]);
    expect(target.getAttribute('data-dt-annotation-count')).toBe('2');
    expect(target.hasAttribute('title')).toBe(false);
  });

  it('writes no header when a change leaves them all as they are', () => {
    store.add({ scope: 'column', column: 'c07', severity: 'error', message: 'e' });
    const observer = new MutationObserver(() => {});
    observer.observe(h.table.getHeaderRow(), { subtree: true, attributes: true });
    // A filter change re-reads every header; none of them changes.
    store.setSeverityFilter({ info: false });
    store.add({ scope: 'cell', rowId: 900, column: 'c07', severity: 'info', message: 'far' });
    expect(observer.takeRecords()).toEqual([]);
    observer.disconnect();
  });

  it('shows on a header built later what the store holds for its column', () => {
    h.actions.hideColumn('c20');
    store.add({ scope: 'column', column: 'c20', severity: 'info', message: 'while hidden' });
    store.add({ scope: 'column', column: 'c20', severity: 'warning', message: 'while hidden' });
    h.actions.showColumn('c20');
    const shown = header(h.table, 'c20');
    expect(annotationClassesOf(shown)).toEqual([
      'dt-col-header--annotated',
      'dt-col-header--annotation-warning',
    ]);
    expect(shown.getAttribute('data-dt-annotation-count')).toBe('2');
    expect(annotationClassesOf(cell(h.table, 1, 'c20'))).toEqual([
      'dt-cell--col-annotated',
      'dt-cell--col-annotation-warning',
    ]);
  });
});
