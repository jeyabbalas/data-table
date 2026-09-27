/**
 * Mount a table straight into the demo page through the public API, and read
 * back where its cursor and columns are.
 *
 * The demo's own load path builds a table the way a user does, but it offers
 * no knobs: no host size, no column count, no stats panel, no page without
 * the demo's `box-sizing` reset. Specs that need those create the table
 * in-page from the dev server's source instead, in a fixed-position host above
 * the demo. The data is generated in-page too; every cell is a pure function
 * of its row and column.
 *
 * The probes on `window.__dtTest` exist because `page.evaluate` callbacks
 * cannot see module scope. Installing them once beats inlining the same
 * geometry into every callback.
 */

import { expect, type Page } from '@playwright/test';
import { settle } from './demo';

/** Id of the element the table mounts into. */
export const HOST_ID = 'dt-test-host';

export interface MountOptions {
  /**
   * Columns, named `c` and the index zero-padded to the width of the last
   * one: `c00`…`c39` for 40, `c000`…`c299` for 300. Default 300.
   */
  columns?: number;
  /** Data rows. Default 200. */
  rows?: number;
  /** Host width in px. Default 1200. */
  width?: number;
  /** Host height in px. Default 600. */
  height?: number;
  /** Header charts. Default `false`: they cost a query per column in view. */
  visualizations?: boolean;
  /**
   * Put `box-sizing` back to `content-box` everywhere, undoing the demo's
   * global reset, so only the library's stylesheet sizes the table.
   */
  contentBox?: boolean;
  /** More CSS for the page, added before the table mounts. */
  css?: string;
  /**
   * Register a custom stats panel on every numeric column. Each panel writes
   * `panel <column>` into its slot and logs its construction and destruction
   * in `window.__dtTest.panelLog`. Stats panels come with the header charts,
   * so this needs `visualizations`.
   */
  statsPanel?: boolean;
}

/** Where a column's header sits against the header viewport, in px. */
export interface ColumnView {
  left: number;
  right: number;
  /** Visible part of the viewport: right of the pinned block, for an unpinned column. */
  viewLeft: number;
  viewRight: number;
  pinned: boolean;
  /** The whole header is inside the visible part. */
  inView: boolean;
}

/** What `aria-activedescendant` names, and where the cursor ring is painted. */
export interface CursorState {
  /** `state.focusedCell`. */
  focused: { row: number; column: string } | null;
  /** `aria-activedescendant` on `.dt-grid`. */
  activeId: string | null;
  /** The element the id resolves to inside the grid, or `null` if none. */
  target: {
    kind: 'header' | 'cell';
    /** `-1` for a header. */
    row: number;
    column: string;
    ringed: boolean;
    /**
     * Wholly inside the scroller that shows it, and right of the pinned block
     * unless it is pinned itself.
     */
    inView: boolean;
  } | null;
  /** Every element carrying a cursor ring, as `header:<column>` or `cell:<row>:<column>`. */
  rings: string[];
  /** `document.activeElement`, described. */
  active: string;
}

/** Page-side probes installed by {@link mountTable}. */
export interface TableProbes {
  cursor(): CursorState;
  /** `null` when the column has no header in the DOM. */
  column(name: string): ColumnView | null;
  /** Column names in DOM order of the header row. */
  headerOrder(): string[];
  /** `aria-colindex` of every header, in DOM order. */
  headerColIndexes(): number[];
  /** `aria-colindex` of every cell of the first rendered row, in DOM order. */
  cellColIndexes(): number[];
  /** The body scroller's horizontal position and its maximum. */
  scroll(): { left: number; max: number };
  panelLog: { event: 'construct' | 'destroy'; column: string }[];
}

/** What {@link mountTable} leaves on `window`, for `page.evaluate` callbacks. */
export type TestWindow = {
  __dt: import('../../../src/index').DataTable;
  __dtTest: TableProbes;
};

/**
 * Create a table in a fixed-position host at the top-left of the page and
 * load generated data into it. The table is on `window.__dt`, the probes on
 * `window.__dtTest`.
 *
 * Column `i` holds text (`k0`…`k6`) when `i % 3 === 1`, and numbers
 * otherwise, so the header charts include both histograms and value counts.
 */
