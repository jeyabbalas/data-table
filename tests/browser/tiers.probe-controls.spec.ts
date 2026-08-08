/**
 * Negative controls for the tier oracles — the phase's own acceptance test
 * for its instruments.
 *
 * A probe that cannot fail proves nothing, and "0 violations" from a
 * silently broken probe reads exactly like "0 violations" from a correct
 * table. So: corrupt one rendered thing at a time and require the probe to
 * notice, once, with the right verdict.
 *
 * Runs in the default suite on a deliberately tiny tier (40 × 500) — this
 * guards the measuring apparatus every later phase leans on, so it must be
 * cheap enough never to be skipped.
 *
 * The probe is installed `manual: true` (no MutationObserver, no rAF loop)
 * and `exhaustive: true` (every rendered cell, not a sample), so a single
 * corruption is found with certainty and one pass yields exactly one
 * violation. That is also the invariant the sampling mode relies on to
 * stay bounded: at most one violation per pass, capped at 50 passes.
 */
import { expect, test } from '@playwright/test';

import {
  installListenerCensus,
  installObserverCensus,
  readListenerCensus,
  readObserverCensus,
  readSubscriberCounts,
} from './helpers/metrics';
import {
  installColumnInvariantProbe,
  mountTierTable,
  readColViolations,
  runColumnProbePass,
  waitForTierSettled,
  TIER_HOST_ID,
} from './helpers/wideTable';

const SEED = 11;

test.describe.configure({ timeout: 120_000 });

/** Mutate the page, run exactly one probe pass, and report what it caught. */
async function corruptAndProbe(
  page: import('@playwright/test').Page,
  corrupt: (hostId: string) => void,
): Promise<{ kind: string; detail: string } | null> {
  await page.evaluate(corrupt, TIER_HOST_ID);
  await runColumnProbePass(page);
  const found = await page.evaluate(() => {
    const w = window as unknown as { __dtColViolations?: Array<{ kind: string; detail: string }> };
    // `splice`, not reassignment: the probe's `validate` closes over the
    // original array, so swapping in a fresh one would silently send every
    // later violation somewhere nothing reads.
    return w.__dtColViolations?.splice(0) ?? [];
  });
  expect(found.length, `expected exactly one violation, got ${JSON.stringify(found)}`).toBe(1);
  return found[0] ?? null;
}

