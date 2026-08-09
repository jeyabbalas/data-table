/**
 * What one `ColumnHeader` costs to mount and unmount, measured at WIDE.
 *
 * **This is a go/no-go measurement, not a micro-benchmark.** Header column
 * windowing mounts and destroys headers at scroll rate, so the phase's mount
 * strategy hinges on one number: does a full window's worth of headers
 * construct, append, lay out and tear down inside a single frame? Phase 4 §4.2
 * fixes the target at **~16 ms for a full-window remount** — with a ~45-header
 * window that is ≈0.35 ms per header. Under it, plain `new ColumnHeader(...)`
 * per mount ships as-is. Over it, the fallback is template cloning: one inert
 * header, `cloneNode(true)` per mount, patch the text / attributes / listeners
 * that actually differ (the SVG-heavy action buttons are byte-identical across
 * columns). Over budget *even cloned*, §4.7 splits the mount across two rAF
 * slices — structure first, action panel next frame — and keeps windowing.
 *
 * Measured **at WIDE with 1,000 headers already in the document**, not against
 * an empty page, because that is the environment the decision is about: style
 * recalculation, the container queries on `.dt-col-header`, and the signal
 * subscription lists all scale with what is already mounted. A number taken on
 * a bare page would flatter the plain-construction path exactly where it
 * matters least.
 *
 * **Gated, never in CI** (`RUN_BROWSER_PERF=1`), for the reasons
 * `tiers.full.spec.ts` sets out at length: a wall-clock assertion on a shared
 * runner is a coin flip, and generating WIDE costs tens of seconds and
 * gigabytes. Run it with:
 *
 * ```bash
 * RUN_BROWSER_PERF=1 npx playwright test tests/browser/header-mount-cost.spec.ts
 * ```
 */
import { expect, test, type Page } from '@playwright/test';

import { TIERS } from '../fixtures/tiers';

import {
  TIER_HOST_ID,
  mountTierTable,
  waitForTierSettled,
  wideMountOptions,
} from './helpers/wideTable';

const RUN = process.env['RUN_BROWSER_PERF'] === '1';

/**
 * Headers built per sample — a full window at WIDE, per §4.2.
 *
 * The doc's estimate; the measured window at the pinned 1280 × 720 viewport is
 * smaller (Phase 3's body figures put it near 17 at rest). Measuring the larger
 * number is the conservative direction: it is the count the 16 ms frame budget
 * is quoted against, and a strategy that clears it clears the real window too.
 */
const WINDOW_HEADERS = 45;

/** Samples taken; the verdict is the median, so an unlucky GC cannot set it. */
const SAMPLES = 7;

/** §4.2's frame budget for one full-window remount, in ms. */
const FRAME_BUDGET_MS = 16;

