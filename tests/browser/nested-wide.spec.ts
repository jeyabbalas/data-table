/**
 * A wide table of nested values at 200,000 rows stays correct, small and
 * quick: through a yank to its far right and a vertical scroll storm, every
 * row shows its own values, every nested cell stays within the cap, and the
 * nested columns' header charts draw at once.
 *
 * A nested value can be any size. The grid reads it as bounded DuckDB text
 * (`gridValueSQL` in src/data/valueSql.ts): a list past 32 items shows 32
 * and `… +N`, and any text past 1,000 graphemes is cut, so that a block of
 * 128 rows costs kilobytes whatever its values hold. A nested column's chart
 * counts nulls in one scan instead of grouping values, which on 200K rows of
 * embeddings took 18–21 s with the worker, and so the grid, frozen. Neither
 * bound shows at the fixture's 1,000 rows, and jsdom runs no DuckDB at all.
 *
 * The table is built in DuckDB and loaded from Parquet, as
 * `helpers/bigTable.ts` builds its own, so `__rowid__ === position === id`.
 * Its 46 columns are `id`, 38 scalars as `helpers/table.ts` generates them,
 * the six nested columns of `WIDE_NESTED`, and `grp` (`'g' || id % 97`)
 * last, at the far right with them. Mid-storm, a probe holds every rendered
 * row to `data-row-id === data-row-index` and every checked cell to a text
 * only its own row's value can have; once the view settles, every nested
 * cell is compared whole with what DuckDB says it should be
 * (`helpers/nested.ts`).
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  MAX_CELL_CHARS,
  NESTED_HOST_ID,
  expectedCellTexts,
  mountSqlTable,
  readBody,
  rowFetchPayloads,
  WIDE_NESTED,
  WIDE_ROWS,
  WIDE_SELECT,
  waitForFilledBody,
  watchConsoleErrors,
  wrongCells,
} from './helpers/nested';

const BLOCK_ROWS = 128;

/**
 * How soon after the yank each nested column's chart has to have drawn.
 * Measured on an Apple-silicon laptop: 96–229 ms with this spec alone, 102–
 * 243 ms with three copies running at once. Each run records its times in
 * the `chart paint ms` annotation.
 */
const CHART_PAINT_MS = 1_000;

/** The table, as `helpers/nested.ts` builds it. */
const ROWS = WIDE_ROWS;
const NESTED = WIDE_NESTED;
const SELECT = WIDE_SELECT;

/** One breach the probe saw: a row claiming another row's index, or a cell not its row's. */
interface Breach {
  index: number;
  rowid: number;
  /** `null` for a row whose id is not its index. */
  column: string | null;
  text: string;
  length: number;
}

type ProbeWindow = {
  __dtWideProbe?: {
    active: boolean;
    breaches: Breach[];
    /** Cells checked, over every pass. */
    cells: number;
    observer: MutationObserver;
    rafId: number;
  };
};

/**
 * Check every rendered row on every DOM change and every frame, until
 * {@link readProbe}: its id has to be its index, and each cell of `grp` and
 * the nested columns has to hold a text that only its own row's value has,
 * of at most {@link MAX_CELL_CHARS} characters. The checks are the
 * generator's values inlined: evaluate callbacks cannot see module scope.
 */
