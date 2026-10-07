/**
 * Header controls as pointer targets: WCAG 2.2 SC 2.5.8, Target Size
 * (Minimum).
 *
 * Each control is 22 px, under the 24 px the criterion asks for, so it
 * passes on spacing: a 24 px circle centred on each must meet no other
 * target and no other circle, which for two 22 px buttons side by side means
 * centres 24 px apart, 2 px between them. A nested or JSON column's header
 * has six controls (pin, hide, filter, extract, sort, the drag handle). At
 * the 150 px every column had, they needed 132 px where the bar clips at
 * 128: they touched, centres 22 px apart, and the drag handle lost the last
 * 4 px of its box. Nested and JSON columns are 168 px wide until resized,
 * and the bar keeps 2 px between its controls however narrow its column,
 * revealed or not.
 *
 * axe ships `target-size` disabled, so `axe.spec.ts`'s scans never ran it.
 * The controls are out of the tab order, so where two are too close axe
 * cannot decide: it reports them as incomplete, not as violations, and the
 * scans here fail on either.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { NESTED_EXAMPLE, loadExample, openDemo, settle } from './helpers/demo';
import { scrollToColumn } from './helpers/nested';
import { HOST_ID, type TestWindow, mountTable } from './helpers/table';

/** The demo's table. */
const DEMO = '#table-container';

/** A nested or JSON column's header controls, in order, the drag handle last. */
const NESTED_CONTROLS = [
  'dt-col-pin-btn',
  'dt-col-hide-btn',
  'dt-col-filter-btn',
  'dt-col-extract-btn',
  'dt-col-sort-btn',
  'dt-col-drag-handle',
];

/** Any other column's. */
const CONTROLS = NESTED_CONTROLS.filter((c) => c !== 'dt-col-extract-btn');

/** The closest two neighbouring centres may be: 24 px, less rounding. */
const MIN_PITCH = 23.99;

type DemoWindow = { __dtDemo: { table: import('../../src/index').DataTable | null } };

/** A header's action bar, as laid out. */
interface Bar {
  /** The header's width. */
  width: number;
  /** Its controls, in DOM order, each by its own class. */
  controls: string[];
  /** From each control's centre to the next one's, in px. */
  pitches: number[];
  /**
   * Controls whose box, with the 3 px each side its focus ring takes (a 2 px
   * outline 1 px out), runs past the bar's clip, the bar's padding box.
   */
  clipped: string[];
}

function bar(page: Page, root: string, column: string): Promise<Bar> {
  return page.evaluate(
    ({ root, column, known }) => {
      const header = Array.from(
        document.querySelectorAll<HTMLElement>(`${root} .dt-col-header[data-column]`),
      ).find((h) => h.dataset.column === column);
      if (!header) throw new Error(`no header for ${column}`);
      const panel = header.querySelector<HTMLElement>('.dt-col-action-panel')!;
      const clip = panel.getBoundingClientRect();
      const controls = Array.from(panel.children);
      const boxes = controls.map((c) => c.getBoundingClientRect());
      const name = (el: Element) => known.find((k) => el.classList.contains(k)) ?? el.className;
      const centres = boxes.map((b) => b.left + b.width / 2);
      return {
        width: header.getBoundingClientRect().width,
        controls: controls.map(name),
        pitches: centres.slice(1).map((c, i) => Math.round((c - centres[i]!) * 100) / 100),
        clipped: controls.flatMap((c, i) => {
          const b = boxes[i]!;
          const past = Math.max(clip.left - (b.left - 3), b.right + 3 - clip.right);
          return past > 0.05 ? [`${name(c)}: ${past.toFixed(2)} px`] : [];
        }),
      };
    },
    { root, column, known: NESTED_CONTROLS },
  );
}

/** Controls of `column` whose middle does not reach them: covered, or not painted there. */
function unreachable(page: Page, root: string, column: string): Promise<string[]> {
  return page.evaluate(
    ({ root, column }) => {
      const header = Array.from(
        document.querySelectorAll<HTMLElement>(`${root} .dt-col-header[data-column]`),
      ).find((h) => h.dataset.column === column)!;
      const panel = header.querySelector<HTMLElement>('.dt-col-action-panel')!;
      return Array.from(panel.children)
        .filter((el) => {
          const c = el.getBoundingClientRect();
          const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
          return !(hit && el.contains(hit));
        })
        .map((el) => el.className);
    },
    { root, column },
  );
}

