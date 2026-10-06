/**
 * @vitest-environment jsdom
 *
 * An inspector open that has to wait, F2's on a row still loading or any
 * open while the panel's chunk loads, goes ahead only while the user is
 * still where they asked: on that cell, focus in the table (on the grid,
 * for F2's), and no other panel opened meanwhile. Anything the user did in
 * between wins: the open is dropped rather than closing the panel they
 * opened or taking focus from where they put it. The extract panel's chunk
 * waits the same way.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { __resetModalHostForTests, isAnyModalOpen } from '@/core/ModalHost';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { TableContainer } from '@/table/TableContainer';

class MockResizeObserver implements ResizeObserver {
  constructor(_: ResizeObserverCallback) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'tags', type: 'nested', nullable: true, originalType: 'VARCHAR[]' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

function rowAt(i: number, columns: readonly string[]): Record<string, unknown> {
  const row: Record<string, unknown> = { __rowid__: i };
  for (const column of columns) {
    if (column === 'id') row['id'] = i;
    if (column === 'tags') row['tags'] = `[a${i}, b]`;
    if (column === 'name') row['name'] = `n${i}`;
  }
  return row;
}

/** Row reads past the first block wait for this while it is set: a slow block. */
let rowGate: Promise<void> | null = null;

function makeBridge(): WorkerBridge {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('AS "json"')) {
      const id = Number(/"__rowid__" = (\d+)/.exec(sql)?.[1]);
      const text = `["a${id}","b"]`;
      return [{ json: text, chars: text.length }];
    }
    const select = /^SELECT (.*?) FROM/s.exec(sql)?.[1] ?? '';
    const columns = SCHEMA.map((c) => c.name).filter((c) => select.includes(`"${c}"`));
    const byIds = /"__rowid__" IN \(([^)]*)\)/.exec(sql);
    if (byIds) return byIds[1]!.split(',').map((id) => rowAt(Number(id), columns));
    if (sql.includes('COUNT(')) return [{ count: 400 }];
    const limit = Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? 0);
    const offset = Number(
      /OFFSET (\d+)/.exec(sql)?.[1] ?? /"__rowid__" >= (\d+)/.exec(sql)?.[1] ?? 0,
    );
    if (rowGate && offset > 0) await rowGate;
    return Array.from({ length: Math.max(0, Math.min(limit, 400 - offset)) }, (_, i) =>
      rowAt(offset + i, columns),
    );
  });
  return {
    query,
    initialize: vi.fn(),
    terminate: vi.fn(),
    clearQueryCache: vi.fn(),
    isInitialized: () => true,
  } as unknown as WorkerBridge;
}

let state: TableState;
let actions: StateActions;
let table: TableContainer;

const root = (): HTMLElement => table.getElement();
const grid = (): HTMLElement => table.getGridElement();
const inspectorEl = (): HTMLElement | null =>
  root().querySelector<HTMLElement>('.dt-value-inspector');
const inspectorShown = (): boolean =>
  inspectorEl() !== null && inspectorEl()!.style.display !== 'none';
const extractShown = (): boolean => {
  const el = root().querySelector<HTMLElement>('.dt-extract-panel');
  return el !== null && el.style.display !== 'none';
};
const cellOf = (row: number, column: string): HTMLElement =>
  root().querySelector<HTMLElement>(`[data-row-index="${row}"] [data-column="${column}"]`)!;
const filterButton = (column: string): HTMLElement =>
  root().querySelector<HTMLElement>(`.dt-col-header[data-column="${column}"] .dt-col-filter-btn`)!;
const extractButton = (column: string): HTMLElement =>
  root().querySelector<HTMLElement>(`.dt-col-header[data-column="${column}"] .dt-col-extract-btn`)!;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function keydown(key: string, target: EventTarget = grid()): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