async function installProbe(page: Page): Promise<void> {
  await page.evaluate(
    ({ hostId, maxChars }) => {
      const viewport = document.querySelector(`#${hostId} .dt-virtual-viewport`);
      if (!viewport) throw new Error('probe: no .dt-virtual-viewport under host');
      // The text each column's cell must have in row `i`: whole, or a head
      // that leads only row `i`'s value.
      const checks: Record<string, (i: number, t: string) => boolean> = {
        grp: (i, t) => t === `g${i % 97}`,
        embedding: (i, t) => t.startsWith(`[${i}.0, `),
        long_ints: (i, t) =>
          i % 13 === 12 ? t === 'null' : t.startsWith(`[${i}, `) || t === `[${i}]`,
        long_words: (i, t) =>
          i % 64 !== 3 && i % 11 === 10 ? t === '[]' : t.startsWith(`[r${i}-0w`),
        point: (i, t) => t.startsWith(`{'rid': ${i}, `),
        attrs: (i, t) =>
          i % 17 === 16 ? t === 'null' : t.startsWith(`{rid=${i}, `) || t === `{rid=${i}}`,
        people: (i, t) => t.startsWith(`[{'rid': ${i}, `),
      };
      const probe = {
        active: true,
        breaches: [] as Breach[],
        cells: 0,
        observer: null as unknown as MutationObserver,
        rafId: 0,
      };
      const validate = () => {
        // Cap the log: a broken build would otherwise flood it.
        if (probe.breaches.length >= 50) return;
        for (const row of document.querySelectorAll<HTMLElement>(
          `#${hostId} .dt-body .dt-row[data-row-id]`,
        )) {
          const index = Number(row.getAttribute('data-row-index'));
          const rowid = Number(row.getAttribute('data-row-id'));
          if (rowid !== index) {
            probe.breaches.push({ index, rowid, column: null, text: '', length: 0 });
            continue;
          }
          for (const cell of row.querySelectorAll<HTMLElement>('.dt-cell[data-column]')) {
            const column = cell.dataset.column!;
            const check = checks[column];
            // A pending cell is empty until its column is fetched.
            if (!check || cell.classList.contains('dt-cell--pending')) continue;
            const text = cell.textContent ?? '';
            probe.cells++;
            if (!check(index, text) || text.length > maxChars) {
              probe.breaches.push({
                index,
                rowid,
                column,
                text: text.slice(0, 80),
                length: text.length,
              });
            }
          }
        }
      };
      probe.observer = new MutationObserver(validate);
      probe.observer.observe(viewport, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-row-index', 'data-row-id', 'class'],
      });
      const loop = () => {
        if (!probe.active) return;
        validate();
        probe.rafId = requestAnimationFrame(loop);
      };
      probe.rafId = requestAnimationFrame(loop);
      (window as unknown as ProbeWindow).__dtWideProbe = probe;
    },
    { hostId: NESTED_HOST_ID, maxChars: MAX_CELL_CHARS },
  );
}

/** Stop the probe: the breaches it saw, and how many cells it checked. */
function readProbe(page: Page): Promise<{ breaches: Breach[]; cells: number }> {
  return page.evaluate(() => {
    const w = window as unknown as ProbeWindow;
    const probe = w.__dtWideProbe!;
    // Flag first so an already-queued frame cannot re-schedule.
    probe.active = false;
    probe.observer.disconnect();
    cancelAnimationFrame(probe.rafId);
    delete w.__dtWideProbe;
    return { breaches: probe.breaches, cells: probe.cells };
  });
}

/**
 * Wait until no row is a placeholder, no cell is pending, and the rows, the
 * `grp` texts and `scrollTop` have held still across two polls: the
 * scroller can reposition its viewport without a fetch, so a content-only
 * check could pass mid-move.
 */
async function waitForSettled(page: Page): Promise<void> {
  await page.waitForFunction(
    (hostId) => {
      const w = window as unknown as { __dtSettled?: { last: string; stable: number } };
      const host = document.getElementById(hostId)!;
      const scroller = host.querySelector('.dt-body-scroll')!;
      const waiting = host.querySelectorAll(
        '.dt-body [data-placeholder], .dt-body .dt-cell--pending',
      ).length;
      const key =
        `${scroller.scrollTop.toFixed(2)}#${waiting}#` +
        Array.from(
          host.querySelectorAll('.dt-body .dt-row[data-row-id]'),
          (r) =>
            `${r.getAttribute('data-row-index')}:${r.getAttribute('data-row-id')}:` +
            (r.querySelector('.dt-cell[data-column="grp"]')?.textContent ?? ''),
        ).join(',');
      const s = (w.__dtSettled ??= { last: '', stable: 0 });
      s.stable = key === s.last ? s.stable + 1 : 0;
      s.last = key;
      return waiting === 0 && key.length > 20 && s.stable >= 2;
    },
    NESTED_HOST_ID,
    { polling: 120, timeout: 60_000 },
  );
  await page.evaluate(() => {
    delete (window as unknown as { __dtSettled?: unknown }).__dtSettled;
  });
}

/** Every rendered `grp` and nested cell against DuckDB, and none longer than the cap. */
async function expectBodyMatchesDuckDB(page: Page): Promise<void> {
  const columns = [...NESTED, 'grp'];
  const body = await readBody(page, columns);
  const ids = Object.keys(body.cells);
  expect(ids.length).toBeGreaterThan(10);
  expect({ placeholders: body.placeholders, pending: body.pending }).toEqual({
    placeholders: 0,
    pending: 0,
  });
  expect(wrongCells(body, await expectedCellTexts(page, NESTED, ids), NESTED)).toEqual([]);
  const long: string[] = [];
  for (const [id, texts] of Object.entries(body.cells)) {
    expect(texts.grp, `grp of row ${id}`).toBe(`g${Number(id) % 97}`);
    for (const column of NESTED) {
      if (texts[column]!.length > MAX_CELL_CHARS) long.push(`${id}/${column}`);
    }
  }
  expect(long, `cells longer than ${MAX_CELL_CHARS} characters`).toEqual([]);
}

