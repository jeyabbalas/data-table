/**
 * Phase 3's acceptance test: the body renders a column *window*.
 *
 * Row virtualization already bounded the row axis; nothing bounded the column
 * axis, so a body row carried one cell per visible column no matter how many
 * a user could see. What this spec establishes, on a real browser against a
 * real DuckDB load:
 *
 *  - **The window is a function of the viewport.** Doubling the column count
 *    does not change how many cells a row renders. That is the property, and
 *    it is asserted by mounting two tiers of different widths and comparing.
 *  - **The extent never moves.** `scrollWidth` is identical at every stop of a
 *    full horizontal sweep, and `leftSpacer + rendered + rightSpacer` equals
 *    the published content width exactly. Spacer arithmetic that drifts would
 *    make the scrollbar walk out from under the thumb as the user drags it.
 *  - **Headers and cells still line up.** This is C2's alignment spike made
 *    permanent: paired by `data-column`, every rendered cell's left edge is
 *    within a pixel of its header's, at every offset. The spike measured
 *    0.000 px; a spacer off by one column's width would be 150.
 *
 * Deliberately a small custom tier rather than WIDE_CI: every fact here is
 * about the column axis, `tiers.smoke.spec.ts` already pays for one WIDE_CI
 * mount in the default suite, and a second would double its cost to re-prove
 * nothing about depth.
 */
import { expect, test } from '@playwright/test';

import { DT_BUDGET } from '../budgets';

import {
  installColumnInvariantProbe,
  mountTierTable,
  readBodyWindow,
  readColViolations,
  sweepHorizontal,
  waitForTierSettled,
  TIER_HOST_ID,
} from './helpers/wideTable';

const SEED = 23;
const ROWS = 2_000;

/** DuckDB boot plus two generated tiers. */
test.describe.configure({ timeout: 180_000 });

test('the rendered window is a function of the viewport, not the column count', async ({
  page,
}) => {
  const measured: Array<{ cols: number; window: number; cells: number; rows: number }> = [];

  for (const cols of [60, 300]) {
    await mountTierTable(page, { tier: 'custom', rows: ROWS, cols, seed: SEED, viz: false });
    await waitForTierSettled(page);

    const body = await readBodyWindow(page);
    expect(body.rowIndex, `${cols} columns: no data row painted`).toBeGreaterThanOrEqual(0);

    // The structural invariant, restated where a browser can see it:
    // `[P pinned][left spacer][W cells][right spacer]`.
    expect(body.pinnedCount).toBe(0);
    expect(body.columns).toHaveLength(body.windowSize);
    expect(body.childCount).toBe(body.windowSize + 2);
    expect(body.mismatchedRows, 'rows built for different windows').toBe(0);

    // A window, not the whole list.
    expect(body.windowSize, `${cols} columns rendered ${body.windowSize}`).toBeLessThan(cols);
    expect(body.windowSize).toBeLessThanOrEqual(DT_BUDGET.COLVIRT.WINDOW_COLUMNS_MAX);

    measured.push({
      cols,
      window: body.windowSize,
      cells: body.totalCells,
      rows: body.rowCount,
    });
  }

  console.log(`[column-window] ${JSON.stringify(measured)}`);

  // The claim of the phase: 5× the columns, same number of cells per row.
  const [narrow, wide] = measured;
  expect(wide!.window, 'window size must not scale with column count').toBe(narrow!.window);
  expect(wide!.cells).toBeLessThanOrEqual(DT_BUDGET.COLVIRT.BODY_CELLS_MAX);
});

