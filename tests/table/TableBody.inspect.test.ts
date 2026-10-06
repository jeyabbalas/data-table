/**
 * @vitest-environment jsdom
 *
 * The value inspector's triggers in the body: which cells are inspectable
 * (non-NULL values of nested and JSON columns, never a pending cell, never a
 * pooled one), the click on a cell's inspect icon (it opens without touching
 * the selection; elsewhere a click selects as before), the double click, the
 * touch rule, and `getInspectTarget`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { createSignal } from '@/core/Signal';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { TableBody } from '@/table/TableBody';

class MockResizeObserver implements ResizeObserver {
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

/** Row `i`: `tags` NULL at row 1, `doc` NULL at row 2. */
function rowAt(i: number, columns: readonly string[]): Record<string, unknown> {
  const row: Record<string, unknown> = { __rowid__: i };
  for (const column of columns) {
    if (column === 'id') row['id'] = i;
    if (column === 'tags') row['tags'] = i === 1 ? null : `[a${i}, b]`;
    if (column === 'doc') row['doc'] = i === 2 ? null : `{"k": ${i}}`;
    if (column === 'name') row['name'] = `n${i}`;
  }
  return row;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

interface Setup {
  body: TableBody;
  state: TableState;
  container: HTMLElement;
  onInspectCell: ReturnType<typeof vi.fn>;
}

async function setup(options: { inspect?: boolean } = {}): Promise<Setup> {
  const mounted = createSignal<readonly string[]>(['id', 'tags', 'doc', 'name']);
  const root = document.createElement('div');
  root.className = 'dt-root';
  const gridElement = document.createElement('div');
  gridElement.className = 'dt-grid';
  gridElement.setAttribute('tabindex', '0');
  const container = document.createElement('div');
  gridElement.appendChild(container);
  root.appendChild(gridElement);
  document.body.appendChild(root);

  const state: TableState = createTableState();
  state.tableName.set('t');
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(40);

  const bridge = {
    query: vi.fn(async (sql: string) => {
      const select = /^SELECT (.*?) FROM/s.exec(sql)?.[1] ?? '';
      const columns = SCHEMA.map((c) => c.name).filter((c) => select.includes(`"${c}"`));
      const byIds = /"__rowid__" IN \(([^)]*)\)/.exec(sql);
      if (byIds) return byIds[1]!.split(',').map((id) => rowAt(Number(id), columns));
      const limit = Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? 0);
      const offset = Number(/OFFSET (\d+)/.exec(sql)?.[1] ?? 0);
      return Array.from({ length: limit }, (_, i) => rowAt(offset + i, columns));
    }),
    isInitialized: vi.fn().mockReturnValue(true),
    initialize: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
    clearQueryCache: vi.fn(),
  };
  const actions = new StateActions(state, bridge as unknown as Parameters<typeof StateActions>[1]);
  const onInspectCell = vi.fn();
  const body = new TableBody(
    container,
    state,
    bridge as unknown as Parameters<typeof TableBody>[2],
    actions,
    {
      gridElement,
      mountedColumns: mounted,
      ...(options.inspect === false ? {} : { onInspectCell }),
    },
  );
  Object.defineProperty(body.getVirtualScroller().getScrollContainer(), 'clientHeight', {
    value: 320,
    configurable: true,
  });
  await body.initialize();
  return { body, state, container, onInspectCell };
}

function cellOf(container: HTMLElement, row: number, column: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    `[data-row-index="${row}"] [data-column="${column}"]`,
  );
  if (!el) throw new Error(`no cell at ${row}/${column}`);
  return el;
}

const inspectable = (el: HTMLElement): boolean => el.classList.contains('dt-cell--inspectable');

