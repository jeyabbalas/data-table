/**
 * Mount and observe a **wide** tier (`tests/fixtures/tiers.ts`) in a real
 * browser, with a column-axis oracle to match `bigTable.ts`'s row-axis one.
 *
 * `bigTable.ts` proves the *row* invariant on a 3-column table; nothing
 * proved anything about the column axis, and no test crossed both. These
 * helpers generalize its shape — generate in DuckDB → `exportToBuffer` →
 * real `table.loadData` — to any tier, and add the invariant Phases 3–5
 * are about to put at risk:
 *
 *  - the rendered header `data-column` sequence equals
 *    `state.visibleColumns.get()`;
 *  - every rendered `aria-colindex` matches `columnOrder.indexOf(col) + 1`
 *    and ascends strictly in DOM order (an ARIA MUST, and the thing a
 *    windowing bug breaks first);
 *  - sampled resolved cells render exactly `cellOracle(row, col, seed)`.
 *
 * Before column virtualization the expected header sequence is simply
 * "all visible columns", so the probe is green today and load-bearing from
 * Phase 3 on — which is the point: it has to be installed *before* the
 * change it guards.
 *
 * Deliberately does not touch `bigTable.ts`: `scroll-extent.spec.ts` and
 * `scroll-flicker.spec.ts` depend on its exact settle semantics.
 */
import type { Page } from '@playwright/test';

import {
  ORACLE_FN_SOURCE,
  TIERS,
  columnName,
  resolveTier,
  tierCSV,
  tierTableSQL,
  type TierName,
  type TierSpec,
} from '../../fixtures/tiers';

/** Host element id, for host-scoped locators in the specs. */
export const TIER_HOST_ID = 'tier-table-host';

/** Scratch table the tier is generated into before the parquet round trip. */
const SCRATCH_TABLE = 'dt_tier_src';

/**
 * One probe-observed breach.
 *
 * `rowid` is the row oracle (`data-row-id === data-row-index`), carried by
 * the same probe rather than a second observer: `bigTable.ts`'s row probe
 * is bound to its own host and its own `grp` column, and the column
 * oracle's cell check is only meaningful once the row identity holds, so
 * one pass validating both is both cheaper and better ordered.
 */
export interface ColViolation {
  /** `performance.now()` at observation time. */
  t: number;
  kind: 'sequence' | 'colindex' | 'cell' | 'rowid';
  /** Human-readable detail — what was expected vs. what was rendered. */
  detail: string;
}

/** Which mounted table a helper should look at. */
export interface HostOptions {
  /**
   * CSS selector for the element the table was mounted under. Defaults to
   * {@link mountTierTable}'s own host; pass `'#table-container'` to point
   * the probes at the demo's `?gen=` harness instead.
   */
  host?: string;
}

/** A rendered column, as read back by {@link readVisibleGrid}. */
export interface VisibleColumn {
  name: string;
  colindex: number;
  left: number;
  right: number;
  /** Fully inside the horizontal viewport (±0.5 px slop). */
  fullyVisible: boolean;
  pinned: boolean;
}

export interface MountTierOptions {
  tier: TierName | 'custom';
  rows?: number;
  cols?: number;
  seed?: number;
  /** Per-column charts. Off by default — 1,000 of them is its own experiment. */
  viz?: boolean;
  rowHeight?: number;
}

/** Timings the mount collected, so a spec can assert against the readout. */
export interface MountTierResult {
  spec: TierSpec;
  genMs: number;
  exportMs: number;
  loadMs: number;
}

type TierWindow = {
  __t: import('../../../src/index').DataTable;
  /** Mount progress marker so a hung stage names itself in traces. */
  __wideTableStage?: string;
  __dtTierSettle?: { last: string; stable: number };
  __dtColViolations?: ColViolation[];
  __dtColProbe?: { observer: MutationObserver; rafId: number; active: boolean };
  __dtOracle?: (i: number, c: number, seed: number) => string | null;
};