test('scrolling moves the window without moving the extent', async ({ page }) => {
  await mountTierTable(page, { tier: 'custom', rows: ROWS, cols: 300, seed: SEED, viz: false });
  await waitForTierSettled(page);
  await installColumnInvariantProbe(page, SEED);

  const stops = await sweepHorizontal(page, [0, 0.25, 0.5, 0.75, 1]);
  const extent = stops[0]!.body.scrollWidth;
  const seenFirstColumns = new Set<string>();

  for (const stop of stops) {
    const where = `at scrollLeft ${stop.scrollLeft}`;
    const body = stop.body;
    expect(body.rowIndex, `${where}: no data row painted`).toBeGreaterThanOrEqual(0);

    // --- the extent is invariant ------------------------------------------
    // `.dt-body` and `.dt-header-row` both carry `min-width: fit-content`, so
    // the horizontal extent is `max(width spacer, the flex row's natural
    // overflow)` — which means the spacers are load-bearing for scroll
    // geometry, not just for looks. The C2 spike is what established that;
    // this is the assertion it earned.
    expect(body.scrollWidth, `${where}: scrollWidth moved`).toBe(extent);
    expect(body.leftSpacerPx + body.renderedWidthPx + body.rightSpacerPx, `${where}: spacers`).toBe(
      body.contentWidthPx,
    );
    expect(body.leftSpacerPx).toBeGreaterThanOrEqual(0);
    expect(body.rightSpacerPx).toBeGreaterThanOrEqual(0);

    // --- the window is bounded and consistent -----------------------------
    expect(body.mismatchedRows, `${where}: rows built for different windows`).toBe(0);
    expect(body.childCount).toBe(body.windowSize + body.pinnedCount + 2);
    expect(body.windowSize, `${where}: window size`).toBeLessThanOrEqual(
      DT_BUDGET.COLVIRT.WINDOW_COLUMNS_MAX,
    );
    expect(body.totalCells, `${where}: body cells`).toBeLessThanOrEqual(
      DT_BUDGET.COLVIRT.BODY_CELLS_MAX,
    );
    seenFirstColumns.add(body.columns[0]!);

    // --- the window covers what the user can see --------------------------
    // Frame-dependent, which is why it lives here and not in the rAF probe:
    // a render one frame behind the scroll offset is legitimate mid-scroll
    // and a violation at rest.
    const rendered = new Set(body.columns);
    const missing = stop.columns
      .filter((col) => col.fullyVisible)
      .map((col) => col.name)
      .filter((name) => !rendered.has(name));
    expect(missing, `${where}: fully visible columns absent from the body`).toEqual([]);

    // --- headers and cells agree ------------------------------------------
    expect(stop.alignment.length, `${where}: no columns to align`).toBeGreaterThan(0);
    const worst = stop.alignment.reduce((a, b) => (b.delta > a.delta ? b : a));
    expect(
      worst.delta,
      `${where}: ${worst.column} header x ${worst.headerX} vs cell x ${worst.cellX}`,
    ).toBeLessThanOrEqual(DT_BUDGET.COLVIRT.HEADER_BODY_ALIGN_PX);
    const widest = stop.alignment.reduce((a, b) => (b.widthDelta > a.widthDelta ? b : a));
    expect(widest.widthDelta, `${where}: ${widest.column} width`).toBeLessThanOrEqual(
      DT_BUDGET.COLVIRT.HEADER_BODY_ALIGN_PX,
    );
  }

  console.log(
    `[column-window] sweep ${JSON.stringify(
      stops.map((s) => ({
        at: s.at,
        first: s.body.columns[0],
        w: s.body.windowSize,
        cells: s.body.totalCells,
        rows: s.body.rowCount,
      })),
    )}`,
  );

  // The sweep actually moved the window — without this every assertion above
  // could be passing against one static position.
  expect(seenFirstColumns.size, `first rendered column across the sweep`).toBeGreaterThan(1);
  expect(stops[0]!.body.leftSpacerPx).toBe(0);
  expect(stops[stops.length - 1]!.body.rightSpacerPx).toBe(0);

  const violations = await readColViolations(page);
  expect(
    violations.slice(0, 5),
    `column oracle breaches: ${JSON.stringify(violations.slice(0, 5))}`,
  ).toHaveLength(DT_BUDGET.WIDE_CI.ORACLE_VIOLATIONS);
});

