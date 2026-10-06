/**
 * @vitest-environment jsdom
 *
 * Extract field → column from the UI, through `createDataTable`, against
 * real DuckDB and the nested stress fixture (Parquet): the `point` header's
 * extract button opens the panel, whose Add column adds `point_x` right
 * after `point`, holding what SQL reads there, with the cursor on its
 * header; and Ctrl/Cmd+Enter on a node of the value inspector adds that
 * node's value as a column and leaves the cursor on the same row, in it.
 * An add the user cancels while it runs still lands, once, and leaves the
 * cursor where the user went.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { WorkerBridge } from '@/data/WorkerBridge';
import { createDataTable, quoteIdentifier, type DataTable } from '@/index';
import { HEADER_ROW_INDEX } from '@/table/KeyboardNavigator';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { readBinaryFixture } from '../helpers/fixtures';
import { SHOWCASE } from '../helpers/nestedFixture';
import { makeNodeBridge } from '../helpers/nodeBridge';

const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

let harness: NodeDuckDBHarness | undefined;
const tables: DataTable[] = [];

beforeAll(async () => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  // Rows render for a viewport this tall; jsdom lays nothing out (and with
  // no width, every column is mounted).
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 500;
    },
  });
  harness = await createNodeDuckDB();
}, 60_000);

afterEach(async () => {
  for (const table of tables.splice(0)) {
    if (!table.isDestroyed()) await table.destroy();
  }
  document.body.innerHTML = '';
});

afterAll(async () => {
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  }
  await harness?.cleanup();
});

/** While set, a query that reads `"point"['x']` waits for it: the add, queued behind other work. */
let gate: Promise<void> | null = null;

/** A bridge over the node connection, with the lifecycle `createDataTable` touches. */
function facadeBridge(): WorkerBridge {
  const conn = harness!.conn;
  const base = makeNodeBridge(conn, harness!.db);
  return {
    ...base,
    query: async (text: string, ...rest: unknown[]) => {
      if (gate && text.includes(`"point"['x']`)) await gate;
      return (base.query as (...args: unknown[]) => Promise<unknown[]>)(text, ...rest);
    },
    initialize: async () => {},
    isInitialized: () => true,
    clearQueryCache: () => {},
    terminate: () => {},
    dropTable: async (name: string) => {
      await conn.query(`DROP TABLE IF EXISTS ${quoteIdentifier(name)}`);
    },
  } as unknown as WorkerBridge;
}

async function mount(tableName: string): Promise<{ table: DataTable; container: HTMLElement }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const table = await createDataTable({
    container,
    bridge: facadeBridge(),
    source: await readBinaryFixture('parquet', 'nested-stress-tests'),
    sourceFormat: 'parquet',
    tableName,
    persistence: false,
    presets: false,
    expressionFilter: false,
    exportDialog: false,
    visualizations: false,
  });
  tables.push(table);
  return { table, container };
}

async function sql(text: string): Promise<Record<string, unknown>[]> {
  return (await harness!.conn.query(text)).toArray().map((row) => row.toJSON());
}

const ROW = SHOWCASE.DEMO;

const grid = (container: HTMLElement): HTMLElement =>
  container.querySelector<HTMLElement>('[role="grid"]')!;
const header = (container: HTMLElement, column: string): HTMLElement =>
  container.querySelector<HTMLElement>(`.dt-col-header[data-column="${column}"]`)!;
const cell = (container: HTMLElement, row: number, column: string): HTMLElement | null =>
  container.querySelector<HTMLElement>(`[data-row-index="${row}"] [data-column="${column}"]`);
const announced = (container: HTMLElement): string =>
  container.querySelector('.dt-announce')?.textContent ?? '';

/** `count` columns from `name` on. */
function after(names: readonly string[], name: string, count: number): string[] {
  const at = names.indexOf(name);
  return names.slice(at, at + count);
}