export async function mountTable(page: Page, options: MountOptions = {}): Promise<void> {
  const o = {
    columns: options.columns ?? 300,
    rows: options.rows ?? 200,
    width: options.width ?? 1200,
    height: options.height ?? 600,
    visualizations: options.visualizations ?? false,
    statsPanel: options.statsPanel ?? false,
    hostId: HOST_ID,
  };
  await page.goto('./');
  // Same specificity as the demo's `*` reset and later in the cascade, so it
  // wins everywhere the library does not declare box-sizing itself.
  const reset = options.contentBox ? '*, *::before, *::after { box-sizing: content-box; }' : '';
  if (reset || options.css) await page.addStyleTag({ content: reset + (options.css ?? '') });

  await page.evaluate(async (o) => {
    const w = window as unknown as TestWindow;
    const mod = (await import(
      /* @vite-ignore */ '/data-table/src/index.ts'
    )) as typeof import('../../../src/index');

    const host = document.createElement('div');
    host.id = o.hostId;
    // Above the demo's own content, which sets no z-index, and below
    // everything the table portals to <body>: popovers from 55, modals 1000.
    host.style.cssText =
      `position: fixed; left: 0; top: 0; width: ${o.width}px; height: ${o.height}px;` +
      ' z-index: 1; background: white;';
    document.body.appendChild(host);

    const digits = String(o.columns - 1).length;
    const names = Array.from(
      { length: o.columns },
      (_, i) => `c${String(i).padStart(digits, '0')}`,
    );
    const lines = [names.join(',')];
    for (let r = 0; r < o.rows; r++) {
      lines.push(
        names
          .map((_, i) =>
            i % 3 === 1 ? `k${(r + i) % 7}` : String(((r * 31 + i * 17) % 1000) / 10),
          )
          .join(','),
      );
    }

    const panelLog: TableProbes['panelLog'] = [];
    let statsPanelRegistry: InstanceType<typeof mod.StatsPanelRegistry> | undefined;
    if (o.statsPanel) {
      const advanced = (await import(
        /* @vite-ignore */ '/data-table/src/advanced.ts'
      )) as typeof import('../../../src/advanced');
      class LoggingPanel extends advanced.BaseStatsPanel {
        constructor(
          container: HTMLElement,
          column: import('../../../src/index').ColumnSchema,
          options: import('../../../src/advanced').StatsPanelOptions,
        ) {
          super(container, column, options);
          panelLog.push({ event: 'construct', column: column.name });
          container.textContent = `panel ${column.name}`;
        }
        update(): void {}
        destroy(): void {
          panelLog.push({ event: 'destroy', column: this.column.name });
          super.destroy();
        }
      }
      statsPanelRegistry = new mod.StatsPanelRegistry();
      statsPanelRegistry.register({
        name: 'logging',
        isApplicable: (type) => type === 'float' || type === 'integer' || type === 'decimal',
        constructor: LoggingPanel,
        priority: 10,
      });
    }

    const table = await mod.createDataTable({
      container: host,
      tableName: 'generated',
      // No IndexedDB: a restored session would make this a different test.
      persistence: false,
      visualizations: o.visualizations,
      ...(statsPanelRegistry ? { statsPanelRegistry } : {}),
    });
    w.__dt = table;

    const q = (selector: string) => host.querySelector<HTMLElement>(selector);
    const describe = (el: Element | null): string => {
      if (!el) return 'null';
      if (el === document.body) return 'body';
      let s = el.tagName.toLowerCase();
      if (el.id) s += `#${el.id}`;
      const cls = typeof el.className === 'string' ? el.className.trim() : '';
      if (cls) s += `.${cls.split(/\s+/).slice(0, 2).join('.')}`;
      const column = el.closest('[data-column]')?.getAttribute('data-column');
      return column ? `${s} (${column})` : s;
    };
    /** Right edge of the pinned block, or `viewLeft` when nothing is pinned. */
    const pinnedRight = (viewLeft: number): number => {
      let right = viewLeft;
      for (const h of host.querySelectorAll('.dt-col-header--pinned')) {
        right = Math.max(right, h.getBoundingClientRect().right);
      }
      return right;
    };

    w.__dtTest = {
      panelLog,
      cursor() {
        const grid = q('.dt-grid')!;
        const focused = table.state.focusedCell.get();
        const activeId = grid.getAttribute('aria-activedescendant');
        let target: CursorState['target'] = null;
        const el = activeId ? document.getElementById(activeId) : null;
        if (el && grid.contains(el)) {
          const header = el.classList.contains('dt-col-header');
          const scroller = q(header ? '.dt-header-scroll' : '.dt-body-scroll')!;
          const view = scroller.getBoundingClientRect();
          const box = el.getBoundingClientRect();
          const pinned = el.classList.contains(
            header ? 'dt-col-header--pinned' : 'dt-cell--pinned',
          );
          const left = pinned ? view.left : pinnedRight(view.left);
          target = {
            kind: header ? 'header' : 'cell',
            row: header ? -1 : Number(el.closest('.dt-row')?.getAttribute('data-row-index')),
            column: el.getAttribute('data-column') ?? '',
            ringed: el.classList.contains(header ? 'dt-col-header--focused' : 'dt-cell--focused'),
            inView:
              box.left >= left - 0.5 &&
              box.right <= view.left + scroller.clientWidth + 0.5 &&
              box.top >= view.top - 0.5 &&
              box.bottom <= view.top + scroller.clientHeight + 0.5,
          };
        }
        const rings = [
          ...Array.from(
            host.querySelectorAll('.dt-col-header--focused'),
            (h) => `header:${h.getAttribute('data-column')}`,
          ),
          ...Array.from(
            host.querySelectorAll('.dt-cell--focused'),
            (c) =>
              `cell:${c.closest('.dt-row')?.getAttribute('data-row-index')}:${c.getAttribute('data-column')}`,
          ),
        ];
        return { focused, activeId, target, rings, active: describe(document.activeElement) };
      },
      column(name) {
        const header = Array.from(
          host.querySelectorAll<HTMLElement>('.dt-col-header[data-column]'),
        ).find((h) => h.dataset.column === name);
        if (!header) return null;
        const scroller = q('.dt-header-scroll')!;
        const view = scroller.getBoundingClientRect();
        const box = header.getBoundingClientRect();
        const pinned = header.classList.contains('dt-col-header--pinned');
        const viewLeft = pinned ? view.left : pinnedRight(view.left);
        const viewRight = view.left + scroller.clientWidth;
        return {
          left: box.left,
          right: box.right,
          viewLeft,
          viewRight,
          pinned,
          inView: box.left >= viewLeft - 0.5 && box.right <= viewRight + 0.5,
        };
      },
      headerOrder() {
        return Array.from(
          host.querySelectorAll('.dt-col-header[data-column]'),
          (h) => h.getAttribute('data-column') ?? '',
        );
      },
      headerColIndexes() {
        return Array.from(host.querySelectorAll('.dt-col-header[data-column]'), (h) =>
          Number(h.getAttribute('aria-colindex')),
        );
      },
      cellColIndexes() {
        const row = q('.dt-body .dt-row:not([data-placeholder])');
        return row
          ? Array.from(row.querySelectorAll('.dt-cell[data-column]'), (c) =>
              Number(c.getAttribute('aria-colindex')),
            )
          : [];
      },
      scroll() {
        const body = q('.dt-body-scroll')!;
        return { left: body.scrollLeft, max: body.scrollWidth - body.clientWidth };
      },
    };

    await table.loadData(new File([lines.join('\n')], 'generated.csv', { type: 'text/csv' }));
  }, o);

  await page.waitForFunction(
    (hostId) =>
      document.querySelectorAll(`#${hostId} .dt-body .dt-row:not([data-placeholder])`).length > 0,
    HOST_ID,
    { timeout: 90_000 },
  );
  await settle(page);
}