/** Park the pointer outside the table, so no bar is revealed. */
async function pointerAway(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
}

/** Point at the start of `column`'s bar, and wait for it to show every control. */
async function revealBar(page: Page, root: string, column: string): Promise<void> {
  const panel = page.locator(
    `${root} .dt-col-header[data-column="${column}"] .dt-col-action-panel`,
  );
  // The demo's table starts below the fold.
  await panel.scrollIntoViewIfNeeded();
  const box = (await panel.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await expect.poll(() => unreachable(page, root, column)).toEqual([]);
}

async function openNestedExample(page: Page): Promise<void> {
  await openDemo(page);
  await loadExample(page, NESTED_EXAMPLE);
  await pointerAway(page);
}

/** Scroll the demo's table to `column`, and wait for its header's controls. */
async function showColumn(page: Page, column: string): Promise<void> {
  await scrollToColumn(page, column, DEMO);
  await expect(
    page.locator(`${DEMO} .dt-col-header[data-column="${column}"] .dt-col-sort-btn`),
  ).toBeVisible();
  await settle(page);
}

test('a nested or JSON column is 168 px wide until resized, and its six controls fit, 24 px apart', async ({
  page,
}) => {
  test.slow();
  await openNestedExample(page);

  await test.step('every nested and JSON header is 168 px, every other 150', async () => {
    const headers = await page.evaluate((root) => {
      const table = (window as unknown as DemoWindow).__dtDemo.table!;
      const inspectable = new Set(
        table.state.schema
          .get()
          .filter((c) => c.type === 'nested' || c.originalType === 'JSON')
          .map((c) => c.name),
      );
      return Array.from(
        document.querySelectorAll<HTMLElement>(`${root} .dt-col-header[data-column]`),
        (h) => ({
          column: h.dataset.column!,
          expected: inspectable.has(h.dataset.column!) ? 168 : 150,
          width: Math.round(h.getBoundingClientRect().width * 100) / 100,
        }),
      );
    }, DEMO);
    expect(headers.filter((h) => h.width === 150).map((h) => h.column)).toEqual([
      'id',
      'label',
      'notes',
      'raw_blob',
    ]);
    expect(headers.filter((h) => h.width !== h.expected)).toEqual([]);
    expect(headers.filter((h) => h.width === 168)).toHaveLength(32);
  });

  for (const column of ['tags', 'point', 'doc']) {
    await test.step(`${column}: its controls in order, whole, centres 24 px apart`, async () => {
      await showColumn(page, column);
      const b = await bar(page, DEMO, column);
      expect(b.width, column).toBe(168);
      expect(b.controls, column).toEqual(NESTED_CONTROLS);
      expect(b.clipped, column).toEqual([]);
      expect(Math.min(...b.pitches), `${column}: ${b.pitches.join(', ')}`).toBeGreaterThanOrEqual(
        MIN_PITCH,
      );
    });
  }

  await test.step('label, at 150 px: five controls, where they were', async () => {
    await showColumn(page, 'label');
    const b = await bar(page, DEMO, 'label');
    expect(b.width).toBe(150);
    expect(b.controls).toEqual(CONTROLS);
    expect(b.clipped).toEqual([]);
    // 110 px of controls across the bar's 125: 3.75 px between each, the
    // same with the 2 px gap as without it.
    expect(b.pitches).toEqual([25.75, 25.75, 25.75, 25.75]);
  });
});

test('axe finds the header controls 24 px apart (target-size), and leaves nothing undecided', async ({
  page,
}) => {
  test.slow();
  await openNestedExample(page);

  // The lists first, then the structs, then the maps and JSON.
  for (const column of [null, 'point', 'attrs']) {
    if (column) await showColumn(page, column);
    await pointerAway(page);
    const results = await new AxeBuilder({ page })
      .include('.dt-col-action-panel')
      .withRules(['target-size'])
      .analyze();
    const nodes = (rs: typeof results.violations) =>
      rs.flatMap((r) =>
        r.nodes.map((n) => {
          const why = [...n.any, ...n.all, ...n.none].find((c) => c.data)?.data as
            { messageKey?: string; closestOffset?: number } | undefined;
          return `${n.target.join(' ')}: ${why?.messageKey ?? ''} ${why?.closestOffset ?? ''}`;
        }),
      );
    const at = column ?? 'the first screen';
    expect(nodes(results.violations), `violations at ${at}`).toEqual([]);
    expect(nodes(results.incomplete), `undecided at ${at}`).toEqual([]);
    const passed = results.passes.flatMap((r) => r.nodes);
    expect(passed.length, `passes at ${at}`).toBeGreaterThan(20);
  }
});

test('F2 shows the whole focus ring of each control on a nested or JSON header', async ({
  page,
}) => {
  test.slow();
  await openNestedExample(page);

  for (const [column, before] of [
    ['tags', 'raw_blob'],
    ['doc', 'map_of_structs'],
  ] as const) {
    await showColumn(page, before);
    await page.locator(`${DEMO} .dt-grid`).focus();
    await page.evaluate(
      (column) =>
        (window as unknown as DemoWindow).__dtDemo.table!.actions.setFocusedCell({
          row: -1,
          column,
        }),
      before,
    );
    await page.keyboard.press('ArrowRight');
    await settle(page);
    await expect(page.locator(`${DEMO} .dt-col-header--focused`)).toHaveAttribute(
      'data-column',
      column,
    );

    await page.keyboard.press('F2');
    const seen: string[] = [];
    // Every control F2 reaches: all but the drag handle, which column
    // layout mode (Shift+F2) stands in for.
    for (let i = 0; i < NESTED_CONTROLS.length - 1; i++) {
      const ring = await page.evaluate((known) => {
        const el = document.activeElement as HTMLElement;
        const clip = el.closest<HTMLElement>('.dt-col-action-panel')!.getBoundingClientRect();
        const style = getComputedStyle(el);
        const ring = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
        const b = el.getBoundingClientRect();
        return {
          control: known.find((k) => el.classList.contains(k)) ?? el.className,
          left: Math.max(0, Math.round((clip.left - (b.left - ring)) * 10) / 10),
          right: Math.max(0, Math.round((b.right + ring - clip.right) * 10) / 10),
        };
      }, NESTED_CONTROLS);
      expect(ring, `${column}: ${ring.control}`).toMatchObject({ left: 0, right: 0 });
      seen.push(ring.control);
      await page.keyboard.press('ArrowRight');
    }
    expect(seen, column).toEqual(NESTED_CONTROLS.slice(0, -1));
    await page.keyboard.press('Escape');
  }
});

test('pointed at, a 60 px nested column’s bar shows its six controls 24 px apart', async ({
  page,
}) => {
  test.slow();
  await openNestedExample(page);
  // `tags` is on the first screen, after four scalar columns.
  await page.evaluate(() =>
    (window as unknown as DemoWindow).__dtDemo.table!.actions.setColumnWidth('tags', 60),
  );
  await settle(page);
  await expect(
    page.locator(`${DEMO} .dt-col-header[data-column="tags"] .dt-col-drag-handle`),
  ).toBeAttached();

  await revealBar(page, DEMO, 'tags');

  const b = await bar(page, DEMO, 'tags');
  expect(b.width).toBe(60);
  expect(b.controls).toEqual(NESTED_CONTROLS);
  expect(b.clipped).toEqual([]);
  expect(Math.min(...b.pitches), b.pitches.join(', ')).toBeGreaterThanOrEqual(MIN_PITCH);
});

test('pointed at, a 60 px column’s bar shows its five controls 24 px apart', async ({ page }) => {
  await mountTable(page, { columns: 40 });
  await page.evaluate(() =>
    (window as unknown as TestWindow).__dt.actions.setColumnWidth('c03', 60),
  );
  await settle(page);
  await pointerAway(page);

  await revealBar(page, `#${HOST_ID}`, 'c03');

  const b = await bar(page, `#${HOST_ID}`, 'c03');
  expect(b.width).toBe(60);
  expect(b.controls).toEqual(CONTROLS);
  expect(b.clipped).toEqual([]);
  expect(Math.min(...b.pitches), b.pitches.join(', ')).toBeGreaterThanOrEqual(MIN_PITCH);
});
