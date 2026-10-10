/**
 * Annotations at scale, in a real browser: a 1,000-column table with some
 * 110K annotations and a million-row table with some 100K.
 *
 * An in-page oracle indexes the store (`getAll()` and the severity filter,
 * nothing the renderer uses) and checks every rendered row and cell, and
 * every header, shells included, against it: the three class families, the
 * severity each one falls back to, the count, and the native title, which a
 * cell gives up only while it shows a severity. The checks run after
 * scrolls, during and after wheel storms over pooled rows, after severity
 * toggles and after `clear()`.
 *
 * By default the specs assert counts: the store has one listener for the
 * grid, and a change far from the view writes nothing to the DOM. Timing
 * budgets, relative to the same table with no annotations, run only under
 * `RUN_ANNOTATION_PERF=1`.
 */

import { existsSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { BIG_TABLE_HOST_ID, mountBigTable, waitForRowsResolved } from './helpers/bigTable';
import { settle } from './helpers/demo';
import { HOST_ID, mountTable, wheelBy } from './helpers/table';

const PERF = process.env.RUN_ANNOTATION_PERF === '1';

/** What the oracle found: the first problems, how many, and how much it checked. */
interface AuditReport {
  problems: string[];
  problemCount: number;
  rows: number;
  cells: number;
  headers: number;
}

/** Timings of one table, in ms: a scroll step's median, the changes' means. */
interface Timings {
  scrollStep: number;
  /** Scroll steps that rendered a placeholder: they measure less than a render. */
  placeholderSteps: number;
  updateOnScreen: number;
  addOffScreen: number;
  severityToggle: number;
}

/** The page-side probe {@link installProbe} leaves on `window.__annot`. */
interface AnnotationProbe {
  /** Add `total` annotations, 90% cell, 9% row, 1% column, over `rows` rows and every column. */
  seed(options: { total: number; rows: number; seed: number }): number;
  /** How long the last {@link seed}'s `addMany` took, in ms. */
  lastSeedMs(): number;
  /** Check the rendered grid against the store. */
  audit(): AuditReport;
  /** Check every frame until {@link stopWatch}, against the store as it is now. */
  startWatch(): void;
  stopWatch(): { problems: string[]; frames: number; checkedFrames: number };
  /** The store's listeners. */
  listeners(): number;
  /**
   * Add a cell and a row annotation at `rowId`, far from the view, and count
   * the mutations under the table they cause, synchronously and a frame later.
   */
  offScreenMutations(rowId: number, column: string): Promise<number>;
  /** Put annotations on one cell, with messages long enough to make the popover scroll. */
  hotCell(rowId: number, column: string, perScope: number): void;
  /** Measure renders over the first of `rows` rows, and single changes. */
  timings(rows: number): Promise<Timings>;
  /** Count animation frames longer than 50 ms from now until {@link stopLongFrames}. */
  startLongFrames(): void;
  stopLongFrames(): number;
}

type ProbeWindow = { __annot: AnnotationProbe };

/**
 * Install the oracle and the measurements for the table on `window[tableKey]`
 * mounted in `#hostId`.
 */
async function installProbe(page: Page, tableKey: '__dt' | '__t', hostId: string): Promise<void> {
  await page.evaluate(
    ({ tableKey, hostId }) => {
      type Severity = 'error' | 'warning' | 'info';
      type Entry = { count: number; best: Severity | null };
      const w = window as unknown as Record<string, unknown>;
      const table = w[tableKey] as import('../../src/index').DataTable;
      const store = table.annotations;
      const host = document.getElementById(hostId)!;
      const SEVERITIES: Severity[] = ['error', 'warning', 'info'];
      const RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

      let index: {
        rows: Map<number, Entry>;
        columns: Map<string, Entry>;
        cells: Map<string, Entry>;
      } | null = null;
      const indexStore = () => {
        const filter = store.getSeverityFilter();
        const rows = new Map<number, Entry>();
        const columns = new Map<string, Entry>();
        const cells = new Map<string, Entry>();
        const count = <K>(map: Map<K, Entry>, key: K, severity: Severity) => {
          let entry = map.get(key);
          if (!entry) map.set(key, (entry = { count: 0, best: null }));
          entry.count++;
          if (filter[severity] && (entry.best === null || RANK[severity] < RANK[entry.best])) {
            entry.best = severity;
          }
        };
        for (const a of store.getAll()) {
          if (a.scope === 'row') count(rows, a.rowId, a.severity);
          else if (a.scope === 'column') count(columns, a.column, a.severity);
          else count(cells, `${a.rowId}\u0000${a.column}`, a.severity);
        }
        index = { rows, columns, cells };
        return index;
      };

      const checkFamily = (
        problems: string[],
        el: Element,
        label: string,
        marker: string,
        prefix: string,
        entry: Entry | undefined,
      ) => {
        const annotated = !!entry && entry.count > 0;
        if (el.classList.contains(marker) !== annotated) {
          problems.push(`${label}: ${marker} ${annotated ? 'missing' : 'present'}`);
        }
        for (const severity of SEVERITIES) {
          const has = el.classList.contains(prefix + severity);
          const wanted = annotated && entry!.best === severity;
          if (has !== wanted) {
            problems.push(`${label}: ${prefix}${severity} ${wanted ? 'missing' : 'present'}`);
          }
        }
      };
      const checkCount = (problems: string[], el: Element, label: string, total: number) => {
        const count = el.getAttribute('data-dt-annotation-count');
        const wanted = total > 0 ? String(total) : null;
        if (count !== wanted) problems.push(`${label}: count ${count}, want ${wanted}`);
      };

      const auditWith = (idx: NonNullable<typeof index>): AuditReport => {
        const problems: string[] = [];
        let rows = 0;
        let cells = 0;
        let headers = 0;
        for (const h of host.querySelectorAll('.dt-header-row > .dt-col-header[data-column]')) {
          headers++;
          const column = h.getAttribute('data-column')!;
          const entry = idx.columns.get(column);
          checkFamily(
            problems,
            h,
            `header ${column}`,
            'dt-col-header--annotated',
            'dt-col-header--annotation-',
            entry,
          );
          checkCount(problems, h, `header ${column}`, entry?.count ?? 0);
        }
        const popoverAnchor = document.querySelector('.dt-annotation-popover')?.id;
        for (const r of host.querySelectorAll('.dt-body .dt-row:not([data-placeholder])')) {
          const rowId = Number(r.getAttribute('data-row-id'));
          if (!Number.isFinite(rowId)) continue;
          rows++;
          const rowEntry = idx.rows.get(rowId);
          checkFamily(
            problems,
            r,
            `row ${rowId}`,
            'dt-row--annotated',
            'dt-row--annotation-',
            rowEntry,
          );
          for (const c of r.querySelectorAll(':scope > .dt-cell[data-column]')) {
            cells++;
            const column = c.getAttribute('data-column')!;
            const label = `cell ${rowId}/${column}`;
            const columnEntry = idx.columns.get(column);
            const cellEntry = idx.cells.get(`${rowId}\u0000${column}`);
            checkFamily(
              problems,
              c,
              label,
              'dt-cell--row-annotated',
              'dt-cell--row-annotation-',
              rowEntry,
            );
            checkFamily(
              problems,
              c,
              label,
              'dt-cell--col-annotated',
              'dt-cell--col-annotation-',
              columnEntry,
            );
            checkFamily(
              problems,
              c,
              label,
              'dt-cell--annotated',
              'dt-cell--annotation-',
              cellEntry,
            );
            checkCount(
              problems,
              c,
              label,
              (rowEntry?.count ?? 0) + (columnEntry?.count ?? 0) + (cellEntry?.count ?? 0),
            );
            if (c.classList.contains('dt-cell--pending')) continue;
            const shows = [rowEntry, columnEntry, cellEntry].some((e) => e && e.best !== null);
            const title = c.getAttribute('title');
            if (shows && title !== null) {
              problems.push(
                `${label}: title ${JSON.stringify(title)} on a cell showing a severity`,
              );
            }
            const native = c.classList.contains('dt-cell--null') ? '' : c.textContent;
            if (!shows && title !== native) {
              problems.push(
                `${label}: title ${JSON.stringify(title)}, want ${JSON.stringify(native)}`,
              );
            }
            const describedBy = c.getAttribute('aria-describedby');
            if (describedBy !== null && describedBy !== popoverAnchor) {
              problems.push(`${label}: aria-describedby ${describedBy}`);
            }
          }
        }
        return {
          problems: problems.slice(0, 25),
          problemCount: problems.length,
          rows,
          cells,
          headers,
        };
      };

      let longFrames: { observer: PerformanceObserver; count: number } | null = null;
      let seedMs = Number.NaN;
      let watch: {
        active: boolean;
        problems: string[];
        frames: number;
        checkedFrames: number;
      } | null = null;

      const median = (values: number[]): number => {
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
      };
      const nextFrame = () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const noPlaceholders = async () => {
        for (let i = 0; i < 600 && host.querySelector('[data-placeholder]'); i++) await nextFrame();
      };

      const probe: AnnotationProbe = {
        seed({ total, rows, seed }) {
          let s = seed >>> 0;
          // mulberry32: the same annotations on every run.
          const rand = () => {
            s = (s + 0x6d2b79f5) >>> 0;
            let t = s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
          const names = table.state.columnOrder.get().filter((c) => c !== '__rowid__');
          const anns: import('../../src/index').NewAnnotation[] = new Array(total);
          for (let i = 0; i < total; i++) {
            const r = rand();
            const severity = SEVERITIES[Math.floor(rand() * 3)]!;
            if (r < 0.9) {
              anns[i] = {
                scope: 'cell',
                rowId: Math.floor(rand() * rows),
                column: names[Math.floor(rand() * names.length)]!,
                severity,
                message: `cell annotation ${i}`,
              };
            } else if (r < 0.99) {
              anns[i] = {
                scope: 'row',
                rowId: Math.floor(rand() * rows),
                severity,
                message: `row annotation ${i}`,
              };
            } else {
              anns[i] = {
                scope: 'column',
                column: names[Math.floor(rand() * names.length)]!,
                severity,
                message: `column annotation ${i}`,
              };
            }
          }
          const t0 = performance.now();
          store.addMany(anns);
          seedMs = performance.now() - t0;
          index = null;
          return store.count();
        },
        lastSeedMs() {
          return seedMs;
        },
        audit() {
          return auditWith(indexStore());
        },
        startWatch() {
          const idx = indexStore();
          const state = { active: true, problems: [] as string[], frames: 0, checkedFrames: 0 };
          watch = state;
          const frame = () => {
            if (!state.active) return;
            state.frames++;
            // Every other frame: the check costs about as much as a render.
            if (state.frames % 2 === 0) {
              state.checkedFrames++;
              const report = auditWith(idx);
              for (const p of report.problems) {
                if (state.problems.length < 25) state.problems.push(`frame ${state.frames}: ${p}`);
              }
            }
            requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        },
        stopWatch() {
          const state = watch ?? { active: false, problems: [], frames: 0, checkedFrames: 0 };
          state.active = false;
          watch = null;
          return {
            problems: state.problems,
            frames: state.frames,
            checkedFrames: state.checkedFrames,
          };
        },
        listeners() {
          // The store's own registry: the grid's one listener is the
          // AnnotationOverlay's, which subscribes before app code can.
          const registry = (store as unknown as { listeners?: unknown }).listeners;
          if (registry instanceof Set || registry instanceof Map) return registry.size;
          if (Array.isArray(registry)) return registry.length;
          throw new Error(
            'the annotation store keeps its listeners somewhere this probe does not know',
          );
        },
        async offScreenMutations(rowId, column) {
          const observer = new MutationObserver(() => {});
          observer.observe(host, {
            subtree: true,
            attributes: true,
            childList: true,
            characterData: true,
          });
          const cell = store.add({
            scope: 'cell',
            rowId,
            column,
            severity: 'error',
            message: 'far',
          });
          const row = store.add({ scope: 'row', rowId, severity: 'warning', message: 'far' });
          let records = observer.takeRecords().length;
          await nextFrame();
          records += observer.takeRecords().length;
          observer.disconnect();
          store.removeMany([cell.id, row.id]);
          index = null;
          return records;
        },
        hotCell(rowId, column, perScope) {
          const long =
            'is outside the range the schema allows for this column, and was flagged by the ' +
            'validator together with the values around it in the same batch';
          const anns: import('../../src/index').NewAnnotation[] = [];
          for (let i = 0; i < perScope; i++) {
            const severity = SEVERITIES[i % 3]!;
            anns.push({ scope: 'cell', rowId, column, severity, message: `cell ${i} ${long}` });
            anns.push({ scope: 'row', rowId, severity, message: `row ${i} ${long}` });
            anns.push({ scope: 'column', column, severity, message: `column ${i} ${long}` });
          }
          store.addMany(anns);
          index = null;
        },
        async timings(rows) {
          const scroller = table.container.getTableBody()!.getVirtualScroller();
          // Fill the row cache with the rows the steps cross, then measure
          // renders over cached rows only: a step whose rows are not fetched
          // renders placeholders, which costs less and would flatter the
          // result. By row index, which on a table too tall for the browser
          // maps onto the compressed scroll range.
          const last = Math.min(rows, 1_600) - 40;
          for (let row = 0; ; row += 100) {
            scroller.scrollToRow(Math.min(row, last), 'start');
            await noPlaceholders();
            if (row >= last) break;
          }
          const steps: number[] = [];
          let placeholderSteps = 0;
          for (let row = last; row > 40; row -= 5) {
            const t0 = performance.now();
            scroller.scrollToRow(row, 'start');
            // Style and layout too, as the frame after a scroll pays them.
            host.querySelector('.dt-body .dt-row')?.getBoundingClientRect();
            steps.push(performance.now() - t0);
            if (host.querySelector('[data-placeholder]')) placeholderSteps++;
          }
          await noPlaceholders();

          // Each change timed as the mean of a batch: `performance.now()` is
          // coarsened to 0.1 ms here.
          const perCall = (count: number, run: (i: number) => void): number => {
            const t0 = performance.now();
            for (let i = 0; i < count; i++) run(i);
            return (performance.now() - t0) / count;
          };
          // One annotation in view, its severity changed back and forth.
          const firstRow = host.querySelector('.dt-body .dt-row[data-row-id]')!;
          const rowId = Number(firstRow.getAttribute('data-row-id'));
          const column = firstRow
            .querySelector('.dt-cell[data-column]')!
            .getAttribute('data-column')!;
          const target = store.add({
            scope: 'cell',
            rowId,
            column,
            severity: 'info',
            message: 't',
          });
          const updateOnScreen = perCall(200, (i) =>
            store.update(target.id, { severity: i % 2 ? 'info' : 'error' }),
          );
          store.remove(target.id);
          // One annotation far from the view, added.
          const added: string[] = [];
          const addOffScreen = perCall(200, (i) => {
            added.push(
              store.add({
                scope: 'cell',
                rowId: 900_000_000 + i,
                column,
                severity: 'error',
                message: 'far',
              }).id,
            );
          });
          store.removeMany(added);
          // A severity toggle: every rendered cell and every header compared.
          const severityToggle = perCall(20, (i) => store.setSeverityFilter({ info: i % 2 === 1 }));
          store.setSeverityFilter({ info: true });
          index = null;
          return {
            scrollStep: median(steps),
            placeholderSteps,
            updateOnScreen,
            addOffScreen,
            severityToggle,
          };
        },
        startLongFrames() {
          const state = {
            count: 0,
            observer: new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) if (entry.duration > 50) state.count++;
            }),
          };
          state.observer.observe({ type: 'long-animation-frame', buffered: false });
          longFrames = state;
        },
        stopLongFrames() {
          const state = longFrames;
          longFrames = null;
          state?.observer.disconnect();
          return state?.count ?? 0;
        },
      };
      (window as unknown as ProbeWindow).__annot = probe;
    },
    { tableKey, hostId },
  );
}