/** Call one of the probes {@link mountTable} installed in the page. */
export function probe<K extends keyof Omit<TableProbes, 'panelLog'>>(
  page: Page,
  name: K,
  ...args: Parameters<TableProbes[K]>
): Promise<ReturnType<TableProbes[K]>> {
  return page.evaluate(
    ({ name, args }) =>
      ((window as unknown as TestWindow).__dtTest[name] as (...a: unknown[]) => unknown)(...args),
    { name, args: args as unknown[] },
  ) as Promise<ReturnType<TableProbes[K]>>;
}

/**
 * Scroll sideways with real wheel events, `stepPx` at a time, until the table
 * has moved by `dx` or stopped at an edge, then wait for it to settle.
 *
 * Wheel events rather than `scrollLeft` writes: a wheel scroll arrives as a
 * run of moves, which is what a user produces and what observers and
 * windowing have to keep up with.
 *
 * @param opts.over - Where the pointer wheels: the body (default) or the
 *   header, or `pointer` to leave it where it is, which a drag in progress
 *   needs, since moving it would be part of the drag.
 */
export async function wheelBy(
  page: Page,
  dx: number,
  opts: { stepPx?: number; over?: 'body' | 'header' | 'pointer' } = {},
): Promise<void> {
  const stepPx = Math.min(Math.abs(dx), opts.stepPx ?? 400) * Math.sign(dx);
  if (opts.over !== 'pointer') {
    const target = opts.over === 'header' ? '.dt-header-scroll' : '.dt-body-scroll';
    const box = (await page.locator(`#${HOST_ID} ${target}`).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 60));
  }

  const start = (await probe(page, 'scroll')).left;
  let last = start;
  let stuck = 0;
  while (Math.abs(last - start) < Math.abs(dx) - 1 && stuck < 5) {
    await page.mouse.wheel(stepPx, 0);
    await page.waitForTimeout(16);
    const now = (await probe(page, 'scroll')).left;
    stuck = now === last ? stuck + 1 : 0;
    last = now;
  }
  expect(last, 'the wheel did not move the table').not.toBe(start);
  // A wheel scroll can animate; measure only once it has stopped.
  await expect
    .poll(
      async () => {
        const before = (await probe(page, 'scroll')).left;
        await page.waitForTimeout(50);
        return (await probe(page, 'scroll')).left === before;
      },
      { timeout: 5_000 },
    )
    .toBe(true);
  await settle(page);
}

/** Wheel until `column`'s header is wholly in view, from whichever side it is on. */
export async function wheelIntoView(page: Page, column: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const view = await probe(page, 'column', column);
    expect(view, `${column} has no header`).not.toBeNull();
    if (view!.inView) return;
    const dx =
      view!.left < view!.viewLeft ? view!.left - view!.viewLeft : view!.right - view!.viewRight;
    // Long distances in big steps, the last stretch in small ones.
    await wheelBy(page, dx, { stepPx: Math.max(400, Math.min(2_000, Math.abs(dx) / 10)) });
  }
  throw new Error(`could not wheel ${column} into view`);
}
