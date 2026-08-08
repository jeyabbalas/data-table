/**
 * Records what the library costs *today*, one JSON file per tier, so every
 * later phase can prove a before/after instead of asserting one.
 *
 * ```bash
 * npm run perf:baseline          # capture (RUN_BASELINE=1)
 * npm run perf:baseline:report   # merge the JSONs into the baselines README
 * ```
 *
 * **Gated and never in CI.** Wall clock is the point here, and a wall-clock
 * number from a shared runner is noise; `RUN_BASELINE=1` keeps this a
 * deliberate act on a known machine. Nothing in this file asserts a
 * threshold — a capture that fails an assertion is a capture you did not
 * get, and the whole purpose is to record whatever is true, including the
 * pathological parts. The only assertions are that the tier really mounted
 * and the numbers are real, because a baseline of a broken mount would
 * poison every comparison built on it.
 *
 * Captures append, never overwrite (README §8.6): the filename carries the
 * short SHA, so re-running on a new commit adds a column to the report
 * rather than erasing the history. Machine details ride along in the JSON —
 * two captures from different laptops are not comparable and the file has
 * to say so.
 *
 * The matrix is the one the phase doc fixed: WIDE_CI; WIDE with
 * visualizations on and off (the on case is Phase 2's pathology, and its
 * cost is exactly what wants recording); GRID; DEEP; and TARGET, which is
 * probes only until Phase 10 teaches the library to scan a file directly.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { TIERS, columnName } from '../fixtures/tiers';

import {
  bridgeStats,
  domNodeCount,
  frameSampler,
  installObserverCensus,
  readObserverCensus,
  readSubscriberCounts,
} from './helpers/metrics';
import {
  mountTierTable,
  waitForTierSettled,
  wideMountOptions,
  TIER_HOST_ID,
  WIDE_IS_TRUNCATED,
  WIDE_MOUNT_ROWS,
  type MountTierOptions,
} from './helpers/wideTable';

test.skip(process.env['RUN_BASELINE'] !== '1', 'baseline capture — set RUN_BASELINE=1');

/** Same reasoning as `tiers.full.spec.ts`: one tier at a time, in order. */
test.describe.configure({ mode: 'default', timeout: 1_800_000 });

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', '..', 'plans', 'scaling', 'baselines');

/** One recorded row of `plans/scaling/baselines/`. */
interface Baseline {
  tier: string;
  vizMode: 'on' | 'off';
  gitSha: string;
  date: string;
  /** So a reader knows two captures are not comparable across machines. */
  machine: { platform: string; cpus: number; node: string };
  genMs: number | null;
  exportMs: number | null;
  loadMs: number | null;
  workerMs: number | null;
  firstPaintMs: number | null;
  vizReadyMs: number | null;
  queryCount: number | null;
  cacheHits: number | null;
  domNodes: number | null;
  canvasCount: number | null;
  liveResizeObservers: number | null;
  liveMutationObservers: number | null;
  sortSignalSubscribers: number | null;
  heapMB: number | null;
  oneSortMs: number | null;
  oneFilterMs: number | null;
  scrollStormFrameP95: number | null;
  /** Free-text: truncations, fallbacks, anything §4.8 forced. */
  notes?: string;
}

function gitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'nogit';
  }
}

const SHA = gitSha();
const DATE = new Date().toISOString().slice(0, 10);
/** Rides along in every capture: two machines' numbers are not comparable. */
const MACHINE = { platform: platform(), cpus: cpus().length, node: process.version };

/**
 * Write one capture.
 *
 * Filename carries tier, viz mode, and SHA, which is what makes the set
 * append-only: a second run on the same commit overwrites its own file (the
 * honest thing — it is the same measurement), while a new commit lands
 * beside it.
 */
function writeBaseline(row: Baseline): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `baseline-${row.tier}-${row.vizMode}-${row.gitSha}.json`);
  writeFileSync(file, `${JSON.stringify(row, null, 2)}\n`, 'utf8');
  console.log(`[perf-baseline] wrote ${file}`);
}

/** Duration of a `dt:load:*` measure, page-side. */
async function loadMeasure(page: Page, name: string): Promise<number | null> {
  return page.evaluate((measure) => {
    const entries = performance.getEntriesByName(`dt:load:${measure}`, 'measure');
    const last = entries[entries.length - 1];
    return last ? Math.round(last.duration * 100) / 100 : null;
  }, name);
}

async function heapMB(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return mem ? Math.round((mem.usedJSHeapSize / 1024 / 1024) * 10) / 10 : null;
  });
}

async function canvasCount(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelectorAll('.dt-root canvas').length);
}

