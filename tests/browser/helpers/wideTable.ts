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
  tierSelectSQL,
  type TierName,
  type TierSpec,
} from '../../fixtures/tiers';

/** Host element id, for host-scoped locators in the specs. */
export const TIER_HOST_ID = 'tier-table-host';

/**
 * How deep the WIDE tier can actually be built today — the phase doc's §4.8
 * truncation, applied for a reason it did not anticipate.
 *
 * WIDE is defined as 1,000 × 100,000 and **cannot be produced at that depth
 * on this stack**. `exportToBuffer` wraps its SQL in
 * `COPY (…) TO '<file>' (FORMAT PARQUET)` with no row-group option
 * (`src/worker/dispatcher.ts:358-360`), so DuckDB uses its default
 * `ROW_GROUP_SIZE` of 122,880 rows — more than the tier is deep. The whole
 * 10⁸-cell tier therefore buffers as a single row group and the writer dies
 * with `Out of Memory Error: Allocation failure` inside DuckDB-WASM's
 * ~3.1 GiB heap. Measured: it is the column count that decides this, not
 * the cell count — GRID (200 × 500,000) and DEEP (20 × 5,000,000) are the
 * same 10⁸ cells and both complete.
 *
 * So the truncation is on the **row** axis, not the `cols=500` the doc
 * suggested: the column axis is the entire point of this tier and Phases
 * 2–6 are about it, while depth is what GRID and DEEP already cover. That
 * TARGET — 1,000 columns × 5,000,000 rows — streams fine at
 * `ROW_GROUP_SIZE 30720` is the control that pins the cause on the row
 * group rather than the width.
 *
 * Bisected on the reference machine (macOS, Chromium, 1,000 columns, all
 * through the demo harness's real export → load path):
 *
 * | rows    | result                            |
 * | ------- | --------------------------------- |
 * | 100,000 | OOM in the parquet writer         |
 * | 95,000  | OOM in the parquet writer         |
 * | 85,000  | ok — 21.9 s build, 13.1 s load    |
 * | 75,000  | ok — 18.6 s build, 9.7 s load     |
 * | 60,000  | ok — 15.0 s build, 8.3 s load     |
 *
 * 60,000 rather than the 85,000 the cliff would allow: `viz=on` adds
 * ~1,000 canvases and ~1,000 aggregate queries on top of the same heap,
 * and a tier pinned 10 % from a hard ceiling would fail intermittently for
 * reasons that have nothing to do with the phase under test. `DT_WIDE_ROWS`
 * overrides it on a machine with more headroom; a phase that gives
 * `exportToBuffer` a row-group option (Phase 11 — streaming exports)
 * should retest 100,000 and raise this.
 */
export const WIDE_MOUNT_ROWS = Number(process.env['DT_WIDE_ROWS'] ?? 60_000);

/** Whether {@link wideMountOptions} is producing a truncated tier. */
export const WIDE_IS_TRUNCATED = WIDE_MOUNT_ROWS < TIERS.wide.rows;

/**
 * Mount options for WIDE at the greatest depth that builds — full width,
 * {@link WIDE_MOUNT_ROWS} deep. Shared by the gated spec and the baseline
 * capture so both describe the same tier.
 */
export function wideMountOptions(viz: boolean): MountTierOptions {
  return {
    tier: 'custom',
    cols: TIERS.wide.cols,
    rows: WIDE_MOUNT_ROWS,
    seed: TIERS.wide.seed,
    viz,
  };
}

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
  kind: 'sequence' | 'colindex' | 'cell' | 'rowid' | 'window';
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

