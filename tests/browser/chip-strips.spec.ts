/**
 * The filter bar's and the hidden-columns gutter's chips: one row each, which
 * scrolls sideways once it is wider than the table, with the toolbar's
 * buttons pinned at its end.
 *
 * jsdom has no layout, so the unit tests fake one. These check the real
 * thing: that hiding hundreds of columns leaves the gutter one row tall and
 * the grid its height, that a chip added out of view is scrolled to,
 * smoothly, up to the pinned buttons and no further, that changing or
 * removing chips leaves the row where it is, and that the keyboard sees each
 * chip whole.
 */

import { expect, test, type Page } from '@playwright/test';
import { settle } from './helpers/demo';
import { HOST_ID, mountTable, type TestWindow } from './helpers/table';

type Kind = 'hidden' | 'filter';

/** Name of column `i` in a table {@link mountTable} made with 300 columns. */
const col = (i: number): string => `c${String(i).padStart(3, '0')}`;

/** Hide columns, in one task, as code that hides many does. */
async function hide(page: Page, columns: string[]): Promise<void> {
  await page.evaluate((columns) => {
    const { actions } = (window as unknown as TestWindow).__dt;
    for (const c of columns) actions.hideColumn(c);
  }, columns);
}

interface StripState {
  /** `scrollLeft`, and its largest value. */
  left: number;
  max: number;
  /** The chips wholly in view: inside the row, and short of its pinned end. */
  whole: string[];
  /** Every chip, in order. */
  chips: string[];
}

/** Where a toolbar's row is scrolled, and the chips it shows whole. */
async function strip(page: Page, kind: Kind): Promise<StripState> {
  return page.evaluate(
    ({ host, kind }) => {
      const root = document.getElementById(host)!;
      const scroll = root.querySelector<HTMLElement>(`.dt-${kind}-scroll`)!;
      const box = scroll.getBoundingClientRect();
      const end = root.querySelector(`.dt-${kind}-actions`)!.getBoundingClientRect();
      const named = Array.from(
        root.querySelectorAll<HTMLElement>(
          kind === 'hidden' ? '.dt-hidden-chip' : '.dt-filter-chip',
        ),
      ).map((chip) => ({
        chip,
        name:
          chip.querySelector(kind === 'hidden' ? '.dt-hidden-chip-name' : '.dt-filter-chip-column')
            ?.textContent ?? '',
      }));
      const whole = named.filter(({ chip }) => {
        const r = chip.getBoundingClientRect();
        return r.left >= box.left - 0.5 && r.right <= Math.min(box.right, end.left) + 0.5;
      });
      return {
        left: scroll.scrollLeft,
        max: scroll.scrollWidth - scroll.clientWidth,
        whole: whole.map(({ name }) => name),
        chips: named.map(({ name }) => name),
      };
    },
    { host: HOST_ID, kind },
  );
}

/**
 * Record the row's `scrollLeft` every frame, from now until it has held
 * still for ten frames, and return the record. A smooth scroll shows up as
 * the values in between.
 */
