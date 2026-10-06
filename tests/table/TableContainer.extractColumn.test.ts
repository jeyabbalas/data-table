/**
 * @vitest-environment jsdom
 *
 * "Extract field → column" as `TableContainer` runs it: the header's extract
 * button opens the panel (a lazy chunk) under it, one panel at a time, held
 * open on its column, torn down by `render()` and `destroy()`;
 * `extractColumn` adds from the panel and from the value inspector's
 * Ctrl/Cmd+Enter, then puts the cursor on the new column (its header, or the
 * row the inspector showed), scrolls to it, flashes its header, focuses the
 * grid and announces it; a failure goes back to whichever asked, or to the
 * live region; and `extractColumns: false` takes both entry points away.
 *
 * `actions.addNestedFieldColumn` is replaced by one that changes the state
 * as the real one does, without DuckDB (see `fakeAdd`); the real one runs in
 * `ExtractColumnPanel.facade.duckdb.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StateActions } from '@/core/Actions';
import { __resetModalHostForTests } from '@/core/ModalHost';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { TableState } from '@/core/State';
import { batch } from '@/core/Signal';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { nestedFieldExpression, uniqueColumnName } from '@/nested/extractExpression';
import { HEADER_ROW_INDEX } from '@/table/KeyboardNavigator';
import { TableContainer, type TableContainerOptions } from '@/table/TableContainer';

class MockResizeObserver implements ResizeObserver {
  constructor(_: ResizeObserverCallback) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const SCHEMA: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  {
    name: 'point',
    type: 'nested',
    nullable: true,
    originalType: 'STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)',
  },
  { name: 'tags', type: 'nested', nullable: true, originalType: 'VARCHAR[]' },
  { name: 'doc', type: 'string', nullable: true, originalType: 'JSON' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

let state: TableState;

function rowAt(i: number, columns: readonly string[]): Record<string, unknown> {
  const row: Record<string, unknown> = { __rowid__: i };
  for (const column of columns) row[column] = column === 'id' ? i : `${column}${i}`;
  return row;
}

/** Answers the body's row reads, for whatever columns the schema has, and the inspector's reads. */
function makeBridge(): WorkerBridge {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('AS "json"')) {
      const text = sql.includes('"point"') ? '{"x":1.5,"y":-0.5,"tier":"gold"}' : '["a","b"]';
      return [{ json: text, chars: text.length }];
    }
    const select = /^SELECT (.*?) FROM/s.exec(sql)?.[1] ?? '';
    const columns = state.schema
      .get()
      .map((c) => c.name)
      .filter((c) => select.includes(`"${c}"`));
    const byIds = /"__rowid__" IN \(([^)]*)\)/.exec(sql);
    if (byIds) return byIds[1]!.split(',').map((id) => rowAt(Number(id), columns));
    if (sql.includes('COUNT(')) return [{ count: 40 }];
    const limit = Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? 0);
    const offset = Number(/OFFSET (\d+)/.exec(sql)?.[1] ?? 0);
    return Array.from({ length: Math.min(limit, 40 - offset) }, (_, i) =>
      rowAt(offset + i, columns),
    );
  });
  return {
    query,
    initialize: vi.fn(),
    terminate: vi.fn(),
    clearQueryCache: vi.fn(),
    isInitialized: () => true,
  } as unknown as WorkerBridge;
}

let actions: StateActions;
let table: TableContainer;
let add: ReturnType<typeof vi.spyOn>;

/**
 * `addNestedFieldColumn` without DuckDB: the expression and name the real
 * one makes, and the same state writes, in one batch (the relation renamed
 * to its VIEW, the column after its source), or `failure` when given. With
 * `gate`, the add waits for it first, as one queued behind other work does.
 */
