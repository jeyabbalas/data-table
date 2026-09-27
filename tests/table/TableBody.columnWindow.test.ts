/**
 * @vitest-environment jsdom
 *
 * Body rows that render only some columns: the ones a column window
 * controller publishes, stood in for by `mountedColumns` here.
 *
 * A row holds a cell for each of them, in layout order, and a spacer as wide
 * as each run of columns between them and after the last. A change of columns
 * keeps the cells of the columns that stay, as the same elements: a cell
 * holding focus must never be detached by a scroll.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSignal } from '@/core/Signal';
import { StateActions } from '@/core/Actions';
import { initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';

import { rowsFor } from '../helpers/rowFetchBridge';
import {
  MockResizeObserver,
  setupTableBody,
  type TableBodyHarness,
} from '../helpers/tableBodyHarness';

/** Eight 100px columns, `a`…`h`: 800px of content. */
const COLUMNS = 'abcdefgh'.split('');
const SCHEMA: ColumnSchema[] = COLUMNS.map((name) => ({
  name,
  type: 'string',
  nullable: true,
  originalType: 'VARCHAR',
}));

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function setup(mountedAtFirst: string[]) {
  const mounted = createSignal<readonly string[]>(mountedAtFirst);
  const harness = setupTableBody({ body: { mountedColumns: mounted, instanceId: 't1' } });
  initializeColumnsFromSchema(harness.state, SCHEMA);
  const actions = new StateActions(harness.state, {
    query: vi.fn(),
    clearQueryCache: vi.fn(),
  } as unknown as ConstructorParameters<typeof StateActions>[1]);
  for (const name of COLUMNS) actions.setColumnWidth(name, 100);

  const init = harness.body.initialize();
  await harness.drain();
  const first = harness.queries[0]!;
  first.deferred.resolve(rowsFor(first.sql, COLUMNS));
  await init;
  return { harness, mounted, actions };
}

function row(harness: TableBodyHarness, index = 0): HTMLElement {
  return harness.container.querySelector<HTMLElement>(`.dt-row[data-row-index="${index}"]`)!;
}

/** A row's children: a column name for a cell, `|width|` for a spacer. */
function children(rowEl: HTMLElement): string[] {
  return Array.from(rowEl.children, (child) =>
    child.classList.contains('dt-col-spacer')
      ? `|${(child as HTMLElement).style.width}|`
      : (child.getAttribute('data-column') ?? '?'),
  );
}

function cellOf(rowEl: HTMLElement, column: string): HTMLElement {
  return rowEl.querySelector<HTMLElement>(`.dt-cell[data-column="${column}"]`)!;
}

