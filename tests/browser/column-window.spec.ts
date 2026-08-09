/**
 * Phases 3 and 4's acceptance test: **both** grid rows render a column
 * *window*, and they render the same one.
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
 *  - **The header row is the same window, not a second one.** Phase 4 gave the
 *    header row the body's shape — a pinned prefix, two `role="presentation"`
 *    spacers, and a run of columns near the viewport — so the two rows are
 *    asserted *equal*, not merely each bounded. A header row that windowed to
 *    a different offset than the body would keep every alignment number below
 *    a pixel and still put the wrong labels over the data.
 *  - **`aria-colindex` ascends in DOM order across the header row.** ARIA says
 *    MUST, and a windowed row is exactly where it breaks: the values are
 *    positions in the whole table, so they are sparse either side of a spacer
 *    and the *ordering* is the only part that survives as an invariant.
 *
 * Deliberately a small custom tier rather than WIDE_CI: every fact here is
 * about the column axis, `tiers.smoke.spec.ts` already pays for one WIDE_CI
 * mount in the default suite, and a second would double its cost to re-prove
 * nothing about depth. The 1,000-column repeat is at the bottom, behind
 * `RUN_BROWSER_PERF=1`, following `viz-lazy.spec.ts`.
 */
import { expect, test } from '@playwright/test';

import { DT_BUDGET } from '../budgets';
import { TIERS } from '../fixtures/tiers';

import { installObserverCensus, readObserverCensus, readSubscriberCounts } from './helpers/metrics';
import {
  installColumnInvariantProbe,
  mountTierTable,
  readBodyWindow,
  readColViolations,
  readHeaderWindow,
  sweepHorizontal,
  waitForTierSettled,
  wideMountOptions,
  TIER_HOST_ID,
  type SweepStop,
} from './helpers/wideTable';

const SEED = 23;
const ROWS = 2_000;

/**
 * Every header-axis fact that has to hold at one settled scroll offset.
 *
 * Factored out because it is asserted at five stops of the default-tier sweep
 * and again at three stops of the gated 1,000-column one, and the whole claim
 * of the phase is that it is the *same* set of facts at both widths. Two
 * copies would be two places for that to stop being true.
 */