/**
 * Mount a `DataTable` in a 600 px host and load it with the named tier,
 * entirely in-page through public API.
 *
 * The tier SQL is built in Node and passed in as a string: `page.evaluate`
 * callbacks cannot see module scope, so the alternative would be a second
 * copy of the generator living in-page. Same reason `ORACLE_FN_SOURCE`
 * exists.
 *
 * Stashes the instance on `window.__t` and the oracle on
 * `window.__dtOracle` for later `page.evaluate` calls.
 */
export async function mountTierTable(page: Page, opts: MountTierOptions): Promise<MountTierResult> {
  const spec = resolveTier(opts.tier, {
    rows: opts.rows,
    cols: opts.cols,
    seed: opts.seed,
  });

  await page.goto('./');

  // `wide-csv` is the text-format path: there is no SQL stage, and the CSV
  // crosses the CDP boundary as one ~40 MB string. Every other tier goes
  // through DuckDB, where only the (much smaller) SQL text crosses.
  const csv = opts.tier === 'wide-csv' ? tierCSV(spec) : null;

  const timings = await page.evaluate(
    async ({ createSql, exportSql, csvText, viz, rowHeight, hostId, oracleSource, scratch }) => {
      const w = window as unknown as TierWindow;
      w.__wideTableStage = 'import';
      const mod = (await import(
        /* @vite-ignore */ '/data-table/src/index.ts'
      )) as typeof import('../../../src/index');

      const host = document.createElement('div');
      host.id = hostId;
      // A bounded host is what forces virtualization to engage.
      host.style.height = '600px';
      document.querySelector('#table-container')!.appendChild(host);

      w.__wideTableStage = 'boot';
      const table = await mod.createDataTable({
        container: host,
        // No IndexedDB: a restored session would quietly make this a
        // different test, and these tiers are far too large to snapshot.
        persistence: false,
        visualizations: viz,
        ...(rowHeight === undefined ? {} : { rowHeight }),
      });
      w.__t = table;
      w.__dtOracle = new Function(oracleSource)() as TierWindow['__dtOracle'];

      let genMs: number;
      // `wide-csv` arrives already built (there is no SQL stage), so its
      // generate and export phases are both zero-cost by construction.
      let exportMs = 0;
      let source: string | ArrayBuffer;

      const t0 = performance.now();
      w.__wideTableStage = 'generate';
      if (csvText !== null) {
        genMs = performance.now() - t0;
        source = csvText;
      } else {
        await table.bridge.query(createSql);
        genMs = performance.now() - t0;

        w.__wideTableStage = 'export';
        const t1 = performance.now();
        // Never export __rowid__ — the loader rejects sources that carry it.
        const buf = await table.bridge.exportToBuffer(exportSql, 'parquet');
        exportMs = performance.now() - t1;

        // Drop before loading so two copies of the tier never coexist in
        // the 4 GB WASM heap.
        w.__wideTableStage = 'drop';
        await table.bridge.query(`DROP TABLE "${scratch}"`);
        source = buf.buffer as ArrayBuffer;
      }

      w.__wideTableStage = 'load';
      const t2 = performance.now();
      await table.loadData(source, { sourceFormat: csvText !== null ? 'csv' : 'parquet' });
      const loadMs = performance.now() - t2;
      w.__wideTableStage = 'done';
      return { genMs, exportMs, loadMs };
    },
    {
      createSql: csv === null ? tierTableSQL(spec, SCRATCH_TABLE) : '',
      exportSql: `SELECT * FROM "${SCRATCH_TABLE}" ORDER BY "${columnName(0)}"`,
      csvText: csv,
      viz: opts.viz ?? false,
      rowHeight: opts.rowHeight,
      hostId: TIER_HOST_ID,
      oracleSource: ORACLE_FN_SOURCE,
      scratch: SCRATCH_TABLE,
    },
  );

  // loadData resolves only after the first viewport is fetched and painted,
  // so this gate is a cheap double-check; on a hang the failure names the
  // stage via `window.__wideTableStage` in the trace.
  await page.waitForFunction(
    (hostId) =>
      !!document.querySelector(`#${hostId} .dt-grid[role="grid"]`) &&
      document.querySelectorAll(`#${hostId} .dt-body .dt-row`).length > 0,
    TIER_HOST_ID,
    { timeout: 600_000 },
  );

  return { spec, ...timings };
}