test(`${ROWS.toLocaleString('en')} rows × 46 columns, six nested: a yank right and a scroll storm stay correct, cells capped, charts quick`, async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = watchConsoleErrors(page);

  await test.step('mount', async () => {
    await mountSqlTable(page, {
      select: SELECT,
      rows: ROWS,
      visualizations: true,
      recordFetches: NESTED,
    });
    await waitForFilledBody(page, ['id']);
  });

  await test.step('a yank to the far right: every nested chart draws, every cell is its row’s', async () => {
    await installProbe(page);
    const painted = await page.evaluate(
      async ({ hostId, columns, timeoutMs }) => {
        const host = document.getElementById(hostId)!;
        const scroller = host.querySelector('.dt-body-scroll')!;
        const drawn = (name: string): boolean => {
          const header = Array.from(host.querySelectorAll('.dt-col-header[data-column]')).find(
            (h) => h.getAttribute('data-column') === name,
          );
          const canvas = header?.querySelector<HTMLCanvasElement>('.dt-col-viz canvas');
          if (!canvas || canvas.width === 0 || canvas.height === 0) return false;
          const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
          for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
          return false;
        };
        const t0 = performance.now();
        scroller.scrollLeft = scroller.scrollWidth - scroller.clientWidth;
        const at: Record<string, number> = {};
        await new Promise<void>((resolve) => {
          const frame = () => {
            const now = performance.now();
            for (const name of columns) {
              if (!(name in at) && drawn(name)) at[name] = Math.round(now - t0);
            }
            if (Object.keys(at).length === columns.length || now - t0 > timeoutMs) resolve();
            else requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        });
        return at;
      },
      { hostId: NESTED_HOST_ID, columns: [...NESTED], timeoutMs: 15_000 },
    );
    test.info().annotations.push({ type: 'chart paint ms', description: JSON.stringify(painted) });
    for (const column of NESTED) {
      expect(painted[column], `ms from the yank to ${column}'s chart drawing`).toBeLessThanOrEqual(
        CHART_PAINT_MS,
      );
    }

    await waitForFilledBody(page, [...NESTED, 'grp']);
    await expectBodyMatchesDuckDB(page);
  });

  await test.step('a vertical scroll storm: no row contradicts itself, none is left loading', async () => {
    // ~8 s, as `scroll-flicker.spec.ts` storms its 200K rows: bursts of
    // ±400 px, direction reversals, and a teleport every 19th step, ending
    // on a fixed landing so the storm never finishes mid-teleport.
    await page.evaluate(async (hostId) => {
      const el = document.querySelector(`#${hostId} .dt-body-scroll`)!;
      const maxScroll = el.scrollHeight - el.clientHeight;
      let seed = 0x5eed;
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
    }, NESTED_HOST_ID);

    await waitForSettled(page);
    const { breaches, cells } = await readProbe(page);
    expect(breaches, 'rows and cells that were not their own').toEqual([]);
    // Enough that a probe that saw nothing cannot pass.
    expect(cells).toBeGreaterThan(5_000);
    await expectBodyMatchesDuckDB(page);
    const scrolled = await page.evaluate(
      (hostId) => document.querySelector(`#${hostId} .dt-body-scroll`)!.scrollTop,
      NESTED_HOST_ID,
    );
    expect(scrolled, 'the storm ended in the middle of the table').toBeGreaterThan(1_000_000);
  });

  await test.step('no row fetch read more than 128 × 1,001 characters of a nested column', async () => {
    const fetches = (await rowFetchPayloads(page)).filter((f) => Object.keys(f.columns).length > 0);
    expect(fetches.length, 'row fetches that read a nested column').toBeGreaterThan(20);
    const over: string[] = [];
    const most: Record<string, number> = {};
    let capped = 0;
    for (const [n, fetch] of fetches.entries()) {
      if (fetch.rows > BLOCK_ROWS) over.push(`fetch ${n}: ${fetch.rows} rows`);
      for (const [column, { chars, longest, other }] of Object.entries(fetch.columns)) {
        if (chars > BLOCK_ROWS * MAX_CELL_CHARS || longest > MAX_CELL_CHARS || other > 0) {
          over.push(
            `fetch ${n}, ${column}: ${chars} characters, longest ${longest}, ${other} not text`,
          );
        }
        if (longest === MAX_CELL_CHARS) capped++;
        most[column] = Math.max(most[column] ?? 0, chars);
      }
    }
    test.info().annotations.push({
      type: 'most characters a row fetch read, by nested column',
      description: `${JSON.stringify(most)} over ${fetches.length} fetches`,
    });
    expect(over).toEqual([]);
    // The cap was reached, not only respected: the long values were read.
    expect(capped).toBeGreaterThan(0);
  });

  expect(errors).toEqual([]);
});
