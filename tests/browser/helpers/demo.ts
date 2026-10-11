/**
 * Shared page-driving helpers for the browser accessibility suite.
 *
 * Everything here talks to the demo app (`index.html` + `demo/main.ts`)
 * rather than to a bespoke harness page, so the specs exercise the same
 * integration a user hits. Datasets are synthesised in-page and pushed
 * through the demo's `#file-input` with a `DataTransfer`, which keeps the
 * repo free of multi-megabyte fixture files and lets the column count be a
 * test parameter.
 */

import type { Page } from '@playwright/test';

/** Column counts the focus-order specs run at, to prove independence. */
export const NARROW_COLUMNS = 4;
export const WIDE_COLUMNS = 266;

/**
 * The example chip of the nested-types fixture, 1,000 rows of lists,
 * structs, maps and JSON (`tests/fixtures/datasets/nested-stress-tests.*`).
 */
export const NESTED_EXAMPLE = 'Nested types Parquet';

/**
 * {@link NESTED_EXAMPLE}'s structs and its list of structs, side by side: all
 * of them in the demo's view once `point` is scrolled to its left edge, the
 * five structs wholly and `people` all but its last 14 px (six 168 px columns
 * in a 994 px view). Its first screen holds lists only.
 */
export const NESTED_EXAMPLE_STRUCTS = [
  'point',
  'odd_names',
  'typed_leaves',
  'wide_struct',
  'nested_struct',
  'people',
] as const;

/**
 * Page-side probe surface installed by {@link installProbes}.
 *
 * Focus order is a property of real layout, so these helpers have to run in
 * the page. Installing them once as a global beats inlining the same
 * tabbability predicate into a dozen `evaluate` callbacks — Playwright
 * serialises each callback in isolation and cannot see module scope.
 */
export interface DtProbes {
  /** Every tabbable element in the document, in DOM order. */
  tabbables(): HTMLElement[];
  /** Short human-readable descriptor: `button#id.class`. */
  describe(el: Element | null): string;
  /** A token unique to this element, stable for the page's lifetime. */
  identify(el: Element | null): string;
  /** Tabbables split by position relative to `selector`'s element. */
  partition(selector: string): { before: string[]; inside: string[]; after: string[] };
  /** Whether `document.activeElement` sits inside `selector`'s element. */
  activeInside(selector: string): boolean;
  /** Whether `document.activeElement` follows `selector`'s element in the DOM. */
  activeAfter(selector: string): boolean;
  /** Whether `document.activeElement` precedes `selector`'s element in the DOM. */
  activeBefore(selector: string): boolean;
  /** Focus the last tabbable before `selector`'s element. */
  focusLastBefore(selector: string): string;
  /** Focus the first tabbable after `selector`'s element. */
  focusFirstAfter(selector: string): string;
}

declare global {
  interface Window {
    __dtA11y: DtProbes;
  }
}

/**
 * Install the page-side probes. Uses `addInitScript` so they survive
 * navigation and are present before any application code runs.
 */
export async function installProbes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const SELECTOR = 'a[href],button,input,select,textarea,[tabindex],iframe,[contenteditable]';

    /**
     * Approximates Chrome's sequential-navigation set. Deliberately does not
     * model positive `tabindex` reordering — nothing in this app uses it, and
     * the real `Tab` walk in the specs is the authoritative check anyway.
     */
    const isTabbable = (el: Element): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const ti = el.getAttribute('tabindex');
      if (ti !== null && Number.parseInt(ti, 10) < 0) return false;
      if ('disabled' in el && (el as HTMLInputElement).disabled) return false;
      if (el.getAttribute('aria-hidden') === 'true') return false;
      if (el.closest('[inert]')) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      // Zero client rects catches `content-visibility`, collapsed ancestors,
      // and anything clipped to nothing — all unreachable in practice.
      return el.getClientRects().length > 0;
    };

    const describe = (el: Element | null): string => {
      if (!el) return 'null';
      if (el === document.body) return 'body';
      let s = el.tagName.toLowerCase();
      if (el.id) s += `#${el.id}`;
      const cls = typeof el.className === 'string' ? el.className.trim() : '';
      if (cls) s += `.${cls.split(/\s+/).slice(0, 2).join('.')}`;
      return s;
    };

    const tabbables = (): HTMLElement[] =>
      Array.from(document.querySelectorAll(SELECTOR)).filter(isTabbable) as HTMLElement[];

    const require = (selector: string): Element => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`probe: no element matches ${selector}`);
      return el;
    };

    const partition = (selector: string) => {
      const root = require(selector);
      const all = tabbables();
      const rel = (el: Element, mask: number) =>
        !root.contains(el) && !!(root.compareDocumentPosition(el) & mask);
      return {
        before: all.filter((e) => rel(e, Node.DOCUMENT_POSITION_PRECEDING)).map(describe),
        inside: all.filter((e) => root.contains(e)).map(describe),
        after: all.filter((e) => rel(e, Node.DOCUMENT_POSITION_FOLLOWING)).map(describe),
      };
    };

    // Element identity, stamped on first sight. Descriptors collide (two
    // chips in one toolbar look identical), so cycle detection needs this.
    let stamped = 0;
    const identify = (el: Element | null): string => {
      if (!(el instanceof HTMLElement)) return 'none';
      let token = el.dataset.dtProbeId;
      if (!token) {
        token = `e${++stamped}`;
        el.dataset.dtProbeId = token;
      }
      return token;
    };

    window.__dtA11y = {
      tabbables,
      describe,
      identify,
      partition,
      activeInside: (selector) => require(selector).contains(document.activeElement),
      activeAfter: (selector) => {
        const root = require(selector);
        const a = document.activeElement;
        return (
          !!a &&
          !root.contains(a) &&
          !!(root.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING)
        );
      },
      activeBefore: (selector) => {
        const root = require(selector);
        const a = document.activeElement;
        return (
          !!a &&
          !root.contains(a) &&
          !!(root.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_PRECEDING)
        );
      },
      focusLastBefore: (selector) => {
        const root = require(selector);
        const before = tabbables().filter(
          (e) =>
            !root.contains(e) &&
            !!(root.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_PRECEDING),
        );
        const target = before[before.length - 1];
        if (!target) throw new Error(`probe: nothing tabbable before ${selector}`);
        target.focus();
        return describe(target);
      },
      focusFirstAfter: (selector) => {
        const root = require(selector);
        const target = tabbables().find(
          (e) =>
            !root.contains(e) &&
            !!(root.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING),
        );
        if (!target) throw new Error(`probe: nothing tabbable after ${selector}`);
        target.focus();
        return describe(target);
      },
    };
  });
}

