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
import { bodyCells, fetchBandSize, rowCache } from '../helpers/tableBodyDom';
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
/** `COL_QUANTUM` in `src/table/TableBody.ts`, which is module-private. */
const COL_QUANTUM_FOR_TEST = 16;

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

      // Move the window past the fetched band. The top-up is issued
      // immediately but its deferred is left parked, so this is the frame the
      // user actually sees: rows present, columns not yet in hand.
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
      await settle(harness);

      const after = cache.coverageOf(0)!;
      // Union, not replacement — the original band is still in hand.
      for (const name of before.names) expect(after.names.has(name)).toBe(true);
      const win = harness.body.getColumnWindow();
      for (let i = win.start; i < win.end; i++) expect(after.names.has(`col_${i}`)).toBe(true);
      expect(after.names.size).toBeGreaterThan(before.names.size);

      const rowEl = [...harness.container.querySelectorAll('.dt-row')].find(
        (el) => el.getAttribute('data-row-index') === '0',
      ) as HTMLElement;
      expect(rowEl.querySelectorAll('[data-pending]')).toHaveLength(0);
      for (const cell of bodyCells(rowEl)) {
        expect(cell.textContent).toBe(`${cell.getAttribute('data-column')}-0`);
      }
    });

    it('re-issues at most the visible blocks for one window move', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      harness = await mount();
      harness.queries.length = 0;

      harness.scrollToColumnPx(40 * COL_WIDTH);
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

  describe('`rowCacheRows` means rows', () => {
    /**
     * `rowCacheRows` × the width of one fetch — the budget `evictDistantBlocks`
     * compares `cellCount` against. Read through {@link fetchBandSize} rather
     * than re-derived, so this does not re-implement `buildFetchSet`'s
     * quantization to check `buildFetchSet`'s quantization.
     */
    function liveBudget(harness: TableBodyHarness, rowCacheRows: number): number {
      return rowCacheRows * Math.max(1, fetchBandSize(harness.body));
    }

    /**
     * A purely vertical scroll on a clipped table, where the docs promise the
     * option is "unchanged". It was not: the budget multiplied the *render
     * need* (14 columns at this configuration) while every row cost the
     * *padded fetch* (32), so the cache held `rowCacheRows × 14/32` rows —
     * 384 of a configured 1,024 — and re-queried 2.7× sooner than documented.
     * The column window never moves here, which is what makes it a defect in
     * the arithmetic rather than the sweep behaviour below.
     */
    it('keeps `rowCacheRows` rows on a scroll that never moves the window', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      const CACHE_ROWS = 1024;
      harness = await mount({
        totalRows: 20_000,
        body: { fetchBlockSize: 128, rowCacheRows: CACHE_ROWS, prefetch: false },
      });
      const before = harness.body.getColumnWindow();

      for (let row = 0; row <= 3_000; row += 60) {
        harness.scrollToRow(row);
        await settle(harness);
      }

      expect(harness.body.getColumnWindow()).toEqual(before);
      const cache = rowCache(harness.body) as RowCache;
      expect(cache.size).toBeGreaterThanOrEqual(CACHE_ROWS);
      expect(cache.cellCount).toBeLessThanOrEqual(liveBudget(harness, CACHE_ROWS));
    });

    /**
     * The case row eviction structurally cannot handle: the viewport never
     * moves vertically, so the one block it spans is exempt from eviction on
     * every pass, while a sideways sweep merges the whole column axis into it.
     * At 600 columns that block alone reaches 128 × 600 = 76,800 cells, more
     * than a budget can allow, and deleting *other* blocks cannot help — so
     * the old code deleted them all anyway, on every write, and stayed over.
     * Measured: a sweep took the cache from 640 warmed rows to 128 at 600
     * columns and to 128 at 1,000. `RowCache.prune` reclaims on the column
     * axis instead, and the warmed rows survive.
     */
    it('does not spend the vertical cache on a horizontal sweep', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      const WIDE = 600;
      harness = await mount({ schema: wideHarnessSchema(WIDE) });
      const cache = rowCache(harness.body) as RowCache;

      for (const row of [0, 130, 260, 390, 520, 0]) {
        harness.scrollToRow(row);
        await settle(harness);
      }
      const warmed = cache.size;
      expect(warmed).toBeGreaterThanOrEqual(5 * 128);

      for (let column = 0; column <= WIDE - 20; column += 16) {
        harness.scrollToColumnPx(column * COL_WIDTH);
        await settle(harness);
      }

      expect(cache.size).toBe(warmed);
      expect(cache.cellCount).toBeLessThanOrEqual(liveBudget(harness, 2048));
      // Pruning is invisible: the fetch band contains the render window by
      // construction, so nothing on screen went pending.
      expect(harness.container.querySelectorAll('[data-pending]')).toHaveLength(0);
    });

    it('bounds the coverage interner rather than growing for the session', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      harness = await mount();
      const interner = (rowCache(harness.body) as RowCache).coverageInterner;

      // A full sweep at one column per step — the pattern that used to mint a
      // coverage set per scroll position, because the render *need* was
      // interned from the unquantized window.
      for (let column = 0; column < COLUMNS; column++) {
        harness.scrollToColumnPx(column * COL_WIDTH);
        await settle(harness);
      }

      // The claim is about the *shape* of the growth, not a magic number:
      // sets are minted per quantized band and per union of two, so the count
      // tracks `columns / quantum` (19 here) and not the 300 distinct scroll
      // positions the sweep visited. Measured 42; before, the same sweep
      // interned one set per position, and one drag at 1,000 columns produced
      // 1,149 with no ceiling at all.
      const bands = Math.ceil(COLUMNS / COL_QUANTUM_FOR_TEST);
      console.log(
        `[projection] ${COLUMNS} scroll positions interned ` +
          `${interner.internedCount} coverage sets (${bands} quantized bands)`,
      );
      expect(interner.internedCount).toBeLessThanOrEqual(3 * bands);
    }, 60_000);
  });

  describe('interleaved diagonal scrolling with aborted fetches', () => {
    /**
     * Every rendered cell either carries a value that belongs to its own
     * `(row, column)` or is explicitly marked pending. Anything else — a
     * neighbour's value, a stale value, the literal text `null` — is the class
     * of bug clipping introduces and a green rendering suite cannot see.
     */
    function oracleViolations(harness: TableBodyHarness): string[] {
      const problems: string[] = [];
      for (const rowEl of harness.container.querySelectorAll<HTMLElement>('.dt-row')) {
        if (rowEl.hasAttribute('data-placeholder')) continue;
        const index = Number(rowEl.getAttribute('data-row-index'));
        for (const cell of bodyCells(rowEl)) {
          const column = cell.getAttribute('data-column');
          if (column === null) continue;
          const text = cell.textContent ?? '';
          if (cell.hasAttribute('data-pending')) {
            if (text !== '') problems.push(`row ${index} ${column}: pending but shows "${text}"`);
            if (cell.classList.contains('dt-cell--null')) {
              problems.push(`row ${index} ${column}: pending but still classed null`);
            }
            continue;
          }
          const want = `${column}-${index}`;
          if (text !== want) problems.push(`row ${index} ${column}: "${text}" != "${want}"`);
        }
      }
      return problems;
    }

    it('never paints a wrong, stale or null-looking value, and always converges', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // `rejectOnAbort: false` is the hostile case: an aborted fetch resolves
      // anyway and the post-await guards have to drop it.
      harness = await mount({ totalRows: 4_000, bridge: { rejectOnAbort: false } });

      // mulberry32(0x5EED) — a fixed script, so a failure reproduces.
      let seed = 0x5eed;
      const random = (): number => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };

      for (let step = 0; step < 40; step++) {
        if (random() < 0.5) {
          harness.scrollToRow(Math.floor(random() * 3_900));
        } else {
          harness.scrollToColumnPx(Math.floor(random() * (COLUMNS - 4)) * COL_WIDTH);
        }
        // Answer only some of what is outstanding, so later steps run against
        // a genuinely half-resolved cache with fetches still in flight.
        for (const query of harness.queries) {
          if (answered.has(query) || random() < 0.35) continue;
          answered.add(query);
          query.deferred.resolve(rowsFor(query.sql));
        }
        await harness.drain(3);
        expect(oracleViolations(harness)).toEqual([]);
      }

      await settle(harness);
      // Converged: nothing pending, nothing a placeholder, nothing wrong.
      expect(oracleViolations(harness)).toEqual([]);
      expect(harness.container.querySelectorAll('[data-pending]')).toHaveLength(0);
      expect(harness.container.querySelectorAll('[data-placeholder]')).toHaveLength(0);
      expect(harness.body.__verifyDomOrderForTests()).toBe(true);
      // Aborted fetches settle silently; a real failure would not.
      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('re-issues the columns an aborted horizontal fetch never delivered', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      harness = await mount();

      // Two horizontal moves in a row: the first flight is abandoned before
      // it lands, because the window has left its column range entirely.
      harness.scrollToColumnPx(60 * COL_WIDTH);
      await harness.drain();
      const abandoned = harness.queries[harness.queries.length - 1]!;
      harness.scrollToColumnPx(250 * COL_WIDTH);
      await harness.drain();
      expect(abandoned.signal?.aborted).toBe(true);

      await settle(harness);
      // The reconciler covered the destination anyway.
      const cache = rowCache(harness.body) as RowCache;
      const win = harness.body.getColumnWindow();
      for (let i = win.start; i < win.end; i++) {
        expect(cache.coverageOf(harness.body.getVisibleRange().start)!.names.has(`col_${i}`)).toBe(
          true,
        );
      }
      expect(harness.container.querySelectorAll('[data-pending]')).toHaveLength(0);
    });

    it('tops up the rotated-in columns after an order-only visibleColumns write', async () => {
      vi.stubGlobal('ResizeObserver', MockResizeObserver);
      harness = await mount();
      const cache = rowCache(harness.body) as RowCache;
      expect(cache.coverageOf(0)!.names.has('col_290')).toBe(false);

      // A reorder: same set, new order. Nothing cached is invalidated — but
      // col_290 has just rotated into the rendered window, and it was never
      // fetched.
      const columns = [...harness.state.visibleColumns.get()];
      const moved = columns.splice(290, 1)[0]!;
      columns.unshift(moved);
      harness.state.visibleColumns.set(columns);
      await settle(harness);

      expect(cache.coverageOf(0)!.names.has(moved)).toBe(true);
      expect(harness.container.querySelectorAll('[data-pending]')).toHaveLength(0);
    });
  });
});