function fakeAdd(failure?: string, gate?: Promise<void>): void {
  add = vi
    .spyOn(actions, 'addNestedFieldColumn')
    .mockImplementation(async (column, path, options = {}) => {
      await Promise.resolve();
      await gate;
      if (failure !== undefined) return { success: false, error: failure };
      const source = state.schema.get().find((c) => c.name === column)!;
      const built = nestedFieldExpression(
        { name: column, originalType: source.originalType ?? '' },
        path,
        options,
      );
      if (!built.ok) return { success: false, error: built.error.message };
      const name =
        options.name ??
        uniqueColumnName(
          built.name,
          state.schema.get().map((c) => c.name),
        );
      const after = (list: readonly string[]): string[] => {
        const at = list.indexOf(column) + 1;
        return [...list.slice(0, at), name, ...list.slice(at)];
      };
      batch(() => {
        state.tableName.set('t_view');
        state.derivedColumns.set([
          ...state.derivedColumns.get(),
          { kind: 'expression', name, expression: built.expression },
        ]);
        state.schema.set([
          ...state.schema.get(),
          {
            name,
            type: 'float',
            nullable: true,
            originalType: 'DOUBLE',
            isDerived: true,
            expression: built.expression,
          },
        ]);
        state.visibleColumns.set(after(state.visibleColumns.get()));
        state.columnOrder.set(after(state.columnOrder.get()));
      });
      return { success: true, name };
    });
}

async function mount(options: TableContainerOptions = {}): Promise<void> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const bridge = makeBridge();
  state = createTableState();
  actions = new StateActions(state, bridge);
  state.schema.set(SCHEMA);
  initializeColumnsFromSchema(state, SCHEMA);
  state.totalRows.set(40);
  state.filteredRows.set(40);
  state.tableName.set('t');
  table = new TableContainer(container, state, actions, bridge, options);
  // jsdom lays nothing out: give the body a height, and let it render.
  const scroll = root().querySelector<HTMLElement>('.dt-body-scroll')!;
  Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 320 });
  await table.whenBodyReady();
  table.getTableBody()!.getVirtualScroller().refresh();
  await vi.waitFor(() =>
    expect(cellOf(3, 'point').classList.contains('dt-cell--inspectable')).toBe(true),
  );
}

const root = (): HTMLElement => table.getElement();
const grid = (): HTMLElement => table.getGridElement();
const cellOf = (row: number, column: string): HTMLElement =>
  root().querySelector<HTMLElement>(`[data-row-index="${row}"] [data-column="${column}"]`)!;
const headerOf = (column: string): HTMLElement =>
  root().querySelector<HTMLElement>(`.dt-col-header[data-column="${column}"]`)!;
const extractButton = (column: string): HTMLButtonElement | null =>
  headerOf(column).querySelector<HTMLButtonElement>('.dt-col-extract-btn');
const panelEl = (): HTMLElement | null => root().querySelector<HTMLElement>('.dt-extract-panel');
const panelShown = (): boolean => panelEl() !== null && panelEl()!.style.display !== 'none';
const inspectorEl = (): HTMLElement | null =>
  root().querySelector<HTMLElement>('.dt-value-inspector');
const inspectorShown = (): boolean =>
  inspectorEl() !== null && inspectorEl()!.style.display !== 'none';
const announced = (): string => root().querySelector('.dt-announce')!.textContent ?? '';

/** Open the extract panel from `column`'s header button; the chunk may load first. */
async function openPanel(column: string): Promise<HTMLElement> {
  extractButton(column)!.click();
  await vi.waitFor(() => expect(panelShown()).toBe(true), { timeout: 5000 });
  return panelEl()!;
}

/** Open the value inspector on a cell, and wait for its tree. */
async function openInspector(row: number, column: string): Promise<HTMLElement> {
  expect(table.openValueInspector({ row, column })).toBe(true);
  await vi.waitFor(() => expect(inspectorEl()?.querySelector('[role="tree"]')).toBeTruthy(), {
    timeout: 5000,
  });
  return inspectorEl()!;
}