/** What the browser does after the cursor keys scroll the body: jsdom does not. */
const scrolled = (): void => {
  root().querySelector<HTMLElement>('.dt-body-scroll')!.dispatchEvent(new Event('scroll'));
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/**
 * Hold a panel's chunk back, as a first download over a slow network does:
 * the table's own promise of it, which it would otherwise start on first
 * use. Resolves to the real module once released.
 */
function holdChunk(field: 'valueInspectorModule' | 'extractPanelModule'): () => Promise<void> {
  const gate = deferred();
  const module =
    field === 'valueInspectorModule'
      ? gate.promise.then(() => import('@/table/ValueInspector'))
      : gate.promise.then(() => import('@/table/ExtractColumnPanel'));
  (table as unknown as Record<string, unknown>)[field] = module;
  return async () => {
    gate.resolve();
    await module;
    await sleep(30);
  };
}

beforeEach(async () => {
  rowGate = null;
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const bridge = makeBridge();
  state = createTableState();
  actions = new StateActions(state, bridge);
  state.schema.set(SCHEMA);
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(400);
  state.filteredRows.set(400);
  state.tableName.set('t');
  table = new TableContainer(container, state, actions, bridge);
  // jsdom lays nothing out: give the body a height, and let it render.
  const scroll = root().querySelector<HTMLElement>('.dt-body-scroll')!;
  Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 320 });
  await table.whenBodyReady();
  table.getTableBody()!.getVirtualScroller().refresh();
  await vi.waitFor(() =>
    expect(cellOf(3, 'tags').classList.contains('dt-cell--inspectable')).toBe(true),
  );
  grid().focus();
});