test('fractional column widths do not accumulate across a spacer', async ({ page }) => {
  // The negative control for D10 — quantizing declared widths to integers
  // before summing them. `setColumnWidth` does not round, and the mouse
  // resize path passes a fractional `clientX` under page zoom, so 150.3 is
  // reachable. Chrome snaps it to 150.296875 (its 1/64 px layout unit), which
  // leaves 0.003125 px of residue per column: invisible over the eight
  // columns the C2 spike could cover at 50 columns, and 3.1 px — triple the
  // tolerance — across the ~990 a left spacer covers at 1,000. Summing the
  // *rounded* width is what makes the spacer agree with the boxes it stands
  // in for; this is the test that would notice if it stopped.
  await mountTierTable(page, { tier: 'custom', rows: ROWS, cols: 300, seed: SEED, viz: false });
  await waitForTierSettled(page);

  await page.evaluate(() => {
    const table = (window as any).__t;
    const widths = new Map(table.state.columnWidths.get());
    for (const column of table.state.visibleColumns.get()) widths.set(column, 150.3);
    table.state.columnWidths.set(widths);
  });
  await waitForTierSettled(page);

  // 75 % and max, where the left spacer covers the most columns — the only
  // place a per-column residue is large enough to see.
  const stops = await sweepHorizontal(page, [0.75, 1]);
  for (const stop of stops) {
    const where = `at scrollLeft ${stop.scrollLeft}`;
    expect(stop.alignment.length, `${where}: no columns to align`).toBeGreaterThan(0);
    const worst = stop.alignment.reduce((a, b) => (b.delta > a.delta ? b : a));
    console.log(
      `[column-window] fractional ${where}: worst ${worst.delta.toFixed(4)} px ` +
        `at ${worst.column}, left spacer ${stop.body.leftSpacerPx}`,
    );
    expect(
      worst.delta,
      `${where}: ${worst.column} header x ${worst.headerX} vs cell x ${worst.cellX}`,
    ).toBeLessThanOrEqual(DT_BUDGET.COLVIRT.HEADER_BODY_ALIGN_PX);
    // Integers all the way through: the spacers are sums of rounded widths,
    // so they cannot be fractional however fractional the input was.
    expect(Number.isInteger(stop.body.leftSpacerPx), `${where}: left spacer`).toBe(true);
    expect(Number.isInteger(stop.body.rightSpacerPx), `${where}: right spacer`).toBe(true);
    expect(stop.body.leftSpacerPx + stop.body.renderedWidthPx + stop.body.rightSpacerPx).toBe(
      stop.body.contentWidthPx,
    );
  }
  expect(stops[0]!.body.leftSpacerPx, 'the sweep must reach a deep left spacer').toBeGreaterThan(
    10_000,
  );
});

test('a pinned column stays rendered wherever the window is', async ({ page }) => {
  // Pinned columns are sticky, so they are on screen at every offset and must
  // be rendered at every offset — outside the window, ahead of the left
  // spacer. Getting this wrong is invisible at scrollLeft 0 and blank
  // everywhere else.
  await mountTierTable(page, { tier: 'custom', rows: ROWS, cols: 120, seed: SEED, viz: false });
  await waitForTierSettled(page);

  await page.evaluate(() => {
    const table = (window as any).__t;
    table.actions.toggleColumnPin('col_0');
  });
  await waitForTierSettled(page);

  await page.evaluate((hostId) => {
    const el = document.querySelector(`#${hostId} .dt-body-scroll`) as HTMLElement;
    el.scrollLeft = el.scrollWidth - el.clientWidth;
  }, TIER_HOST_ID);
  await waitForTierSettled(page);

  const body = await readBodyWindow(page);
  expect(body.pinnedCount).toBe(1);
  expect(body.columns[0]).toBe('col_0');
  expect(body.columns).not.toContain('col_1');
  expect(body.childCount).toBe(1 + body.windowSize + 2);
  expect(body.leftSpacerPx).toBeGreaterThan(0);
  expect(body.leftSpacerPx + body.renderedWidthPx + body.rightSpacerPx).toBe(body.contentWidthPx);

  const pinnedIsSticky = await page.evaluate((hostId) => {
    const cell = document.querySelector(
      `#${hostId} .dt-body .dt-cell[data-column="col_0"]`,
    ) as HTMLElement;
    return { position: getComputedStyle(cell).position, left: cell.style.left };
  }, TIER_HOST_ID);
  expect(pinnedIsSticky.position).toBe('sticky');
  expect(pinnedIsSticky.left).toBe('0px');
});
