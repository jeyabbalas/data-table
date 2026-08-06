/**
 * Helpers for the large-dataset scrolling specs: mount a millions-of-rows
 * `DataTable` entirely in-page through public APIs, then observe it with
 * deterministic oracles.
 *
 * The dataset is generated in DuckDB (`range()`), exported to parquet via
 * `bridge.exportToBuffer`, and re-loaded with `table.loadData` — the exact
 * production load path, so the parquet loader injects `__rowid__` in file
 * order and `__rowid__ === position === id` holds by construction. That
 * yields a hard oracle: while the table is unsorted and unfiltered,
 * `data-row-id === data-row-index` for every rendered non-placeholder row at
 * every instant, and the `grp` cell text equals `'g' + (index % 97)`. Any
 * stale-range render violates it immediately — no screenshots, no timing.
 *
 * Real Chromium is load-bearing: jsdom performs no layout, so browser
 * max-element-height clamping, scroll-space compression, and the
 * latency-scaled fetch races these specs exist to catch are all invisible
 * there.
 */

import type { Page } from '@playwright/test';

/** Columns of the generated table, in display order. */
export const GEN_COLUMNS = ['id', 'grp', 'val'] as const;

/** The `grp` cell text for row `i` — every cell is a pure function of the index. */
export function expectedGrp(i: number): string {
  return 'g' + (i % 97);
}

/** Host element id, for host-scoped locators in the specs. */
export const BIG_TABLE_HOST_ID = 'big-table-host';

/** One probe-observed breach of the row oracle. */
export interface Violation {
  /** `performance.now()` at observation time. */
  t: number;
  /** The row's `data-row-index`. */
  index: number;
  /** The row's `data-row-id`. */
  rowid: number;
  /** The `grp` cell text at observation time. */
  text: string;
  /** Which half of the oracle failed. */
  kind: 'rowid' | 'grp';
}

/** A fully-visible resolved row, as read back by {@link readVisibleRows}. */
export interface VisibleRow {
  index: number;
  rowid: number;
  /** Cell texts in {@link GEN_COLUMNS} order. */
  cells: string[];
}

/** Handles and scratch state stashed on `window` by these helpers. */
type BigTableWindow = {
  __t: import('../../../src/index').DataTable;
  /** Mount progress marker so a hung stage names itself in traces. */
  __bigTableStage?: string;
  __dtRowsResolved?: { last: string; stable: number };
  __dtScrollViolations?: Violation[];
  __dtProbe?: { observer: MutationObserver; rafId: number; active: boolean };
};

/**
 * Mount a `DataTable` in a 600 px host and load it with `rows` generated
 * rows, entirely in-page via public API — no fixtures, no network.
 *
 * Stashes the instance on `window.__t` for later `page.evaluate` calls.
 */