/**
 * Wait until every rendered row has resolved and the view has stopped
 * moving.
 *
 * A tier-local copy of `bigTable.ts`'s `waitForRowsResolved`, keyed on
 * `col_0` instead of `grp`. Copied rather than parameterized on purpose —
 * `scroll-extent.spec.ts` and `scroll-flicker.spec.ts` depend on that
 * helper's exact semantics and must not move when this one does.
 *
 * `scrollLeft` joins `scrollTop` in the stability key: horizontal sweeps
 * reposition the viewport without a row-content change, and a
 * content-only key would report "stable" mid-sweep.
 */
export async function waitForTierSettled(
  page: Page,
  opts: HostOptions & { timeout?: number } = {},
): Promise<void> {
  await page.waitForFunction(
    (hostSelector) => {
      const w = window as unknown as TierWindow;
      const host = document.querySelector(hostSelector);
      const scrollEl = host?.querySelector('.dt-body-scroll');
      if (!host || !scrollEl) return false;
      const placeholders = host.querySelectorAll('[data-placeholder]').length;
      const rows = Array.from(host.querySelectorAll('.dt-body .dt-row[data-row-id]'));
      const key =
        scrollEl.scrollTop.toFixed(2) +
        '/' +
        scrollEl.scrollLeft.toFixed(2) +
        '#' +
        placeholders +
        '#' +
        host.querySelectorAll('.dt-col-header[data-column]').length +
        '#' +
        rows
          .map(
            (r) =>
              r.getAttribute('data-row-index') +
              ':' +
              r.getAttribute('data-row-id') +
              ':' +
              (r.querySelector('.dt-cell[data-column="col_0"]')?.textContent ?? ''),
          )
          .join(',');
      const s = (w.__dtTierSettle ??= { last: '', stable: 0 });
      s.stable = key === s.last ? s.stable + 1 : 0;
      s.last = key;
      return placeholders === 0 && rows.length > 0 && s.stable >= 2;
    },
    opts.host ?? `#${TIER_HOST_ID}`,
    { polling: 150, timeout: opts.timeout ?? 300_000 },
  );
  await page.evaluate(() => {
    // Reset so consecutive waits are independent.
    delete (window as unknown as TierWindow).__dtTierSettle;
  });
}

/**
 * Install the column-axis oracle: a `MutationObserver` on the grid plus a
 * rAF sampler, both validating the rendered column window against
 * `state.visibleColumns` / `state.columnOrder` and sampling one resolved
 * cell against `dtCellOracle`.
 *
 * Same shape and same safety argument as
 * `bigTable.ts`'s `installRowInvariantProbe`: renders are synchronous, so
 * observer callbacks and rAF ticks always see a finished pass. Install
 * once, tear down with exactly one {@link readColViolations}.
 *
 * `seed` is passed in because the injected oracle is a pure function of
 * `(i, c, seed)` and nothing in the page knows which tier is mounted.
 */