/**
 * Time one user-visible interaction, page-side, from the action to a
 * re-resolved body.
 *
 * Timed in the page rather than by polling from Node: Playwright's settle
 * poll runs at 150 ms and needs two stable reads, so a Node-side clock
 * would add up to ~450 ms of its own latency to every number — on a fast
 * tier that is most of the measurement. The wait condition is "the bridge
 * dispatched at least one new query, nothing is in flight, and no
 * placeholder is left", which is the closest page-observable stand-in for
 * "the user can read the answer".
 */
async function timeInteraction(page: Page, action: 'sort' | 'filter'): Promise<number> {
  return page.evaluate(
    async ({ kind, hostId, sortColumn, filterColumn }) => {
      const table = (window as any).__t;
      const before = table.bridge.__getStatsForTests().sent.query as number;
      const t0 = performance.now();

      if (kind === 'sort') {
        table.actions.toggleSort(sortColumn);
      } else {
        table.actions.addFilter({ type: 'range', column: filterColumn, min: 0, max: 50000 });
      }

      await new Promise<void>((resolve) => {
        const settled = (): boolean => {
          const stats = table.bridge.__getStatsForTests();
          const placeholders = document.querySelectorAll(`#${hostId} [data-placeholder]`).length;
          return stats.sent.query > before && stats.inFlight === 0 && placeholders === 0;
        };
        const tick = (): void => {
          if (settled()) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      return Math.round((performance.now() - t0) * 100) / 100;
    },
    {
      kind: action,
      hostId: TIER_HOST_ID,
      // col_10 is class 10: a plain INTEGER with ~100,000 distinct values,
      // so both the sort and the range filter are real work rather than a
      // dictionary lookup over 26 letters.
      sortColumn: columnName(10),
      filterColumn: columnName(10),
    },
  );
}

/**
 * Mount a tier, measure everything §4.7 asks for, and write the capture.
 *
 * Deliberately assertion-light: the mount must have worked, and after that
 * every number is recorded as found.
 */
async function capture(page: Page, tier: string, opts: MountTierOptions): Promise<Baseline> {
  await installObserverCensus(page);
  const mounted = await mountTierTable(page, opts);
  await waitForTierSettled(page);

  const spec = mounted.spec;
  const rendered = await page.evaluate(
    (hostId) => ({
      rows: document.querySelectorAll(`#${hostId} .dt-body .dt-row`).length,
      totalRows: (window as any).__t.state.totalRows.get() as number,
    }),
    TIER_HOST_ID,
  );
  // The only real gate: a capture of a table that never loaded would be a
  // row of plausible-looking zeros in a file every later phase trusts.
  expect(rendered.totalRows, `${tier} totalRows`).toBe(spec.rows);
  expect(rendered.rows, `${tier} rendered rows`).toBeGreaterThan(0);

  const stats = await bridgeStats(page);
  const observers = await readObserverCensus(page);
  const subscribers = await readSubscriberCounts(page);

  const viz = opts.viz === true;
  const row: Baseline = {
    tier,
    vizMode: viz ? 'on' : 'off',
    gitSha: SHA,
    date: DATE,
    machine: MACHINE,
    genMs: Math.round(mounted.genMs),
    // The tier is streamed straight into the parquet writer, so there is no
    // separate export stage to time — see `tierSelectSQL`. Kept in the
    // schema (§4.7 names it) so a phase that reintroduces one has a slot.
    exportMs: null,
    loadMs: Math.round(mounted.loadMs),
    workerMs: await loadMeasure(page, 'worker'),
    firstPaintMs: await loadMeasure(page, 'paint'),
    vizReadyMs: await loadMeasure(page, 'viz'),
    queryCount: stats?.sent.query ?? null,
    cacheHits: stats?.cacheHits ?? null,
    domNodes: await domNodeCount(page),
    canvasCount: await canvasCount(page),
    liveResizeObservers: observers.resize,
    liveMutationObservers: observers.mutation,
    sortSignalSubscribers: subscribers['sortColumns'] ?? null,
    heapMB: await heapMB(page),
    oneSortMs: null,
    oneFilterMs: null,
    scrollStormFrameP95: null,
    // A capture that quietly measured a smaller tier than its filename
    // claims would poison every comparison built on it (README §8.6).
    ...(tier === 'wide' && WIDE_IS_TRUNCATED
      ? {
          notes:
            `Truncated: ${WIDE_MOUNT_ROWS} of ${TIERS.wide.rows} rows, all ` +
            `${TIERS.wide.cols} columns. exportToBuffer has no ROW_GROUP_SIZE ` +
            'option, so the full-depth tier buffers as one row group and ' +
            "overruns DuckDB-WASM's heap — see WIDE_MOUNT_ROWS.",
        }
      : {}),
  };

  // Scroll pacing before the interactions: sorting rewrites the row order,
  // and a storm over a sorted table measures a different thing.
  const frames = await frameSampler(page, async () => {
    for (const fraction of [0.13, 0.5, 0.97, 0.31, 1, 0]) {
      await page.evaluate(
        ({ hostId, f }) => {
          const el = document.querySelector(`#${hostId} .dt-body-scroll`) as HTMLElement;
          el.scrollTop = (el.scrollHeight - el.clientHeight) * f;
        },
        { hostId: TIER_HOST_ID, f: fraction },
      );
      await waitForTierSettled(page);
    }
  });
  row.scrollStormFrameP95 = Math.round(frames.p95DeltaMs * 100) / 100;

  // Filter first, then undo it, then sort — so both numbers describe the
  // same starting state. Measuring a filter on an already-sorted table
  // would fold the sort's cost into it and make the two captures
  // incomparable with each other and with later phases.
  row.oneFilterMs = await timeInteraction(page, 'filter');
  await waitForTierSettled(page);
  await page.evaluate((column) => (window as any).__t.actions.removeFilter(column), columnName(10));
  await waitForTierSettled(page);

  row.oneSortMs = await timeInteraction(page, 'sort');
  await waitForTierSettled(page);

  writeBaseline(row);
  return row;
}

test('baseline — WIDE_CI (300 × 20,000), viz off', async ({ page }) => {
  const row = await capture(page, 'wide-ci', { tier: 'wide-ci', viz: false });
  expect(row.loadMs).toBeGreaterThan(0);
});

test('baseline — WIDE (1,000 columns), viz off', async ({ page }) => {
  const row = await capture(page, 'wide', wideMountOptions(false));
  expect(row.canvasCount).toBe(0);
});

test('baseline — WIDE (1,000 columns), viz on', async ({ page }) => {
  // The expensive half of the matrix and the reason it is worth capturing:
  // ~1,000 eager column charts through a serial dispatcher is Phase 2's
  // whole subject, and this is the number it has to beat.
  const row = await capture(page, 'wide', wideMountOptions(true));
  expect(row.queryCount).toBeGreaterThan(0);
  console.log(
    `[perf-baseline] wide viz=on cost ${row.queryCount} queries and ` +
      `${row.canvasCount} canvases for ${TIERS.wide.cols} columns`,
  );
});

test('baseline — GRID (200 × 500,000), viz off', async ({ page }) => {
  await capture(page, 'grid', { tier: 'grid', viz: false });
});

test('baseline — DEEP (20 × 5,000,000), viz off', async ({ page }) => {
  await capture(page, 'deep', { tier: 'deep', viz: false });
});

test('baseline — TARGET (1,000 × 5,000,000), probes only', async ({ page }) => {
  // No mount: 5 × 10⁹ cells cannot be materialized inside DuckDB-WASM's
  // 4 GB ceiling, so until Phase 10 the tier exists as a parquet file that
  // is written and probed. `genMs` is the `COPY`; everything a mounted
  // tier would have reported stays null rather than fabricated.
  const spec = TIERS.target;
  await page.goto('./?gen=target');
  await page.waitForSelector('#dt-perf-panel[data-state="ready"]', { timeout: 1_700_000 });

  const snap = await page.evaluate(() => (window as any).__dtPerf.snapshot());
  expect(snap.error).toBeNull();
  expect(snap.probe?.rowCount, 'read_parquet COUNT(*)').toBe(spec.rows);
  expect(snap.probe?.colCount, 'read_parquet DESCRIBE width').toBe(spec.cols);

  const row: Baseline = {
    tier: 'target',
    vizMode: 'off',
    gitSha: SHA,
    date: DATE,
    machine: MACHINE,
    genMs: Math.round(snap.genMs),
    exportMs: null,
    loadMs: null,
    workerMs: null,
    firstPaintMs: null,
    vizReadyMs: null,
    queryCount: snap.queryCount,
    cacheHits: snap.cacheHits,
    domNodes: null,
    canvasCount: null,
    liveResizeObservers: null,
    liveMutationObservers: null,
    sortSignalSubscribers: null,
    heapMB: snap.heapMB,
    oneSortMs: null,
    oneFilterMs: null,
    scrollStormFrameP95: null,
    notes:
      'Probes only — the file is written with COPY … TO parquet and read back through ' +
      'read_parquet. genMs is the COPY; no table is materialized until Phase 10.',
  };
  writeBaseline(row);
});