/**
 * Navigate to the demo and wait for it to settle: the "Open file" button is
 * disabled while the demo restores a saved session.
 */
export async function openDemo(page: Page): Promise<void> {
  await installProbes(page);
  await page.goto('./');
  await page.waitForFunction(
    () => document.querySelector<HTMLButtonElement>('#open-file-btn')?.disabled === false,
    undefined,
    { timeout: 90_000 },
  );
}

/**
 * Synthesise a CSV with `columns` columns and push it through the demo's
 * file input, then wait for the grid to finish its first paint.
 *
 * The column type mix is deliberate: every third column is categorical so
 * the header row renders both value-counts and histogram plots, which is
 * where issue #84's control explosion came from.
 */
export async function loadCsv(page: Page, columns: number, rows = 200): Promise<void> {
  await page.evaluate(
    ({ columns, rows }) => {
      const names = Array.from({ length: columns }, (_, i) =>
        i % 3 === 0 ? `num_col_${i}` : i % 3 === 1 ? `cat_col_${i}` : `val_col_${i}`,
      );
      const lines = [names.join(',')];
      for (let r = 0; r < rows; r++) {
        lines.push(
          names
            .map((_, i) =>
              i % 3 === 1 ? `cat${(r + i) % 7}` : String(((r * 31 + i * 17) % 1000) / 10),
            )
            .join(','),
        );
      }
      const file = new File([lines.join('\n')], `wide${columns}.csv`, { type: 'text/csv' });
      const dt = new DataTransfer();
      dt.items.add(file);
      // A picked file loads at once, as the file picker's change says.
      const input = document.querySelector<HTMLInputElement>('#file-input')!;
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { columns, rows },
  );

  await page.waitForFunction(
    () =>
      !!document.querySelector('.dt-grid[role="grid"]') &&
      document.querySelectorAll('.dt-root [role="columnheader"]').length > 0 &&
      document.querySelectorAll('.dt-body .dt-row').length > 0,
    undefined,
    { timeout: 90_000 },
  );
  // Column-header plots render asynchronously after the first row paint;
  // their buttons are part of the tab-stop census, so wait them out.
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await settle(page);
}

/**
 * Click the demo's example chip labelled `name`, and wait for the load to
 * end and the grid to finish its first paint, as {@link loadCsv} does.
 *
 * In development a chip loads the dev server's copy of its fixture, from
 * `/fixtures/`, not GitHub's.
 */
export async function loadExample(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name }).click();
  // The info bar gains the load's time once `loadData` has resolved.
  await page.waitForFunction(
    () => document.querySelector('#table-info')?.textContent?.includes('loaded in') === true,
    undefined,
    { timeout: 90_000 },
  );
  await page.waitForFunction(
    () =>
      !!document.querySelector('.dt-grid[role="grid"]') &&
      document.querySelectorAll('.dt-root [role="columnheader"]').length > 0 &&
      document.querySelectorAll('.dt-body .dt-row:not([data-placeholder])').length > 0,
    undefined,
    { timeout: 90_000 },
  );
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await settle(page);
}

/**
 * Make the demo's table `height` px tall, taller than the window.
 *
 * The demo fits its table to the window, which at the test viewport is a
 * short one: a panel that opens below a header has little room, and the
 * page does not scroll. Specs that need room, or a grid taller than the
 * window, as on a page that lays a long table out in its flow, call this
 * first.
 */
