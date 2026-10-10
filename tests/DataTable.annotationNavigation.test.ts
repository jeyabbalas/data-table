/**
 * @vitest-environment jsdom
 *
 * The `annotationNavigation` option on the facade: on by default, `false`
 * leaves `F8` and `Alt+↓` to the page while the actions keep working; and the
 * facade tells the container when each filter cycle has its row count, which
 * navigation waits for.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { createDataTable, type DataTable } from '@/index';

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

function makeBridge(): WorkerBridge {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(async (sql: string) => (sql.includes('COUNT(*)') ? [{ cnt: 5 }] : [])),
    loadData: vi.fn().mockResolvedValue({ schema: [], rowCount: 0 }),
    exportToBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    clearQueryCache: vi.fn(),
    terminate: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(true),
  } as unknown as WorkerBridge;
}

/** A table with 50 rows of {@link SCHEMA} in state, and one annotation. */
async function mount(annotationNavigation?: boolean): Promise<DataTable> {
  const container = document.createElement('div');
  container.style.height = '400px';
  document.body.appendChild(container);
  const table = await createDataTable({
    container,
    bridge: makeBridge(),
    persistence: false,
    undoRedo: false,
    visualizations: false,
    exportDialog: false,
    ...(annotationNavigation === undefined ? {} : { annotationNavigation }),
  });
  table.state.tableName.set('t');
  table.state.baseTableName.set('t');
  table.state.schema.set(SCHEMA);
  initializeColumnsFromSchema(table.state, SCHEMA);
  table.state.totalRows.set(50);
  table.annotations.add({ scope: 'row', rowId: 7, severity: 'error', message: 'x' });
  return table;
}

function pressF8(table: DataTable, init: KeyboardEventInit = { key: 'F8' }): boolean {
  const grid = table.container.getGridElement();
  grid.focus();
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  grid.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('createDataTable — annotationNavigation', () => {
  it('is on by default: F8 and Alt+↓ go to the next annotation', async () => {
    const table = await mount();
    const next = vi.spyOn(table.actions, 'nextAnnotation');
    expect(pressF8(table)).toBe(true);
    expect(pressF8(table, { key: 'ArrowDown', altKey: true })).toBe(true);
    expect(next).toHaveBeenCalledTimes(2);
    await table.destroy();
  });

  it('with false, leaves the keys to the page, and the actions still work', async () => {
    const table = await mount(false);
    const next = vi.spyOn(table.actions, 'nextAnnotation');
    expect(pressF8(table)).toBe(false);
    expect(pressF8(table, { key: 'ArrowUp', altKey: true })).toBe(false);
    expect(next).not.toHaveBeenCalled();
    expect(await table.actions.revealRow(9)).toEqual({ row: 9, column: 'id' });
    expect(await table.actions.nextAnnotation()).toMatchObject({ rowId: 7, row: 7 });
    await table.destroy();
  });

  it('tells the container when the filters in state have their row count', async () => {
    const table = await mount();
    const settled = vi.spyOn(table.container, 'filterCycleSettled');
    const changed = new Promise<void>((resolve) => table.on('filterChange', () => resolve()));
    table.actions.addFilter({ type: 'null', column: 'name' });
    await changed;
    expect(settled).toHaveBeenLastCalledWith(table.state.filters.get());
    await table.destroy();
    // A destroyed table navigates nowhere.
    await expect(table.actions.nextAnnotation()).rejects.toMatchObject({ code: 'DESTROYED' });
  });
});