/** Give a cell a layout box: 150 × 32 at (0, 100). */
function layOut(el: HTMLElement): void {
  el.getBoundingClientRect = () =>
    ({
      top: 100,
      left: 0,
      width: 150,
      height: 32,
      bottom: 132,
      right: 150,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect;
}

function click(el: HTMLElement, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event;
}

describe('TableBody — inspectable cells', () => {
  it('marks the non-NULL values of nested and JSON columns, and no others', async () => {
    const { body, container } = await setup();
    expect(inspectable(cellOf(container, 0, 'tags'))).toBe(true);
    expect(cellOf(container, 0, 'tags').getAttribute('aria-haspopup')).toBe('dialog');
    expect(cellOf(container, 0, 'tags').getAttribute('aria-keyshortcuts')).toBe('F2');
    expect(inspectable(cellOf(container, 0, 'doc'))).toBe(true);
    expect(inspectable(cellOf(container, 1, 'tags'))).toBe(false); // NULL
    expect(cellOf(container, 1, 'tags').hasAttribute('aria-haspopup')).toBe(false);
    expect(inspectable(cellOf(container, 2, 'doc'))).toBe(false); // NULL
    expect(inspectable(cellOf(container, 0, 'name'))).toBe(false);
    expect(inspectable(cellOf(container, 0, 'id'))).toBe(false);
    body.destroy();
  });

  it('marks no cell when the body cannot open the inspector', async () => {
    const { body, container } = await setup({ inspect: false });
    expect(container.querySelector('.dt-cell--inspectable')).toBeNull();
    expect(container.querySelector('[aria-haspopup]')).toBeNull();
    body.destroy();
  });

  it('unmarks a pending cell, which has no value yet', async () => {
    const { body, container } = await setup();
    expect(inspectable(cellOf(container, 3, 'tags'))).toBe(true);
    // The rows' block as if fetched without `tags`, which a wide table's
    // column window does: its cells wait for a read of that column.
    const internals = body as unknown as {
      blockColumns: Map<number, ReadonlySet<string>>;
      renderVisibleRows(): void;
    };
    internals.blockColumns.set(0, new Set(['id', 'doc', 'name']));
    internals.renderVisibleRows();
    const tags = cellOf(container, 3, 'tags');
    expect(tags.classList.contains('dt-cell--pending')).toBe(true);
    expect(inspectable(tags)).toBe(false);
    expect(tags.hasAttribute('aria-haspopup')).toBe(false);
    expect(body.getInspectTarget(3, 'tags')).toBeNull();
    expect(inspectable(cellOf(container, 3, 'doc'))).toBe(true);
    body.destroy();
  });

  it('keeps no mark on a pooled row, and gives a reused cell the mark of its new value', async () => {
    const { body, container } = await setup();
    const internals = body as unknown as {
      rowPool: HTMLElement[];
      returnRowToPool(el: HTMLElement): void;
    };
    const row0 = container.querySelector<HTMLElement>('[data-row-index="0"]')!;
    internals.returnRowToPool(row0);
    const pooled = internals.rowPool[internals.rowPool.length - 1]!;
    expect(pooled.querySelector('.dt-cell--inspectable')).toBeNull();
    expect(pooled.querySelector('[aria-haspopup]')).toBeNull();
    expect(pooled.querySelector('[aria-keyshortcuts]')).toBeNull();

    // Scrolled: rows come back from the pool with their new values' marks.
    const scroller = body.getVirtualScroller();
    scroller.getScrollContainer().scrollTop = 32;
    scroller.refresh();
    expect(inspectable(cellOf(container, 1, 'tags'))).toBe(false);
    expect(inspectable(cellOf(container, 3, 'tags'))).toBe(true);
    body.destroy();
  });

  it('describes the target of an inspectable cell, and refuses every other', async () => {
    const { body, container } = await setup();
    expect(body.getInspectTarget(0, 'tags')).toEqual({
      rowId: 0,
      cell: cellOf(container, 0, 'tags'),
    });
    expect(body.getInspectTarget(4, 'doc')?.rowId).toBe(4);
    expect(body.getInspectTarget(1, 'tags')).toBeNull(); // NULL
    expect(body.getInspectTarget(0, 'name')).toBeNull(); // scalar
    expect(body.getInspectTarget(39, 'tags')).toBeNull(); // not rendered
    expect(body.getInspectTarget(0, 'nope')).toBeNull();
    body.destroy();
    expect(body.getInspectTarget(0, 'tags')).toBeNull();
  });

  it('says whether a cell has a value to inspect, may have one once loaded, or has none', async () => {
    const { body } = await setup();
    expect(body.inspectState(0, 'tags')).toBe('ready');
    expect(body.inspectState(1, 'tags')).toBe('none'); // NULL
    expect(body.inspectState(0, 'name')).toBe('none'); // scalar
    expect(body.inspectState(0, 'nope')).toBe('none');
    expect(body.inspectState(39, 'tags')).toBe('loading'); // not rendered
    expect(body.inspectState(40, 'tags')).toBe('none'); // past the end
    expect(body.inspectState(-1, 'tags')).toBe('none'); // the header row
    body.destroy();
    expect(body.inspectState(0, 'tags')).toBe('none');
  });
});

describe('TableBody — opening the inspector with the pointer', () => {
  it('opens on a click on the inspect icon, moves the cursor there, and leaves the selection', async () => {
    const { body, state, container, onInspectCell } = await setup();
    state.selectedRows.set(new Set([5]));
    const cell = cellOf(container, 3, 'tags');
    layOut(cell);
    // 10 px in from the right edge, 4 px below the middle.
    click(cell, { clientX: 140, clientY: 120 });
    expect(onInspectCell).toHaveBeenCalledWith({ row: 3, column: 'tags' });
    expect(state.focusedCell.get()).toEqual({ row: 3, column: 'tags' });
    expect([...state.selectedRows.get()]).toEqual([5]);
    body.destroy();
  });

  it('selects as before on a click outside the icon', async () => {
    const { body, state, container, onInspectCell } = await setup();
    const cell = cellOf(container, 3, 'tags');
    layOut(cell);
    click(cell, { clientX: 100, clientY: 116 }); // 50 px from the end
    click(cellOf(container, 4, 'tags'), { clientX: 140, clientY: 116 }); // no layout: no icon
    layOut(cellOf(container, 6, 'tags'));
    click(cellOf(container, 6, 'tags'), { clientX: 140, clientY: 100 }); // 16 px above the middle
    expect(onInspectCell).not.toHaveBeenCalled();
    expect([...state.selectedRows.get()]).toEqual([6]);
    expect(state.focusedCell.get()).toEqual({ row: 6, column: 'tags' });
    body.destroy();
  });

  it('treats a click with a modifier key as selection, even on the icon', async () => {
    const { body, state, container, onInspectCell } = await setup();
    const cell = cellOf(container, 3, 'tags');
    layOut(cell);
    click(cell, { clientX: 140, clientY: 116, shiftKey: true });
    expect(onInspectCell).not.toHaveBeenCalled();
    expect(state.selectedRows.get().has(3)).toBe(true);
    body.destroy();
  });

  it('ignores the icon place of a scalar or NULL cell', async () => {
    const { body, container, onInspectCell } = await setup();
    for (const [row, column] of [
      [3, 'name'],
      [1, 'tags'],
    ] as const) {
      const cell = cellOf(container, row, column);
      layOut(cell);
      click(cell, { clientX: 140, clientY: 116 });
    }
    expect(onInspectCell).not.toHaveBeenCalled();
    body.destroy();
  });

  it('opens on a double click anywhere in an inspectable cell', async () => {
    const { body, state, container, onInspectCell } = await setup();
    cellOf(container, 4, 'doc').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(onInspectCell).toHaveBeenCalledWith({ row: 4, column: 'doc' });
    expect(state.focusedCell.get()).toEqual({ row: 4, column: 'doc' });

    cellOf(container, 4, 'name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    cellOf(container, 2, 'doc').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(onInspectCell).toHaveBeenCalledTimes(1);
    body.destroy();
  });

  it('on touch, opens from the icon only on the cursor’s cell', async () => {
    const { body, state, container, onInspectCell } = await setup();
    const cell = cellOf(container, 3, 'tags');
    layOut(cell);
    cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    click(cell, { clientX: 140, clientY: 116 });
    // A tap there on another cell selects it and puts the cursor on it…
    expect(onInspectCell).not.toHaveBeenCalled();
    expect(state.selectedRows.get().has(3)).toBe(true);
    expect(state.focusedCell.get()).toEqual({ row: 3, column: 'tags' });

    // …and then the icon shows on it, and a second tap there opens it.
    cell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    click(cell, { clientX: 140, clientY: 116 });
    expect(onInspectCell).toHaveBeenCalledWith({ row: 3, column: 'tags' });
    expect(state.selectedRows.get().has(3)).toBe(true);
    body.destroy();
  });

  it('stops listening once destroyed', async () => {
    const { body, container, onInspectCell } = await setup();
    const cell = cellOf(container, 4, 'doc');
    body.destroy();
    container.appendChild(cell);
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(onInspectCell).not.toHaveBeenCalled();
  });
});
