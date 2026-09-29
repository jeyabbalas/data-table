/**
 * @vitest-environment jsdom
 *
 * The row range follows the body's height. `VirtualScroller` reads the
 * body's `clientHeight` when it works the range out, which it did only on a
 * scroll or a state change: a body that grew taller showed blank space below
 * the rows it had rendered until the next scroll. `TableContainer` now has
 * the range read again whenever the body resizes.
 *
 * jsdom does no layout: `clientHeight` is stubbed, and the ResizeObserver
 * callback is called by hand. The same in a real browser is
 * `tests/browser/viewport-height.spec.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { TableContainer } from '@/table/TableContainer';

class MockResizeObserver implements ResizeObserver {
  static instances: MockResizeObserver[] = [];
  readonly observed = new Set<Element>();
  constructor(readonly callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }
  observe(element: Element): void {
    this.observed.add(element);
  }
  unobserve(element: Element): void {
    this.observed.delete(element);
  }
  disconnect(): void {
    this.observed.clear();
  }
}

const mockBridge = {
  initialize: vi.fn(),
  query: vi.fn().mockResolvedValue([]),
  terminate: vi.fn(),
  clearQueryCache: vi.fn(),
} as unknown as WorkerBridge;

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'score', type: 'float', nullable: false, originalType: 'DOUBLE' },
];

let container: HTMLElement;
let state: TableState;
let table: TableContainer;

function bodyScroll(): HTMLElement {
  return table.getElement().querySelector<HTMLElement>('.dt-body-scroll')!;
}

/** Give the body a height, and report it as a ResizeObserver would. */
function resizeBody(height: number): void {
  const body = bodyScroll();
  Object.defineProperty(body, 'clientHeight', { configurable: true, value: height });
  for (const observer of MockResizeObserver.instances) {
    if (!observer.observed.has(body)) continue;
    observer.callback(
      [
        {
          target: body,
          contentRect: { width: 800, height },
        } as unknown as ResizeObserverEntry,
      ],
      observer,
    );
  }
}

beforeEach(async () => {
  MockResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  container = document.createElement('div');
  document.body.appendChild(container);
  state = createTableState();
  const actions = new StateActions(state, mockBridge);
  state.schema.set(SCHEMA);
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(1_000);
  state.filteredRows.set(1_000);
  state.tableName.set('test_table');
  table = new TableContainer(container, state, actions, mockBridge);
  await table.whenBodyReady();
});

afterEach(() => {
  table.destroy();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('the row range and the body height', () => {
  it('is read again when the body grows taller, with no scroll', () => {
    resizeBody(100);
    const scroller = table.getTableBody()!.getVirtualScroller();
    // ⌈100 / 32⌉ rows in view, and 5 below them.
    expect(scroller.getVisibleRange()).toMatchObject({ start: 0, end: 9 });

    resizeBody(600);

    // ⌈600 / 32⌉ rows in view, and 5 below them.
    expect(scroller.getVisibleRange()).toMatchObject({ start: 0, end: 24 });
    expect(bodyScroll().querySelectorAll('.dt-row')).toHaveLength(24);
  });

  it('is read again when the body shrinks', () => {
    resizeBody(600);
    resizeBody(100);

    expect(table.getTableBody()!.getVirtualScroller().getVisibleRange()).toMatchObject({
      start: 0,
      end: 9,
    });
    expect(bodyScroll().querySelectorAll('.dt-row')).toHaveLength(9);
  });

  it('is empty while the body has no height, and read again once it has', () => {
    resizeBody(0);
    const scroller = table.getTableBody()!.getVirtualScroller();
    expect(scroller.getVisibleRange()).toMatchObject({ start: 0, end: 0 });

    resizeBody(320);
    expect(scroller.getVisibleRange()).toMatchObject({ start: 0, end: 15 });
  });

  it('is left alone once the table is destroyed', () => {
    const scroller = table.getTableBody()!.getVirtualScroller();
    const refresh = vi.spyOn(scroller, 'refresh');
    table.destroy();

    expect(() => resizeBody(600)).not.toThrow();
    expect(refresh).not.toHaveBeenCalled();
  });
});