test('the column and row oracles detect exactly the corruption they are given', async ({
  page,
}) => {
  await mountTierTable(page, { tier: 'custom', rows: 500, cols: 40, seed: SEED, viz: false });
  await waitForTierSettled(page);
  await installColumnInvariantProbe(page, SEED, { exhaustive: true, manual: true });

  // Baseline: a correct table survives an exhaustive pass with nothing to
  // report. Without this, every assertion below could be passing for the
  // wrong reason.
  expect(await runColumnProbePass(page)).toBe(0);

  // --- cell oracle -------------------------------------------------------
  const cell = await corruptAndProbe(page, (hostId) => {
    const el = document.querySelector(`#${hostId} .dt-cell[data-column="col_0"]`)!;
    (el as HTMLElement).dataset['dtOriginal'] = el.textContent ?? '';
    el.textContent = 'not-the-oracle-value';
  });
  expect(cell?.kind).toBe('cell');
  expect(cell?.detail).toContain('not-the-oracle-value');

  await page.evaluate((hostId) => {
    const el = document.querySelector(`#${hostId} .dt-cell[data-column="col_0"]`) as HTMLElement;
    el.textContent = el.dataset['dtOriginal'] ?? '';
  }, TIER_HOST_ID);
  expect(await runColumnProbePass(page)).toBe(0);

  // --- header sequence ---------------------------------------------------
  const sequence = await corruptAndProbe(page, (hostId) => {
    const el = document.querySelector(`#${hostId} .dt-col-header[data-column="col_3"]`)!;
    el.setAttribute('data-column', 'col_999');
  });
  expect(sequence?.kind).toBe('sequence');

  await page.evaluate((hostId) => {
    document
      .querySelector(`#${hostId} .dt-col-header[data-column="col_999"]`)!
      .setAttribute('data-column', 'col_3');
  }, TIER_HOST_ID);
  expect(await runColumnProbePass(page)).toBe(0);

  // --- aria-colindex -----------------------------------------------------
  // Stash the live value rather than hard-coding one: `columnOrder`
  // includes the injected `__rowid__`, so the presentation index of
  // `col_5` is not 6, and a wrong "restore" would leave the probe
  // legitimately unhappy and look like a probe bug.
  const colindex = await corruptAndProbe(page, (hostId) => {
    const el = document.querySelector(
      `#${hostId} .dt-col-header[data-column="col_5"]`,
    ) as HTMLElement;
    el.dataset['dtOriginal'] = el.getAttribute('aria-colindex') ?? '';
    el.setAttribute('aria-colindex', '99');
  });
  expect(colindex?.kind).toBe('colindex');
  expect(colindex?.detail).toContain('col_5');

  await page.evaluate((hostId) => {
    const el = document.querySelector(
      `#${hostId} .dt-col-header[data-column="col_5"]`,
    ) as HTMLElement;
    el.setAttribute('aria-colindex', el.dataset['dtOriginal']!);
  }, TIER_HOST_ID);
  expect(await runColumnProbePass(page)).toBe(0);

  // --- row oracle --------------------------------------------------------
  const rowid = await corruptAndProbe(page, (hostId) => {
    const row = document.querySelector(`#${hostId} .dt-body .dt-row[data-row-id]`)!;
    row.setAttribute('data-row-id', '424242');
  });
  expect(rowid?.kind).toBe('rowid');
  expect(rowid?.detail).toContain('424242');

  await page.evaluate((hostId) => {
    const row = document.querySelector(`#${hostId} .dt-body .dt-row[data-row-id="424242"]`)!;
    row.setAttribute('data-row-id', row.getAttribute('data-row-index')!);
  }, TIER_HOST_ID);
  expect(await runColumnProbePass(page)).toBe(0);

  // Teardown leaves nothing behind for the next install.
  expect(await readColViolations(page)).toEqual([]);
});

test('the listener, observer, and subscriber censuses survive a real mount', async ({ page }) => {
  // The censuses install through `page.addInitScript`, which Playwright
  // compiles before injecting. That transpile is a real constraint and it
  // has already bitten once: a `#private` field in the observer wrapper
  // lowered to a Babel helper that never reached the page, so
  // `new ResizeObserver` threw inside `new TableContainer` and every
  // gated tier failed at mount. Nothing in the default suite noticed,
  // because nothing in the default suite installed a census.
  //
  // Hence this: the cheapest possible tier, asserting only that each
  // census returns live, plausible numbers from a table that really
  // mounted. It is a syntax-survives-the-transpile test as much as a
  // counting test.
  await installListenerCensus(page);
  await installObserverCensus(page);

  await mountTierTable(page, { tier: 'custom', rows: 200, cols: 8, seed: SEED, viz: false });
  await waitForTierSettled(page);

  const observers = await readObserverCensus(page);
  // One ResizeObserver per column header plus the container's own; the
  // exact figure is a rendering detail, "more than zero and no more than
  // it created" is the invariant.
  expect(observers.created.resize, 'ResizeObservers ever constructed').toBeGreaterThan(0);
  expect(observers.resize, 'live ResizeObservers').toBeGreaterThan(0);
  expect(observers.resize).toBeLessThanOrEqual(observers.created.resize);
  expect(observers.mutation).toBeLessThanOrEqual(observers.created.mutation);

  const listeners = await readListenerCensus(page);
  expect(listeners.added, 'addEventListener calls').toBeGreaterThan(0);
  expect(listeners.net['scroll'], 'net scroll listeners').toBeGreaterThan(0);
  // Net counts are added-minus-removed, so a removal the wrapper missed
  // would show up here as a negative.
  for (const [type, net] of Object.entries(listeners.net)) {
    expect(net, `net listeners for "${type}"`).toBeGreaterThanOrEqual(0);
  }

  const subscribers = await readSubscriberCounts(page);
  expect(Object.keys(subscribers).length, 'signals with subscriberCount()').toBeGreaterThan(0);
  expect(subscribers['visibleColumns'], 'visibleColumns subscribers').toBeGreaterThan(0);
});