function call<K extends keyof AnnotationProbe>(
  page: Page,
  name: K,
  ...args: Parameters<AnnotationProbe[K]>
): Promise<Awaited<ReturnType<AnnotationProbe[K]>>> {
  return page.evaluate(
    ({ name, args }) =>
      ((window as unknown as ProbeWindow).__annot[name] as (...a: unknown[]) => unknown)(...args),
    { name, args: args as unknown[] },
  ) as Promise<Awaited<ReturnType<AnnotationProbe[K]>>>;
}

async function expectClean(page: Page, label: string): Promise<AuditReport> {
  const report = await call(page, 'audit');
  expect(
    report.problems,
    `${label}: ${report.problemCount} problem(s) over ${report.rows} rows, ` +
      `${report.cells} cells, ${report.headers} headers`,
  ).toEqual([]);
  expect(report.rows, `${label}: rows checked`).toBeGreaterThan(0);
  return report;
}

/** Wheel the body vertically, `ticks` times without waiting, then let it settle. */
async function wheelStorm(page: Page, hostId: string, ticks: number, dy: number): Promise<void> {
  const box = (await page.locator(`#${hostId} .dt-body-scroll`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < ticks; i++) await page.mouse.wheel(0, dy);
}

test.describe('annotations at scale — 1,000 columns, ~110K annotations', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);

  let page: Page;
  const ROWS = 400;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await mountTable(page, { columns: 1_000, rows: ROWS, width: 1200, height: 600 });
    await installProbe(page, '__dt', HOST_ID);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('one store listener for the grid, and nothing written for a change far from the view', async () => {
    expect(await call(page, 'listeners')).toBe(1);
    expect(await call(page, 'seed', { total: 110_000, rows: ROWS, seed: 1 })).toBe(110_000);
    expect(await call(page, 'listeners')).toBe(1);
    const report = await expectClean(page, 'after addMany');
    // Every header is checked, the shells of the columns far from the view too.
    expect(report.headers).toBe(1_000);
    // Row 390 is far below the rows rendered; c999 far right of the columns.
    expect(await call(page, 'offScreenMutations', 390, 'c999')).toBe(0);
  });

  test('stays right through sideways scrolls and wheel storms over pooled rows', async () => {
    await wheelBy(page, 6_000);
    await expectClean(page, 'after a scroll right');
    await wheelBy(page, 60_000);
    await expectClean(page, 'at the far right');

    await call(page, 'startWatch');
    await wheelStorm(page, HOST_ID, 40, 240);
    await wheelBy(page, -30_000);
    await wheelStorm(page, HOST_ID, 40, -240);
    const watched = await call(page, 'stopWatch');
    expect(watched.problems, `${watched.checkedFrames} frames checked`).toEqual([]);
    expect(watched.checkedFrames).toBeGreaterThan(5);
    await settle(page);
    await expectClean(page, 'after the storms');
  });

  test('follows severity toggles and clear()', async () => {
    for (const filter of [
      { error: false },
      { warning: false },
      { info: false },
      { error: true },
      { warning: true, info: true },
    ]) {
      await page.evaluate(
        (f) =>
          (
            window as unknown as { __dt: import('../../src/index').DataTable }
          ).__dt.annotations.setSeverityFilter(f),
        filter,
      );
      await expectClean(page, `after setSeverityFilter(${JSON.stringify(filter)})`);
    }
    await page.evaluate(() =>
      (window as unknown as { __dt: import('../../src/index').DataTable }).__dt.annotations.clear(),
    );
    const report = await expectClean(page, 'after clear()');
    expect(report.cells).toBeGreaterThan(0);
    expect(
      await page
        .locator(`#${HOST_ID} [class*="annot"], #${HOST_ID} [data-dt-annotation-count]`)
        .count(),
    ).toBe(0);
  });

  test('timings against the same table with no annotations', async () => {
    test.skip(!PERF, 'set RUN_ANNOTATION_PERF=1 to measure');
    const baseline = await call(page, 'timings', ROWS);
    await call(page, 'startLongFrames');
    await wheelStorm(page, HOST_ID, 40, 240);
    await wheelStorm(page, HOST_ID, 40, -240);
    await settle(page);
    const baselineLongFrames = await call(page, 'stopLongFrames');

    await call(page, 'seed', { total: 110_000, rows: ROWS, seed: 2 });
    const loaded = await call(page, 'timings', ROWS);
    await call(page, 'startLongFrames');
    await wheelStorm(page, HOST_ID, 40, 240);
    await wheelStorm(page, HOST_ID, 40, -240);
    await settle(page);
    const loadedLongFrames = await call(page, 'stopLongFrames');
    console.log(
      `1,000 columns × ${ROWS} rows, 0 annotations:`,
      baseline,
      `long frames in a storm: ${baselineLongFrames}\n110K annotations:`,
      loaded,
      `long frames in a storm: ${loadedLongFrames}`,
    );
    expect([baseline.placeholderSteps, loaded.placeholderSteps]).toEqual([0, 0]);
    expect(loaded.scrollStep).toBeLessThan(baseline.scrollStep + 2);
    expect(loaded.updateOnScreen).toBeLessThan(5);
    expect(loaded.addOffScreen).toBeLessThan(5);
    expect(loadedLongFrames).toBeLessThanOrEqual(baselineLongFrames + 1);
    await page.evaluate(() =>
      (window as unknown as { __dt: import('../../src/index').DataTable }).__dt.annotations.clear(),
    );
  });
});

