/**
 * @vitest-environment jsdom
 *
 * Row fetches that select only the columns rows can show.
 *
 * With a column window, a block fetch selects the pinned block and, around
 * each run of mounted columns, as many again either side, rounded out to
 * 16-column steps. A block fetched without a column that rows then render is
 * fetched again, its cells pending until it lands, and a fetch in flight that
 * would land without one is replaced.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StateActions } from '@/core/Actions';
import { createSignal } from '@/core/Signal';
import { initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';

import { rowsFor } from '../helpers/rowFetchBridge';
import {
  MockResizeObserver,
  setupTableBody,
  type TableBodyHarness,
} from '../helpers/tableBodyHarness';

/** Sixty-four 100px columns, `c00`…`c63`. */
const COLUMNS = Array.from({ length: 64 }, (_, i) => `c${String(i).padStart(2, '0')}`);
const SCHEMA: ColumnSchema[] = COLUMNS.map((name) => ({
  name,
  type: 'string',
  nullable: true,
  originalType: 'VARCHAR',
}));

/** `c{from}`…`c{to - 1}`. */
function span(from: number, to: number): string[] {
  return COLUMNS.slice(from, to);
}

/** The columns a block query selects, `__rowid__` left out. */
function selected(sql: string): string[] {
  const list = /^SELECT (.*?) FROM /.exec(sql)![1]!;
  return list
    .split(', ')
    .map((part) => part.replace(/"/g, ''))
    .filter((name) => name !== '__rowid__');
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

/** A body over 64 columns rendering `mountedAtFirst`, before its first fetch lands. */
function setup(mountedAtFirst: string[], pinned: string[] = []) {
  const mounted = createSignal<readonly string[]>(mountedAtFirst);
  const harness = setupTableBody({ body: { mountedColumns: mounted } });
  initializeColumnsFromSchema(harness.state, SCHEMA);
  const actions = new StateActions(harness.state, {
    query: vi.fn(),
    clearQueryCache: vi.fn(),
  } as unknown as ConstructorParameters<typeof StateActions>[1]);
  for (const name of pinned) actions.toggleColumnPin(name);
  for (const name of COLUMNS) actions.setColumnWidth(name, 100);
  return { harness, mounted, actions };
}

/** Land the last query with rows holding exactly what it selected. */
async function land(harness: TableBodyHarness): Promise<void> {
  const query = harness.queries.at(-1)!;
  query.deferred.resolve(rowsFor(query.sql, selected(query.sql)));
  await harness.drain();
}

function row(harness: TableBodyHarness, index = 0): HTMLElement {
  return harness.container.querySelector<HTMLElement>(`.dt-row[data-row-index="${index}"]`)!;
}

function cell(harness: TableBodyHarness, column: string, index = 0): HTMLElement {
  return row(harness, index).querySelector<HTMLElement>(`.dt-cell[data-column="${column}"]`)!;
}

describe('TableBody row fetches with a column window', () => {
  it('select the pinned block and each run widened by its width, rounded out to 16 columns', async () => {
    // c63 pinned leads; a run c40–c47, and the cursor's c05 on its own.
    const { harness } = setup(['c63', 'c05', ...span(40, 48)], ['c63']);
    const init = harness.body.initialize();
    await harness.drain();

    // Layout: c63, then c00…c62 at indices 1…63. The run is indices 41–48,
    // widened by 8 to 33–56 and rounded out to 32–64; c05 is index 6,
    // widened to 5–8 and rounded out to 1–16 (the pinned block ends at 1).
    expect(selected(harness.queries[0]!.sql)).toEqual(['c63', ...span(0, 15), ...span(31, 63)]);
    await land(harness);
    await init;
    expect(cell(harness, 'c44').textContent).toBe('c44-0');
    harness.body.destroy();
  });

  it('fetch nothing for a sideways move the fetched columns still cover', async () => {
    const { harness, mounted } = setup(span(40, 48));
    const init = harness.body.initialize();
    await harness.drain();
    await land(harness);
    await init;
    const fetched = harness.queries.length;

    mounted.set(span(44, 52));
    await harness.drain();

    expect(harness.queries.length).toBe(fetched);
    expect(cell(harness, 'c51').textContent).toBe('c51-0');
    harness.body.destroy();
  });

  it('fetch again past them, with the new cells pending until the rows land', async () => {
    const { harness, mounted } = setup(span(40, 48));
    const init = harness.body.initialize();
    await harness.drain();
    await land(harness);
    await init;
    const fetched = harness.queries.length;

    mounted.set(span(20, 28));
    await harness.drain();

    const again = harness.queries.slice(fetched);
    expect(again.length).toBeGreaterThan(0);
    // Run 20–28 widened by 8 is 12–36, rounded out to 0–48.
    expect(selected(again[0]!.sql)).toEqual(span(0, 48));
    // Cells of c20–c27 have no value yet, and the row says it is busy.
    expect(cell(harness, 'c24').textContent).toBe('');
    expect(cell(harness, 'c24').classList.contains('dt-cell--pending')).toBe(true);
    expect(row(harness).getAttribute('aria-busy')).toBe('true');

    await land(harness);
    expect(cell(harness, 'c24').textContent).toBe('c24-0');
    expect(cell(harness, 'c24').classList.contains('dt-cell--pending')).toBe(false);
    expect(row(harness).hasAttribute('aria-busy')).toBe(false);
    harness.body.destroy();
  });

  it('replace a fetch in flight that would land without a column now rendered', async () => {
    const { harness, mounted } = setup(span(40, 48));
    const init = harness.body.initialize();
    await harness.drain();
    const first = harness.queries[0]!;

    mounted.set(span(4, 12));
    await harness.drain();

    expect(first.signal?.aborted).toBe(true);
    const replacement = harness.queries.at(-1)!;
    expect(replacement).not.toBe(first);
    expect(selected(replacement.sql)).toContain('c04');
    await land(harness);
    await init;
    expect(cell(harness, 'c04').textContent).toBe('c04-0');
    harness.body.destroy();
  });

  it('keep a fetch in flight that covers the columns rows render now', async () => {
    const { harness, mounted } = setup(span(40, 48));
    const init = harness.body.initialize();
    await harness.drain();
    const first = harness.queries[0]!;

    mounted.set(span(42, 50));
    await harness.drain();

    expect(first.signal?.aborted).toBe(false);
    expect(harness.queries.length).toBe(1);
    await land(harness);
    await init;
    harness.body.destroy();
  });

  it('select every visible column without a column window', async () => {
    const harness = setupTableBody();
    const init = harness.body.initialize();
    await harness.drain();
    expect(selected(harness.queries[0]!.sql)).toEqual(['id', 'tag']);
    const query = harness.queries[0]!;
    query.deferred.resolve(rowsFor(query.sql, ['id', 'tag']));
    await init;
    harness.body.destroy();
  });
});