interface MountCost {
  /** Per-sample wall clock for constructing + appending + laying out a window. */
  mountMs: number[];
  /** Per-sample wall clock for destroying that window. */
  unmountMs: number[];
  /** Headers built per sample. */
  perSample: number;
  /** Headers already in the document when the measurement ran. */
  standingHeaders: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Construct / append / lay out / destroy `perSample` headers, `samples` times,
 * inside the live header row.
 *
 * Inside the live row and not a detached node: an appended-but-unlaid-out
 * element costs almost nothing, and "almost nothing" is the wrong answer to a
 * question about frames. Forcing `offsetWidth` after the appends is what pulls
 * style recalc and layout inside the mark pair, so the measurement covers what
 * the browser would actually owe on a scroll frame. The headers are destroyed
 * before the next sample, so the row is left exactly as it was found.
 */
async function measureMountCost(
  page: Page,
  perSample: number,
  samples: number,
): Promise<MountCost> {
  return page.evaluate(
    async ({ hostId, perSample: n, samples: k }) => {
      const advanced = (await import(
        /* @vite-ignore */ '/data-table/src/advanced.ts'
      )) as typeof import('../../src/advanced');
      const table = (window as unknown as { __t: import('../../src/index').DataTable }).__t;

      const host = document.getElementById(hostId)!;
      const headerRow = host.querySelector<HTMLElement>('.dt-header-row')!;
      const standingHeaders = headerRow.querySelectorAll('[role="columnheader"]').length;

      const schema = table.state.schema.get();
      const visible = table.state.visibleColumns.get();
      // Real columns from the middle of the table, so the sample is not the
      // few leading columns every other measurement already warms.
      const offset = Math.max(0, Math.floor(visible.length / 2) - n);
      const byName = new Map(schema.map((col) => [col.name, col]));
      const columns = visible
        .slice(offset, offset + n)
        .map((name) => byName.get(name))
        .filter((col): col is NonNullable<typeof col> => col !== undefined);

      const mountMs: number[] = [];
      const unmountMs: number[] = [];

      for (let sample = 0; sample < k; sample++) {
        // One frame between samples: without it the samples chain inside a
        // single long task and each one inherits the previous one's dirty
        // layout tree.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

        const built: InstanceType<typeof advanced.ColumnHeader>[] = [];
        const t0 = performance.now();
        for (const column of columns) {
          const header = new advanced.ColumnHeader(column, table.state, table.actions, {
            classPrefix: 'dt',
            annotations: table.annotations,
          });
          headerRow.appendChild(header.getElement());
          built.push(header);
        }
        void headerRow.offsetWidth;
        mountMs.push(performance.now() - t0);

        const t1 = performance.now();
        for (const header of built) header.destroy();
        void headerRow.offsetWidth;
        unmountMs.push(performance.now() - t1);
      }

      return { mountMs, unmountMs, perSample: columns.length, standingHeaders };
    },
    { hostId: TIER_HOST_ID, perSample, samples },
  );
}

test.describe('header mount cost at WIDE', () => {
  test.skip(!RUN, 'set RUN_BROWSER_PERF=1 to run the header mount-cost measurement');
  test.setTimeout(600_000);

  test('a full window of headers mounts within one frame', async ({ page }) => {
    await mountTierTable(page, wideMountOptions(false));
    await waitForTierSettled(page);

    const cost = await measureMountCost(page, WINDOW_HEADERS, SAMPLES);

    const mount = median(cost.mountMs);
    const unmount = median(cost.unmountMs);
    const perHeader = mount / cost.perSample;

    // The record the phase's STATUS.md handoff quotes. Logged whatever the
    // verdict — §4.2 requires the number either way, not only on a pass.
    console.log(
      `[header-mount-cost] ${cost.perSample} headers × ${SAMPLES} samples, ` +
        `${cost.standingHeaders} already standing (${TIERS.wide.cols}-column tier)\n` +
        `  mount   median ${mount.toFixed(2)} ms  (${perHeader.toFixed(3)} ms/header)  ` +
        `samples [${cost.mountMs.map((v) => v.toFixed(1)).join(', ')}]\n` +
        `  unmount median ${unmount.toFixed(2)} ms  ` +
        `(${(unmount / cost.perSample).toFixed(3)} ms/header)  ` +
        `samples [${cost.unmountMs.map((v) => v.toFixed(1)).join(', ')}]\n` +
        `  verdict: ${mount <= FRAME_BUDGET_MS ? 'PLAIN CONSTRUCTION' : 'TEMPLATE CLONING'} ` +
        `(§4.2 budget ${FRAME_BUDGET_MS} ms)`,
    );

    expect(cost.perSample).toBe(WINDOW_HEADERS);
    expect(mount, `${cost.perSample}-header mount`).toBeLessThan(FRAME_BUDGET_MS);
    // Unmount is on the same scroll frame as the mount it pairs with, so it
    // owes the same budget. It is measured separately because the two have
    // completely different fixes if one of them is what blows the frame.
    expect(unmount, `${cost.perSample}-header unmount`).toBeLessThan(FRAME_BUDGET_MS);
  });
});