test.describe('annotations at scale — a million rows, ~100K annotations', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);

  let page: Page;
  const ROWS = 1_000_000;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await mountBigTable(page, { rows: ROWS });
    await waitForRowsResolved(page);
    await installProbe(page, '__t', BIG_TABLE_HOST_ID);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('stays right through deep scrolls and wheel storms', async () => {
    expect(await call(page, 'listeners')).toBe(1);
    expect(await call(page, 'seed', { total: 100_000, rows: ROWS, seed: 3 })).toBe(100_000);
    // Every 10th row of the first 1,000 annotated too, so the rows rendered
    // first have something to show.
    await page.evaluate(() => {
      const t = (window as unknown as { __t: import('../../src/index').DataTable }).__t;
      t.annotations.addMany(
        Array.from({ length: 100 }, (_, i) => ({
          scope: 'cell' as const,
          rowId: i * 10,
          column: 'grp',
          severity: 'warning' as const,
          message: 'near the top',
        })),
      );
    });
    await expectClean(page, 'after addMany');
    expect(await call(page, 'offScreenMutations', 900_000, 'val')).toBe(0);

    await call(page, 'startWatch');
    await wheelStorm(page, BIG_TABLE_HOST_ID, 60, 400);
    const watched = await call(page, 'stopWatch');
    expect(watched.problems, `${watched.checkedFrames} frames checked`).toEqual([]);
    expect(watched.checkedFrames).toBeGreaterThan(5);
    await waitForRowsResolved(page);
    await expectClean(page, 'after a wheel storm');

    // Deep, where scrolling is compressed.
    await page.evaluate((hostId) => {
      const el = document.querySelector<HTMLElement>(`#${hostId} .dt-body-scroll`)!;
      el.scrollTop = el.scrollHeight * 0.73;
    }, BIG_TABLE_HOST_ID);
    await waitForRowsResolved(page);
    await expectClean(page, 'deep in the table');
    await page.evaluate(() =>
      (
        window as unknown as { __t: import('../../src/index').DataTable }
      ).__t.annotations.setSeverityFilter({ warning: false }),
    );
    await expectClean(page, 'with warnings hidden');
    await page.evaluate(() => {
      const t = (window as unknown as { __t: import('../../src/index').DataTable }).__t;
      t.annotations.setSeverityFilter({ warning: true });
      t.annotations.clear();
    });
    await expectClean(page, 'after clear()');
  });

  test('timings against the same table with no annotations', async () => {
    test.skip(!PERF, 'set RUN_ANNOTATION_PERF=1 to measure');
    await page.evaluate((hostId) => {
      document.querySelector<HTMLElement>(`#${hostId} .dt-body-scroll`)!.scrollTop = 0;
    }, BIG_TABLE_HOST_ID);
    await waitForRowsResolved(page);
    const baseline = await call(page, 'timings', ROWS);
    // A million: a tenth of them on the rows measured, the rest spread out.
    await call(page, 'seed', { total: 100_000, rows: 2_000, seed: 4 });
    await call(page, 'seed', { total: 900_000, rows: ROWS, seed: 5 });
    const loaded = await call(page, 'timings', ROWS);
    console.log('1M rows: 0 →', baseline, '\n1M annotations →', loaded);
    expect([baseline.placeholderSteps, loaded.placeholderSteps]).toEqual([0, 0]);
    expect(loaded.scrollStep).toBeLessThan(baseline.scrollStep + 2);
    expect(loaded.updateOnScreen).toBeLessThan(5);
    expect(loaded.addOffScreen).toBeLessThan(5);
  });
});

