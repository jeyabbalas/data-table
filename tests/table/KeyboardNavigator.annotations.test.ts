/**
 * @vitest-environment jsdom
 *
 * The annotation keys: `F8` / `Shift+F8` and `Alt+↓` / `Alt+↑` go to the
 * next and previous annotation from the grid, the filter bar and the gutter
 * alike, take the key (prevent its default) only when there is something to
 * go to, and do nothing in F2 controls mode, in Shift+F2 layout mode, under
 * a dialog, or without the `navigateAnnotations` option.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { __resetModalHostForTests, ModalHost } from '@/core/ModalHost';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { ColumnHeader } from '@/table/ColumnHeader';
import { HEADER_ROW_INDEX, KeyboardNavigator } from '@/table/KeyboardNavigator';
import type { TableBody } from '@/table/TableBody';

const schema: ColumnSchema[] = [
  { name: 'a', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'b', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

const bridge = {
  query: vi.fn(),
  clearQueryCache: vi.fn(),
} as unknown as WorkerBridge;

function stubBody(): TableBody {
  const vs = {
    getViewportHeight: () => 320,
    getRowHeight: () => 32,
    getVirtualScrollTop: () => 0,
    scrollToRow: vi.fn(),
  };
  return { getVirtualScroller: () => vs } as unknown as TableBody;
}

function setup(options: { navigate?: boolean; available?: boolean } = {}) {
  const state = createTableState();
  state.schema.set(schema);
  initializeColumnsFromSchema(state, schema);
  state.totalRows.set(50);
  const actions = new StateActions(state, bridge);

  // root > filter bar button + grid (> headers) + gutter button
  const root = document.createElement('div');
  document.body.appendChild(root);
  const filterBar = document.createElement('button');
  root.appendChild(filterBar);
  const grid = document.createElement('div');
  grid.setAttribute('tabindex', '0');
  root.appendChild(grid);
  const gutter = document.createElement('button');
  root.appendChild(gutter);
  const headers = schema.map(
    (col, i) => new ColumnHeader(col, state, actions, { cellId: `dt-t1-colheader-${i}` }),
  );
  for (const h of headers) grid.appendChild(h.getElement());

  const navigateAnnotations = vi.fn((_: 'next' | 'previous') => options.available ?? true);
  const nav = new KeyboardNavigator({
    rootElement: root,
    gridElement: grid,
    bodyScroll: document.createElement('div'),
    state,
    actions,
    getTableBody: () => stubBody(),
    getColumnHeaders: () => headers,
    navigateAnnotations: options.navigate === false ? undefined : navigateAnnotations,
  });
  const cleanup = (): void => {
    nav.destroy();
    for (const h of headers) h.destroy();
  };
  return { state, actions, root, grid, filterBar, gutter, headers, navigateAnnotations, cleanup };
}

/** Dispatch a keydown on `el`; returns whether its default was prevented. */
function press(el: Element, init: KeyboardEventInit): boolean {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('KeyboardNavigator: the annotation keys', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    __resetModalHostForTests();
  });

  it.each([
    ['F8', { key: 'F8' }, 'next'],
    ['Shift+F8', { key: 'F8', shiftKey: true }, 'previous'],
    ['Alt+ArrowDown', { key: 'ArrowDown', altKey: true }, 'next'],
    ['Alt+ArrowUp', { key: 'ArrowUp', altKey: true }, 'previous'],
  ] as const)('%s goes to the %s annotation, and takes the key', (_, init, direction) => {
    const { grid, actions, state, navigateAnnotations, cleanup } = setup();
    actions.setFocusedCell({ row: 4, column: 'a' });
    grid.focus();
    expect(press(grid, init)).toBe(true);
    expect(navigateAnnotations).toHaveBeenCalledExactlyOnceWith(direction);
    // The keys move nothing themselves: Alt+arrows are not cursor keys.
    expect(state.focusedCell.get()).toEqual({ row: 4, column: 'a' });
    cleanup();
  });

  it('leaves the key to the page when there is nothing to go to', () => {
    const { grid, navigateAnnotations, cleanup } = setup({ available: false });
    grid.focus();
    expect(press(grid, { key: 'F8' })).toBe(false);
    expect(press(grid, { key: 'ArrowDown', altKey: true })).toBe(false);
    expect(navigateAnnotations).toHaveBeenCalledTimes(2);
    cleanup();
  });

  it('is off without the option: the keys stay the page’s', () => {
    const { grid, cleanup } = setup({ navigate: false });
    grid.focus();
    expect(press(grid, { key: 'F8' })).toBe(false);
    expect(press(grid, { key: 'ArrowUp', altKey: true })).toBe(false);
    cleanup();
  });

  it('works from the filter bar and the gutter, which keep focus', () => {
    const { filterBar, gutter, navigateAnnotations, cleanup } = setup();
    filterBar.focus();
    expect(press(filterBar, { key: 'F8' })).toBe(true);
    expect(document.activeElement).toBe(filterBar);
    gutter.focus();
    expect(press(gutter, { key: 'ArrowUp', altKey: true })).toBe(true);
    expect(document.activeElement).toBe(gutter);
    expect(navigateAnnotations.mock.calls).toEqual([['next'], ['previous']]);
    cleanup();
  });

  it('ignores the keys with other modifiers', () => {
    const { grid, navigateAnnotations, cleanup } = setup();
    grid.focus();
    for (const init of [
      { key: 'F8', ctrlKey: true },
      { key: 'F8', metaKey: true },
      { key: 'F8', altKey: true },
      { key: 'ArrowDown', altKey: true, shiftKey: true },
      { key: 'ArrowDown', altKey: true, ctrlKey: true },
      { key: 'ArrowUp', altKey: true, metaKey: true },
    ]) {
      press(grid, init);
    }
    expect(navigateAnnotations).not.toHaveBeenCalled();
    cleanup();
  });

  it('does nothing in F2 controls mode, which keeps focus on the header button', () => {
    const { root, actions, headers, navigateAnnotations, cleanup } = setup();
    actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'b' });
    press(root, { key: 'F2' });
    const button = headers[1]!.getControls()[0]!;
    expect(document.activeElement).toBe(button);

    expect(press(button, { key: 'F8' })).toBe(false);
    expect(press(button, { key: 'F8', shiftKey: true })).toBe(false);
    expect(press(button, { key: 'ArrowDown', altKey: true })).toBe(false);
    expect(press(button, { key: 'ArrowUp', altKey: true })).toBe(false);
    expect(navigateAnnotations).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
    cleanup();
  });

  it('does nothing in Shift+F2 layout mode', () => {
    const { root, grid, actions, navigateAnnotations, cleanup } = setup();
    actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'a' });
    grid.focus();
    press(grid, { key: 'F2', shiftKey: true });
    expect(press(grid, { key: 'F8' })).toBe(false);
    expect(press(grid, { key: 'ArrowDown', altKey: true })).toBe(false);
    expect(navigateAnnotations).not.toHaveBeenCalled();
    // Out of the mode, the keys work again.
    press(grid, { key: 'Enter' });
    expect(press(root, { key: 'F8' })).toBe(true);
    cleanup();
  });

  it('does nothing under a dialog', () => {
    const { grid, navigateAnnotations, cleanup } = setup();
    grid.focus();
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const host = new ModalHost();
    host.open({ mode: 'panel', element: panel, trapFocus: false, restoreFocus: false });
    expect(press(grid, { key: 'F8' })).toBe(false);
    host.close();

    const inner = document.createElement('div');
    inner.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    inner.appendChild(button);
    grid.appendChild(inner);
    button.focus();
    expect(press(button, { key: 'F8' })).toBe(false);
    expect(navigateAnnotations).not.toHaveBeenCalled();
    cleanup();
  });

  it('leaves a key something inside the table has already taken', () => {
    const { grid, navigateAnnotations, cleanup } = setup();
    grid.addEventListener('keydown', (e) => e.preventDefault());
    grid.focus();
    press(grid, { key: 'F8' });
    expect(navigateAnnotations).not.toHaveBeenCalled();
    cleanup();
  });
});