function expectHeaderWindowIntact(stop: SweepStop, where: string): void {
  const header = stop.header;

  // --- the row is `[P pinned][left spacer][W headers][right spacer]` -------
  // Spacers located by `data-col-spacer` and checked by role, never by child
  // index: their *position* is what is being asserted, so finding them by
  // position would assert nothing.
  expect(header.leftSpacerAt, `${where}: left spacer follows the pinned run`).toBe(
    header.pinnedCount,
  );
  expect(header.rightSpacerAt, `${where}: right spacer closes the row`).toBe(header.childCount - 1);
  expect(header.childCount, `${where}: row children`).toBe(
    header.pinnedCount + header.windowSize + 2,
  );
  expect(header.spacerRoles, `${where}: spacer roles`).toEqual(['presentation', 'presentation']);
  expect(header.columns, `${where}: headers outside the two spacers`).toHaveLength(
    header.pinnedCount + header.windowSize,
  );

  // --- it is a window ------------------------------------------------------
  expect(header.columns.length, `${where}: mounted headers`).toBeGreaterThan(0);
  expect(header.columns.length, `${where}: mounted headers`).toBeLessThanOrEqual(
    DT_BUDGET.COLVIRT.HEADERS_RENDERED_MAX,
  );
  expect(header.columns.length, `${where}: mounted headers`).toBeLessThan(header.visibleCount);

  // --- spacer arithmetic ---------------------------------------------------
  // The same identity the body owes, on the row that publishes the extent:
  // `.dt-header-row`'s `min-width` *is* the horizontal scroll extent, so a
  // spacer sum that disagrees with it makes the scrollbar lie.
  expect(header.leftSpacerPx, `${where}: left spacer`).toBeGreaterThanOrEqual(0);
  expect(header.rightSpacerPx, `${where}: right spacer`).toBeGreaterThanOrEqual(0);
  expect(
    header.leftSpacerPx + header.renderedWidthPx + header.rightSpacerPx,
    `${where}: header spacers`,
  ).toBe(header.contentWidthPx);

  // --- aria-colindex ascends in DOM order ----------------------------------
  // An ARIA MUST, and the first thing a windowing bug breaks: mount the run
  // out of order, or place a header on the wrong side of a spacer, and this
  // is what a screen reader notices before a user does.
  const nonAscending = header.colIndices.filter(
    (index, i) =>
      !Number.isFinite(index) || index < 1 || (i > 0 && index <= header.colIndices[i - 1]!),
  );
  expect(nonAscending, `${where}: aria-colindex ${JSON.stringify(header.colIndices)}`).toEqual([]);

  // --- the window covers everything the user can see -----------------------
  // Phrased over *pixels*, not over the mounted set, and that is the point: a
  // column with no header is invisible to any check written over the headers
  // that exist. A run that tiles without a gap and reaches past both viewport
  // edges cannot have skipped a column between them.
  expect(header.maxGapPx, `${where}: gap between mounted headers`).toBeLessThanOrEqual(
    DT_BUDGET.COLVIRT.HEADER_BODY_ALIGN_PX,
  );
  expect(header.windowStart, `${where}: window start`).toBeGreaterThanOrEqual(header.pinnedCount);
  if (header.windowStart > header.pinnedCount) {
    expect(header.windowLeftPx, `${where}: window starts inside the viewport`).toBeLessThanOrEqual(
      header.viewportLeft + 0.5,
    );
  }
  if (header.windowEnd < header.visibleCount) {
    expect(
      header.windowRightPx,
      `${where}: window ends inside the viewport`,
    ).toBeGreaterThanOrEqual(header.viewportRight - 0.5);
  }

  // --- and it is the body's window, not a second one -----------------------
  // Equality, not "both bounded". It holds here because nothing in these
  // sweeps holds the keyboard cursor or DOM focus: `extendWindowToAnchors` is
  // the one thing that legitimately makes the header window *wider* than the
  // body's, and `header-anchors.spec.ts` is where that case is exercised. A
  // spec that focuses a header and then calls this would be asserting the
  // wrong thing, not finding a bug.
  expect(header.columns, `${where}: header row vs body row`).toEqual(stop.body.columns);
  expect(header.pinnedCount, `${where}: pinned prefix`).toBe(stop.body.pinnedCount);
  expect(header.leftSpacerPx, `${where}: left spacer vs body`).toBe(stop.body.leftSpacerPx);
  expect(header.rightSpacerPx, `${where}: right spacer vs body`).toBe(stop.body.rightSpacerPx);

  // --- header/cell alignment ----------------------------------------------
  // `readAlignment` pairs by `data-column` and drops what it cannot pair, so
  // the *count* is the assertion that no rendered cell is orphaned.
  expect(stop.alignment.length, `${where}: cells with no header to align to`).toBe(
    stop.body.columns.length,
  );
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

/** One greppable line per sweep, in the style the body-axis tests use. */
function reportHeaderSweep(label: string, stops: readonly SweepStop[]): void {
  console.log(
    `[column-window] ${label} header sweep ${JSON.stringify(
      stops.map((s) => ({
        at: s.at,
        first: s.header.columns[0],
        headers: s.header.columns.length,
        pinned: s.header.pinnedCount,
        children: s.header.childCount,
        leftPx: s.header.leftSpacerPx,
        rightPx: s.header.rightSpacerPx,
        bodyWin: s.body.windowSize,
      })),
    )}`,
  );
}

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

// =========================================
// The header axis — Phase 4
// =========================================

test('the header row mounts a window, not the column list', async ({ page }) => {
  const measured: Array<{ cols: number; headers: number; children: number }> = [];

  for (const cols of [60, 300]) {
    await mountTierTable(page, { tier: 'custom', rows: ROWS, cols, seed: SEED, viz: false });
    await waitForTierSettled(page);

    const header = await readHeaderWindow(page);
    expect(header.visibleCount, `${cols} columns: visibleColumns`).toBe(cols);
    // `[0 pinned][left spacer][W headers][right spacer]` — nothing is pinned
    // here, so the left spacer is the row's first child.
    expect(header.pinnedCount).toBe(0);
    expect(header.leftSpacerAt).toBe(0);
    expect(header.rightSpacerAt).toBe(header.childCount - 1);
    expect(header.childCount).toBe(header.windowSize + 2);
    expect(header.spacerRoles).toEqual(['presentation', 'presentation']);

    // A window, not the whole list — including at 60 columns, where the whole
    // list would still be only four screenfuls.
    expect(header.columns.length, `${cols} columns mounted ${header.columns.length}`).toBeLessThan(
      cols,
    );
    expect(header.columns.length).toBeLessThanOrEqual(DT_BUDGET.COLVIRT.HEADERS_RENDERED_MAX);

    measured.push({ cols, headers: header.columns.length, children: header.childCount });
  }

  console.log(`[column-window] header rest ${JSON.stringify(measured)}`);

  // The claim of the phase, stated on the header axis: 5× the columns, the
  // same number of headers in the document.
  const [narrow, wide] = measured;
  expect(wide!.headers, 'mounted headers must not scale with column count').toBe(narrow!.headers);
});

test('the header window follows the scroll and stays a window', async ({ page }) => {
  await mountTierTable(page, { tier: 'custom', rows: ROWS, cols: 300, seed: SEED, viz: false });
  await waitForTierSettled(page);
  await installColumnInvariantProbe(page, SEED);

  const stops = await sweepHorizontal(page, [0, 0.25, 0.5, 0.75, 1]);
  const seenFirstHeaders = new Set<string>();

  for (const stop of stops) {
    expectHeaderWindowIntact(stop, `at scrollLeft ${stop.scrollLeft}`);
    seenFirstHeaders.add(stop.header.columns[0]!);
  }

  reportHeaderSweep('300 columns', stops);

  // The sweep actually moved the header window — without this every assertion
  // above could be passing against one static position.
  expect(seenFirstHeaders.size, 'first mounted header across the sweep').toBeGreaterThan(1);
  expect(stops[0]!.header.leftSpacerPx).toBe(0);
  expect(stops[stops.length - 1]!.header.rightSpacerPx).toBe(0);

  // The probe watched every frame in between, where a render one frame behind
  // the offset is legitimate — its `colindex` and `sequence` checks are the
  // mid-flight half of what the stops assert at rest.
  const violations = await readColViolations(page);
  expect(
    violations.slice(0, 5),
    `column oracle breaches: ${JSON.stringify(violations.slice(0, 5))}`,
  ).toHaveLength(DT_BUDGET.WIDE_CI.ORACLE_VIOLATIONS);
});

test('a pinned header stays mounted wherever the window is', async ({ page }) => {
  // The header-axis mirror of the pinned body test. Sticky headers are on
  // screen at every offset and must be mounted at every offset — ahead of the
  // left spacer, and carrying the lowest `aria-colindex` in the row, which is
  // what makes the ascending rule survive a pinned prefix at all.
  await mountTierTable(page, { tier: 'custom', rows: ROWS, cols: 120, seed: SEED, viz: false });
  await waitForTierSettled(page);

  await page.evaluate(() => {
    const table = (window as any).__t;
    table.actions.toggleColumnPin('col_0');
  });
  await waitForTierSettled(page);

  const [stop] = await sweepHorizontal(page, [1]);
  const header = stop!.header;
  console.log(
    `[column-window] header pinned ${JSON.stringify({
      columns: header.columns.slice(0, 3),
      pinned: header.pinnedCount,
      children: header.childCount,
      colIndices: header.colIndices.slice(0, 3),
    })}`,
  );

  expectHeaderWindowIntact(stop!, 'pinned, at scrollLeft max');
  expect(header.pinnedCount).toBe(1);
  expect(header.leftSpacerAt).toBe(1);
  expect(header.columns[0]).toBe('col_0');
  expect(header.columns).not.toContain('col_1');
  expect(header.leftSpacerPx).toBeGreaterThan(0);

  const pinnedIsSticky = await page.evaluate((hostId) => {
    const el = document.querySelector(
      `#${hostId} .dt-col-header[data-column="col_0"]`,
    ) as HTMLElement;
    return { position: getComputedStyle(el).position, colindex: el.getAttribute('aria-colindex') };
  }, TIER_HOST_ID);
  expect(pinnedIsSticky.position).toBe('sticky');
  expect(pinnedIsSticky.colindex).toBe('1');
});

// =========================================
// Gated: the same claims at 1,000 columns
// =========================================

test.describe('WIDE — 1,000 columns', () => {
  test.skip(process.env['RUN_BROWSER_PERF'] !== '1', 'perf tier — set RUN_BROWSER_PERF=1');
  test.describe.configure({ timeout: 1_800_000 });

  test('the header window is the same size at 1,000 columns as at 300', async ({ page }) => {
    // Before the census patches any constructor — `addInitScript` cannot see
    // an observer built before the navigation it installs on.
    await installObserverCensus(page);
    await mountTierTable(page, wideMountOptions(false));
    await waitForTierSettled(page);

    const stops = await sweepHorizontal(page, [0, 0.5, 1]);
    for (const stop of stops) {
      expect(stop.header.visibleCount, 'visibleColumns at WIDE').toBe(TIERS.wide.cols);
      expectHeaderWindowIntact(stop, `WIDE at scrollLeft ${stop.scrollLeft}`);
    }
    reportHeaderSweep('1,000 columns', stops);

    const observers = await readObserverCensus(page);
    const subscribers = await readSubscriberCounts(page);
    const mounted = stops.map((stop) => stop.header.columns.length);
    console.log(
      `[column-window] WIDE ${JSON.stringify({
        mountedHeaders: mounted,
        ro: observers.resize,
        mo: observers.mutation,
        io: observers.intersection,
        sortSubscribers: subscribers['sortColumns'],
        visibleColumnSubscribers: subscribers['visibleColumns'],
      })}`,
    );

    // 3.3× the columns of the default tier above, the same window.
    expect(Math.max(...mounted)).toBeLessThanOrEqual(DT_BUDGET.COLVIRT.HEADERS_RENDERED_MAX);
    expect(stops[0]!.header.leftSpacerPx).toBe(0);
    expect(stops[stops.length - 1]!.header.rightSpacerPx).toBe(0);

    // Nothing per header, and nothing per column: the gauges that used to
    // scale with the header row are constants now.
    expect(observers.resize, 'live ResizeObservers').toBeLessThanOrEqual(
      DT_BUDGET.COLVIRT.RESIZE_OBSERVERS_MAX,
    );
    expect(observers.mutation, 'live MutationObservers').toBeLessThanOrEqual(
      DT_BUDGET.COLVIRT.MUTATION_OBSERVERS_MAX,
    );
    expect(subscribers['sortColumns'], 'sortColumns subscribers').toBeLessThanOrEqual(
      DT_BUDGET.COLVIRT.SORT_SIGNAL_SUBSCRIBERS_MAX,
    );
  });
});
