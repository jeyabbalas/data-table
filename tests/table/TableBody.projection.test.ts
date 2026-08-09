/**
 * @vitest-environment jsdom
 *
 * Column-clipped row fetches — what a block fetch projects, and what the cache
 * then knows it holds.
 *
 * The configuration matters and is the reason this is a new file rather than
 * more cases in `TableBody.columnWindow.test.ts`: at that suite's 60 columns
 * the padded window covers the whole axis and **nothing is clipped**, so every
 * assertion here would pass vacuously. 300 columns in a 600 px viewport puts
 * the window at 14 columns and the fetch at 32 of 300, which is the shape a
 * browser sees at 1,000.
 *
 * The second half of the file is the narrow-table control: at two columns the
 * projection is both columns and the eviction budget is the old row cap, term
 * for term. Ten fetch-pipeline suites assert that behaviourally by passing
 * unedited; these assert it directly, so a regression names itself.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ROWID_COLUMN } from '@/core/types';
import type { RowCache } from '@/table/RowCache';

import { DT_BUDGET } from '../budgets';
import { projectedColumns, rowsFor } from '../helpers/rowFetchBridge';
import { bodyCells, rowCache } from '../helpers/tableBodyDom';
import {
  MockResizeObserver,
  setupTableBody,
  wideHarnessSchema,
  type TableBodyHarness,
  type TableBodyHarnessOptions,
} from '../helpers/tableBodyHarness';

const COLUMNS = 300;
const COL_WIDTH = 150;
const VIEWPORT = 600;

/**
 * Resolve every captured query with exactly the rows its SQL asks for.
 *
 * Tracks what it has answered in a `WeakSet` rather than splicing the capture
 * log, because half the assertions here are about the SQL that was *issued*
 * and a draining settle would throw that away.
 */
const answered = new WeakSet<object>();
async function settle(harness: TableBodyHarness): Promise<void> {
  for (let round = 0; round < 12; round++) {
    const pending = harness.queries.filter((query) => !answered.has(query));
    if (pending.length === 0) break;
    for (const query of pending) {
      answered.add(query);
      if (query.signal?.aborted) continue;
      query.deferred.resolve(rowsFor(query.sql));
    }
    await harness.drain(6);
  }
}

/** A mounted, painted body over `COLUMNS` columns in a `VIEWPORT`-wide box. */
async function mount(options: TableBodyHarnessOptions = {}): Promise<TableBodyHarness> {
  const harness = setupTableBody({
    totalRows: 2_000,
    clientWidth: VIEWPORT,
    schema: wideHarnessSchema(COLUMNS),
    ...options,
    body: { prefetch: false, ...options.body },
  });
  const init = harness.body.initialize();
  await settle(harness);
  await init;
  return harness;
}

/** The projection of the most recent captured query, `__rowid__` first. */
function lastProjection(harness: TableBodyHarness): string[] {
  const sql = harness.queries[harness.queries.length - 1]!.sql;
  return projectedColumns(sql)!;
}

/** `col_N` → N, for asserting a projection is a contiguous quantized run. */
function indexOf(name: string): number {
  return Number(name.slice(4));
}