/** Extra knobs for {@link installColumnInvariantProbe}. */
export interface ProbeOptions extends HostOptions {
  /**
   * Check every rendered cell each pass instead of sampling one. Costlier
   * — use it on small tiers, or where a specific cell must be found.
   */
  exhaustive?: boolean;
  /**
   * Install the validator without the `MutationObserver` or the rAF loop,
   * so passes only happen via {@link runColumnProbePass}.
   */
  manual?: boolean;
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

/**
 * What the **body** renders, as read back by {@link readBodyWindow}.
 *
 * A separate reader from {@link readVisibleGrid} because that one reads
 * `.dt-col-header` elements, and from Phase 3 the header row and the body no
 * longer render the same set of columns: the body windows, the header does
 * not (until Phase 4). Asserting the body's window against a header-derived
 * number would silently pass whatever the body did.
 */
export interface BodyWindow {
  /** `data-row-index` of the row that was read; `-1` when none was painted. */
  rowIndex: number;
  /** `data-window="P:W"` parsed — the row's own claim about its structure. */
  pinnedCount: number;
  windowSize: number;
  /** Every rendered cell's `data-column`, in DOM order. Pinned run first. */
  columns: string[];
  /** Declared spacer widths, in px, read off the inline `flex`. */
  leftSpacerPx: number;
  rightSpacerPx: number;
  /** Σ declared `style.width` of the sampled row's cells. */
  renderedWidthPx: number;
  /**
   * The content extent the body published, in px — `.dt-header-row`'s
   * `min-width`, which `applyContentWidth` writes from the same prefix sums it
   * gives `VirtualScroller.setContentWidth`. `leftSpacerPx + renderedWidthPx +
   * rightSpacerPx` must equal it exactly, at every offset.
   */
  contentWidthPx: number;
  /** `children.length` of the row — cells plus the two spacers. */
  childCount: number;
  /** `.dt-cell` elements under `.dt-body` across every rendered row. */
  totalCells: number;
  /** Painted data rows (placeholders excluded). */
  rowCount: number;
  /** Rows whose `data-window` stamp differs from the sampled row's. */
  mismatchedRows: number;
  /** `.dt-body-scroll.scrollWidth` — the horizontal extent, at this offset. */
  scrollWidth: number;
  /** `.dt-body-scroll.scrollLeft` / `.clientWidth`, for the caller's arithmetic. */
  scrollLeft: number;
  clientWidth: number;
}

/** One column's header/body horizontal agreement, from {@link readAlignment}. */
export interface ColumnAlignment {
  column: string;
  headerX: number;
  cellX: number;
  /** `|headerX − cellX|`. The spike measured 0.000 for every column. */
  delta: number;
  /** `|headerWidth − cellWidth|`. */
  widthDelta: number;
}

export interface MountTierOptions {
  tier: TierName | 'custom';
  rows?: number;
  cols?: number;
  seed?: number;
  /** Per-column charts. Off by default — 1,000 of them is its own experiment. */
  viz?: boolean;
  /**
   * Build every applicable column's chart at load and make the load promise
   * wait for them — the pre-Phase-2 behavior, still reachable through
   * `visualizations: { eager: true }`. Ignored when `viz` is not `true`.
   */
  eager?: boolean;
  rowHeight?: number;
}

/** Timings the mount collected, so a spec can assert against the readout. */
export interface MountTierResult {
  spec: TierSpec;
  /**
   * Building the parquet source: generation and encoding together.
   *
   * One number rather than the generate/export pair an earlier draft had,
   * because on the streamed path there is no seam between them — see
   * {@link tierSelectSQL}. Splitting them again would mean materializing
   * the tier, which is what made the wide tiers unmountable.
   */
  genMs: number;
  loadMs: number;
}

type TierWindow = {
  __t: import('../../../src/index').DataTable;
  /** Mount progress marker so a hung stage names itself in traces. */
  __wideTableStage?: string;
  __dtTierSettle?: { last: string; stable: number };
  __dtColViolations?: ColViolation[];
  __dtColProbe?: { observer: MutationObserver; rafId: number; active: boolean };
  __dtColValidate?: () => void;
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
    async ({ sourceSql, csvText, viz, eager, rowHeight, hostId, oracleSource }) => {
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
        visualizations: viz && eager ? { eager: true } : viz,
        ...(rowHeight === undefined ? {} : { rowHeight }),
      });
      w.__t = table;
      w.__dtOracle = new Function(oracleSource)() as TierWindow['__dtOracle'];

      let genMs: number;
      let source: string | ArrayBuffer;

      const t0 = performance.now();
      w.__wideTableStage = 'generate';
      if (csvText !== null) {
        // `wide-csv` arrives already built — there is no SQL stage at all.
        genMs = performance.now() - t0;
        source = csvText;
      } else {
        // One streamed step: `exportToBuffer` wraps this in `COPY (…) TO
        // parquet`, so the tier goes from `range()` to parquet without ever
        // existing as a table. The earlier two-step version (CREATE TABLE,
        // then export) left the whole tier resident while the writer needed
        // room of its own, and put WIDE and GRID over DuckDB-WASM's ceiling.
        // The select list never includes __rowid__ — the loader rejects
        // sources that carry one.
        const buf = await table.bridge.exportToBuffer(sourceSql, 'parquet');
        genMs = performance.now() - t0;
        source = buf.buffer as ArrayBuffer;
      }