export async function mountBigTable(
  page: Page,
  opts: { rows: number; rowHeight?: number },
): Promise<void> {
  await page.goto('./');
  await page.evaluate(
    async ({ rows, rowHeight, hostId }) => {
      const w = window as unknown as BigTableWindow;
      w.__bigTableStage = 'import';
      const mod = (await import(
        /* @vite-ignore */ '/data-table/src/index.ts'
      )) as typeof import('../../../src/index');

      const host = document.createElement('div');
      host.id = hostId;
      // A bounded host is what forces virtualization to engage.
      host.style.height = '600px';
      document.querySelector('#table-container')!.appendChild(host);

      w.__bigTableStage = 'boot';
      const table = await mod.createDataTable({
        container: host,
        // No IndexedDB: a restored session would quietly make this a
        // different test.
        persistence: false,
        // Header plots would add multi-second stats queries on millions of
        // rows and are irrelevant to scrolling.
        visualizations: false,
        ...(rowHeight === undefined ? {} : { rowHeight }),
      });
      w.__t = table;

      w.__bigTableStage = 'generate';
      await table.bridge.query(
        `CREATE OR REPLACE TABLE gen_src AS
         SELECT CAST(i AS INTEGER) AS id,
                'g' || (i % 97) AS grp,
                (i % 1000) / 10.0 AS val
         FROM range(0, ${rows}) t(i)`,
      );
      // Never export __rowid__ — the loader rejects sources that carry it.
      w.__bigTableStage = 'export';
      const buf = await table.bridge.exportToBuffer(
        'SELECT id, grp, val FROM gen_src ORDER BY id',
        'parquet',
      );
      w.__bigTableStage = 'drop';
      await table.bridge.query('DROP TABLE gen_src');
      // Uint8Array is not in loadData's source union — pass the ArrayBuffer,
      // which exportToBuffer guarantees is exactly the parquet file.
      w.__bigTableStage = 'load';
      await table.loadData(buf.buffer, { sourceFormat: 'parquet' });
      // `buf` goes out of scope here — the only buffer reference is dropped.
      w.__bigTableStage = 'done';
    },
    { rows: opts.rows, rowHeight: opts.rowHeight, hostId: BIG_TABLE_HOST_ID },
  );
  // loadData resolves only after the first viewport is fetched and painted,
  // so this gate is a cheap double-check; on a hang the failure names the
  // stage via window.__bigTableStage in the trace.
  await page.waitForFunction(
    (hostId) =>
      !!document.querySelector(`#${hostId} .dt-grid[role="grid"]`) &&
      document.querySelectorAll(`#${hostId} .dt-body .dt-row`).length > 0,
    BIG_TABLE_HOST_ID,
    { timeout: 90_000 },
  );
}

/**
 * Wait until every rendered row has resolved to real data and the view has
 * stopped moving: zero placeholders under the host AND a serialized map of
 * rendered rows — plus the physical scrollTop — unchanged across two
 * consecutive polls.
 *
 * scrollTop is part of the stability key deliberately: the scroller
 * repositions the viewport without notifying callbacks on offsetY-only
 * reconciliation snaps, so a content-only key could report "stable"
 * mid-reposition.
 */
export async function waitForRowsResolved(page: Page): Promise<void> {
  await page.waitForFunction(
    (hostId) => {
      const w = window as unknown as BigTableWindow;
      const host = document.querySelector(`#${hostId}`);
      const scrollEl = host?.querySelector('.dt-body-scroll');
      if (!host || !scrollEl) return false;
      const placeholders = host.querySelectorAll('[data-placeholder]').length;
      const rows = Array.from(host.querySelectorAll('.dt-body .dt-row[data-row-id]'));
      const key =
        scrollEl.scrollTop.toFixed(2) +
        '#' +
        placeholders +
        '#' +
        rows
          .map(
            (r) =>
              r.getAttribute('data-row-index') +
              ':' +
              r.getAttribute('data-row-id') +
              ':' +
              (r.querySelector('.dt-cell[data-column="grp"]')?.textContent ?? ''),
          )
          .join(',');
      const s = (w.__dtRowsResolved ??= { last: '', stable: 0 });
      s.stable = key === s.last ? s.stable + 1 : 0;
      s.last = key;
      return placeholders === 0 && rows.length > 0 && s.stable >= 2;
    },
    BIG_TABLE_HOST_ID,
    { polling: 120, timeout: 90_000 },
  );
  await page.evaluate(() => {
    // Reset so consecutive waits are independent.
    delete (window as unknown as BigTableWindow).__dtRowsResolved;
  });
}

/**
 * Install the mid-storm oracle: a `MutationObserver` on the virtual viewport
 * plus a rAF sampler, each validating every resolved row against
 * `data-row-id === data-row-index` and the `grp` formula, pushing breaches
 * to `window.__dtScrollViolations`.
 *
 * Safe from torn reads: `renderVisibleRows` is fully synchronous and row
 * fetches are dispatched only after the paint completes, so observer
 * callbacks (microtask checkpoints) and rAF ticks always see a finished
 * pass. Call after {@link mountBigTable}; tear down with
 * {@link readViolations} — and only while unsorted/unfiltered, where the
 * oracle is valid.
 */