test.describe('the annotation popover in a real browser', () => {
  test.setTimeout(240_000);

  test('caps its sections, scrolls without closing, refreshes in place, and passes axe', async ({
    page,
  }) => {
    await mountTable(page, { columns: 40, rows: 100 });
    await installProbe(page, '__dt', HOST_ID);
    await call(page, 'hotCell', 2, 'c01', 8);
    // The pointer moved by hand: a locator's hover() scrolls the grid to the
    // cell first, and a scroll closes the popover.
    const cell = page.locator(`#${HOST_ID} .dt-row[data-row-id="2"] .dt-cell[data-column="c01"]`);
    const cellBox = (await cell.boundingBox())!;
    await page.mouse.move(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height / 2);
    const popover = page.locator('.dt-annotation-popover');
    await expect(popover).toBeVisible();

    // Five entries a section, and the rest counted.
    for (const scope of ['row', 'column', 'cell']) {
      const section = popover.locator(`.dt-annotation-popover__group--${scope}`);
      await expect(section.locator('.dt-annotation-entry')).toHaveCount(5);
      await expect(section.locator('.dt-annotation-popover__more')).toHaveText('+3 more');
    }

    // It overflows: a tab stop, and its own scroll does not close it.
    const metrics = await popover.evaluate((el) => ({
      overflows: el.scrollHeight > el.clientHeight,
      tabindex: el.getAttribute('tabindex'),
    }));
    expect(metrics).toEqual({ overflows: true, tabindex: '0' });
    // Straight onto it, in one move: on the way it would cross the next
    // row's cell of the same, column-annotated, column.
    const popoverBox = (await popover.boundingBox())!;
    await page.mouse.move(
      popoverBox.x + popoverBox.width / 2,
      popoverBox.y + popoverBox.height / 2,
    );
    await page.mouse.wheel(0, 200);
    await expect
      .poll(() => popover.evaluate((el) => el.scrollTop), { timeout: 5_000 })
      .toBeGreaterThan(0);
    await expect(popover).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('.dt-annotation-popover')
      .include(`#${HOST_ID} .dt-root`)
      .analyze();
    expect(
      results.violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
      ),
    ).toEqual([]);
    expect(
      results.incomplete
        .filter((r) => r.id === 'scrollable-region-focusable' || r.id === 'aria-required-children')
        .map((r) => r.id),
    ).toEqual([]);

    // A change elsewhere rewrites nothing; one at the cell refreshes it in place.
    const rewritten = await page.evaluate(async () => {
      const t = (window as unknown as { __dt: import('../../src/index').DataTable }).__dt;
      const el = document.querySelector('.dt-annotation-popover')!;
      const observer = new MutationObserver(() => {});
      observer.observe(el, { subtree: true, childList: true, characterData: true });
      t.annotations.add({
        scope: 'cell',
        rowId: 60,
        column: 'c05',
        severity: 'error',
        message: 'x',
      });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const records = observer.takeRecords().length;
      observer.disconnect();
      return records;
    });
    expect(rewritten).toBe(0);
    await page.evaluate(() => {
      const t = (window as unknown as { __dt: import('../../src/index').DataTable }).__dt;
      t.annotations.add({
        scope: 'cell',
        rowId: 2,
        column: 'c01',
        severity: 'error',
        message: 'new',
      });
    });
    await expect(
      popover.locator('.dt-annotation-popover__group--cell .dt-annotation-popover__more'),
    ).toHaveText('+4 more');
    await expect(popover).toBeVisible();

    // Every annotation there gone: the popover goes with them.
    await page.evaluate(() => {
      const t = (window as unknown as { __dt: import('../../src/index').DataTable }).__dt;
      t.annotations.clear();
    });
    await expect(popover).toBeHidden();
  });
});