describe('TableBody — clipped row-fetch projections', () => {
  let harness: TableBodyHarness | null = null;

  afterEach(() => {
    harness?.body.destroy();
    harness = null;
    vi.unstubAllGlobals();
  });

  describe('what one block fetch projects', () => {
    it('clips to the padded, quantized window instead of every visible column', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      harness = await mount();

      const projection = projectedColumns(harness.queries[0]?.sql ?? '')!;
      // The window at rest is [0, 14): 4 columns fit 600 px and
      // MIN_OVERSCAN_COLUMNS floors ten more. Padded by one span and
      // quantized outward to 16 that is [0, 32) — 32 columns + __rowid__.
      expect(projection[0]).toBe(ROWID_COLUMN);
      expect(projection.slice(1)).toEqual(Array.from({ length: 32 }, (_, i) => `col_${i}`));
      expect(projection).toHaveLength(33);

      // The three properties that must hold at every offset and every width.
      expect(projection.length).toBeLessThanOrEqual(DT_BUDGET.COLVIRT.PROJECTED_COLS_MAX);
      expect(projection.length).toBeLessThan(COLUMNS);
      const win = harness.body.getColumnWindow();
      for (let i = win.start; i < win.end; i++) {
        expect(projection).toContain(`col_${i}`);
      }
    });

    it('keeps the payload inside the block-values budget', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      const local = setupTableBody({
        totalRows: 2_000,
        clientWidth: VIEWPORT,
        schema: wideHarnessSchema(COLUMNS),
        body: { prefetch: false },
      });
      harness = local;
      const init = local.body.initialize();

      const first = local.queries[0]!;
      const payload = rowsFor(first.sql);
      const values = payload.length * Object.keys(payload[0]!).length;
      expect(values).toBe(128 * 33);
      expect(values).toBeLessThanOrEqual(DT_BUDGET.COLVIRT.BLOCK_VALUES_MAX);
      // The unclipped shape, for scale: 128 × 301.
      expect(values).toBeLessThan(128 * (COLUMNS + 1));

      await settle(local);
      await init;
    });

    it('moves the projection with the window, still clipped and still quantized', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      harness = await mount();

      harness.scrollToColumnPx(40 * COL_WIDTH);
      // The window moved but nothing re-fetches on its own here; a vertical
      // scroll is what runs the reconciler in this milestone.
      harness.scrollToRow(400);
      await settle(harness);

      const projection = lastProjection(harness);
      expect(projection[0]).toBe(ROWID_COLUMN);
      const indices = projection.slice(1).map(indexOf);
      const first = indices[0]!;
      const last = indices[indices.length - 1]!;
      expect(indices).toEqual([...indices].sort((a, b) => a - b));
      // Contiguous run, both ends on a quantum boundary (or the axis edge).
      expect(last - first).toBe(indices.length - 1);
      expect(first % 16).toBe(0);
      expect((last + 1) % 16 === 0 || last === COLUMNS - 1).toBe(true);

      expect(projection.length).toBeLessThanOrEqual(DT_BUDGET.COLVIRT.PROJECTED_COLS_MAX);
      expect(projection.length).toBeLessThan(COLUMNS);
      const win = harness.body.getColumnWindow();
      for (let i = win.start; i < win.end; i++) expect(projection).toContain(`col_${i}`);
    });

    it('stays inside the budget at every offset across a full sweep', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      harness = await mount();

      let widest = 0;
      let widestAt = 0;
      for (let column = 0; column <= COLUMNS - 4; column += 8) {
        harness.scrollToColumnPx(column * COL_WIDTH);
        // A vertical nudge is what runs the reconciler in this milestone.
        harness.scrollToRow(column % 7);
        await settle(harness);
        const projection = lastProjection(harness);
        if (projection.length > widest) {
          widest = projection.length;
          widestAt = column;
        }
        expect(projection.length).toBeLessThanOrEqual(DT_BUDGET.COLVIRT.PROJECTED_COLS_MAX);
        expect(projection.length).toBeLessThan(COLUMNS);
      }
      // Logged rather than hard-coded: this is the number
      // `COLVIRT.PROJECTED_COLS_MAX` is derived from, so it should be visible
      // in a run rather than only in a docblock.
      console.log(
        `[projection] widest SELECT list over the sweep: ${widest} columns ` +
          `(at col_${widestAt}, of ${COLUMNS} visible)`,
      );
      expect(widest).toBeGreaterThan(33);
    });

    it('always carries the pinned prefix, however far the window has travelled', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      harness = await mount();

      harness.state.pinnedColumns.set(['col_0', 'col_1']);
      await settle(harness);
      harness.scrollToColumnPx(200 * COL_WIDTH);
      harness.scrollToRow(600);
      await settle(harness);

      const projection = lastProjection(harness);
      expect(projection).toContain('col_0');
      expect(projection).toContain('col_1');
      // …and it is still nowhere near the whole axis.
      expect(projection.length).toBeLessThanOrEqual(DT_BUDGET.COLVIRT.PROJECTED_COLS_MAX);
      expect(projection.length).toBeLessThan(COLUMNS);
      expect(projection).not.toContain('col_100');
    });
  });

  describe('partial coverage', () => {
    it('renders an uncovered cell as pending rather than as the text "null"', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      harness = await mount();

      // Move the window past the fetched band without letting anything
      // re-fetch: the rows are all present, and short of what is on screen.
      harness.scrollToColumnPx(40 * COL_WIDTH);

      const rowEl = [...harness.container.querySelectorAll('.dt-row')].find(
        (el) => el.getAttribute('data-row-index') === '0',
      ) as HTMLElement;
      expect(rowEl.hasAttribute('data-placeholder')).toBe(false);

      const cells = bodyCells(rowEl);
      const covered = cells.filter((cell) => indexOf(cell.getAttribute('data-column')!) < 32);
      const uncovered = cells.filter((cell) => indexOf(cell.getAttribute('data-column')!) >= 32);
      expect(covered.length).toBeGreaterThan(0);
      expect(uncovered.length).toBeGreaterThan(0);

      for (const cell of uncovered) {
        expect(cell.getAttribute('data-pending')).toBe('1');
        expect(cell.getAttribute('aria-busy')).toBe('true');
        expect(cell.classList.contains('dt-cell--pending')).toBe(true);
        // The hazard this exists to prevent: `CellRenderer` treats
        // `undefined` exactly like `null`.
        expect(cell.textContent).toBe('');
        expect(cell.classList.contains('dt-cell--null')).toBe(false);
      }
      for (const cell of covered) {
        expect(cell.hasAttribute('data-pending')).toBe(false);
        expect(cell.textContent).not.toBe('');
      }
    });

    it('merges a second fetch into the same rows and clears the pending markers', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      harness = await mount();
      const cache = rowCache(harness.body) as RowCache;
      const before = cache.coverageOf(0)!;

      harness.scrollToColumnPx(40 * COL_WIDTH);
      // A vertical nudge inside the same block still reconciles: every row is
      // present and none of them covers the new window.
      harness.scrollToRow(1);
      await settle(harness);

      const after = cache.coverageOf(0)!;
      // Union, not replacement — the original band is still in hand.
      for (const name of before.names) expect(after.names.has(name)).toBe(true);
      const win = harness.body.getColumnWindow();
      for (let i = win.start; i < win.end; i++) expect(after.names.has(`col_${i}`)).toBe(true);
      expect(after.names.size).toBeGreaterThan(before.names.size);

      const rowEl = [...harness.container.querySelectorAll('.dt-row')].find(
        (el) => el.getAttribute('data-row-index') === '1',
      ) as HTMLElement;
      expect(rowEl.querySelectorAll('[data-pending]')).toHaveLength(0);
      for (const cell of bodyCells(rowEl)) {
        expect(cell.textContent).toBe(`${cell.getAttribute('data-column')}-1`);
      }
    });

    it('re-issues at most the visible blocks for one window move', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      harness = await mount();
      harness.queries.length = 0;

      harness.scrollToColumnPx(40 * COL_WIDTH);
      harness.scrollToRow(1);
      await settle(harness);

      const highPriority = harness.queries.filter((q) => q.options?.priority === 'high');
      expect(harness.queries.length).toBeGreaterThan(0);
      expect(highPriority.length).toBeLessThanOrEqual(
        DT_BUDGET.COLVIRT.QUERIES_PER_WINDOW_MOVE_MAX,
      );
    });

    it('drops a late partial result from a superseded epoch without claiming coverage', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      harness = await mount({ bridge: { rejectOnAbort: false } });
      const cache = rowCache(harness.body) as RowCache;

      harness.scrollToColumnPx(40 * COL_WIDTH);
      harness.scrollToRow(1);
      await harness.drain();
      const parked = harness.queries[harness.queries.length - 1]!;
      expect(parked.signal?.aborted).toBe(false);

      // Invalidate mid-flight, then let the parked fetch resolve anyway.
      harness.state.sortColumns.set([{ column: 'col_0', direction: 'asc' }]);
      await harness.drain();
      parked.deferred.resolve(rowsFor(parked.sql));
      await harness.drain();

      // Neither its rows nor its coverage may survive the epoch bump. The
      // sort's own re-fetch is still in flight, so the cache holds only what
      // that fetch has landed — nothing, here.
      const stale = projectedColumns(parked.sql)!.filter((name) => name !== ROWID_COLUMN);
      const held = cache.coverageOf(1);
      if (held) {
        expect(stale.every((name) => held.names.has(name))).toBe(false);
      } else {
        expect(cache.has(1)).toBe(false);
      }
    });
  });

  describe('narrow tables are a behavioural no-op', () => {
    it('projects every visible column when the padded window covers the axis', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      const local = setupTableBody({ totalRows: 500, body: { prefetch: false } });
      harness = local;
      const init = local.body.initialize();

      const projection = projectedColumns(local.queries[0]!.sql)!;
      expect(projection).toEqual([ROWID_COLUMN, 'id', 'tag']);

      await settle(local);
      await init;

      // Coverage ≡ the visible column set, so the cell count is exactly
      // `rows × N` — which is what makes the cell budget degenerate to the
      // old row cap with no special case in `evictDistantBlocks`.
      const cache = rowCache(local.body) as RowCache;
      expect(cache.cellCount).toBe(cache.size * 2);
    });

    it('evicts at exactly `rowCacheRows` rows, as the row-count rule did', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      const BLOCK = 16;
      const CACHE_ROWS = 4 * BLOCK;
      const local = setupTableBody({
        totalRows: 10_000,
        body: { fetchBlockSize: BLOCK, rowCacheRows: CACHE_ROWS, prefetch: false },
      });
      harness = local;
      const init = local.body.initialize();
      await settle(local);
      await init;

      for (let row = 20; row <= 400; row += 20) {
        local.scrollToRow(row);
        await settle(local);
      }

      const cache = rowCache(local.body) as RowCache;
      // The pre-phase assertion, unchanged: at most the cap plus the
      // just-written block's slack.
      expect(cache.size).toBeLessThanOrEqual(CACHE_ROWS + BLOCK);
      expect(cache.cellCount).toBe(cache.size * 2);
    });
  });
});
