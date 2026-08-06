/**
 * Bug 2 — fetch-pipeline races at depth — proven against a real engine.
 *
 * Row fetches at million-row depths take hundreds of milliseconds, which
 * opens race windows (superseded ranges, stale replays, eviction of visible
 * rows) that are invisible at the ≤100K fixture scale and in jsdom, where
 * fetches resolve instantly. The table under test is generated in-page so
 * that `__rowid__ === position === id`, which yields a hard oracle: while
 * unsorted/unfiltered, every rendered non-placeholder row must satisfy
 * `data-row-id === data-row-index` and its `grp` cell must read
 * `'g' + (index % 97)` — at every instant, including mid-storm. No
 * screenshots, no timing-sensitive expectations.
 *
 * Determinism of the settled-state test: the walk is fixed-seed, and every
 * jump is rejection-sampled to stay ≥5,000 px away from the anchor, so the
 * final anchor write always carries a delta far larger than one viewport
 * height and takes the PROPORTIONAL branch of the compressed scroll mapping —
 * which is memoryless given scrollTop. Whatever rAF coalescing did to the
 * intermediate events, the settled virtual position (and therefore the
 * rendered row set) is a pure function of the anchor.
 */

import { expect, test } from '@playwright/test';

import {
  BIG_TABLE_HOST_ID,
  GEN_COLUMNS,
  expectedGrp,
  installRowInvariantProbe,
  mountBigTable,
  readViolations,
  readVisibleRows,
  waitForRowsResolved,
} from './helpers/bigTable';
import type { VisibleRow } from './helpers/bigTable';

/** 1.6M rows × 32 px = 51.2M virtual px — deep into compressed mapping. */
const N_LARGE = 1_600_000;
/**
 * The storm runs at 200K rows (6.4M px — identity mapping): the fetch races
 * are height-independent, and the smaller table keeps the ~8 s storm plus its
 * resolution wait comfortably inside the test budget.
 */
const N_STORM = 200_000;
const TRIPS = 4;
const ANCHOR_FRACTION = 0.37;
/** ±0.1% of N_LARGE — the pre-fix mapping error was ~460K rows. */
const ANCHOR_TOLERANCE_ROWS = 1_600;
const GRP_CELL = GEN_COLUMNS.indexOf('grp');

/**
 * Drive one fixed-seed 12-jump walk and land on the anchor. Runs entirely
 * in-page: assigning `scrollTop` from the page fires real scroll events, so
 * the jumps race genuine in-flight block fetches exactly like a user drag.
 *
 * `anchor` and `maxScroll` are computed ONCE by the caller and passed in as
 * absolute pixels: recomputing them per trip from live geometry would let a
 * few-px `clientHeight` wobble (horizontal scrollbar settling) shift the
 * settled position between trips — a spurious 1-row snapshot difference with
 * nothing to do with the races under test.
 */
async function runWalkToAnchor(
  page: import('@playwright/test').Page,
  anchor: number,
  maxScroll: number,
): Promise<void> {
  await page.evaluate(
    async ({ hostId, anchor, maxScroll }) => {
      const el = document.querySelector(`#${hostId} .dt-body-scroll`)!;

      // mulberry32, inlined: evaluate callbacks are serialized and cannot close
      // over Node-side module scope. Same seed every trip → identical walk.
      let seed = 0x5eed;
      const rand = (): number => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      for (let j = 0; j < 12; j++) {
        // Rejection-sample every jump ≥5,000 px away from the anchor: the final
        // anchor write then always carries a delta above one viewport height and
        // takes the memoryless PROPORTIONAL branch, no matter how rAF coalescing
        // grouped the intermediate events. Do not simplify this away — a jump
        // that lands near the anchor would put the last write on the
        // path-dependent LINEAR branch and break trip-to-trip determinism.
        let pos: number;
        do {
          pos = 1 + Math.floor(rand() * (maxScroll - 2));
        } while (Math.abs(pos - anchor) < 5000);
        el.scrollTop = pos;
        await sleep(40 + Math.floor(rand() * 41));
      }
      el.scrollTop = anchor;
    },
    { hostId: BIG_TABLE_HOST_ID, anchor, maxScroll },
  );
}

