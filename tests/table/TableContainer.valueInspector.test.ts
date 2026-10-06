/**
 * @vitest-environment jsdom
 *
 * The value inspector as `TableContainer` runs it: opened from a cell (and
 * refused on one with nothing to inspect), mounted in `.dt-root` beside the
 * grid, one panel at a time, closed by a new filter, sort or table and by the
 * cursor or the selection moving on, torn down by `render()` and
 * `destroy()`, holding its column mounted while open, and F2 → Escape
 * leaving focus and the cursor where they were.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { __resetModalHostForTests } from '@/core/ModalHost';
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
  { name: 'doc', type: 'string', nullable: true, originalType: 'JSON' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

function rowAt(i: number, columns: readonly string[]): Record<string, unknown> {
  const row: Record<string, unknown> = { __rowid__: i };
  for (const column of columns) {
    if (column === 'id') row['id'] = i;
    if (column === 'tags') row['tags'] = i === 1 ? null : `[a${i}, b]`;
    if (column === 'doc') row['doc'] = `{"k": ${i}}`;
    if (column === 'name') row['name'] = `n${i}`;
  }
  return row;
}

/** The rows the bridge answers for; a test may grow the table. */
let rowCount = 40;

/** Answers the body's row reads and the inspector's value reads. */
function makeBridge(): { bridge: WorkerBridge; valueReads: string[] } {
  const valueReads: string[] = [];
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('AS "json"')) {
      valueReads.push(sql);
      const id = Number(/"__rowid__" = (\d+)/.exec(sql)?.[1]);
      const text = sql.includes('"tags"') ? `["a${id}","b"]` : `{"k":${id}}`;
      return [{ json: text, chars: text.length }];
    }
    const select = /^SELECT (.*?) FROM/s.exec(sql)?.[1] ?? '';
    const columns = SCHEMA.map((c) => c.name).filter((c) => select.includes(`"${c}"`));
    const byIds = /"__rowid__" IN \(([^)]*)\)/.exec(sql);
    if (byIds) return byIds[1]!.split(',').map((id) => rowAt(Number(id), columns));
    if (sql.includes('COUNT(')) return [{ count: rowCount }];
    const limit = Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? 0);
    // A block of the unsorted table reads a range of rowids, not an OFFSET.
    const offset = Number(
      /OFFSET (\d+)/.exec(sql)?.[1] ?? /"__rowid__" >= (\d+)/.exec(sql)?.[1] ?? 0,
    );
    return Array.from({ length: Math.max(0, Math.min(limit, rowCount - offset)) }, (_, i) =>
      rowAt(offset + i, columns),
    );
  });
  const bridge = {
    query,
    initialize: vi.fn(),
    terminate: vi.fn(),
    clearQueryCache: vi.fn(),
    isInitialized: () => true,
  } as unknown as WorkerBridge;
  return { bridge, valueReads };
}

let state: TableState;
let actions: StateActions;
let table: TableContainer;
let valueReads: string[];

const root = (): HTMLElement => table.getElement();
const inspectorEl = (): HTMLElement | null =>
  root().querySelector<HTMLElement>('.dt-value-inspector');
const isShown = (): boolean => {
  const el = inspectorEl();
  return el !== null && el.style.display !== 'none';
};
const cellOf = (row: number, column: string): HTMLElement =>
  root().querySelector<HTMLElement>(`[data-row-index="${row}"] [data-column="${column}"]`)!;

async function opened(): Promise<void> {
  await vi.waitFor(() => expect(inspectorEl()?.querySelector('[role="tree"]')).toBeTruthy());
}

beforeEach(async () => {
  rowCount = 40;
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const made = makeBridge();
  valueReads = made.valueReads;
  state = createTableState();
  actions = new StateActions(state, made.bridge);
  state.schema.set(SCHEMA);
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(40);
  state.filteredRows.set(40);
  state.tableName.set('t');
  table = new TableContainer(container, state, actions, made.bridge);
  // jsdom lays nothing out: give the body a height, and let it render.
  const scroll = root().querySelector<HTMLElement>('.dt-body-scroll')!;
  Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 320 });
  await table.whenBodyReady();
  table.getTableBody()!.getVirtualScroller().refresh();
  await vi.waitFor(() => expect(cellOf(3, 'tags')).toBeTruthy());
  await vi.waitFor(() =>
    expect(cellOf(3, 'tags').classList.contains('dt-cell--inspectable')).toBe(true),
  );
});

