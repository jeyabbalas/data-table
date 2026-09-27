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
import { AnnotationStore } from '@/annotations/AnnotationStore';
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

/** The `__rowid__`s a top-up reads, or `null` for a block fetch. */
function rowidsRead(sql: string): number[] | null {
  // A literal list: a sorted block fetch has `IN (SELECT …)` instead.
  const list = /"__rowid__" IN \((\d+(?:, \d+)*)\)/.exec(sql)?.[1];
  return list === undefined ? null : list.split(', ').map(Number);
}

/**
 * Land a query with rows holding exactly what it selected: a block fetch's
 * window, or the rows a top-up reads by id. The last query unless told.
 */
async function land(harness: TableBodyHarness, query = harness.queries.at(-1)!): Promise<void> {
  const ids = rowidsRead(query.sql);
  const columns = selected(query.sql);
  query.deferred.resolve(
    ids === null
      ? rowsFor(query.sql, columns)
      : ids.map((id) => {
          const row: Record<string, unknown> = { __rowid__: id };
          for (const column of columns) row[column] = `${column}-${id}`;
          return row;
        }),
  );
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

  it('fetch nothing for a sideways move the fetched columns still cover, though the next fetch would select others', async () => {
    // 100 columns, so the projection can move without leaving the table.
    const wide = Array.from({ length: 100 }, (_, i) => `c${String(i).padStart(2, '0')}`);
    const mounted = createSignal<readonly string[]>(wide.slice(40, 48));
    const harness = setupTableBody({ body: { mountedColumns: mounted } });
    initializeColumnsFromSchema(
      harness.state,
      wide.map((name) => ({ name, type: 'string', nullable: true, originalType: 'VARCHAR' })),
    );
    const init = harness.body.initialize();
    await harness.drain();
    await land(harness);
    await init;
    const fetched = harness.queries.length;

    // Rendered c52–c59 are within the 32–64 fetched; a fetch now would select
    // 32–80.
    mounted.set(wide.slice(52, 60));
    await harness.drain();

    expect(harness.queries.length).toBe(fetched);
    expect(cell(harness, 'c59').textContent).toBe('c59-0');
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

  it('read the columns past them for the rows they have, with the new cells pending until they land', async () => {
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
    // Run 20–28 widened by 8 is 12–36, rounded out to 0–48; the block has
    // 32–63 already, so it reads 0–31, for its own rows, by id: no sort, no
    // OFFSET.
    expect(selected(again[0]!.sql)).toEqual(span(0, 32));
    expect(rowidsRead(again[0]!.sql)).toEqual(Array.from({ length: 128 }, (_, i) => i));
    expect(again[0]!.sql).not.toMatch(/OFFSET|ORDER BY/);
    // Cells of c20–c27 have no value yet, and the row says it is busy.
    expect(cell(harness, 'c24').textContent).toBe('');
    expect(cell(harness, 'c24').classList.contains('dt-cell--pending')).toBe(true);
    expect(row(harness).getAttribute('aria-busy')).toBe('true');

    await land(harness);
    expect(cell(harness, 'c24').textContent).toBe('c24-0');
    expect(cell(harness, 'c24').classList.contains('dt-cell--pending')).toBe(false);
    expect(row(harness).hasAttribute('aria-busy')).toBe(false);
    // The block now holds c00–c47, the columns a fetch would select here:
    // what it had past them is dropped, so a sweep does not pile columns up.
    const cached = (
      harness.body as unknown as { rowDataCache: Map<number, object> }
    ).rowDataCache.get(5)!;
    expect(Object.keys(cached).sort()).toEqual(['__rowid__', ...span(0, 48)].sort());
    harness.body.destroy();
  });

  it('fetch nothing for a hide or a move, and read a column shown by id for the rows they have', async () => {
    const { harness, actions } = setup(span(0, 8));
    // Hidden before the first fetch, which selects the visible columns only.
    actions.hideColumn('c03');
    const init = harness.body.initialize();
    await harness.drain();
    expect(selected(harness.queries[0]!.sql)).not.toContain('c03');
    await land(harness);
    await init;
    const fetched = harness.queries.length;

    actions.hideColumn('c02');
    const order = harness.state.visibleColumns.get();
    actions.setColumnOrder(['c01', 'c00', ...order.slice(2)]);
    await harness.drain();
    expect(harness.queries.length).toBe(fetched);
    const shown = () =>
      Array.from(row(harness).querySelectorAll('.dt-cell'), (c) => c.getAttribute('data-column'));
    expect(shown().slice(0, 3)).toEqual(['c01', 'c00', 'c04']);
    expect(cell(harness, 'c04').textContent).toBe('c04-0');

    actions.showColumn('c03');
    await harness.drain();
    const topUp = harness.queries.slice(fetched);
    expect(topUp).toHaveLength(1);
    expect(selected(topUp[0]!.sql)).toEqual(['c03']);
    expect(rowidsRead(topUp[0]!.sql)).toEqual(Array.from({ length: 128 }, (_, i) => i));
    expect(cell(harness, 'c03').classList.contains('dt-cell--pending')).toBe(true);
    await land(harness);
    expect(cell(harness, 'c03').textContent).toBe('c03-0');
    harness.body.destroy();
  });

  it('fetch the rows again when a column’s schema entry is replaced under the same table', async () => {
    const { harness, actions } = setup(span(0, 8));
    const init = harness.body.initialize();
    await harness.drain();
    await land(harness);
    await init;
    const fetched = harness.queries.length;

    // What editing a derived column's expression does: a new entry for the
    // column, the table name unchanged. Hidden and shown around it, a body
    // that kept its rows showed the old values.
    actions.hideColumn('c03');
    harness.state.schema.set(
      harness.state.schema.get().map((c) => (c.name === 'c03' ? { ...c } : c)),
    );
    actions.showColumn('c03');
    await harness.drain();
    // Land each fetch since, and what landing it sets off.
    for (let i = fetched; i < harness.queries.length; i++) {
      await land(harness, harness.queries[i]!);
    }
    const since = harness.queries.slice(fetched);
    expect(since.some((q) => selected(q.sql).includes('c03'))).toBe(true);
    harness.body.destroy();
  });

  it('let a fetch in flight land without columns rendered since, then read those', async () => {
    const { harness, mounted } = setup(span(40, 48));
    const init = harness.body.initialize();
    await harness.drain();
    const first = harness.queries[0]!;

    // A sideways scroll while the block is on its way: aborting it here, as
    // the view keeps moving, starved the view of every fetch.
    mounted.set(span(4, 12));
    await harness.drain();
    expect(first.signal?.aborted).toBe(false);
    expect(harness.queries.length).toBe(1);

    await land(harness, first);
    await init;
    const topUp = harness.queries.at(-1)!;
    expect(topUp).not.toBe(first);
    expect(rowidsRead(topUp.sql)).not.toBeNull();
    expect(selected(topUp.sql)).toContain('c04');
    await land(harness, topUp);
    expect(cell(harness, 'c04').textContent).toBe('c04-0');
    harness.body.destroy();
  });

  it('read the columns rows lack by id on a sorted table, not the sorted block again', async () => {
    const { harness, mounted } = setup(span(40, 48));
    harness.state.sortColumns.set([{ column: 'c00', direction: 'desc' }]);
    const init = harness.body.initialize();
    await harness.drain();
    const block = harness.queries.at(-1)!;
    expect(block.sql).toMatch(/OFFSET/);
    await land(harness, block);
    await init;
    const fetched = harness.queries.length;

    mounted.set(span(4, 12));
    await harness.drain();

    const topUp = harness.queries[fetched]!;
    expect(topUp.sql).not.toMatch(/OFFSET|ORDER BY/);
    // The ids of the rows the sorted block holds, in its order. (The test
    // bridge numbers a block's rows by position, whatever the sort.)
    expect(rowidsRead(topUp.sql)).toEqual(Array.from({ length: 128 }, (_, i) => i));
    await land(harness, topUp);
    expect(cell(harness, 'c04', 3).textContent).toBe('c04-3');
    harness.body.destroy();
  });

  it('keep pending cells empty, never NULL, through an annotation change', async () => {
    const annotations = new AnnotationStore();
    const mounted = createSignal<readonly string[]>(span(40, 48));
    const harness = setupTableBody({ body: { mountedColumns: mounted, annotations } });
    initializeColumnsFromSchema(harness.state, SCHEMA);
    const init = harness.body.initialize();
    await harness.drain();
    await land(harness);
    await init;

    mounted.set(span(4, 12));
    await harness.drain();
    expect(cell(harness, 'c04').classList.contains('dt-cell--pending')).toBe(true);

    annotations.add({ scope: 'row', rowId: 0, severity: 'info', message: 'x' });
    const pending = cell(harness, 'c04');
    expect(pending.textContent).toBe('');
    expect(pending.classList.contains('dt-cell--pending')).toBe(true);
    expect(pending.classList.contains('dt-cell--null')).toBe(false);
    harness.body.destroy();
  });

  it("prefetch the next block's missing columns once the view has what it needs", async () => {
    const { harness, mounted } = setup(span(40, 48));
    const init = harness.body.initialize();
    await harness.drain();
    // The visible block, then the next one as a prefetch, both with c32–c63.
    await land(harness);
    await init;
    const next = harness.queries.at(-1)!;
    expect(next.options?.priority).toBe('normal');
    await land(harness, next);
    const fetched = harness.queries.length;

    mounted.set(span(20, 28));
    await harness.drain();
    // The visible block's new columns first, by id…
    const visible = harness.queries[fetched]!;
    expect(visible.options?.priority).toBe('high');
    expect(rowidsRead(visible.sql)?.[0]).toBe(0);
    await land(harness, visible);
    // …then the next block's, as a prefetch.
    const prefetch = harness.queries.at(-1)!;
    expect(prefetch).not.toBe(visible);
    expect(prefetch.options?.priority).toBe('normal');
    expect(rowidsRead(prefetch.sql)?.[0]).toBe(128);
    expect(selected(prefetch.sql)).toEqual(span(0, 32));
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