describe('TableBody rows with a column window', () => {
  it('hold a cell for each mounted column and a spacer for each gap, the last one included', async () => {
    const { harness } = await setup(['a', 'b', 'e', 'f']);
    expect(children(row(harness))).toEqual(['a', 'b', '|200px|', 'e', 'f', '|200px|']);

    // Every data row has the same shape, and cells show their own column.
    for (const rowEl of harness.container.querySelectorAll<HTMLElement>('.dt-row')) {
      expect(children(rowEl)).toEqual(['a', 'b', '|200px|', 'e', 'f', '|200px|']);
    }
    expect(cellOf(row(harness, 3), 'e').textContent).toBe('e-3');
    harness.body.destroy();
  });

  it('keep cell ids and aria-colindex keyed by the column, not the cell position', async () => {
    const { harness } = await setup(['a', 'g']);
    const g = cellOf(row(harness, 2), 'g');
    expect(g.id).toBe('dt-t1-cell-2-6');
    expect(g.getAttribute('aria-colindex')).toBe('7');
    // Spacers are invisible to assistive tech and belong to no column.
    const spacer = row(harness, 2).querySelector('.dt-col-spacer')!;
    expect(spacer.getAttribute('aria-hidden')).toBe('true');
    expect(spacer.hasAttribute('role')).toBe(false);
    harness.body.destroy();
  });

  it('keep the cells of columns that stay when the columns change, as the same elements', async () => {
    const { harness, mounted } = await setup(['a', 'b', 'e', 'f']);
    const rowEl = row(harness);
    const e = cellOf(rowEl, 'e');
    const f = cellOf(rowEl, 'f');
    const a = cellOf(rowEl, 'a');

    mounted.set(['a', 'e', 'f', 'g']);

    expect(children(rowEl)).toEqual(['a', '|300px|', 'e', 'f', 'g', '|100px|']);
    expect(cellOf(rowEl, 'a')).toBe(a);
    expect(cellOf(rowEl, 'e')).toBe(e);
    expect(cellOf(rowEl, 'f')).toBe(f);
    expect(cellOf(rowEl, 'g').textContent).toBe('g-0');
    harness.body.destroy();
  });

  it('never detach a focused cell whose column stays', async () => {
    const { harness, mounted } = await setup(['a', 'b', 'c', 'd']);
    const cell = cellOf(row(harness), 'c');
    cell.focus();
    const detached = vi.fn();
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (Array.from(record.removedNodes).includes(cell)) detached();
      }
    });
    observer.observe(row(harness), { childList: true });

    mounted.set(['c', 'd', 'e', 'f']);
    mounted.set(['a', 'c', 'h']);
    await Promise.resolve();

    expect(detached).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(cell);
    observer.disconnect();
    harness.body.destroy();
  });

  it('lead with a pinned column, sticky, however far the rest of the window is from it', async () => {
    const { harness, mounted, actions } = await setup(['a']);
    actions.toggleColumnPin('h');
    // The layout is now h, a, b, … g.
    mounted.set(['h', 'd', 'e']);
    const rowEl = row(harness);
    expect(children(rowEl)).toEqual(['h', '|300px|', 'd', 'e', '|200px|']);
    expect(cellOf(rowEl, 'h').style.position).toBe('sticky');
    expect(cellOf(rowEl, 'h').style.left).toBe('0px');
    harness.body.destroy();
  });

  it('resize their spacers in place when a column between cells changes width', async () => {
    const { harness, actions } = await setup(['a', 'b', 'e', 'f']);
    const rowEl = row(harness);
    const spacer = rowEl.children[2] as HTMLElement;
    const e = cellOf(rowEl, 'e');

    actions.setColumnWidth('c', 250);

    expect(children(rowEl)).toEqual(['a', 'b', '|350px|', 'e', 'f', '|200px|']);
    expect(rowEl.children[2]).toBe(spacer);
    expect(cellOf(rowEl, 'e')).toBe(e);

    // A mounted column's width is its cell's.
    actions.setColumnWidth('e', 180);
    expect(e.style.width).toBe('180px');
    expect(children(rowEl)).toEqual(['a', 'b', '|350px|', 'e', 'f', '|200px|']);
    harness.body.destroy();
  });

  it('follow a new column order, moving cells only then', async () => {
    const { harness, mounted } = await setup(['a', 'b', 'c']);
    mounted.set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    const rowEl = row(harness);
    const b = cellOf(rowEl, 'b');

    harness.state.visibleColumns.set(['b', 'a', 'c', 'd', 'e', 'f', 'g', 'h']);

    expect(children(rowEl)).toEqual(['b', 'a', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(cellOf(rowEl, 'b')).toBe(b);
    expect(cellOf(rowEl, 'a').textContent).toBe('a-0');
    harness.body.destroy();
  });

  it('keep focus on a focused cell that a reorder shifts, and move it last of all', async () => {
    const { harness } = await setup(COLUMNS);
    const rowEl = row(harness);
    const d = cellOf(rowEl, 'd');
    d.focus();

    // `b` moves right past `d`, and `g` left past it: cells on both sides
    // of the focused one have to move.
    harness.state.visibleColumns.set(['a', 'c', 'g', 'd', 'e', 'b', 'f', 'h']);

    expect(children(rowEl)).toEqual(['a', 'c', 'g', 'd', 'e', 'b', 'f', 'h']);
    expect(cellOf(rowEl, 'd')).toBe(d);
    expect(document.activeElement).toBe(d);
    harness.body.destroy();
  });

  it('render once more after a render that sets off another, never inside it', async () => {
    // What the column window controller does when the body moves focus off
    // a row it is removing: hear the focus, and publish other columns.
    const { harness, mounted } = await setup(['a', 'b', 'c', 'd']);
    const grid = document.createElement('div');
    grid.tabIndex = 0;
    document.body.appendChild(grid);
    const internal = harness.body as unknown as { gridElement: HTMLElement | null };
    internal.gridElement = grid;
    grid.addEventListener('focusin', () => mounted.set(['a', 'b']));

    cellOf(row(harness, 0), 'c').focus();
    harness.body.refresh();
    const query = harness.queries.at(-1)!;
    query.deferred.resolve(rowsFor(query.sql, COLUMNS));
    await harness.drain();

    expect(harness.body.__verifyDomOrderForTests()).toBe(true);
    const indices = Array.from(harness.container.querySelectorAll('.dt-row'), (el) =>
      el.getAttribute('data-row-index'),
    );
    expect(new Set(indices).size).toBe(indices.length);
    for (const rowEl of harness.container.querySelectorAll<HTMLElement>(
      '.dt-row:not([data-placeholder])',
    )) {
      expect(children(rowEl)).toEqual(['a', 'b', '|600px|']);
    }
    harness.body.destroy();
  });

  it('shape every row for the columns published during a scroll that removes the focused row', async () => {
    const { harness, mounted } = await setup(['a', 'b', 'c', 'd']);
    const grid = document.createElement('div');
    grid.tabIndex = 0;
    document.body.appendChild(grid);
    const internal = harness.body as unknown as { gridElement: HTMLElement | null };
    internal.gridElement = grid;
    grid.addEventListener('focusin', () => mounted.set(['a', 'b']));

    // Row 0 holds focus. A scroll of twelve rows removes it, past the five
    // rows of buffer above the view, and the rows that stay and come in are
    // all fetched already.
    cellOf(row(harness, 0), 'c').focus();
    harness.scrollToRow(12);

    expect(row(harness, 0)).toBeNull();
    for (const rowEl of harness.container.querySelectorAll<HTMLElement>(
      '.dt-row:not([data-placeholder])',
    )) {
      expect(children(rowEl), `row ${rowEl.getAttribute('data-row-index')}`).toEqual([
        'a',
        'b',
        '|600px|',
      ]);
    }
    harness.body.destroy();
  });

  it('leave out a mounted name that is not a visible column', async () => {
    const { harness } = await setup(['a', 'nope', 'c']);
    expect(children(row(harness))).toEqual(['a', '|100px|', 'c', '|500px|']);
    harness.body.destroy();
  });

  it('hold every visible column, and no spacer, without a column window', async () => {
    const harness = setupTableBody();
    const init = harness.body.initialize();
    await harness.drain();
    const first = harness.queries[0]!;
    first.deferred.resolve(rowsFor(first.sql, ['id', 'tag']));
    await init;
    expect(children(row(harness))).toEqual(['id', 'tag']);
    harness.body.destroy();
  });
});