afterEach(() => {
  table.destroy();
  __resetModalHostForTests();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('TableContainer — F2 on a row still loading', () => {
  /**
   * F2 on (300, tags), whose block is held back until the returned function
   * lets it in: then the block lands, and renders when the row is in view.
   */
  async function f2OnLoadingRow(): Promise<() => Promise<void>> {
    actions.setFocusedCell({ row: 300, column: 'tags' });
    expect(table.getTableBody()!.inspectState(300, 'tags')).toBe('loading');
    const rows = deferred();
    rowGate = rows.promise;
    expect(keydown('F2').defaultPrevented).toBe(true);
    scrolled();
    return async () => {
      rowGate = null;
      rows.resolve();
      await sleep(80);
    };
  }

  it('leaves alone a filter panel opened before the row came, and what was typed in it', async () => {
    const land = await f2OnLoadingRow();
    filterButton('id').click();
    await sleep(30); // the panel's initial focus
    const panel = table.getFilterPanel()!;
    const input = panel.getElement().querySelector<HTMLInputElement>('input')!;
    input.focus();
    input.value = '12';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    await land();
    expect(panel.getIsOpen()).toBe(true);
    expect(inspectorShown()).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('12');
  });

  it('is dropped once the user scrolls the row away, and does not open when it comes back', async () => {
    const land = await f2OnLoadingRow();
    const scroll = root().querySelector<HTMLElement>('.dt-body-scroll')!;
    const atRow = scroll.scrollTop;
    expect(atRow).toBeGreaterThan(0);
    scroll.scrollTop = 0;
    scrolled();
    await sleep(50); // the rAF-throttled scroll renders the top rows
    await land();
    expect(inspectorShown()).toBe(false);

    // Back at the row, much later: still nothing.
    scroll.scrollTop = atRow;
    scrolled();
    await vi.waitFor(() => expect(table.getTableBody()!.inspectState(300, 'tags')).toBe('ready'));
    await sleep(50);
    expect(inspectorShown()).toBe(false);
  });

  it('is dropped when focus moves off the grid, though it stays in the table', async () => {
    const land = await f2OnLoadingRow();
    filterButton('id').focus();
    await land();
    expect(inspectorShown()).toBe(false);
    expect(document.activeElement).toBe(filterButton('id'));
  });

  it('opens when the user is still on the cell, with focus on the grid', async () => {
    const land = await f2OnLoadingRow();
    await land();
    expect(table.getTableBody()!.inspectState(300, 'tags')).toBe('ready');
    await vi.waitFor(() => expect(inspectorEl()?.querySelector('[role="tree"]')).toBeTruthy());
    expect(inspectorEl()!.querySelector('.dt-value-inspector__title')!.textContent).toBe(
      'tags · Row 301',
    );
  });
});

describe('TableContainer — an inspector open while its chunk loads', () => {
  it('does not open on a cell the cursor has left', async () => {
    const release = holdChunk('valueInspectorModule');
    actions.setFocusedCell({ row: 3, column: 'tags' });
    expect(keydown('F2').defaultPrevented).toBe(true);
    keydown('ArrowDown');
    expect(state.focusedCell.get()).toEqual({ row: 4, column: 'tags' });
    await release();
    expect(inspectorShown()).toBe(false);
    expect(document.activeElement).toBe(grid());
  });

  it('does not take focus from where the user put it outside the table', async () => {
    const release = holdChunk('valueInspectorModule');
    actions.setFocusedCell({ row: 3, column: 'tags' });
    keydown('F2');
    const search = document.createElement('input');
    document.body.appendChild(search);
    search.focus();
    await release();
    expect(inspectorShown()).toBe(false);
    expect(document.activeElement).toBe(search);
  });

  it('gives way to a panel opened meanwhile, which stays the only one open', async () => {
    const release = holdChunk('valueInspectorModule');
    actions.setFocusedCell({ row: 3, column: 'tags' });
    keydown('F2');
    filterButton('id').click();
    await release();
    expect(table.getFilterPanel()!.getIsOpen()).toBe(true);
    expect(inspectorShown()).toBe(false);

    // Escape closes it, and the grid has its keys back.
    const focused = table.getFilterPanel()!.getElement().contains(document.activeElement)
      ? document.activeElement!
      : table.getFilterPanel()!.getElement();
    keydown('Escape', focused);
    expect(isAnyModalOpen()).toBe(false);
    grid().focus();
    expect(keydown('ArrowDown').defaultPrevented).toBe(true);
    expect(state.focusedCell.get()).toEqual({ row: 4, column: 'tags' });
  });

  it('opens on the newest of several asks', async () => {
    const release = holdChunk('valueInspectorModule');
    expect(table.openValueInspector({ row: 3, column: 'tags' })).toBe(true);
    expect(table.openValueInspector({ row: 5, column: 'tags' })).toBe(true);
    await release();
    expect(inspectorEl()!.querySelector('.dt-value-inspector__title')!.textContent).toBe(
      'tags · Row 6',
    );
    expect(isAnyModalOpen()).toBe(true);
  });

  it('opens from code wherever focus is, and with the cursor elsewhere', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    actions.setFocusedCell({ row: 7, column: 'name' });
    expect(table.openValueInspector({ row: 3, column: 'tags' })).toBe(true);
    await vi.waitFor(() => expect(inspectorEl()?.querySelector('[role="tree"]')).toBeTruthy());
    expect(state.focusedCell.get()).toEqual({ row: 7, column: 'name' });
  });

  it('is dropped by a cursor move in the same task, from code too', async () => {
    actions.setFocusedCell({ row: 3, column: 'tags' });
    expect(table.openValueInspector({ row: 3, column: 'tags' })).toBe(true);
    actions.setFocusedCell({ row: 5, column: 'name' });
    await sleep(50);
    expect(inspectorShown()).toBe(false);

    expect(table.openValueInspector({ row: 3, column: 'tags' })).toBe(true);
    actions.clearFocusedCell();
    await sleep(50);
    expect(inspectorShown()).toBe(false);

    // The chunk is there now; the same holds.
    actions.setFocusedCell({ row: 3, column: 'tags' });
    expect(table.openValueInspector({ row: 3, column: 'tags' })).toBe(true);
    actions.setFocusedCell({ row: 6, column: 'name' });
    await sleep(50);
    expect(inspectorShown()).toBe(false);
  });

  it.each([
    ['a selection', () => actions.selectRow(3)],
    ['a filter', () => actions.addFilter({ type: 'point', column: 'id', value: 3 })],
    ['a sort', () => state.sortColumns.set([{ column: 'id', direction: 'desc' }])],
  ])('is dropped by %s in the same task', async (_, change) => {
    actions.setFocusedCell({ row: 3, column: 'tags' });
    expect(table.openValueInspector({ row: 3, column: 'tags' })).toBe(true);
    change();
    await sleep(50);
    expect(inspectorShown()).toBe(false);
  });
});

describe('TableContainer — the extract panel while its chunk loads', () => {
  it('gives way to a panel opened meanwhile', async () => {
    const release = holdChunk('extractPanelModule');
    extractButton('tags').click();
    filterButton('id').click();
    await release();
    expect(table.getFilterPanel()!.getIsOpen()).toBe(true);
    expect(extractShown()).toBe(false);
  });

  it('gives way to the value inspector opened meanwhile', async () => {
    const release = holdChunk('extractPanelModule');
    extractButton('tags').click();
    expect(table.openValueInspector({ row: 3, column: 'tags' })).toBe(true);
    await vi.waitFor(() => expect(inspectorEl()?.querySelector('[role="tree"]')).toBeTruthy());
    await release();
    expect(extractShown()).toBe(false);
    expect(inspectorShown()).toBe(true);
  });
});