/**
 * The two manual fixtures behind the figures in the docs: 10K rows × 1,000
 * columns and 10M rows × 9 columns. They are local files
 * (`tmp-large-data/`, see DEVELOPMENT.md), so this measures only where they
 * are, and only under `RUN_ANNOTATION_PERF=1`. Each table is mounted over
 * the demo with persistence and charts off, and measured with no
 * annotations, then 100K, then a million: 90% cell, 9% row, 1% column. On
 * the 10M-row table a tenth of them go on the first 2,000 rows, which the
 * scroll steps cross, and the rest over every row.
 */
const MANUAL_FIXTURES = 'tmp-large-data/manual-0.9';
const MANUAL_TABLES = [
  { label: '10K × 1,000', file: 'wide_10k_x_1000.parquet', rows: 10_000 },
  { label: '10M × 9', file: 'deep-10m.parquet', rows: 10_000_000 },
] as const;

async function mountFile(page: Page, file: string): Promise<void> {
  await page.goto('./');
  await page.evaluate(
    async ({ url, hostId }) => {
      const mod = (await import(
        /* @vite-ignore */ '/data-table/src/index.ts'
      )) as typeof import('../../src/index');
      const host = document.createElement('div');
      host.id = hostId;
      host.style.cssText =
        'position: fixed; left: 0; top: 0; width: 1200px; height: 600px; z-index: 1;' +
        ' background: white;';
      document.body.appendChild(host);
      const table = await mod.createDataTable({
        container: host,
        persistence: false,
        visualizations: false,
      });
      (window as unknown as { __dt: typeof table }).__dt = table;
      await table.loadData(url);
    },
    { url: `/large-data/manual-0.9/${file}`, hostId: HOST_ID },
  );
  await page.waitForFunction(
    (hostId) =>
      document.querySelectorAll(`#${hostId} .dt-body .dt-row:not([data-placeholder])`).length > 0,
    HOST_ID,
    { timeout: 120_000 },
  );
  await settle(page);
}

