/**
 * @vitest-environment jsdom
 *
 * The value inspector and the extract panel are lazy chunks. A load that
 * fails (the network, a CSP, a deploy that removed the old chunk) is said
 * in the live region and handed to `onError` as a `CHUNK_LOAD_FAILED`
 * error, never left as an unhandled rejection. It is not kept: the next F2
 * or click asks for the chunk again, and opens the panel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { ConfigurationError, type DataTableError } from '@/core/errors';
import { __resetModalHostForTests } from '@/core/ModalHost';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import { defaultStrings } from '@/core/Strings';
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
let state: TableState;
let onError: ReturnType<typeof vi.fn<(error: DataTableError) => void>>;

const announced = (): string => table.getElement().querySelector('.dt-announce')!.textContent ?? '';

beforeEach(async () => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const bridge = makeBridge();
  state = createTableState();
  const actions = new StateActions(state, bridge);
  state.schema.set(SCHEMA);
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(20);
  state.filteredRows.set(20);
  state.tableName.set('t');
  onError = vi.fn();
  table = new TableContainer(container, state, actions, bridge, { onError });
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

/** The error `onError` was handed, once. */
function reported(panel: string): DataTableError {
  expect(onError).toHaveBeenCalledTimes(1);
  const error = onError.mock.calls[0]![0];
  expect(error).toBeInstanceOf(ConfigurationError);
  expect(error.code).toBe('CHUNK_LOAD_FAILED');
  expect(error.details).toEqual({ panel });
  expect(error.cause).toBeInstanceOf(Error);
  expect(error.message).toMatch(new RegExp(`^The ${panel} chunk did not load: `));
  return error;
}

describe('TableContainer — a lazy panel whose chunk failed to load', () => {
  it('says so on F2, reports it, and loads the value inspector again on the next open', async () => {
    vi.doMock('@/table/ValueInspector', () => {
      throw new Error('chunk offline');
    });
    const grid = table.getGridElement();
    grid.focus();
    state.focusedCell.set({ row: 2, column: 'tags' });
    const f2 = (): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true });
      grid.dispatchEvent(event);
      return event;
    };
    expect(f2().defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    reported('valueInspector');
    // The key was claimed: the live region says why nothing opened.
    expect(announced()).toBe(defaultStrings.values.panelLoadFailed);
    expect(table.getElement().querySelector('.dt-value-inspector')).toBeNull();
    expect(document.activeElement).toBe(grid);

    vi.doUnmock('@/table/ValueInspector');
    expect(f2().defaultPrevented).toBe(true);
    await vi.waitFor(
      () =>
        expect(table.getElement().querySelector('.dt-value-inspector [role="tree"]')).toBeTruthy(),
      { timeout: 5000 },
    );
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('says so on a click, reports it, and loads the extract panel again on the next click', async () => {
    vi.doMock('@/table/ExtractColumnPanel', () => {
      throw new Error('chunk offline');
    });
    const button = table
      .getElement()
      .querySelector<HTMLButtonElement>('.dt-col-header[data-column="tags"] .dt-col-extract-btn')!;
    button.click();
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    reported('extractPanel');
    expect(announced()).toBe(defaultStrings.values.panelLoadFailed);
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
