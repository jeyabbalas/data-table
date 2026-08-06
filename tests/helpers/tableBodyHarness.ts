/**
 * Shared jsdom TableBody harness for the fetch-pipeline suites.
 *
 * Mirrors the historical inline setup from `TableBody.race.test.ts`:
 * a real VirtualScroller (never mocked) over a stubbed `clientHeight`
 * so JSDOM produces a genuine visible range, seeded TableState, and the
 * deferred `rowFetchBridge` mock. 320 px at the default 32 px rows means
 * 10 visible rows; with the scroller's 5 buffer rows a mid-table range
 * spans 20 indices.
 *
 * Callers must stub `ResizeObserver` themselves (`vi.stubGlobal`) before
 * constructing — VirtualScroller requires it under JSDOM.
 */
import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { TableBody, type TableBodyOptions } from '@/table/TableBody';

import {
  makeRowFetchBridge,
  type CapturedQuery,
  type RowFetchBridgeOptions,
} from './rowFetchBridge';

export class MockResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

export const HARNESS_SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'tag', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

export const HARNESS_COLUMNS = ['id', 'tag'];

export interface TableBodyHarness {
  body: TableBody;
  state: TableState;
  queries: CapturedQuery[];
  container: HTMLElement;
  /** Set physical scrollTop to `row * rowHeight` and re-derive the range synchronously. */
  scrollToRow: (row: number) => void;
  /** Drain the microtask queue a few times so awaited promises resolve. */
  drain: (times?: number) => Promise<void>;
}

export interface TableBodyHarnessOptions {
  /** Table row count (default 10_000 — comfortably below the 15M px spacer cap). */
  totalRows?: number;
  /** Stubbed scroll-container clientHeight in px (default 320 = 10 rows). */
  clientHeight?: number;
  /** Options forwarded to the TableBody constructor. */
  body?: TableBodyOptions;
  /** Options for the deferred mock bridge. */
  bridge?: RowFetchBridgeOptions;
}

export function setupTableBody(options: TableBodyHarnessOptions = {}): TableBodyHarness {
  const totalRows = options.totalRows ?? 10_000;

  const container = document.createElement('div');
  document.body.appendChild(container);

  const state: TableState = createTableState();
  state.tableName.set('t');
  initializeColumnsFromSchema(state, HARNESS_SCHEMA);
  state.totalRows.set(totalRows);
  state.filteredRows.set(totalRows);

  const { bridge, queries } = makeRowFetchBridge(options.bridge);
  const actions = new StateActions(state, bridge as unknown as Parameters<typeof StateActions>[1]);

  const body = new TableBody(
    container,
    state,
    bridge as unknown as Parameters<typeof TableBody>[2],
    actions,
    options.body ?? {},
  );

  const scroller = body.getVirtualScroller();
  const scrollContainer = scroller.getScrollContainer();
  Object.defineProperty(scrollContainer, 'clientHeight', {
    value: options.clientHeight ?? 320,
    configurable: true,
  });
  scroller.setTotalRows(totalRows);

  const scrollToRow = (row: number): void => {
    scrollContainer.scrollTop = row * 32;
    scroller.refresh();
  };

  const drain = async (times = 4): Promise<void> => {
    for (let i = 0; i < times; i++) await Promise.resolve();
  };

  return { body, state, queries, container, scrollToRow, drain };
}
