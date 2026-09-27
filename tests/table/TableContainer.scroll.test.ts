/**
 * @vitest-environment jsdom
 *
 * The table's own horizontal-scroll writers must not undo scrolls they did not
 * make.
 *
 * - After a filter change, `TableContainer` holds `scrollLeft` for a second
 *   against transient clamps. It used to hold it against the user too: a wheel
 *   or a keyboard move in that second snapped back.
 * - `render()` puts the scroll position back after rebuilding the header row
 *   and body. It used to do so a frame late, undoing a scroll made right after
 *   the render.
 *
 * jsdom does no layout, so nothing here clamps; the tests write the positions
 * a browser would produce and check what the table writes back.
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
let table: TableContainer;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  container = document.createElement('div');
  document.body.appendChild(container);
  state = createTableState();
  actions = new StateActions(state, mockBridge);
  state.schema.set(SCHEMA);
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(100);
  state.tableName.set('test_table');
  table = new TableContainer(container, state, actions, mockBridge);
});

afterEach(() => {
  table.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

function bodyScroll(): HTMLElement {
  return table.getElement().querySelector<HTMLElement>('.dt-body-scroll')!;
}

describe('the scroll hold after a filter change', () => {
  it('puts back a clamp until a second has passed', () => {
    bodyScroll().scrollLeft = 500;
    actions.addFilter({ type: 'range', column: 'score', min: 0, max: 1 });

    bodyScroll().scrollLeft = 0;
    vi.advanceTimersByTime(20);
    expect(bodyScroll().scrollLeft).toBe(500);

    vi.advanceTimersByTime(1100);
    bodyScroll().scrollLeft = 0;
    vi.advanceTimersByTime(20);
    expect(bodyScroll().scrollLeft).toBe(0);
  });

  it.each(['wheel', 'keydown', 'pointerdown', 'touchstart'])(
    'lets a scroll after a %s in the table stand',
    (type) => {
      bodyScroll().scrollLeft = 500;
      actions.addFilter({ type: 'range', column: 'score', min: 0, max: 1 });

      table.getGridElement().dispatchEvent(new Event(type, { bubbles: true }));
      bodyScroll().scrollLeft = 900;
      vi.advanceTimersByTime(100);
      expect(bodyScroll().scrollLeft).toBe(900);
    },
  );

  it('starts over on the next filter change, from where the table is then', () => {
    bodyScroll().scrollLeft = 500;
    actions.addFilter({ type: 'range', column: 'score', min: 0, max: 1 });
    table.getGridElement().dispatchEvent(new Event('wheel', { bubbles: true }));
    bodyScroll().scrollLeft = 900;

    actions.addFilter({ type: 'range', column: 'id', min: 0, max: 1 });
    bodyScroll().scrollLeft = 0;
    vi.advanceTimersByTime(20);
    expect(bodyScroll().scrollLeft).toBe(900);
  });
});

describe("render()'s scroll restore", () => {
  it('puts the position back before returning, and leaves a later scroll alone', () => {
    const body = bodyScroll();
    body.scrollLeft = 300;
    body.scrollTop = 64;

    // A reorder rebuilds the header row and the body.
    actions.setColumnOrder(['score', 'name', 'id']);
    expect(body.scrollLeft).toBe(300);
    expect(body.scrollTop).toBe(64);

    // What the keyboard does right after a move: bring the column into view.
    body.scrollLeft = 700;
    vi.advanceTimersByTime(50);
    expect(body.scrollLeft).toBe(700);
  });
});