describe('extract field → column from the UI (real DuckDB, nested fixture)', () => {
  it('adds point › x from the header’s extract panel, right after point', async () => {
    const { table, container } = await mount('extract_ui_header');
    const button = header(container, 'point').querySelector<HTMLButtonElement>(
      '.dt-col-extract-btn',
    )!;
    expect(button).toBeTruthy();
    button.click();
    const panel = await vi.waitFor(
      () => {
        const el = container.querySelector<HTMLElement>('.dt-extract-panel');
        expect(el?.style.display).toBe('');
        return el!;
      },
      { timeout: 10_000 },
    );
    const labels = [...panel.querySelectorAll('[role="treeitem"]')].map((i) =>
      i.getAttribute('aria-label'),
    );
    expect(labels).toEqual(['x: double', 'y: double', 'tier: varchar']);
    expect(panel.querySelector('.dt-extract-panel__expression')!.textContent).toBe(`"point"['x']`);
    expect(panel.querySelector<HTMLInputElement>('.dt-extract-panel__name')!.value).toBe('point_x');

    panel.querySelector<HTMLButtonElement>('.dt-extract-panel__button--primary')!.click();
    await vi.waitFor(
      () =>
        expect(table.state.focusedCell.get()).toEqual({
          row: HEADER_ROW_INDEX,
          column: 'point_x',
        }),
      { timeout: 10_000 },
    );

    expect(after(table.state.columnOrder.get(), 'point', 2)).toEqual(['point', 'point_x']);
    expect(after(table.state.visibleColumns.get(), 'point', 2)).toEqual(['point', 'point_x']);
    expect(table.state.schema.get().find((c) => c.name === 'point_x')).toMatchObject({
      type: 'float',
      originalType: 'DOUBLE',
      isDerived: true,
      expression: `"point"['x']`,
    });
    const expected = await sql(
      `SELECT "point"['x'] AS v FROM extract_ui_header ORDER BY "__rowid__"`,
    );
    const values = Array.from(await table.actions.getColumnValues('point_x'));
    expect(values).toEqual(expected.map((r) => r.v));
    expect(values.some((v) => v !== null)).toBe(true);
    expect(announced(container)).toBe('Column point_x added');
    expect(container.querySelector('.dt-extract-panel')).toBeNull();
    expect(document.activeElement).toBe(grid(container));
    expect(grid(container).getAttribute('aria-activedescendant')).toBe(
      header(container, 'point_x').id,
    );
    expect(header(container, 'point_x').classList.contains('dt-col-header--restored')).toBe(true);
    // One undo entry: undo takes it out again.
    await expect(table.actions.undo()).resolves.toBe(true);
    expect(table.state.schema.get().some((c) => c.name === 'point_x')).toBe(false);
  }, 60_000);

  it('adds a node’s value from the inspector with Ctrl/Cmd+Enter, the cursor on its row', async () => {
    const { table, container } = await mount('extract_ui_inspector');
    await vi.waitFor(() => expect(cell(container, ROW, 'point')?.textContent).toContain('gold'), {
      timeout: 10_000,
    });
    grid(container).focus();
    table.actions.setFocusedCell({ row: ROW, column: 'point' });
    grid(container).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }),
    );
    const inspector = await vi.waitFor(
      () => {
        const el = container.querySelector<HTMLElement>('.dt-value-inspector');
        expect(el?.querySelector('[role="treeitem"][aria-label="y: -0.5"]')).toBeTruthy();
        return el!;
      },
      { timeout: 10_000 },
    );
    const y = inspector.querySelector<HTMLElement>('[role="treeitem"][aria-label="y: -0.5"]')!;
    y.click();
    y.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    await vi.waitFor(
      () => expect(table.state.focusedCell.get()).toEqual({ row: ROW, column: 'point_y' }),
      { timeout: 10_000 },
    );
    expect(after(table.state.visibleColumns.get(), 'point', 2)).toEqual(['point', 'point_y']);
    expect(container.querySelector('.dt-value-inspector')).toBeNull();
    expect(announced(container)).toBe('Column point_y added');
    expect(document.activeElement).toBe(grid(container));
    // The new column's cell on that row is rendered, holds the value, and is
    // what the grid names as its cursor.
    await vi.waitFor(
      () => {
        const target = cell(container, ROW, 'point_y');
        expect(target?.textContent).toBe('-0.5');
        expect(grid(container).getAttribute('aria-activedescendant')).toBe(target!.id);
      },
      { timeout: 10_000 },
    );
  }, 60_000);

  it('adds once what was asked for again after a Cancel, and leaves the cursor where the user went', async () => {
    const { table, container } = await mount('extract_ui_cancel');
    const button = header(container, 'point').querySelector<HTMLButtonElement>(
      '.dt-col-extract-btn',
    )!;
    const openPanel = async (): Promise<HTMLElement> => {
      button.click();
      return vi.waitFor(
        () => {
          const el = container.querySelector<HTMLElement>('.dt-extract-panel');
          expect(el?.style.display).toBe('');
          return el!;
        },
        { timeout: 10_000 },
      );
    };
    const addButton = (panel: HTMLElement): HTMLButtonElement =>
      panel.querySelector<HTMLButtonElement>('.dt-extract-panel__button--primary')!;
    const cancel = (panel: HTMLElement): void =>
      [...panel.querySelectorAll<HTMLButtonElement>('.dt-extract-panel__button')]
        .find((b) => b.textContent === 'Cancel')!
        .click();
    let release!: () => void;
    gate = new Promise<void>((resolve) => (release = resolve));
    try {
      let panel = await openPanel();
      addButton(panel).click();
      cancel(panel);
      panel = await openPanel();
      expect(addButton(panel).textContent).toBe('Adding…');
      addButton(panel).click();
      cancel(panel);
      grid(container).focus();
      table.actions.setFocusedCell({ row: 2, column: 'point' });
    } finally {
      gate = null;
      release();
    }

    await vi.waitFor(() => expect(announced(container)).toBe('Column point_x added'), {
      timeout: 10_000,
    });
    const derived = table.state.schema.get().filter((c) => c.isDerived);
    expect(derived.map((c) => [c.name, c.expression])).toEqual([['point_x', `"point"['x']`]]);
    expect(table.state.focusedCell.get()).toEqual({ row: 2, column: 'point' });
    expect(document.activeElement).toBe(grid(container));
  }, 60_000);
});