function treeItem(scope: HTMLElement, label: string): HTMLElement {
  const found = [...scope.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(
    (item) => item.getAttribute('aria-label') === label,
  );
  if (!found) throw new Error(`no tree item "${label}"`);
  return found;
}

function ctrlEnter(target: Element): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }),
  );
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  table?.destroy();
  __resetModalHostForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('TableContainer — extract field → column', () => {
  it('puts an extract button on nested and JSON headers only', async () => {
    await mount();
    expect(extractButton('point')).toBeTruthy();
    expect(extractButton('tags')).toBeTruthy();
    expect(extractButton('doc')).toBeTruthy();
    expect(extractButton('id')).toBeNull();
    expect(extractButton('name')).toBeNull();
  });

  it('reaches the button with F2 on the header and the arrow keys, and opens from it', async () => {
    await mount();
    grid().focus();
    actions.setFocusedCell({ row: HEADER_ROW_INDEX, column: 'point' });
    grid().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => expect(headerOf('point').contains(document.activeElement)).toBe(true));
    for (let i = 0; i < 6 && document.activeElement !== extractButton('point'); i++) {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      );
    }
    expect(document.activeElement).toBe(extractButton('point'));
    // Enter on a focused button clicks it; jsdom does not, so the test does.
    extractButton('point')!.click();
    await vi.waitFor(() => expect(panelShown()).toBe(true), { timeout: 5000 });
    await vi.waitFor(() => expect(panelEl()!.contains(document.activeElement)).toBe(true));
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    // Back on the button, in controls mode as before.
    expect(document.activeElement).toBe(extractButton('point'));
  });

  it('adds from the header panel: the cursor on the new header, in view, flashed, announced', async () => {
    await mount();
    fakeAdd();
    const reveal = vi.spyOn(table.getColumnWindow(), 'revealColumn');
    const panel = await openPanel('point');
    // In the root, beside the grid: `role="grid"` owns only rowgroups.
    expect(panel.parentElement).toBe(root());
    expect(grid().contains(panel)).toBe(false);
    // Its ids are this table's.
    expect(panel.getAttribute('aria-labelledby')).toBe(
      `dt-${table.getInstanceId()}-extract-panel-title`,
    );
    expect(extractButton('point')!.getAttribute('aria-expanded')).toBe('true');

    treeItem(panel, 'y: double').click();
    panel.querySelector<HTMLButtonElement>('.dt-extract-panel__button--primary')!.click();

    await vi.waitFor(() =>
      expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'point_y' }),
    );
    expect(add).toHaveBeenCalledWith('point', ['y'], { extract: 'value' });
    expect(state.visibleColumns.get().slice(1, 3)).toEqual(['point', 'point_y']);
    expect(reveal).toHaveBeenCalledWith('point_y');
    expect(announced()).toBe('Column point_y added');
    // The flash any newly shown column's header gets.
    expect(headerOf('point_y').classList.contains('dt-col-header--restored')).toBe(true);
    // The render the add caused tore the panel down; the grid has focus and
    // names the new header as the cursor.
    expect(panelEl()).toBeNull();
    expect(document.activeElement).toBe(grid());
    expect(grid().getAttribute('aria-activedescendant')).toBe(headerOf('point_y').id);
    expect(headerOf('point_y').classList.contains('dt-col-header--focused')).toBe(true);
  });

  it('adds from the inspector with Ctrl/Cmd+Enter, the cursor on the same row in the new column', async () => {
    await mount();
    fakeAdd();
    actions.setFocusedCell({ row: 3, column: 'point' });
    const inspector = await openInspector(3, 'point');
    expect(inspector.getAttribute('aria-labelledby')).toBe(
      `dt-${table.getInstanceId()}-value-inspector-title`,
    );
    // Its "add as column" buttons are there: the hook is wired.
    expect(
      [...inspector.querySelectorAll('.dt-value-inspector__button')].map((b) => b.textContent),
    ).toEqual([
      'Add as column',
      'Add length as column',
      'Add size as column',
      'Add tag as column',
      'Copy JSON',
      'Close',
    ]);
    const x = treeItem(inspector, 'x: 1.5');
    x.click();
    ctrlEnter(x);

    await vi.waitFor(() => expect(state.focusedCell.get()).toEqual({ row: 3, column: 'point_x' }));
    expect(add).toHaveBeenCalledWith('point', ['x'], { extract: 'value' });
    expect(announced()).toBe('Column point_x added');
    expect(inspectorEl()).toBeNull();
    expect(document.activeElement).toBe(grid());
  });

  it('adds a length the inspector asks for, by the inspector’s footer button', async () => {
    await mount();
    fakeAdd();
    const inspector = await openInspector(4, 'tags');
    const length = [
      ...inspector.querySelectorAll<HTMLButtonElement>('.dt-value-inspector__button'),
    ].find((b) => b.textContent === 'Add length as column' && !b.hidden)!;
    length.click();
    await vi.waitFor(() =>
      expect(state.focusedCell.get()).toEqual({ row: 4, column: 'tags_length' }),
    );
    expect(add).toHaveBeenCalledWith('tags', [], { extract: 'length' });
  });

  it('hands a failure back to the panel, which stays open, and moves nothing', async () => {
    await mount();
    fakeAdd('Column name "point_x" already exists');
    const panel = await openPanel('point');
    panel.querySelector<HTMLButtonElement>('.dt-extract-panel__button--primary')!.click();
    await vi.waitFor(() =>
      expect(panel.querySelector('[role="alert"]')!.textContent).toBe(
        'Could not add the column: Column name "point_x" already exists',
      ),
    );
    expect(panelShown()).toBe(true);
    expect(state.focusedCell.get()).toBeNull();
    expect(announced()).toBe('');
  });

  it('hands a failure back to the inspector’s status line', async () => {
    await mount();
    fakeAdd('boom');
    const inspector = await openInspector(3, 'point');
    const x = treeItem(inspector, 'x: 1.5');
    x.click();
    ctrlEnter(x);
    await vi.waitFor(() =>
      expect(inspector.querySelector('.dt-value-inspector__message')!.textContent).toBe(
        'Could not add the column: boom',
      ),
    );
    expect(inspectorShown()).toBe(true);
    expect(announced()).toBe('');
  });

  it('announces a failure when no panel is left to show it', async () => {
    await mount();
    fakeAdd('boom');
    await expect(table.extractColumn({ column: 'point', path: ['x'] })).resolves.toEqual({
      success: false,
      error: 'boom',
    });
    expect(announced()).toBe('Could not add the column: boom');
  });

  it('adds when called directly, the cursor in the row given', async () => {
    await mount();
    fakeAdd();
    await expect(
      table.extractColumn({ column: 'tags', path: [], extract: 'length', row: 5 }),
    ).resolves.toEqual({ success: true, name: 'tags_length' });
    expect(state.focusedCell.get()).toEqual({ row: 5, column: 'tags_length' });
    expect(announced()).toBe('Column tags_length added');
  });

  it('leaves focus the user took elsewhere where it is', async () => {
    await mount();
    fakeAdd();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    await table.extractColumn({ column: 'point', path: ['x'] });
    expect(document.activeElement).toBe(outside);
    expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'point_x' });
  });

  it('keeps one panel open at a time', async () => {
    await mount();
    await openPanel('point');
    headerOf('id').querySelector<HTMLElement>('.dt-col-filter-btn')!.click();
    expect(table.getFilterPanel()!.getIsOpen()).toBe(true);
    expect(panelShown()).toBe(false);

    await openPanel('tags');
    expect(table.getFilterPanel()!.getIsOpen()).toBe(false);

    await openInspector(3, 'point');
    expect(panelShown()).toBe(false);

    await openPanel('point');
    expect(inspectorShown()).toBe(false);
  });

  it('toggles from its button, and gives focus back to it on Escape', async () => {
    await mount();
    const panel = await openPanel('point');
    await vi.waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    expect(panelShown()).toBe(false);
    expect(document.activeElement).toBe(extractButton('point'));
    expect(extractButton('point')!.getAttribute('aria-expanded')).toBe('false');

    await openPanel('point');
    extractButton('point')!.click();
    await vi.waitFor(() => expect(panelShown()).toBe(false));
  });

  it('is torn down by a render, and rebuilt on the next click', async () => {
    await mount();
    await openPanel('point');
    actions.hideColumn('name');
    expect(panelEl()).toBeNull();
    await openPanel('point');
    expect(root().querySelectorAll('.dt-extract-panel')).toHaveLength(1);
  });

  it('holds its column mounted while it is open, and lets it go on close', async () => {
    await mount();
    const columnWindow = table.getColumnWindow();
    const hold = columnWindow.hold.bind(columnWindow);
    const releases = new Map<string, ReturnType<typeof vi.fn>>();
    vi.spyOn(columnWindow, 'hold').mockImplementation((column: string) => {
      const release = vi.fn(hold(column));
      releases.set(column, release);
      return release;
    });
    const panel = await openPanel('doc');
    expect(releases.get('doc')).toBeDefined();
    expect(releases.get('doc')).not.toHaveBeenCalled();
    panel.querySelector<HTMLButtonElement>('.dt-extract-panel__close')!.click();
    expect(releases.get('doc')).toHaveBeenCalledTimes(1);
  });

  it('is destroyed with the table', async () => {
    await mount();
    const panel = await openPanel('point');
    table.destroy();
    expect(panel.isConnected).toBe(false);
  });

  it('with extractColumns: false, offers neither the header button nor the inspector’s', async () => {
    await mount({ extractColumns: false });
    expect(table.getOptions().extractColumns).toBe(false);
    expect(root().querySelector('.dt-col-extract-btn')).toBeNull();
    const inspector = await openInspector(3, 'point');
    expect(
      [...inspector.querySelectorAll('.dt-value-inspector__button')].map((b) => b.textContent),
    ).toEqual(['Copy JSON', 'Close']);
    expect(inspector.querySelector('.dt-value-tree__add')).toBeNull();
    const x = treeItem(inspector, 'x: 1.5');
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    x.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  describe('an add still running', () => {
    function gate(): { promise: Promise<void>; release: () => void } {
      let release!: () => void;
      const promise = new Promise<void>((resolve) => (release = resolve));
      return { promise, release };
    }
    const derivedNames = (): string[] => state.derivedColumns.get().map((d) => d.name);
    const cancelButton = (panel: HTMLElement): HTMLButtonElement =>
      [...panel.querySelectorAll<HTMLButtonElement>('.dt-extract-panel__button')].find(
        (b) => b.textContent === 'Cancel',
      )!;

    it('is the one an identical request gets: one column, one promise', async () => {
      await mount();
      const held = gate();
      fakeAdd(undefined, held.promise);
      const first = table.extractColumn({ column: 'point', path: ['x'] });
      const again = table.extractColumn({ column: 'point', path: ['x'], extract: 'value' });
      expect(again).toBe(first);
      held.release();
      await expect(first).resolves.toEqual({ success: true, name: 'point_x' });
      expect(add).toHaveBeenCalledTimes(1);
      expect(derivedNames()).toEqual(['point_x']);
      // Settled: the same request adds again.
      await table.extractColumn({ column: 'point', path: ['x'] });
      expect(derivedNames()).toEqual(['point_x', 'point_x_2']);
    });

    it('from the extract panel: cancelled, opened again, not sent again, and lands where the user is', async () => {
      await mount();
      const held = gate();
      fakeAdd(undefined, held.promise);
      let panel = await openPanel('point');
      panel.querySelector<HTMLButtonElement>('.dt-extract-panel__button--primary')!.click();
      cancelButton(panel).click();
      expect(panelShown()).toBe(false);

      panel = await openPanel('point');
      const addColumn = panel.querySelector<HTMLButtonElement>(
        '.dt-extract-panel__button--primary',
      )!;
      expect(addColumn.textContent).toBe('Adding…');
      addColumn.click();
      expect(add).toHaveBeenCalledTimes(1);
      cancelButton(panel).click();

      // The user goes on, to a body cell.
      grid().focus();
      actions.setFocusedCell({ row: 2, column: 'id' });
      held.release();
      await vi.waitFor(() => expect(announced()).toBe('Column point_x added'));
      expect(derivedNames()).toEqual(['point_x']);
      expect(state.focusedCell.get()).toEqual({ row: 2, column: 'id' });
      expect(document.activeElement).toBe(grid());
    });

    it('from the value inspector: closed, opened again, not sent again, and lands where the user is', async () => {
      await mount();
      const held = gate();
      fakeAdd(undefined, held.promise);
      actions.setFocusedCell({ row: 3, column: 'point' });
      let inspector = await openInspector(3, 'point');
      const x = treeItem(inspector, 'x: 1.5');
      x.click();
      ctrlEnter(x);
      x.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
      expect(inspectorShown()).toBe(false);

      inspector = await openInspector(3, 'point');
      await vi.waitFor(() =>
        expect(inspector.querySelector('.dt-value-inspector__message')!.textContent).toBe(
          'Adding…',
        ),
      );
      const again = treeItem(inspector, 'x: 1.5');
      again.click();
      ctrlEnter(again);
      expect(add).toHaveBeenCalledTimes(1);
      again.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );

      held.release();
      await vi.waitFor(() => expect(announced()).toBe('Column point_x added'));
      expect(derivedNames()).toEqual(['point_x']);
      expect(state.focusedCell.get()).toEqual({ row: 3, column: 'point' });
      expect(document.activeElement).toBe(grid());
    });

    it('moves the cursor when the panel that asked is still open as it lands', async () => {
      await mount();
      const held = gate();
      fakeAdd(undefined, held.promise);
      const panel = await openPanel('point');
      panel.querySelector<HTMLButtonElement>('.dt-extract-panel__button--primary')!.click();
      held.release();
      await vi.waitFor(() =>
        expect(state.focusedCell.get()).toEqual({ row: HEADER_ROW_INDEX, column: 'point_x' }),
      );
      expect(document.activeElement).toBe(grid());
    });
  });
});