test('1.6M rows: repeated seeded scroll storms settle to identical, correct rows', async ({
  page,
}) => {
  test.setTimeout(360_000);
  await mountBigTable(page, { rows: N_LARGE });

  // Pin the anchor and jump range once, from settled post-mount geometry —
  // every trip then targets byte-identical pixel positions.
  const { anchor, maxScroll } = await page.evaluate((hostId) => {
    const el = document.querySelector(`#${hostId} .dt-body-scroll`)!;
    const maxScroll = el.scrollHeight - el.clientHeight;
    return { anchor: Math.round(0.37 * maxScroll), maxScroll };
  }, BIG_TABLE_HOST_ID);

  const snapshots: VisibleRow[][] = [];
  for (let trip = 0; trip < TRIPS; trip++) {
    await runWalkToAnchor(page, anchor, maxScroll);
    await waitForRowsResolved(page);
    snapshots.push(await readVisibleRows(page));
  }

  // Every trip must settle on the exact same rendered state…
  for (let trip = 1; trip < TRIPS; trip++) {
    expect(snapshots[trip]).toEqual(snapshots[0]);
  }

  // …and that state must be RIGHT, not merely repeatable: a stale range
  // replayed identically on every trip ("deterministically wrong") fails here.
  const settled = snapshots[0]!;
  expect(settled.length).toBeGreaterThan(0);
  for (let i = 1; i < settled.length; i++) {
    expect(settled[i]!.index).toBe(settled[i - 1]!.index + 1);
  }
  for (const row of settled) {
    expect(row.rowid).toBe(row.index);
    expect(row.cells[GRP_CELL]).toBe(expectedGrp(row.index));
  }
  // Plausibility band: the anchor sits at 37% of the scroll range, so the
  // settled window must sit near 37% of the rows (rules out a degenerate
  // always-at-top pass; the proportional mapping's skew is ~tens of rows).
  expect(Math.abs(settled[0]!.index - ANCHOR_FRACTION * N_LARGE)).toBeLessThanOrEqual(
    ANCHOR_TOLERANCE_ROWS,
  );
});

test('200K rows: rows stay self-consistent mid-storm, and sorted mode is deterministic', async ({
  page,
}) => {
  test.setTimeout(360_000);
  await mountBigTable(page, { rows: N_STORM });

  await test.step('storm: no rendered row ever contradicts its claimed index', async () => {
    await installRowInvariantProbe(page);

    // ~8 s storm: 500 steps at ~16 ms — bursts of ±400 px, direction
    // reversals, and a teleport roughly every ~300 ms (every 19th step).
    // Ends on a fixed landing so the storm never finishes mid-teleport.
    await page.evaluate(async (hostId) => {
      const el = document.querySelector(`#${hostId} .dt-body-scroll`)!;
      const maxScroll = el.scrollHeight - el.clientHeight;

      let seed = 0xbeef;
      const rand = (): number => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      let direction = 1;
      for (let i = 0; i < 500; i++) {
        if (i % 19 === 18) {
          el.scrollTop = Math.floor(rand() * maxScroll);
        } else {
          if (rand() < 0.08) direction = -direction;
          el.scrollTop = Math.max(0, Math.min(maxScroll, el.scrollTop + direction * 400));
        }
        await sleep(16);
      }
      el.scrollTop = Math.round(0.5 * maxScroll);
    }, BIG_TABLE_HOST_ID);

    await waitForRowsResolved(page);
    // readViolations also tears the probe down — it must run before the sort
    // step below, where `data-row-id === data-row-index` stops being an
    // invariant by design.
    const violations = await readViolations(page);
    if (violations.length > 0) {
      console.log('probe violations:', JSON.stringify(violations, null, 2));
    }
    expect(violations).toEqual([]);
  });

  await test.step('sorted mode: anchor-return snapshots are identical', async () => {
    await page
      .locator(`#${BIG_TABLE_HOST_ID} .dt-col-header[data-column="grp"] .dt-col-sort-btn`)
      .click();
    // aria-sort flips synchronously with the state change; the wait is
    // belt-and-suspenders against event-delivery latency.
    await page.waitForFunction(
      (hostId) =>
        document
          .querySelector(`#${hostId} .dt-col-header[data-column="grp"]`)
          ?.getAttribute('aria-sort') === 'ascending',
      BIG_TABLE_HOST_ID,
      { timeout: 15_000 },
    );
    await waitForRowsResolved(page);

    // Pin both trip positions once (see runWalkToAnchor's rationale).
    const targets = await page.evaluate((hostId) => {
      const el = document.querySelector(`#${hostId} .dt-body-scroll`)!;
      const maxScroll = el.scrollHeight - el.clientHeight;
      return { away: Math.round(0.8 * maxScroll), anchor: Math.round(0.37 * maxScroll) };
    }, BIG_TABLE_HOST_ID);

    const sortedSnapshots: VisibleRow[][] = [];
    for (let trip = 0; trip < 2; trip++) {
      await page.evaluate(
        async ({ hostId, away, anchor }) => {
          const el = document.querySelector(`#${hostId} .dt-body-scroll`)!;
          const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
          el.scrollTop = away;
          await sleep(60);
          el.scrollTop = anchor;
        },
        { hostId: BIG_TABLE_HOST_ID, ...targets },
      );
      await waitForRowsResolved(page);
      sortedSnapshots.push(await readVisibleRows(page));
    }

    // The rowid === index oracle is deliberately absent here: after the sort,
    // data-row-id keeps the file-order rowid. Deep equality still pins every
    // rowid value, which is exactly what proves the ORDER BY grp +
    // `"__rowid__" ASC` tiebreaker serves a stable row set at equal offsets
    // across overlapping fetch windows.
    const sorted = sortedSnapshots[0]!;
    expect(sorted.length).toBeGreaterThan(0);
    expect(sortedSnapshots[1]).toEqual(sorted);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.index).toBe(sorted[i - 1]!.index + 1);
    }
  });
});