export async function tallDemoTable(page: Page, height = 960): Promise<void> {
  await page.addStyleTag({ content: `.workspace { flex: none; height: ${height}px; }` });
  await settle(page);
}

/**
 * Mount a table with no data source and wait for its shell to paint.
 *
 * The demo only constructs a `DataTable` once a file is loaded, so this is
 * the one way to reach the unloaded state from here — and that state matters:
 * `createDataTable({ container })` with no `source` is the documented way to
 * mount first and `loadData()` later, so an empty shell is many consumers'
 * first paint. It is also where the grid transiently owns a `role="row"`
 * with no cells.
 *
 * Imports the library straight from the dev server rather than through the
 * demo, so nothing here depends on demo wiring.
 */
export async function mountEmptyTable(
  page: Page,
  colorScheme: 'light' | 'dark' = 'light',
): Promise<void> {
  await installProbes(page);
  await page.goto('./');
  await page.evaluate(async (scheme) => {
    const mod = (await import(
      /* @vite-ignore */ '/data-table/src/index.ts'
    )) as typeof import('../../../src/index');
    const host = document.createElement('div');
    host.id = 'empty-table-host';
    document.querySelector('#table-container')!.appendChild(host);
    await mod.createDataTable({
      container: host,
      colorScheme: scheme,
      // No IndexedDB: a restored session would put data in the "unloaded"
      // state and quietly make this a different test.
      persistence: false,
    });
  }, colorScheme);
  await page.waitForSelector('.dt-root', { timeout: 90_000 });
  await settle(page);
}

/**
 * Wait for the table to stop mutating.
 *
 * Stats queries, plot rendering, and the virtual scroller all land on
 * separate microtask/rAF boundaries. Polling the child count until it holds
 * still is more reliable than a fixed sleep and much faster in the common
 * case.
 */
export async function settle(page: Page, quietFrames = 3): Promise<void> {
  await page.waitForFunction(
    (needed) => {
      const w = window as unknown as { __dtSettle?: { last: number; stable: number } };
      const root = document.querySelector('.dt-root');
      const size = root ? root.querySelectorAll('*').length : -1;
      const s = (w.__dtSettle ??= { last: -1, stable: 0 });
      s.stable = size === s.last ? s.stable + 1 : 0;
      s.last = size;
      return s.stable >= needed;
    },
    quietFrames,
    { polling: 120, timeout: 60_000 },
  );
  await page.evaluate(() => {
    delete (window as unknown as { __dtSettle?: unknown }).__dtSettle;
  });
}

/** Switch the demo's colour scheme and wait for the attribute to land. */
export async function setTheme(page: Page, theme: 'light' | 'dark' | 'auto'): Promise<void> {
  await page.locator(`input[name="theme"][value="${theme}"]`).check();
  if (theme !== 'auto') {
    await page.waitForFunction(
      (t) => document.querySelector('.dt-root')?.getAttribute('data-dt-color-scheme') === t,
      theme,
    );
  }
  await settle(page);
}

/** Result of walking `Tab` (or `Shift+Tab`) out of a region. */
export interface TabWalk {
  /** Presses needed to leave the region, or `null` if it never happened. */
  presses: number | null;
  /** Every element focus visited, for failure messages. */
  trail: string[];
  /**
   * One stable token per visited element, for detecting a cycle.
   *
   * Distinct from {@link trail} because descriptors are not unique — two
   * chips in the same toolbar describe identically, and comparing those
   * would report a cycle that is really just two different buttons.
   */
  identities: string[];
}

/**
 * Press `Tab` until focus lands past `selector`'s element (or before it, in
 * reverse), giving up after `max` presses.
 *
 * This is the WCAG 2.1.2 check. It only means anything with a real browser
 * driving real sequential focus navigation — jsdom performs none, which is
 * why a live keyboard trap passed the entire vitest suite.
 */
export async function tabOut(
  page: Page,
  selector: string,
  opts: { shift?: boolean; max?: number } = {},
): Promise<TabWalk> {
  const { shift = false, max = 80 } = opts;
  const key = shift ? 'Shift+Tab' : 'Tab';
  const trail: string[] = [];
  const identities: string[] = [];

  for (let i = 1; i <= max; i++) {
    await page.keyboard.press(key);
    const state = await page.evaluate(
      ({ selector, shift }) => ({
        el: window.__dtA11y.describe(document.activeElement),
        id: window.__dtA11y.identify(document.activeElement),
        inside: window.__dtA11y.activeInside(selector),
        out: shift ? window.__dtA11y.activeBefore(selector) : window.__dtA11y.activeAfter(selector),
      }),
      { selector, shift },
    );
    trail.push(`${String(i).padStart(2)}: ${state.el}${state.inside ? '  [inside]' : ''}`);
    identities.push(state.id);
    if (state.out) return { presses: i, trail, identities };
  }
  return { presses: null, trail, identities };
}
