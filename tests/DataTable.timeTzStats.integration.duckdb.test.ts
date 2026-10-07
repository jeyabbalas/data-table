/**
 * @vitest-environment jsdom
 *
 * A TIME WITH TIME ZONE column's header through the facade, against real
 * DuckDB: its stats slot and its range filters.
 *
 * The chart read the column's minimum and maximum from DuckDB's text, which
 * carries an offset (`23:00:00+05:30`) it could not parse, so the chart drew
 * only its null bar and the stats slot had no time range (KI-2 in the 0.9.0
 * test plan). A range filter compared the column by instant, its bounds in
 * the session's time zone, so a brush over three bars could match one row.
 *
 * Table `verify_time_tz(id, t)`, nine rows, one NULL. By time of day `t` runs
 * from 01:30 to 24:00, and three rows lie from 01:30 up to 06:00, whatever
 * their offsets.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createDataTable, type DataTable } from '@/index';
import { initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { SessionStore } from '@/persistence/SessionStore';
import { createNodeDuckDB, type NodeDuckDBHarness } from './helpers/duckdbNode';
import { makeNodeBridge } from './helpers/nodeBridge';

const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
const originalGetRect = HTMLElement.prototype.getBoundingClientRect;

let harness: NodeDuckDBHarness | undefined;

/**
 * `makeNodeBridge` implements only `query`; `createDataTable` also touches
 * the lifecycle surface. Stub the rest — the table never owns this bridge.
 */
function facadeBridge(): ReturnType<typeof makeNodeBridge> {
  const base = makeNodeBridge(harness!.conn);
  return {
    ...base,
    initialize: async () => {},
    isInitialized: () => true,
    clearQueryCache: () => {},
    terminate: () => {},
  } as unknown as ReturnType<typeof makeNodeBridge>;
}

beforeAll(async () => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 500;
    },
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      width: 150,
      height: 60,
      top: 0,
      left: 0,
      bottom: 60,
      right: 150,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    rect: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 30 }),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
  }) as never;

  harness = await createNodeDuckDB();
  await harness.conn.query(`
    CREATE TABLE verify_time_tz AS SELECT
      s.id, CAST(s.t AS TIMETZ) AS t, s.id - 1 AS __rowid__
    FROM (VALUES
      (1, '01:30:00+05:30'), (2, '03:00:00-08'), (3, '05:00:00+00'), (4, '10:00:00-05:30:45'),
      (5, '14:05:06.5-08'), (6, '18:00:00+09'), (7, '23:00:00+05:30'), (8, '24:00:00-15:59:59'),
      (9, NULL)
    ) AS s(id, t)
  `);
}, 30_000);

afterAll(async () => {
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  }
  HTMLElement.prototype.getBoundingClientRect = originalGetRect;
  await harness?.cleanup();
});

afterEach(() => {
  document.body.innerHTML = '';
});

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 't', type: 'time', nullable: true, originalType: 'TIME WITH TIME ZONE' },
];

function makeSessionStore(): SessionStore {
  return {
    open: vi.fn().mockResolvedValue(true),
    save: vi.fn().mockResolvedValue(undefined),
    saveSync: vi.fn(),
    load: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn(),
  } as unknown as SessionStore;
}

interface Mounted {
  table: DataTable;
  slot: (column: string) => HTMLElement;
}

async function mountTable(): Promise<Mounted> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const table = await createDataTable({
    container,
    bridge: facadeBridge(),
    persistence: { sessionStore: makeSessionStore() },
    presets: false,
    expressionFilter: false,
    exportDialog: false,
  });
  table.state.tableName.set('verify_time_tz');
  table.state.baseTableName.set('verify_time_tz');
  table.state.totalRows.set(9);
  table.state.filteredRows.set(9);
  initializeColumnsFromSchema(table.state, SCHEMA);
  await Promise.resolve();
  await Promise.resolve();

  const slot = (column: string): HTMLElement => {
    const el = container.querySelector(
      `.dt-col-header[data-column="${column}"] .dt-col-stats`,
    ) as HTMLElement | null;
    if (!el) throw new Error(`stats slot for ${column} not found`);
    return el;
  };
  return { table, slot };
}

/** Wait for a column's stats slot text to match every one of `expected`. */
async function waitForSlot(
  h: Mounted,
  column: string,
  ...expected: (string | RegExp)[]
): Promise<void> {
  await vi.waitFor(
    () => {
      const text = h.slot(column).textContent ?? '';
      for (const e of expected) {
        if (e instanceof RegExp) expect(text).toMatch(e);
        else expect(text).toContain(e);
      }
    },
    { timeout: 5000 },
  );
}

describe('TIME WITH TIME ZONE column stats and filters (real DuckDB)', () => {
  it('shows the column’s time range in its stats slot', async () => {
    const h = await mountTable();

    // Line 2 is the time of day as written: 01:30:00+05:30 to 24:00:00-15:59:59.
    await waitForSlot(h, 't', /^9 rows · 1 null/, '01:30:00 – 24:00:00');
    expect(h.slot('t').textContent).not.toContain('Failed to load');
    await h.table.destroy();
  }, 20_000);

  it('counts the rows of the bars a brush-shaped filter covers', async () => {
    const h = await mountTable();
    await waitForSlot(h, 't', '01:30:00 – 24:00:00');

    // What a brush over the first three bars emits.
    h.table.actions.addFilter({
      type: 'range',
      column: 't',
      min: '01:30:00',
      max: '06:00:00',
      valueType: 'time',
    });

    await waitForSlot(h, 'id', '3 / 9 rows');
    await waitForSlot(h, 't', '3 / 9 rows', '3 rows (33.3%)');
    await h.table.destroy();
  }, 20_000);

  it('compares a range filter loaded from a preset saved before 0.9 by time of day', async () => {
    const h = await mountTable();
    await waitForSlot(h, 't', '01:30:00 – 24:00:00');

    h.table.actions.loadFilterPreset([
      { type: 'range', column: 't', min: '01:30:00', max: '06:00:00' },
    ]);

    expect(h.table.state.filters.get()).toEqual([
      { type: 'range', column: 't', min: '01:30:00', max: '06:00:00', valueType: 'time' },
    ]);
    await waitForSlot(h, 'id', '3 / 9 rows');
    await h.table.destroy();
  }, 20_000);

  it("loads a preset's valueType 'time' on a column that is no time without it", async () => {
    const h = await mountTable();
    await waitForSlot(h, 't', '01:30:00 – 24:00:00');

    // CAST("id" AS TIME) would fail every query, the row count's included.
    h.table.actions.loadFilterPreset([
      { type: 'range', column: 'id', min: 1, max: 5, valueType: 'time' },
    ]);

    expect(h.table.state.filters.get()).toEqual([{ type: 'range', column: 'id', min: 1, max: 5 }]);
    await waitForSlot(h, 't', '4 / 9 rows');
    await h.table.destroy();
  }, 20_000);
});
