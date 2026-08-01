/**
 * @vitest-environment jsdom
 *
 * Regression: the post-render focus restore reels focus back in after the user
 * has deliberately tabbed away.
 *
 * `render()` schedules a `requestAnimationFrame` that puts focus back on the
 * grid when a render destroyed the element focus was on — pin / hide / reorder
 * all remove the focused button, and without the restore the next Cmd+Z goes
 * nowhere. The original condition was `hadFocus && !element.contains(
 * document.activeElement)`, a pair of booleans that cannot tell "render
 * destroyed the focused element" from "the user tabbed out while we were
 * rendering". A Tab landing outside the table in that window got yanked
 * straight back in.
 *
 * The condition now names the specific element and requires that it is gone
 * *and* that focus fell to nothing — i.e. that the DOM removal, not the user,
 * is what moved focus.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TableContainer } from '@/table/TableContainer';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';

class MockResizeObserver implements ResizeObserver {
  constructor(_: ResizeObserverCallback) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const mockBridge = {
  initialize: vi.fn(),
  query: vi.fn().mockResolvedValue([]),
  terminate: vi.fn(),
  clearQueryCache: vi.fn(),
} as unknown as WorkerBridge;

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'text', nullable: true, originalType: 'VARCHAR' },
  { name: 'score', type: 'float', nullable: false, originalType: 'DOUBLE' },
];

let container: HTMLElement;
let state: TableState;
let actions: StateActions;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  container = document.createElement('div');
  document.body.appendChild(container);
  state = createTableState();
  actions = new StateActions(state, mockBridge);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

/** Wait out the frame `render()` defers its scroll + focus restore to. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function loaded(): TableContainer {
  state.schema.set(SCHEMA);
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(100);
  state.tableName.set('test_table');
  return new TableContainer(container, state, actions, mockBridge);
}

/**
 * A focusable element inside the table that the next `render()` will destroy —
 * `render()` clears `headerRow`, exactly as it does the real column-header
 * buttons that pin / hide remove.
 */
function doomedButtonInTable(tc: TableContainer): HTMLButtonElement {
  const btn = document.createElement('button');
  tc.getHeaderRow().appendChild(btn);
  btn.focus();
  expect(document.activeElement).toBe(btn);
  return btn;
}

describe('TableContainer — post-render focus restore', () => {
  it('restores focus to the grid when render destroyed the focused element', async () => {
    const tc = loaded();
    const btn = doomedButtonInTable(tc);

    // Stands in for pin / hide / reorder: a render that removes the button
    // the user was on, dropping focus to <body>.
    state.visibleColumns.set(['id', 'name']);
    expect(btn.isConnected).toBe(false);
    expect(document.activeElement).toBe(document.body);

    await nextFrame();

    expect(document.activeElement).toBe(tc.getGridElement());

    tc.destroy();
  });

  it('leaves focus alone when the user tabbed out of the table mid-render', async () => {
    const tc = loaded();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    doomedButtonInTable(tc);

    state.visibleColumns.set(['id', 'name']);

    // The user's Tab lands in the window between render() and its rAF. Pulling
    // focus back here is a keyboard trap by another name.
    outside.focus();
    await nextFrame();

    expect(document.activeElement).toBe(outside);

    tc.destroy();
  });

  it('leaves focus alone when the focused element survived the render', async () => {
    const tc = loaded();
    const grid = tc.getGridElement();
    grid.focus();

    state.visibleColumns.set(['id', 'name']);
    await nextFrame();

    // Nothing moved focus, so nothing should restore it either.
    expect(document.activeElement).toBe(grid);

    tc.destroy();
  });

  it('does not try to focus an unloaded shell', async () => {
    const tc = loaded();
    doomedButtonInTable(tc);

    // Unloading drops the grid semantics, and `.dt-grid` only carries
    // `tabindex` while they are on — `.focus()` would be a silent no-op that
    // leaves focus stranded on <body> while pretending otherwise.
    state.schema.set([]);
    await nextFrame();

    expect(tc.getGridElement().hasAttribute('tabindex')).toBe(false);
    expect(document.activeElement).toBe(document.body);

    tc.destroy();
  });
});
