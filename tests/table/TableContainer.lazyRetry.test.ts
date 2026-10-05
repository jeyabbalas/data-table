/**
 * @vitest-environment jsdom
 *
 * The value inspector and the extract panel are lazy chunks. A load that
 * fails once (the network, a deploy that removed the old chunk) must not be
 * kept: the next F2 or click asks for the chunk again, and opens the panel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { __resetModalHostForTests } from '@/core/ModalHost';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
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
];

function makeBridge(): WorkerBridge {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('AS "json"')) return [{ json: '["a","b"]', chars: 9 }];
    const byIds = /"__rowid__" IN \(([^)]*)\)/.exec(sql);
    if (byIds) {
      return byIds[1]!
        .split(',')
        .map((id) => ({ __rowid__: Number(id), id: Number(id), tags: '[a, b]' }));
    }
    if (sql.includes('COUNT(')) return [{ count: 20 }];
    const limit = Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? 0);
    const offset = Number(/OFFSET (\d+)/.exec(sql)?.[1] ?? 0);
    return Array.from({ length: Math.min(limit, 20 - offset) }, (_, i) => ({
      __rowid__: offset + i,
      id: offset + i,
      tags: '[a, b]',
    }));
  });
  return {
    query,
    initialize: vi.fn(),
    terminate: vi.fn(),
    clearQueryCache: vi.fn(),
    isInitialized: () => true,
  } as unknown as WorkerBridge;
}

let table: TableContainer;

/** The private loaders, called directly: a failure is a rejected promise the test can await. */
interface Loaders {
  showValueInspector(cell: { row: number; column: string }): Promise<void>;
  handleExtractClick(column: string, anchor: HTMLElement): Promise<void>;
}

beforeEach(async () => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const bridge = makeBridge();
  const state = createTableState();
  const actions = new StateActions(state, bridge);
  state.schema.set(SCHEMA);
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(20);
  state.filteredRows.set(20);
  state.tableName.set('t');
  table = new TableContainer(container, state, actions, bridge);
  const scroll = table.getElement().querySelector<HTMLElement>('.dt-body-scroll')!;
  Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 320 });
  await table.whenBodyReady();
  table.getTableBody()!.getVirtualScroller().refresh();
  await vi.waitFor(() =>
    expect(
      table
        .getElement()
        .querySelector('[data-row-index="2"] [data-column="tags"]')
        ?.classList.contains('dt-cell--inspectable'),
    ).toBe(true),
  );
});

afterEach(() => {
  table.destroy();
  __resetModalHostForTests();
  vi.doUnmock('@/table/ValueInspector');
  vi.doUnmock('@/table/ExtractColumnPanel');
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('TableContainer — a lazy panel whose chunk failed to load', () => {
  it('loads the value inspector again on the next open', async () => {
    vi.doMock('@/table/ValueInspector', () => {
      throw new Error('chunk offline');
    });
    const loaders = table as unknown as Loaders;
    await expect(loaders.showValueInspector({ row: 2, column: 'tags' })).rejects.toThrow();
    expect(table.getElement().querySelector('.dt-value-inspector')).toBeNull();

    vi.doUnmock('@/table/ValueInspector');
    expect(table.openValueInspector({ row: 2, column: 'tags' })).toBe(true);
    await vi.waitFor(
      () =>
        expect(table.getElement().querySelector('.dt-value-inspector [role="tree"]')).toBeTruthy(),
      { timeout: 5000 },
    );
  });

  it('loads the extract panel again on the next click', async () => {
    vi.doMock('@/table/ExtractColumnPanel', () => {
      throw new Error('chunk offline');
    });
    const button = table
      .getElement()
      .querySelector<HTMLButtonElement>('.dt-col-header[data-column="tags"] .dt-col-extract-btn')!;
    const loaders = table as unknown as Loaders;
    await expect(loaders.handleExtractClick('tags', button)).rejects.toThrow();
    expect(table.getElement().querySelector('.dt-extract-panel')).toBeNull();

    vi.doUnmock('@/table/ExtractColumnPanel');
    button.click();
    await vi.waitFor(
      () =>
        expect(
          table.getElement().querySelector<HTMLElement>('.dt-extract-panel')?.style.display,
        ).toBe(''),
      { timeout: 5000 },
    );
  });
});