      w.__wideTableStage = 'load';
      const t2 = performance.now();
      await table.loadData(source, { sourceFormat: csvText !== null ? 'csv' : 'parquet' });
      const loadMs = performance.now() - t2;
      w.__wideTableStage = 'done';
      return { genMs, loadMs };
    },
    {
      sourceSql: csv === null ? tierSelectSQL(spec) : '',
      csvText: csv,
      viz: opts.viz ?? false,
      eager: opts.eager ?? false,
      rowHeight: opts.rowHeight,
      hostId: TIER_HOST_ID,
      oracleSource: ORACLE_FN_SOURCE,
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
 *
 * `inFlight === 0` joins them from Phase 2 on, and it is not redundant with
 * the DOM key. Visualization fetches run at `'low'` priority and paint into
 * canvases, which no part of the key above observes: a chart wave can be
 * mid-flight while every row, header and scroll offset has been stable for
 * three polls. A spec that counted canvases or queries at that moment would
 * read a number from the middle of the wave and call it the total. The
 * bridge counter is the only page-observable fact that covers the whole
 * request set, whatever it renders into.
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
      // `__t` for a `mountTierTable` host, `__dtPerf.table` for the demo's
      // `?gen=` harness — the same two places `bridgeStats` looks. Absent on
      // a table mounted without the test hooks, which counts as quiet rather
      // than hanging forever on a counter that will never appear.
      const table =
        w.__t ?? (window as unknown as { __dtPerf?: { table?: typeof w.__t } }).__dtPerf?.table;
      const bridge = table?.bridge as unknown as
        { __getStatsForTests?: () => { inFlight: number } } | undefined;
      const inFlight = bridge?.__getStatsForTests?.().inFlight ?? 0;
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
          .map((r) => {
            // The row's *first rendered* cell, not `col_0`. Body rows render
            // only the horizontally visible column window, so at any scrolled
            // position `col_0` is absent and this term collapsed to `''` for
            // every row — the settle key stopped seeing row content at all and
            // reported "settled" while cells were still being painted.
            const first = r.querySelector('.dt-cell[data-column]');
            return (
              r.getAttribute('data-row-index') +
              ':' +
              r.getAttribute('data-row-id') +
              ':' +
              (first?.getAttribute('data-column') ?? '') +
              '=' +
              (first?.textContent ?? '')
            );
          })
          .join(',');
      const s = (w.__dtTierSettle ??= { last: '', stable: 0 });
      s.stable = key === s.last ? s.stable + 1 : 0;
      s.last = key;
      return placeholders === 0 && rows.length > 0 && inFlight === 0 && s.stable >= 2;
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
 * Wait for the initial visualization wave — the charts whose headers were
 * visible at load time — to finish fetching.
 *
 * Since Phase 2 the load promise resolves at first interactive paint and no
 * longer waits for charts, so `mountTierTable` returning says nothing about
 * them. Anything that counts canvases, reads `dt:load:viz`, or attributes a
 * query total to "the load" has to gate on this instead, or it reads a
 * number from the middle of the wave.
 *
 * Resolves immediately (with an empty wave) when `visualizations: false`, and
 * on a table mounted without the test hooks.
 */
export async function waitForVizReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const w = window as unknown as TierWindow;
    await w.__t?.whenVizReady();
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
  opts: ProbeOptions = {},
): Promise<void> {
  await page.evaluate(
    ({ hostSelector, seedValue, exhaustive, manual }) => {
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
            return;
          }
          if (wanted > 0 && index !== wanted) {
            push('colindex', `${name}: aria-colindex ${index}, columnOrder says ${wanted}`);
            return;
          }
          previous = index;
        }

        const rows = Array.from(
          host!.querySelectorAll('.dt-body .dt-row[data-row-id]:not([data-placeholder])'),
        ) as HTMLElement[];
        if (rows.length === 0) return;

        // (c) The body's column window is internally consistent.
        //
        // Frame-independent on purpose, and that is the whole design of this
        // check. "The rendered columns are the ones under the viewport" is
        // NOT frame-independent — a render one frame behind the scroll offset
        // is legitimate, and asserting it here would log violations during
        // ordinary scrolling. What must hold in every frame is the row's
        // internal structure: `[P pinned][left spacer][W cells][right
        // spacer]`, the pinned prefix being the head of `visibleColumns`, the
        // window being a contiguous run of it, and every rendered row
        // agreeing — one render pass builds them all for one window, so a row
        // that disagrees was left behind by a pass that did not finish.
        //
        // The first row is checked in full and the rest by their stamp, which
        // is O(rows) rather than O(cells) — this runs on every rAF.
        const windowStamp = rows[0]!.getAttribute('data-window');
        for (const row of exhaustive ? rows : rows.slice(0, 1)) {
          const stamp = row.getAttribute('data-window');
          if (stamp === null) {
            push('window', `row ${row.getAttribute('data-row-index')}: no data-window stamp`);
            return;
          }
          const parts = stamp.split(':');
          // `Number(undefined)` is NaN, so a malformed stamp fails here
          // rather than producing two plausible-looking numbers.
          const p = Number(parts[0]);
          const w = Number(parts[1]);
          if (!Number.isInteger(p) || !Number.isInteger(w)) {
            push('window', `row ${row.getAttribute('data-row-index')}: data-window "${stamp}"`);
            return;
          }
          if (row.children.length !== p + w + 2) {
            push(
              'window',
              `row ${row.getAttribute('data-row-index')}: data-window "${stamp}" ` +
                `wants ${p + w + 2} children, has ${row.children.length}`,
            );
            return;
          }
          for (const [at, side] of [
            [p, 'left'],
            [p + w + 1, 'right'],
          ] as const) {
            if (row.children[at]?.getAttribute('data-col-spacer') !== side) {
              push(
                'window',
                `row ${row.getAttribute('data-row-index')}: no ${side} spacer at ${at}`,
              );
              return;
            }
          }
          if (w === 0) continue;
          const cols = (Array.from(row.querySelectorAll('.dt-cell[data-column]')) as HTMLElement[])
            .map((cell) => cell.getAttribute('data-column'))
            .join(',');
          // The window starts wherever its first cell says it does; the
          // structure above already fixed that cell at child index `P + 1`.
          const first = row.children[p + 1]?.getAttribute('data-column') ?? '';
          const from = visible.indexOf(first);
          const wanted = visible
            .slice(0, p)
            .concat(from < 0 ? [] : visible.slice(from, from + w))
            .join(',');
          if (from < p || cols !== wanted) {
            push(
              'window',
              `row ${row.getAttribute('data-row-index')}: rendered [${cols.slice(0, 60)}…] ` +
                `is not visibleColumns[0,${p}) + [${from},${from + w}) (×${visible.length})`,
            );
            return;
          }
        }
        const strayRow = rows.find((row) => row.getAttribute('data-window') !== windowStamp);
        if (strayRow) {
          push(
            'window',
            `row ${strayRow.getAttribute('data-row-index')}: data-window ` +
              `"${strayRow.getAttribute('data-window')}" vs "${windowStamp}" on the rest`,
          );
          return;
        }

        // (d) The row oracle, header/body agreement, and the cell oracle.
        //
        // Sampling mode looks at one random row and one random cell per
        // pass: at frame rate over a scroll storm that still covers
        // thousands of cells, and it is cheap enough not to perturb the
        // rendering it is measuring. `exhaustive` checks every rendered
        // cell instead — for the negative controls, which need a
        // deliberately corrupted cell to be found with certainty.
        const pickRow = exhaustive ? rows : [rows[Math.floor(Math.random() * rows.length)]!];

        for (const row of pickRow) {
          const rowIndex = Number(row.getAttribute('data-row-index'));
          const rowId = Number(row.getAttribute('data-row-id'));
          // The row oracle: while unsorted and unfiltered every rendered
          // row carries `__rowid__ === position`. The cell oracle is keyed
          // by source row index, so it is only meaningful once this holds.
          if (rowId !== rowIndex) {
            push('rowid', `row ${rowIndex}: data-row-id ${rowId}`);
            return;
          }
          const cells = Array.from(row.querySelectorAll('.dt-cell[data-column]')) as HTMLElement[];
          if (cells.length === 0) continue;
          const pickCell = exhaustive ? cells : [cells[Math.floor(Math.random() * cells.length)]!];

          for (const cell of pickCell) {
            const colName = cell.getAttribute('data-column')!;
            const header = headers.find((h) => h.getAttribute('data-column') === colName);
            if (
              header &&
              header.getAttribute('aria-colindex') !== cell.getAttribute('aria-colindex')
            ) {
              push(
                'colindex',
                `${colName}: header aria-colindex ${header.getAttribute('aria-colindex')} ` +
                  `vs cell ${cell.getAttribute('aria-colindex')}`,
              );
              return;
            }
            const c = Number(colName.slice(4));
            if (!Number.isFinite(c)) continue;
            const want = oracle(rowIndex, c, seedValue);
            if (want !== null && cell.textContent !== want) {
              push('cell', `row ${rowIndex} ${colName}: "${cell.textContent}" != "${want}"`);
              return;
            }
          }
        }
      };
      w.__dtColValidate = validate;

      // `manual` installs the validator and nothing else: no observer, no
      // rAF loop. That is what lets a negative control corrupt one thing,
      // run exactly one pass, and see exactly one violation.
      const observer = new MutationObserver(validate);
      if (!manual) {
        observer.observe(grid, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['data-column', 'aria-colindex'],
        });
      }
      const probe = { observer, rafId: 0, active: !manual };
      const loop = (): void => {
        if (!probe.active) return;
        validate();
        probe.rafId = requestAnimationFrame(loop);
      };
      if (!manual) probe.rafId = requestAnimationFrame(loop);
      w.__dtColProbe = probe;
    },
    {
      hostSelector: opts.host ?? `#${TIER_HOST_ID}`,
      seedValue: seed,
      exhaustive: opts.exhaustive === true,
      manual: opts.manual === true,
    },
  );
}