export async function installColumnInvariantProbe(
  page: Page,
  seed: number,
  opts: HostOptions = {},
): Promise<void> {
  await page.evaluate(
    ({ hostSelector, seedValue }) => {
      const w = window as unknown as TierWindow;
      const host = document.querySelector(hostSelector);
      const grid = host?.querySelector('.dt-grid');
      if (!grid) throw new Error('column probe: no .dt-grid under host');
      const oracle = w.__dtOracle;
      if (!oracle) throw new Error('column probe: no oracle — mountTierTable first');
      const violations: ColViolation[] = (w.__dtColViolations = []);
      const state = w.__t.state;

      const push = (kind: ColViolation['kind'], detail: string): void => {
        violations.push({ t: performance.now(), kind, detail });
      };

      const validate = (): void => {
        // Cap the log — a genuinely broken build would otherwise flood it.
        if (violations.length >= 50) return;

        const visible = state.visibleColumns.get();
        const order = state.columnOrder.get();
        const headers = Array.from(
          host!.querySelectorAll('.dt-col-header[data-column]'),
        ) as HTMLElement[];
        if (headers.length === 0) return; // mid-rebuild; the next tick sees it

        // (a) Rendered sequence == the expected slice of visibleColumns.
        // Pre-virtualization that slice is the whole list; from Phase 3 on
        // it is a contiguous window, and `indexOf` locating the first
        // rendered column is what makes this assertion survive the change.
        const rendered = headers.map((h) => h.getAttribute('data-column')!);
        const from = visible.indexOf(rendered[0]!);
        const expected = from < 0 ? [] : visible.slice(from, from + rendered.length);
        if (from < 0 || rendered.join(',') !== expected.join(',')) {
          push(
            'sequence',
            `headers [${rendered.slice(0, 4).join(',')}…×${rendered.length}] ` +
              `is not a contiguous run of visibleColumns (×${visible.length})`,
          );
          return;
        }

        // (b) aria-colindex is the presentation position and must ascend
        // strictly in DOM order. Values are `columnOrder.indexOf + 1`, so
        // they are consecutive only while nothing is hidden — ascending is
        // the invariant that always holds (TableContainer.ts:1361-1372).
        let previous = 0;
        for (const header of headers) {
          const name = header.getAttribute('data-column')!;
          const index = Number(header.getAttribute('aria-colindex'));
          const wanted = order.indexOf(name) + 1;
          if (!Number.isFinite(index) || index <= previous) {
            push('colindex', `${name}: aria-colindex ${index} does not ascend past ${previous}`);
            break;
          }
          if (wanted > 0 && index !== wanted) {
            push('colindex', `${name}: aria-colindex ${index}, columnOrder says ${wanted}`);
            break;
          }
          previous = index;
        }

        // (c) Header and body must agree, and a sampled resolved cell must
        // render exactly what the oracle says. One cell per tick keeps the
        // sampler cheap enough to run at frame rate on a 1,000-column grid.
        const rows = host!.querySelectorAll(
          '.dt-body .dt-row[data-row-id]:not([data-placeholder])',
        );
        if (rows.length === 0) return;
        const row = rows[Math.floor(Math.random() * rows.length)] as HTMLElement;
        const rowIndex = Number(row.getAttribute('data-row-index'));
        const rowId = Number(row.getAttribute('data-row-id'));
        const cells = row.querySelectorAll('.dt-cell[data-column]');
        if (cells.length === 0) return;
        const cell = cells[Math.floor(Math.random() * cells.length)] as HTMLElement;
        const colName = cell.getAttribute('data-column')!;
        const header = headers.find((h) => h.getAttribute('data-column') === colName);
        if (header) {
          const headerIndex = header.getAttribute('aria-colindex');
          const cellIndex = cell.getAttribute('aria-colindex');
          if (headerIndex !== cellIndex) {
            push(
              'colindex',
              `${colName}: header aria-colindex ${headerIndex} vs cell ${cellIndex}`,
            );
            return;
          }
        }
        // The row oracle: while unsorted and unfiltered every rendered row
        // carries `__rowid__ === position`. The cell oracle is keyed by
        // source row index, so it is only meaningful once this holds.
        if (rowId !== rowIndex) {
          push('rowid', `row ${rowIndex}: data-row-id ${rowId}`);
          return;
        }
        const c = Number(colName.slice(4));
        if (!Number.isFinite(c)) return;
        const want = oracle(rowIndex, c, seedValue);
        if (want !== null && cell.textContent !== want) {
          push('cell', `row ${rowIndex} ${colName}: "${cell.textContent}" != "${want}"`);
        }
      };

      const observer = new MutationObserver(validate);
      observer.observe(grid, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-column', 'aria-colindex'],
      });
      const probe = { observer, rafId: 0, active: true };
      const loop = (): void => {
        if (!probe.active) return;
        validate();
        probe.rafId = requestAnimationFrame(loop);
      };
      probe.rafId = requestAnimationFrame(loop);
      w.__dtColProbe = probe;
    },
    { hostSelector: opts.host ?? `#${TIER_HOST_ID}`, seedValue: seed },
  );
}

