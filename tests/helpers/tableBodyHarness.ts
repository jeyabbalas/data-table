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
import { vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { DEFAULT_COLUMN_WIDTH } from '@/table/ColumnWindow';
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

/**
 * `n` integer columns named `col_0 … col_{n-1}` — the column-axis counterpart
 * of the 10,000-row default, for suites about the column window rather than
 * the fetch pipeline.
 *
 * Named to match `tests/fixtures/tiers.ts`, so a jsdom failure and a browser
 * failure talk about the same column.
 */
export function wideHarnessSchema(n: number): ColumnSchema[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `col_${i}`,
    type: 'integer' as const,
    nullable: false,
    originalType: 'INTEGER',
  }));
}

export interface TableBodyHarness {
  body: TableBody;
  state: TableState;
  queries: CapturedQuery[];
  container: HTMLElement;
  /** The element the scroller listens on — where `scrollTop`/`scrollLeft` live. */
  scrollContainer: HTMLElement;
  /** The mounted schema's column names, in order. */
  columns: string[];
  /** Set physical scrollTop to `row * rowHeight` and re-derive the range synchronously. */
  scrollToRow: (row: number) => void;
  /**
   * Set physical `scrollLeft` and recompute the column window synchronously.
   *
   * jsdom dispatches no `scroll` event for a programmatic write, so this is
   * also what a real horizontal scroll amounts to once the rAF throttle has
   * fired. Use {@link TableBodyHarness.fireScroll} to go through the listener
   * itself.
   */
  scrollToColumnPx: (px: number) => void;
  /** {@link TableBodyHarness.scrollToColumnPx} to the left edge of `columns[index]`. */
  scrollToColumn: (index: number) => void;
  /** Dispatch a real `scroll` event on the scroll container. */
  fireScroll: () => void;
  /**
   * Run every animation frame queued so far, repeatedly, so a callback that
   * schedules another one also runs. Requires `clientWidth` to have been
   * passed — that is what installs the queue.
   */
  flushFrames: (times?: number) => void;
  /** Drain the microtask queue a few times so awaited promises resolve. */
  drain: (times?: number) => Promise<void>;
}

export interface TableBodyHarnessOptions {
  /** Table row count (default 10_000 — comfortably below the 15M px spacer cap). */
  totalRows?: number;
  /** Stubbed scroll-container clientHeight in px (default 320 = 10 rows). */
  clientHeight?: number;
  /**
   * Stubbed scroll-container `clientWidth` in px.
   *
   * Left alone by default, so jsdom's `0` stands — which is what every
   * existing suite has implicitly been running with, and what makes the
   * column window fall back to its column floor. Passing a width also
   * installs the deterministic `requestAnimationFrame` queue
   * ({@link TableBodyHarness.flushFrames}); it is removed by the
   * `vi.unstubAllGlobals()` every suite already runs for `ResizeObserver`.
   */
  clientWidth?: number;
  /** Schema to mount (default {@link HARNESS_SCHEMA}). */
  schema?: ColumnSchema[];
  /** Options forwarded to the TableBody constructor. */
  body?: TableBodyOptions;
  /** Options for the deferred mock bridge. */
  bridge?: RowFetchBridgeOptions;
}

export function setupTableBody(options: TableBodyHarnessOptions = {}): TableBodyHarness {
  const totalRows = options.totalRows ?? 10_000;
  const schema = options.schema ?? HARNESS_SCHEMA;

  // Installed before the TableBody is constructed: it attaches its horizontal
  // scroll listener there, and a frame scheduled against the real rAF would
  // land after the test has finished.
  const frames: FrameRequestCallback[] = [];
  if (options.clientWidth !== undefined) {
    let nextFrameId = 1;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
      frames.push(cb);
      return nextFrameId++;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
      // Ids are not tracked: nothing in these suites cancels a frame it also
      // needs to have run, and a cancelled callback simply stays queued and
      // no-ops behind its own destroyed guard.
      void id;
    });
  }

  const container = document.createElement('div');
  document.body.appendChild(container);

  const state: TableState = createTableState();
  state.tableName.set('t');
  initializeColumnsFromSchema(state, schema);
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
  if (options.clientWidth !== undefined) {
    Object.defineProperty(scrollContainer, 'clientWidth', {
      value: options.clientWidth,
      configurable: true,
    });
  }
  scroller.setTotalRows(totalRows);

  const columns = schema.map((column) => column.name);

  const scrollToRow = (row: number): void => {
    scrollContainer.scrollTop = row * 32;
    scroller.refresh();
  };

  const scrollToColumnPx = (px: number): void => {
    scrollContainer.scrollLeft = px;
    body.refreshColumnWindow();
  };

  const scrollToColumn = (index: number): void => {
    const widths = state.columnWidths.get();
    let left = 0;
    for (let i = 0; i < index && i < columns.length; i++) {
      left += Math.round(widths.get(columns[i]!) ?? DEFAULT_COLUMN_WIDTH);
    }
    scrollToColumnPx(left);
  };

  const fireScroll = (): void => {
    scrollContainer.dispatchEvent(new Event('scroll'));
  };

  const flushFrames = (times = 2): void => {
    for (let i = 0; i < times; i++) {
      const queued = frames.splice(0, frames.length);
      for (const cb of queued) cb(0);
    }
  };

  const drain = async (times = 4): Promise<void> => {
    for (let i = 0; i < times; i++) await Promise.resolve();
  };

  return {
    body,
    state,
    queries,
    container,
    scrollContainer,
    columns,
    scrollToRow,
    scrollToColumnPx,
    scrollToColumn,
    fireScroll,
    flushFrames,
    drain,
  };
}