export async function installRowInvariantProbe(page: Page): Promise<void> {
  await page.evaluate((hostId) => {
    const w = window as unknown as BigTableWindow;
    const viewport = document.querySelector(`#${hostId} .dt-virtual-viewport`);
    if (!viewport) throw new Error('probe: no .dt-virtual-viewport under host');
    const violations: Violation[] = (w.__dtScrollViolations = []);

    const validate = () => {
      // Cap the log — a genuinely broken build would otherwise flood it.
      if (violations.length >= 50) return;
      const rows = document.querySelectorAll(`#${hostId} .dt-body .dt-row[data-row-id]`);
      for (const r of rows) {
        const index = Number(r.getAttribute('data-row-index'));
        const rowid = Number(r.getAttribute('data-row-id'));
        // expectedGrp inlined: evaluate callbacks cannot see module scope.
        const text = r.querySelector('.dt-cell[data-column="grp"]')?.textContent ?? '';
        if (rowid !== index) {
          violations.push({ t: performance.now(), index, rowid, text, kind: 'rowid' });
        } else if (text !== 'g' + (index % 97)) {
          violations.push({ t: performance.now(), index, rowid, text, kind: 'grp' });
        }
      }
    };

    const observer = new MutationObserver(validate);
    observer.observe(viewport, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-row-index', 'data-row-id'],
    });
    const probe = { observer, rafId: 0, active: true };
    const loop = () => {
      if (!probe.active) return;
      validate();
      probe.rafId = requestAnimationFrame(loop);
    };
    probe.rafId = requestAnimationFrame(loop);
    w.__dtProbe = probe;
  }, BIG_TABLE_HOST_ID);
}

/**
 * Tear down the invariant probe and return everything it caught. Call
 * exactly once per {@link installRowInvariantProbe} — and before any sort,
 * which correctly invalidates the rowid oracle.
 */
export async function readViolations(page: Page): Promise<Violation[]> {
  return page.evaluate(() => {
    const w = window as unknown as BigTableWindow;
    if (w.__dtProbe) {
      // Flag first so an already-queued rAF callback cannot re-schedule.
      w.__dtProbe.active = false;
      w.__dtProbe.observer.disconnect();
      cancelAnimationFrame(w.__dtProbe.rafId);
    }
    const v = w.__dtScrollViolations ?? [];
    delete w.__dtProbe;
    delete w.__dtScrollViolations;
    return v;
  });
}

/**
 * Read the rows currently fully inside the scroll viewport, sorted by
 * index.
 *
 * Rect-based on purpose: the renderer keeps `bufferRows` extra rows above
 * and below the visual window, so DOM order says nothing about visibility —
 * the first *fully visible* row is a geometric fact. The ±0.5 px slop
 * absorbs fractional viewport offsets.
 */
export async function readVisibleRows(page: Page): Promise<VisibleRow[]> {
  return page.evaluate((hostId) => {
    const scrollEl = document.querySelector(`#${hostId} .dt-body-scroll`)!;
    const rect = scrollEl.getBoundingClientRect();
    const top = rect.top;
    // clientHeight-based bottom: immune to a horizontal scrollbar.
    const bottom = rect.top + scrollEl.clientHeight;
    const out: VisibleRow[] = [];
    for (const r of document.querySelectorAll(`#${hostId} .dt-body .dt-row[data-row-id]`)) {
      const rr = r.getBoundingClientRect();
      if (rr.top >= top - 0.5 && rr.bottom <= bottom + 0.5) {
        out.push({
          index: Number(r.getAttribute('data-row-index')),
          rowid: Number(r.getAttribute('data-row-id')),
          // GEN_COLUMNS inlined: evaluate callbacks cannot see module scope.
          cells: ['id', 'grp', 'val'].map(
            (c) => r.querySelector(`.dt-cell[data-column="${c}"]`)?.textContent ?? '',
          ),
        });
      }
    }
    return out.sort((a, b) => a.index - b.index);
  }, BIG_TABLE_HOST_ID);
}