/**
 * Tear down the column probe and return everything it caught. Call exactly
 * once per {@link installColumnInvariantProbe} — and before any sort,
 * which correctly invalidates the cell half of the oracle.
 */
export async function readColViolations(page: Page): Promise<ColViolation[]> {
  return page.evaluate(() => {
    const w = window as unknown as TierWindow;
    if (w.__dtColProbe) {
      // Flag first so an already-queued rAF callback cannot re-schedule.
      w.__dtColProbe.active = false;
      w.__dtColProbe.observer.disconnect();
      cancelAnimationFrame(w.__dtColProbe.rafId);
    }
    const v = w.__dtColViolations ?? [];
    delete w.__dtColProbe;
    delete w.__dtColViolations;
    return v;
  });
}

/**
 * Read the rendered columns and their geometry in one round trip.
 *
 * Rect-based like `bigTable.ts`'s `readVisibleRows`: once columns window,
 * DOM order says nothing about what a user can see, and "fully visible" is
 * a geometric fact. Pinned columns are flagged rather than filtered — they
 * are sticky, so they are always visible and would otherwise skew any
 * "which window is rendered" assertion.
 */
export async function readVisibleGrid(
  page: Page,
  opts: HostOptions = {},
): Promise<VisibleColumn[]> {
  return page.evaluate(
    (hostSelector) => {
      const scrollEl = document.querySelector(`${hostSelector} .dt-body-scroll`)!;
      const rect = scrollEl.getBoundingClientRect();
      const left = rect.left;
      // clientWidth-based right edge: immune to a vertical scrollbar.
      const right = rect.left + scrollEl.clientWidth;
      const out: VisibleColumn[] = [];
      for (const header of document.querySelectorAll(
        `${hostSelector} .dt-col-header[data-column]`,
      )) {
        const hr = header.getBoundingClientRect();
        out.push({
          name: header.getAttribute('data-column')!,
          colindex: Number(header.getAttribute('aria-colindex')),
          left: hr.left,
          right: hr.right,
          fullyVisible: hr.left >= left - 0.5 && hr.right <= right + 0.5,
          pinned: header.classList.contains('dt-col-header--pinned'),
        });
      }
      return out;
    },
    opts.host ?? `#${TIER_HOST_ID}`,
  );
}

/**
 * Drive `.dt-body-scroll.scrollLeft` to each position and settle between
 * them, returning the grid snapshot at every stop.
 *
 * `positions` are fractions of the maximum scrollLeft, so a spec reads
 * `[0, 0.25, 0.5, 0.75, 1]` rather than pixel counts that change with the
 * column width default.
 */
export async function sweepHorizontal(
  page: Page,
  positions: number[],
  opts: HostOptions = {},
): Promise<Array<{ at: number; scrollLeft: number; columns: VisibleColumn[] }>> {
  const host = opts.host ?? `#${TIER_HOST_ID}`;
  const out: Array<{ at: number; scrollLeft: number; columns: VisibleColumn[] }> = [];
  for (const at of positions) {
    const scrollLeft = await page.evaluate(
      ({ hostSelector, fraction }) => {
        const el = document.querySelector(`${hostSelector} .dt-body-scroll`) as HTMLElement;
        el.scrollLeft = (el.scrollWidth - el.clientWidth) * fraction;
        return el.scrollLeft;
      },
      { hostSelector: host, fraction: at },
    );
    await waitForTierSettled(page, { host });
    out.push({ at, scrollLeft, columns: await readVisibleGrid(page, { host }) });
  }
  return out;
}

/** Re-export so specs can name a tier without a second import path. */
export { TIERS, columnName };