afterEach(() => {
  table.destroy();
  __resetModalHostForTests();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('TableContainer — the value inspector', () => {
  it('opens on a nested or JSON value, and refuses everything else', async () => {
    expect(table.openValueInspector({ row: 3, column: 'name' })).toBe(false);
    expect(table.openValueInspector({ row: 1, column: 'tags' })).toBe(false); // NULL
    expect(table.openValueInspector({ row: 39, column: 'tags' })).toBe(false); // not rendered
    expect(inspectorEl()).toBeNull();

    expect(table.openValueInspector({ row: 3, column: 'tags' })).toBe(true);
    await opened();
    // In the root, beside the grid: `role="grid"` owns only rowgroups.
    expect(inspectorEl()!.parentElement).toBe(root());
    expect(table.getGridElement().contains(inspectorEl())).toBe(false);
    expect(inspectorEl()!.querySelector('.dt-value-inspector__title')!.textContent).toBe(
      'tags · Row 4',
    );
    expect(valueReads).toHaveLength(1);
    expect(valueReads[0]).toContain('WHERE "__rowid__" = 3');

    expect(table.openValueInspector({ row: 4, column: 'doc' })).toBe(true);
    await vi.waitFor(() =>
      expect(inspectorEl()!.querySelector('.dt-value-inspector__title')!.textContent).toBe(
        'doc · Row 5',
      ),
    );
    await opened();
    expect(inspectorEl()!.querySelector('[role="treeitem"]')!.getAttribute('aria-label')).toBe(
      'doc: json, 1 key',
    );
  });

  it('opens from F2 on the cursor, and Escape gives focus back with the cursor intact', async () => {
    const grid = table.getGridElement();
    grid.focus();
    actions.setFocusedCell({ row: 3, column: 'tags' });
    const descendant = grid.getAttribute('aria-activedescendant');
    expect(descendant).toBe(cellOf(3, 'tags').id);

    const f2 = new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true });
    grid.dispatchEvent(f2);
    expect(f2.defaultPrevented).toBe(true);
    await opened();
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('role')).toBe('treeitem'));

    const focus = vi.spyOn(grid, 'focus');
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(isShown()).toBe(false);
    expect(document.activeElement).toBe(grid);
    // The cell is in view beside the panel: the page does not jump to the grid's top.
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(state.focusedCell.get()).toEqual({ row: 3, column: 'tags' });
    expect(grid.getAttribute('aria-activedescendant')).toBe(descendant);
  });

  describe('F2 on a row still loading', () => {
    const f2 = (): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true });
      table.getGridElement().dispatchEvent(event);
      return event;
    };
    /** What the browser does after the cursor keys scroll the body: jsdom does not. */
    const scrolled = (): void => {
      root().querySelector<HTMLElement>('.dt-body-scroll')!.dispatchEvent(new Event('scroll'));
    };

    // 400 rows: row 300 is in a block the body has not fetched.
    beforeEach(() => {
      rowCount = 400;
      state.totalRows.set(400);
      state.filteredRows.set(400);
      table.getGridElement().focus();
    });

    it('claims the key, and opens once the row is fetched and rendered', async () => {
      actions.setFocusedCell({ row: 300, column: 'tags' });
      expect(table.getTableBody()!.inspectState(300, 'tags')).toBe('loading');
      expect(f2().defaultPrevented).toBe(true);
      expect(isShown()).toBe(false);

      scrolled();
      await opened();
      expect(inspectorEl()!.querySelector('.dt-value-inspector__title')!.textContent).toBe(
        'tags · Row 301',
      );
      expect(valueReads.at(-1)).toContain('WHERE "__rowid__" = 300');
    });

    it('drops the request when the cursor moves on before the row is there', async () => {
      actions.setFocusedCell({ row: 300, column: 'tags' });
      expect(f2().defaultPrevented).toBe(true);
      actions.setFocusedCell({ row: 299, column: 'tags' });

      scrolled();
      await vi.waitFor(() => expect(table.getTableBody()!.inspectState(300, 'tags')).toBe('ready'));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(isShown()).toBe(false);
      expect(valueReads).toHaveLength(0);
    });

    it('leaves F2 alone on a cell with nothing to inspect, loaded or not, and the view too', () => {
      const scrollToRow = vi.spyOn(table.getTableBody()!.getVirtualScroller(), 'scrollToRow');
      actions.setFocusedCell({ row: 1, column: 'tags' }); // NULL
      expect(f2().defaultPrevented).toBe(false);
      actions.setFocusedCell({ row: 300, column: 'name' }); // scalar, not fetched, out of view
      expect(f2().defaultPrevented).toBe(false);
      expect(isShown()).toBe(false);
      expect(scrollToRow).not.toHaveBeenCalled();
    });
  });

  it('is torn down by a render, and rebuilt on the next open', async () => {
    table.openValueInspector({ row: 3, column: 'tags' });
    await opened();
    actions.hideColumn('name');
    expect(inspectorEl()).toBeNull();

    expect(table.openValueInspector({ row: 3, column: 'tags' })).toBe(true);
    await opened();
    expect(root().querySelectorAll('.dt-value-inspector')).toHaveLength(1);
  });

  it('closes when the filters, the sort or the table change', async () => {
    const reopen = async (): Promise<void> => {
      expect(table.openValueInspector({ row: 3, column: 'tags' })).toBe(true);
      await opened();
      expect(isShown()).toBe(true);
    };
    await reopen();
    state.sortColumns.set([{ column: 'id', direction: 'desc' }]);
    expect(isShown()).toBe(false);

    state.sortColumns.set([]);
    await vi.waitFor(() =>
      expect(cellOf(3, 'tags').classList.contains('dt-cell--inspectable')).toBe(true),
    );
    await reopen();
    state.tableName.set('t');
    expect(isShown()).toBe(true); // the same name: nothing changed
    state.tableName.set('t_view');
    expect(isShown()).toBe(false);
    state.tableName.set('t');
    await vi.waitFor(() =>
      expect(cellOf(3, 'tags').classList.contains('dt-cell--inspectable')).toBe(true),
    );

    await reopen();
    actions.addFilter({ type: 'point', column: 'id', value: 3 });
    expect(isShown()).toBe(false);
  });

  it('closes when the cursor or the selection moves on, not when the cursor stays', async () => {
    actions.setFocusedCell({ row: 3, column: 'tags' });
    table.openValueInspector({ row: 3, column: 'tags' });
    await opened();
    actions.setFocusedCell({ row: 3, column: 'tags' });
    expect(isShown()).toBe(true);
    actions.setFocusedCell({ row: 4, column: 'tags' });
    expect(isShown()).toBe(false);

    table.openValueInspector({ row: 4, column: 'tags' });
    await opened();
    actions.selectRow(4);
    expect(isShown()).toBe(false);
  });

  it('keeps one panel open at a time', async () => {
    table.openValueInspector({ row: 3, column: 'tags' });
    await opened();

    const filterButton = root().querySelector<HTMLElement>(
      '.dt-col-header[data-column="id"] .dt-col-filter-btn',
    )!;
    filterButton.click();
    expect(table.getFilterPanel()!.getIsOpen()).toBe(true);
    expect(isShown()).toBe(false);

    table.openValueInspector({ row: 3, column: 'tags' });
    expect(table.getFilterPanel()!.getIsOpen()).toBe(false);
    await opened();
    expect(isShown()).toBe(true);
  });

  it('holds its column mounted while it is open, and lets it go on close', async () => {
    const columnWindow = table.getColumnWindow();
    const hold = columnWindow.hold.bind(columnWindow);
    const releases = new Map<string, ReturnType<typeof vi.fn>>();
    vi.spyOn(columnWindow, 'hold').mockImplementation((column: string) => {
      const release = vi.fn(hold(column));
      releases.set(column, release);
      return release;
    });
    table.openValueInspector({ row: 3, column: 'doc' });
    await opened();
    expect(releases.get('doc')).toBeDefined();
    expect(releases.get('doc')).not.toHaveBeenCalled();

    inspectorEl()!.querySelector<HTMLButtonElement>('.dt-value-inspector__close')!.click();
    expect(releases.get('doc')).toHaveBeenCalledTimes(1);
  });

  it('is destroyed with the table', async () => {
    table.openValueInspector({ row: 3, column: 'tags' });
    await opened();
    const el = inspectorEl()!;
    table.destroy();
    expect(el.isConnected).toBe(false);
  });
});