async function startRecording(page: Page, kind: Kind): Promise<void> {
  await page.evaluate(
    ({ host, kind }) => {
      const scroll = document
        .getElementById(host)!
        .querySelector<HTMLElement>(`.dt-${kind}-scroll`)!;
      const w = window as unknown as { __stripRecord: Promise<number[]> };
      w.__stripRecord = new Promise((resolve) => {
        const seen: number[] = [scroll.scrollLeft];
        let still = 0;
        const frame = (): void => {
          const left = scroll.scrollLeft;
          still = left === seen[seen.length - 1] ? still + 1 : 0;
          seen.push(left);
          // Ten still frames, but give a scroll that has not started a moment.
          if (still >= 10 && seen.length > 20) resolve(seen);
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    },
    { host: HOST_ID, kind },
  );
}

async function recording(page: Page): Promise<number[]> {
  return page.evaluate(
    () => (window as unknown as { __stripRecord: Promise<number[]> }).__stripRecord,
  );
}

/** Wait for a toolbar's row to come to rest, a glide in flight included. */
async function still(page: Page, kind: Kind): Promise<void> {
  await startRecording(page, kind);
  await recording(page);
}

/**
 * Scroll a toolbar's row to `left` at once, and let it settle. A glide in
 * flight finishes first: a write while one runs leaves the row a frame of
 * the glide short of where it was sent.
 */
async function scrollStrip(page: Page, kind: Kind, left: number): Promise<void> {
  await still(page, kind);
  await page.evaluate(
    ({ host, kind, left }) => {
      document.getElementById(host)!.querySelector<HTMLElement>(`.dt-${kind}-scroll`)!.scrollLeft =
        left;
    },
    { host: HOST_ID, kind, left },
  );
  await still(page, kind);
}

/** Values strictly between the first and the last of a record: the frames of a glide. */
function between(record: number[]): number[] {
  const from = record[0]!;
  const to = record[record.length - 1]!;
  const [lo, hi] = from < to ? [from, to] : [to, from];
  return record.filter((v) => v > lo + 1 && v < hi - 1);
}

test('hiding 250 of 300 columns keeps the gutter one row, and the grid its height', async ({
  page,
}) => {
  await mountTable(page, { columns: 300, width: 1000, height: 600 });
  const measure = () =>
    page.evaluate((host) => {
      const root = document.getElementById(host)!;
      const tops = new Set(
        Array.from(root.querySelectorAll('.dt-hidden-chip')).map((c) =>
          Math.round(c.getBoundingClientRect().top),
        ),
      );
      return {
        gutter: Math.round(root.querySelector('.dt-hidden-gutter')!.getBoundingClientRect().height),
        body: root.querySelector<HTMLElement>('.dt-body-scroll')!.clientHeight,
        root: Math.round(root.querySelector('.dt-root')!.getBoundingClientRect().width),
        rows: tops.size,
      };
    }, HOST_ID);

  // Only `__rowid__` is hidden at first.
  const before = await measure();
  expect(before.rows).toBe(1);

  await hide(
    page,
    Array.from({ length: 250 }, (_, i) => col(i + 10)),
  );
  await settle(page);
  const after = await measure();

  // It used to wrap the chips onto rows, up to 200px of the table.
  expect(after.rows).toBe(1);
  expect(after.gutter).toBe(before.gutter);
  expect(after.body).toBe(before.body);
  expect(after.root).toBe(before.root);
  const row = await strip(page, 'hidden');
  expect(row.chips).toHaveLength(251);
  // The row is many times wider than the table, and scrolls instead.
  expect(row.max).toBeGreaterThan(10 * 1000);

  // A pointer scrolls it sideways, with a wheel or a trackpad.
  await scrollStrip(page, 'hidden', 0);
  const box = (await page.locator(`#${HOST_ID} .dt-hidden-scroll`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
  await page.mouse.wheel(400, 0);
  await expect.poll(async () => (await strip(page, 'hidden')).left).toBeGreaterThan(0);
});

test('a chip hidden out of view is scrolled to, smoothly, and stops clear of "Show all"', async ({
  page,
}) => {
  await mountTable(page, { columns: 300, width: 1000, height: 600 });
  await hide(
    page,
    Array.from({ length: 50 }, (_, i) => col(i + 10)),
  );
  await settle(page);

  // At the start of the row, hide a column whose chip goes at its end.
  await scrollStrip(page, 'hidden', 0);
  await startRecording(page, 'hidden');
  await hide(page, [col(200)]);
  const forward = await recording(page);
  let row = await strip(page, 'hidden');

  expect(row.chips[row.chips.length - 1]).toBe(col(200));
  expect(row.whole).toContain(col(200));
  // At the end of the row, give or take the pixel past the last chip.
  expect(row.max - row.left).toBeLessThanOrEqual(1);
  expect(forward[0]).toBe(0);
  // Frames in between: a glide, not a jump.
  expect(between(forward).length).toBeGreaterThan(2);

  // At the end of the row, hide one whose chip goes near its start.
  await startRecording(page, 'hidden');
  await hide(page, [col(1)]);
  const back = await recording(page);
  row = await strip(page, 'hidden');

  expect(row.chips.slice(0, 2)).toEqual(['__rowid__', col(1)]);
  expect(row.whole[0]).toBe(col(1));
  expect(between(back).length).toBeGreaterThan(2);
});

test('hiding several columns at once makes one glide, to the right-most of their chips', async ({
  page,
}) => {
  await mountTable(page, { columns: 300, width: 1000, height: 600 });
  await hide(
    page,
    Array.from({ length: 50 }, (_, i) => col(i + 10)),
  );
  await settle(page);
  await scrollStrip(page, 'hidden', 0);

  await startRecording(page, 'hidden');
  // In no particular order, as code might.
  await hide(page, [col(150), col(250), col(120), col(180)]);
  const record = await recording(page);
  const row = await strip(page, 'hidden');

  expect(row.chips.slice(-4)).toEqual([col(120), col(150), col(180), col(250)]);
  expect(row.whole).toContain(col(250));
  // One glide: always forward, never back.
  for (let i = 1; i < record.length; i++) {
    expect(record[i]!, `frame ${i} of ${record.join(', ')}`).toBeGreaterThanOrEqual(record[i - 1]!);
  }
});

test('restoring a column from its chip leaves the row in place and focus on the next chip', async ({
  page,
}) => {
  await mountTable(page, { columns: 300, width: 1000, height: 600 });
  await hide(
    page,
    Array.from({ length: 50 }, (_, i) => col(i + 10)),
  );
  await settle(page);
  const { max } = await strip(page, 'hidden');
  await scrollStrip(page, 'hidden', Math.round(max / 2));
  const before = await strip(page, 'hidden');
  const target = before.whole[2]!;
  const next = before.chips[before.chips.indexOf(target) + 1]!;

  await page.getByRole('button', { name: `Show ${target}`, exact: true }).click();
  await settle(page);
  const after = await strip(page, 'hidden');

  expect(after.chips).not.toContain(target);
  await expect(page.getByRole('button', { name: `Show ${next}`, exact: true })).toBeFocused();
  expect(after.whole).toContain(next);
  // Focus going to the first chip would have taken the row back to its start.
  expect(Math.abs(after.left - before.left)).toBeLessThan(200);
});

test('the keyboard sees each chip whole: Tab in, the arrows, and the wrap', async ({ page }) => {
  await mountTable(page, { columns: 300, width: 1000, height: 600 });
  await hide(
    page,
    Array.from({ length: 50 }, (_, i) => col(i + 10)),
  );
  await settle(page);
  const { max } = await strip(page, 'hidden');
  await scrollStrip(page, 'hidden', max);

  // The stop is on the first chip, scrolled far out of view. Tab from the
  // body scroller, the stop before the gutter, comes back to it.
  await page.locator(`#${HOST_ID} .dt-body-scroll`).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Show __rowid__', exact: true })).toBeFocused();
  let row = await strip(page, 'hidden');
  expect(row.whole[0]).toBe('__rowid__');

  // End is "Show all", pinned; ← from it is the last chip, whole beside it.
  await page.keyboard.press('End');
  await expect(page.locator(`#${HOST_ID} .dt-hidden-show-all`)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  row = await strip(page, 'hidden');
  await expect(
    page.getByRole('button', { name: `Show ${row.chips[row.chips.length - 1]}`, exact: true }),
  ).toBeFocused();
  expect(row.whole).toContain(row.chips[row.chips.length - 1]);

  // → twice wraps through "Show all" to the first chip.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  row = await strip(page, 'hidden');
  expect(row.whole[0]).toBe('__rowid__');
  expect(row.left).toBe(0);
});

test('the filter bar glides to a new filter, and stays put when one changes or goes', async ({
  page,
}) => {
  await mountTable(page, { columns: 300, width: 1000, height: 600 });
  const filter = (columns: string[]) =>
    page.evaluate((columns) => {
      const { actions } = (window as unknown as TestWindow).__dt;
      for (const column of columns) actions.addFilter({ type: 'not-null', column });
    }, columns);
  await filter(Array.from({ length: 14 }, (_, i) => col(i)));
  await settle(page);
  await still(page, 'filter');
  let bar = await strip(page, 'filter');
  expect(bar.max).toBeGreaterThan(0);
  // At the end of the row, give or take the pixel past the last chip.
  expect(bar.max - bar.left).toBeLessThanOrEqual(1);
  expect(bar.whole).toContain(col(13));

  await scrollStrip(page, 'filter', 0);
  await startRecording(page, 'filter');
  await page.evaluate(
    ({ change, remove }) => {
      const { actions } = (window as unknown as TestWindow).__dt;
      actions.addFilter({ type: 'null', column: change });
      actions.removeFilter(remove);
    },
    { change: col(13), remove: col(5) },
  );
  const unmoved = await recording(page);
  expect(new Set(unmoved)).toEqual(new Set([0]));

  await startRecording(page, 'filter');
  await filter([col(20)]);
  const glide = await recording(page);
  bar = await strip(page, 'filter');
  expect(bar.chips[bar.chips.length - 1]).toBe(col(20));
  expect(bar.whole).toContain(col(20));
  expect(between(glide).length).toBeGreaterThan(2);
});

test('chips of fractional width end whole, clear of "Show all", at a pixel ratio of 1', async ({
  page,
}) => {
  // At a device-pixel ratio of 1 the row scrolls by whole pixels, and to a
  // whole pixel at most. Rounded toward a chip, or stopped short of the end of
  // chips of fractional width, it left a fraction of the chip under the
  // pinned end: past half a pixel at 64.2px, with CI's Linux fonts as here.
  await mountTable(page, {
    columns: 300,
    width: 1000,
    height: 600,
    css: '.dt-hidden-chip { width: 64.2px; max-width: none; }',
  });
  expect(await page.evaluate(() => devicePixelRatio)).toBe(1);
  await hide(
    page,
    Array.from({ length: 50 }, (_, i) => col(i + 10)),
  );
  await settle(page);
  await still(page, 'hidden');
  let row = await strip(page, 'hidden');
  // At the end of the row, give or take the pixel past the last chip.
  expect(row.max - row.left).toBeLessThanOrEqual(1);
  expect(row.whole).toContain(col(59));

  // A chip added at the end, glided to from the start.
  await scrollStrip(page, 'hidden', 0);
  await hide(page, [col(200)]);
  await still(page, 'hidden');
  row = await strip(page, 'hidden');
  expect(row.whole).toContain(col(200));

  // Mid-row, by the keyboard: each chip the arrows reach is whole.
  await scrollStrip(page, 'hidden', Math.round(row.max / 2) + 0.4);
  await page.locator(`#${HOST_ID} .dt-hidden-show-all`).focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('ArrowRight');
    const name = await page.evaluate(
      () =>
        document.activeElement?.closest('.dt-hidden-chip')?.querySelector('.dt-hidden-chip-name')
          ?.textContent ?? '',
    );
    expect((await strip(page, 'hidden')).whole, `after → to ${name}`).toContain(name);
  }
});