/**
 * Run one probe pass on demand and return the violation count so far.
 *
 * Only meaningful with `manual: true`, where nothing else drives the
 * probe. This is what makes the negative controls exact: corrupt one
 * thing, run exactly one pass, expect exactly one violation.
 */
export async function runColumnProbePass(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as TierWindow;
    if (!w.__dtColValidate) throw new Error('column probe: not installed');
    w.__dtColValidate();
    return (w.__dtColViolations ?? []).length;
  });
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
    delete w.__dtColValidate;
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
 * Read the **body**'s rendered column window in one round trip.
 *
 * Samples the first painted data row for the per-row facts and counts the
 * rest, because every row in a render pass is built for the same window —
 * `mismatchedRows` is what turns that "because" into an assertion.
 *
 * Spacer widths come off the inline `flex` shorthand rather than
 * `getBoundingClientRect`: the declared value is what the body computed from
 * its prefix sums, and it is that number a spec wants to check against the
 * columns it stands in for. The rendered width can differ under flex
 * pressure without the arithmetic being wrong.
 */
export async function readBodyWindow(page: Page, opts: HostOptions = {}): Promise<BodyWindow> {
  return page.evaluate(
    (hostSelector) => {
      const scrollEl = document.querySelector(`${hostSelector} .dt-body-scroll`) as HTMLElement;
      const headerRow = document.querySelector<HTMLElement>(`${hostSelector} .dt-header-row`);
      const empty: BodyWindow = {
        rowIndex: -1,
        pinnedCount: 0,
        windowSize: 0,
        columns: [],
        leftSpacerPx: 0,
        rightSpacerPx: 0,
        renderedWidthPx: 0,
        contentWidthPx: parseFloat(headerRow?.style.minWidth ?? '') || 0,
        childCount: 0,
        totalCells: document.querySelectorAll(`${hostSelector} .dt-body .dt-cell`).length,
        rowCount: 0,
        mismatchedRows: 0,
        scrollWidth: scrollEl?.scrollWidth ?? 0,
        scrollLeft: scrollEl?.scrollLeft ?? 0,
        clientWidth: scrollEl?.clientWidth ?? 0,
      };

      const rows = Array.from(
        document.querySelectorAll<HTMLElement>(
          `${hostSelector} .dt-body .dt-row[data-row-id]:not([data-placeholder])`,
        ),
      );
      const row = rows[0];
      if (!row) return empty;

      const stamp = row.getAttribute('data-window') ?? '';
      const [pinnedRaw, sizeRaw] = stamp.split(':');
      const spacerPx = (side: 'left' | 'right'): number => {
        const el = row.querySelector<HTMLElement>(`[data-col-spacer="${side}"]`);
        if (!el) return Number.NaN;
        // `flex: 0 0 <n>px` — parse the basis off the shorthand's own text.
        const match = /(-?[\d.]+)px\s*$/.exec(el.style.flex);
        return match ? parseFloat(match[1]!) : Number.NaN;
      };

      const cells = Array.from(row.querySelectorAll<HTMLElement>('.dt-cell[data-column]'));
      return {
        ...empty,
        rowIndex: Number(row.getAttribute('data-row-index')),
        pinnedCount: Number(pinnedRaw),
        windowSize: Number(sizeRaw),
        columns: cells.map((cell) => cell.getAttribute('data-column')!),
        leftSpacerPx: spacerPx('left'),
        rightSpacerPx: spacerPx('right'),
        renderedWidthPx: cells.reduce((sum, cell) => sum + (parseFloat(cell.style.width) || 0), 0),
        childCount: row.children.length,
        rowCount: rows.length,
        mismatchedRows: rows.filter((r) => r.getAttribute('data-window') !== stamp).length,
      };
    },
    opts.host ?? `#${TIER_HOST_ID}`,
  );
}

