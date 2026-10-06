/**
 * @vitest-environment jsdom
 *
 * The value inspector through `createDataTable`, against real DuckDB and the
 * nested stress fixture (Parquet), on its DEMO row: F2 on `point`, a double
 * click on `doc` (a JSON column), and a click on the inspect icon of `people`
 * (a list of structs), which leaves the selection alone. Each shows the
 * value's tree, and Escape gives focus back to the grid with the cursor and
 * `aria-activedescendant` where they were.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { initializeColumnsFromSchema } from '@/core/State';
import { createDataTable, type DataTable } from '@/index';
import type { SessionStore } from '@/persistence/SessionStore';
import type { LoadResult } from '@/worker/loaders/types';

import { createNodeDuckDB, type NodeDuckDBHarness } from '../helpers/duckdbNode';
import { MANIFEST, SHOWCASE, loadNestedFixture } from '../helpers/nestedFixture';
import { makeNodeBridge } from '../helpers/nodeBridge';

const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

let harness: NodeDuckDBHarness | undefined;
let loaded: LoadResult;

/** A bridge over the node connection with the lifecycle `createDataTable` touches. */
function facadeBridge(): ReturnType<typeof makeNodeBridge> {
  return {
    ...makeNodeBridge(harness!.conn),
    initialize: async () => {},
    isInitialized: () => true,
    clearQueryCache: () => {},
    terminate: () => {},
  } as unknown as ReturnType<typeof makeNodeBridge>;
}

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

beforeAll(async () => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  // Rows render for a viewport this tall; jsdom lays nothing out.
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return 500;
    },
  });
  harness = await createNodeDuckDB();
  loaded = await loadNestedFixture(harness, 'parquet');
}, 60_000);

afterAll(async () => {
  if (originalClientHeight) {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalClientHeight);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  }
  await harness?.cleanup();
});

afterEach(() => {
  document.body.innerHTML = '';
});

const ROW = SHOWCASE.DEMO;

async function mountTable(): Promise<{ table: DataTable; container: HTMLElement }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const table = await createDataTable({
    container,
    bridge: facadeBridge(),
    persistence: { sessionStore: makeSessionStore() },
    presets: false,
    expressionFilter: false,
    exportDialog: false,
    visualizations: false,
  });
  table.state.tableName.set(loaded.tableName);
  table.state.baseTableName.set(loaded.tableName);
  table.state.totalRows.set(MANIFEST.rowCount);
  table.state.filteredRows.set(MANIFEST.rowCount);
  initializeColumnsFromSchema(table.state, loaded.schema);
  // The DEMO row's cells, read and rendered.
  await vi.waitFor(() => expect(cell(container, ROW, 'point').textContent).toContain('gold'), {
    timeout: 10_000,
  });
  return { table, container };
}

function cell(container: HTMLElement, row: number, column: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    `[data-row-index="${row}"] [data-column="${column}"]`,
  );
  if (!el) throw new Error(`no cell at ${row}/${column}`);
  return el;
}

const grid = (container: HTMLElement): HTMLElement =>
  container.querySelector<HTMLElement>('[role="grid"]')!;
const panel = (container: HTMLElement): HTMLElement | null =>
  container.querySelector<HTMLElement>('.dt-value-inspector');
const treeLabels = (container: HTMLElement): string[] =>
  Array.from(
    panel(container)?.querySelectorAll('[role="treeitem"]') ?? [],
    (item) => item.getAttribute('aria-label') ?? '',
  );

/** Wait for the tree, and for focus on its active item. */
async function treeShown(container: HTMLElement, labels: string[]): Promise<void> {
  await vi.waitFor(() => expect(treeLabels(container)).toEqual(labels), { timeout: 10_000 });
  await vi.waitFor(() =>
    expect(document.activeElement?.getAttribute('aria-label')).toBe(labels[0]),
  );
}

/** Escape from the tree: the panel closes, and focus, cursor and activedescendant are as they were. */
function escapeBackToGrid(container: HTMLElement, column: string): void {
  document.activeElement!.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  expect(panel(container)!.style.display).toBe('none');
  expect(document.activeElement).toBe(grid(container));
  expect(grid(container).getAttribute('aria-activedescendant')).toBe(
    cell(container, ROW, column).id,
  );
}

describe('the value inspector through createDataTable (real DuckDB, nested fixture)', () => {
  it('opens on `point` with F2', async () => {
    const { table, container } = await mountTable();
    expect(cell(container, ROW, 'point').classList.contains('dt-cell--inspectable')).toBe(true);
    grid(container).focus();
    table.actions.setFocusedCell({ row: ROW, column: 'point' });

    const f2 = new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true });
    grid(container).dispatchEvent(f2);
    expect(f2.defaultPrevented).toBe(true);
    await treeShown(container, ['point: struct(3), 3 fields', 'x: 1.5', 'y: -0.5', 'tier: "gold"']);
    expect(panel(container)!.querySelector('.dt-value-inspector__title')!.textContent).toBe(
      `point · Row ${ROW + 1}`,
    );
    expect(panel(container)!.querySelector('.dt-value-inspector__type')!.textContent).toBe(
      'struct(3)',
    );

    escapeBackToGrid(container, 'point');
    expect(table.state.focusedCell.get()).toEqual({ row: ROW, column: 'point' });
    await table.destroy();
  }, 30_000);

  it('opens on `doc`, a JSON column, with a double click', async () => {
    const { table, container } = await mountTable();
    const doc = cell(container, ROW, 'doc');
    doc.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await treeShown(container, [
      'doc: json, 7 keys',
      'k: "alpha"',
      'score: 0.92',
      'kind: "demo"',
      'my field: "spaced key"',
      'a.b: "dotted key"',
      'q"k: "quoted key"',
      'ünï: "unicode key"',
    ]);
    expect(table.state.focusedCell.get()).toEqual({ row: ROW, column: 'doc' });
    escapeBackToGrid(container, 'doc');
    await table.destroy();
  }, 30_000);

  it('opens on `people` from its inspect icon, and leaves the selection alone', async () => {
    const { table, container } = await mountTable();
    table.actions.selectRow(2);
    const people = cell(container, ROW, 'people');
    people.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        width: 150,
        height: 32,
        bottom: 32,
        right: 150,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    people.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 140, clientY: 16 }),
    );
    await treeShown(container, [
      'people: [struct(3)], 2 items',
      '1: struct(3), 3 fields',
      'name: "Ada"',
      'age: 36',
      'langs: [varchar], 2 items',
      '2: struct(3), 3 fields',
      'name: "Linus"',
      'age: 54',
      'langs: [varchar], 3 items',
    ]);
    expect([...table.state.selectedRows.get()]).toEqual([2]);
    expect(table.state.focusedCell.get()).toEqual({ row: ROW, column: 'people' });
    escapeBackToGrid(container, 'people');
    await table.destroy();
  }, 30_000);
});