test.describe('annotations at a million — the manual fixtures', () => {
  for (const fixture of MANUAL_TABLES) {
    test(`timings on ${fixture.label} at 0, 100K and 1M annotations`, async ({ page }) => {
      test.skip(
        !PERF || !existsSync(`${MANUAL_FIXTURES}/${fixture.file}`),
        `set RUN_ANNOTATION_PERF=1, with ${MANUAL_FIXTURES}/${fixture.file} present`,
      );
      test.setTimeout(900_000);
      await mountFile(page, fixture.file);
      await installProbe(page, '__dt', HOST_ID);
      const near = Math.min(fixture.rows, 2_000);
      const results: Record<string, unknown>[] = [];
      results.push({ annotations: 0, ...(await call(page, 'timings', fixture.rows)) });

      await call(page, 'seed', { total: 10_000, rows: near, seed: 11 });
      const first = await call(page, 'lastSeedMs');
      await call(page, 'seed', { total: 90_000, rows: fixture.rows, seed: 12 });
      const addMany100K = first + (await call(page, 'lastSeedMs'));
      results.push({
        annotations: 100_000,
        addMany: addMany100K,
        ...(await call(page, 'timings', fixture.rows)),
      });

      await call(page, 'seed', { total: 90_000, rows: near, seed: 13 });
      const nearMs = await call(page, 'lastSeedMs');
      await call(page, 'seed', { total: 810_000, rows: fixture.rows, seed: 14 });
      const addMany900K = nearMs + (await call(page, 'lastSeedMs'));
      results.push({
        annotations: 1_000_000,
        addMany: addMany900K,
        ...(await call(page, 'timings', fixture.rows)),
      });
      console.log(`${fixture.label}:\n${results.map((r) => JSON.stringify(r)).join('\n')}`);

      const [baseline, , million] = results as unknown as Timings[];
      expect(results.map((r) => (r as unknown as Timings).placeholderSteps)).toEqual([0, 0, 0]);
      expect(million!.scrollStep).toBeLessThan(baseline!.scrollStep + 2);
      expect(million!.updateOnScreen).toBeLessThan(5);
      expect(million!.addOffScreen).toBeLessThan(5);
    });
  }
});