/**
 * Pair every rendered body cell with its header and measure the horizontal
 * disagreement between them.
 *
 * This is C2's alignment spike, made permanent. The spike's whole question
 * was whether a spacer standing in for N skipped columns puts the remaining
 * cells exactly where their headers are — it measured 0.000 px across the
 * board, and this is the assertion that keeps it there. Paired by
 * `data-column`, never by position: that pairing is precisely what windowing
 * breaks.
 *
 * Only columns the body actually renders appear; the header row is still
 * built in full, and a header with no cell has nothing to disagree with.
 */
export async function readAlignment(
  page: Page,
  opts: HostOptions = {},
): Promise<ColumnAlignment[]> {
  return page.evaluate(
    (hostSelector) => {
      const headers = new Map<string, DOMRect>();
      for (const header of document.querySelectorAll<HTMLElement>(
        `${hostSelector} .dt-col-header[data-column]`,
      )) {
        headers.set(header.getAttribute('data-column')!, header.getBoundingClientRect());
      }
      const row = document.querySelector<HTMLElement>(
        `${hostSelector} .dt-body .dt-row[data-row-id]:not([data-placeholder])`,
      );
      const out: ColumnAlignment[] = [];
      if (!row) return out;
      for (const cell of row.querySelectorAll<HTMLElement>('.dt-cell[data-column]')) {
        const column = cell.getAttribute('data-column')!;
        const headerRect = headers.get(column);
        if (!headerRect) continue;
        const cellRect = cell.getBoundingClientRect();
        out.push({
          column,
          headerX: headerRect.left,
          cellX: cellRect.left,
          delta: Math.abs(headerRect.left - cellRect.left),
          widthDelta: Math.abs(headerRect.width - cellRect.width),
        });
      }
      return out;
    },
    opts.host ?? `#${TIER_HOST_ID}`,
  );
}

/** One settled stop of {@link sweepHorizontal}. */
export interface SweepStop {
  /** The requested fraction of maximum scrollLeft. */
  at: number;
  scrollLeft: number;
  /** Header geometry — the header row is not windowed until Phase 4. */
  columns: VisibleColumn[];
  /** What the body rendered at this offset. */
  body: BodyWindow;
  /** Header/body agreement for every column the body rendered. */
  alignment: ColumnAlignment[];
}

/**
 * Drive `.dt-body-scroll.scrollLeft` to each position and settle between
 * them, returning the grid snapshot at every stop.
 *
 * `positions` are fractions of the maximum scrollLeft, so a spec reads
 * `[0, 0.25, 0.5, 0.75, 1]` rather than pixel counts that change with the
 * column width default.
 *
 * The body window, the extent and the alignment are read **here** rather
 * than by `installColumnInvariantProbe`, and the reason is worth stating: the
 * probe runs on every rAF and every mutation, where a render that is one
 * frame behind the scroll offset is legitimate and transient. "The columns
 * under the viewport are the ones rendered" is only true at rest. Facts that
 * need the DOM to have caught up belong at a settled stop; the probe keeps
 * only the invariants that hold mid-flight.
 */
export async function sweepHorizontal(
  page: Page,
  positions: number[],
  opts: HostOptions = {},
): Promise<SweepStop[]> {
  const host = opts.host ?? `#${TIER_HOST_ID}`;
  const out: SweepStop[] = [];
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
    out.push({
      at,
      scrollLeft,
      columns: await readVisibleGrid(page, { host }),
      body: await readBodyWindow(page, { host }),
      alignment: await readAlignment(page, { host }),
    });
  }
  return out;
}

/** Re-export so specs can name a tier without a second import path. */
export { TIERS, columnName };
