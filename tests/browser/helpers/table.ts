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
 * cannot see module scope. They take column order and geometry from the
 * table's state, not from the header row: a table that renders only the
 * columns near the view has no header for the others, and a check that
 * needs one would fail, or pass, without testing anything.
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

/**
 * Where a column sits against the body's viewport, in px, worked out from
 * the table's state: visible order, widths, pinned columns and `scrollLeft`.
 * The header and the cells of a column share it.
 */
export interface ColumnView {
  left: number;
  right: number;
  /** Visible part of the viewport: right of the pinned block, for an unpinned column. */
  viewLeft: number;
  viewRight: number;
  pinned: boolean;
  /** The whole column is inside the visible part. */
  inView: boolean;
  /** Its header is in the DOM. */
  mounted: boolean;
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

/** `aria-colindex` as rendered, with the column order it has to follow. */
export interface AriaColIndexes {
  columnOrder: string[];
  /** Every header in the DOM, in DOM order, as `[column, aria-colindex]`. */
  headers: [string, number][];
  /** The cells of the first row with data, likewise. */
  cells: [string, number][];
}

/** Page-side probes installed by {@link mountTable}. */
export interface TableProbes {
  cursor(): CursorState;
  /** `null` when the column is not visible. */
  column(name: string): ColumnView | null;
  /** `state.visibleColumns`: the presented order. */
  order(): string[];
  /** Visible columns at least partly inside the body's viewport, from state. */
  inView(): string[];
  ariaColIndexes(): AriaColIndexes;
  /** The body scroller's horizontal position and its maximum. */
  scroll(): { left: number; max: number };
  /**
   * Check the cursor every frame until {@link TableProbes.cursorBreaches}:
   * whenever there is one, `aria-activedescendant` has to name the element
   * that carries its ring.
   */
  watchCursor(): void;
  /** Stop {@link TableProbes.watchCursor} and return every frame that failed. */
  cursorBreaches(): string[];
  /** The columns the column window controller publishes to mount, in order. */
  mounted(): string[];
  /**
   * Check every frame until {@link TableProbes.windowReport} that each column
   * at least partly in view is among the mounted ones, and that every body
   * row with data holds a cell for exactly the mounted columns, in order.
   * Count how often the mounted columns change.
   */
  watchWindow(): void;
  /** Stop {@link TableProbes.watchWindow}: the frames that failed, and the changes seen. */
  windowReport(): { breaches: string[]; changes: number; frames: number };
  /** Body rows with data, and the cells in them. */
  bodyCells(): { rows: number; cells: number };
  /**
   * Every cell of a column in view, in every body row with data, checked
   * against the value generated for it: missing cells and wrong values, as
   * `row/column: what was there`.
   */
  wrongCellsInView(): string[];
  /**
   * How far each cell of the first body row with data sits from its column's
   * header, horizontally: the largest gap, in px, and the column it is in.
   */
  cellHeaderMisalignment(): { px: number; column: string | null };
  /**
   * How many columns each body row fetch since the last call selected,
   * `__rowid__` left out, in the order they were sent.
   */
  rowFetchWidths(): number[];
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
        override destroy(): void {
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

    // Every body row fetch, by the columns it selects. They are the queries
    // that select `__rowid__` first.
    const rowFetches: number[] = [];
    const query = table.bridge.query.bind(table.bridge);
    table.bridge.query = ((sql: string, ...rest: unknown[]) => {
      const list = /^SELECT "__rowid__"(.*?) FROM /.exec(sql)?.[1];
      if (list !== undefined) rowFetches.push(list === '' ? 0 : list.split(', ').length - 1);
      return (query as (...a: unknown[]) => unknown)(sql, ...rest);
    }) as typeof table.bridge.query;

    const q = (selector: string) => host.querySelector<HTMLElement>(selector);
    const headerOf = (column: string) =>
      Array.from(host.querySelectorAll<HTMLElement>('.dt-col-header[data-column]')).find(
        (h) => h.dataset.column === column,
      ) ?? null;
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
    /** A column's width as the table resolves it: whole pixels, 150 when unset or invalid. */
    const widthOf = (column: string): number => {
      const declared = table.state.columnWidths.get().get(column);
      return typeof declared === 'number' && Number.isFinite(declared) && declared >= 0
        ? Math.round(declared)
        : 150;
    };
    /** Right edge of the pinned block, or `viewLeft` when nothing is pinned. */
    const pinnedRight = (viewLeft: number): number => {
      let right = viewLeft;
      for (const h of host.querySelectorAll('.dt-col-header--pinned')) {
        right = Math.max(right, h.getBoundingClientRect().right);
      }
      return right;
    };

    let watch: { active: boolean; breaches: string[] } | null = null;
    const dataRows = () =>
      Array.from(host.querySelectorAll<HTMLElement>('.dt-body .dt-row:not([data-placeholder])'));
    /** The value `mountTable` generated for row `r` of the column named `name`. */
    const generated = (r: number, name: string): string | number => {
      const i = Number(name.slice(1));
      return i % 3 === 1 ? `k${(r + i) % 7}` : ((r * 31 + i * 17) % 1000) / 10;
    };
    let windowWatch: {
      active: boolean;
      breaches: string[];
      changes: number;
      frames: number;
      stop: () => void;
    } | null = null;

    const probes: TableProbes = {
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
        const visible = table.state.visibleColumns.get();
        if (!visible.includes(name)) return null;
        // Pinned columns lead the visible order, so offsets into the content
        // double as offsets into the pinned block.
        const pinnedSet = new Set(table.state.pinnedColumns.get());
        let x = 0;
        let offset = 0;
        let pinnedWidth = 0;
        for (const c of visible) {
          if (c === name) offset = x;
          if (pinnedSet.has(c)) pinnedWidth += widthOf(c);
          x += widthOf(c);
        }
        const body = q('.dt-body-scroll')!;
        const view = body.getBoundingClientRect();
        const pinned = pinnedSet.has(name);
        const left = view.left + offset - (pinned ? 0 : body.scrollLeft);
        const right = left + widthOf(name);
        const viewLeft = pinned ? view.left : view.left + pinnedWidth;
        const viewRight = view.left + body.clientWidth;
        return {
          left,
          right,
          viewLeft,
          viewRight,
          pinned,
          inView: left >= viewLeft - 0.5 && right <= viewRight + 0.5,
          mounted: headerOf(name) !== null,
        };
      },
      order() {
        return [...table.state.visibleColumns.get()];
      },
      inView() {
        // One pass: `column()` walks every column, and this runs every frame
        // of a watch, so calling it per column made a 1,000-column frame take
        // seconds.
        const visible = table.state.visibleColumns.get();
        const pinnedSet = new Set(table.state.pinnedColumns.get());
        let pinnedWidth = 0;
        for (const c of visible) if (pinnedSet.has(c)) pinnedWidth += widthOf(c);
        const body = q('.dt-body-scroll')!;
        const scrollLeft = body.scrollLeft;
        const width = body.clientWidth;
        const shown: string[] = [];
        let x = 0;
        for (const name of visible) {
          const w = widthOf(name);
          // In content coordinates: a pinned column is always at the left.
          const pinned = pinnedSet.has(name);
          const left = pinned ? x + scrollLeft : x;
          const viewLeft = pinned ? scrollLeft : scrollLeft + pinnedWidth;
          if (left + w > viewLeft && left < scrollLeft + width) shown.push(name);
          x += w;
        }
        return shown;
      },
      ariaColIndexes() {
        const read = (els: Iterable<Element>): [string, number][] =>
          Array.from(els, (el) => [
            el.getAttribute('data-column') ?? '',
            Number(el.getAttribute('aria-colindex')),
          ]);
        const row = Array.from(
          host.querySelectorAll('.dt-body .dt-row:not([data-placeholder])'),
        ).find((r) => r.querySelector('.dt-cell[data-column]'));
        return {
          columnOrder: [...table.state.columnOrder.get()],
          headers: read(host.querySelectorAll('.dt-col-header[data-column]')),
          cells: row ? read(row.querySelectorAll('.dt-cell[data-column]')) : [],
        };
      },
      scroll() {
        const body = q('.dt-body-scroll')!;
        return { left: body.scrollLeft, max: body.scrollWidth - body.clientWidth };
      },
      watchCursor() {
        const state = { active: true, breaches: [] as string[] };
        watch = state;
        const frame = () => {
          if (!state.active) return;
          const c = probes.cursor();
          if (c.focused && !c.target?.ringed && state.breaches.length < 20) {
            state.breaches.push(
              `${c.focused.row}/${c.focused.column}: aria-activedescendant=${c.activeId}` +
                ` resolves to ${c.target ? `${c.target.kind} ${c.target.column}` : 'nothing'}`,
            );
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      },
      cursorBreaches() {
        const breaches = watch?.breaches ?? [];
        if (watch) watch.active = false;
        watch = null;
        return breaches;
      },
      mounted() {
        return [...table.container.getColumnWindow().mountedColumns.get()];
      },
      watchWindow() {
        const published = table.container.getColumnWindow().mountedColumns;
        const state = {
          active: true,
          breaches: [] as string[],
          changes: 0,
          frames: 0,
          stop: published.subscribe(() => state.changes++),
        };
        windowWatch = state;
        const frame = () => {
          if (!state.active) return;
          state.frames++;
          const at = `at ${q('.dt-body-scroll')!.scrollLeft}px`;
          const list = published.get();
          const mounted = new Set(list);
          const missing = probes.inView().filter((c) => !mounted.has(c));
          if (missing.length > 0 && state.breaches.length < 20) {
            state.breaches.push(`${at}: ${missing.join(' ')} in view, not mounted`);
          }
          const expected = list.join(' ');
          for (const row of dataRows()) {
            const cells = Array.from(row.querySelectorAll('.dt-cell[data-column]'), (cell) =>
              cell.getAttribute('data-column'),
            ).join(' ');
            if (cells !== expected && state.breaches.length < 20) {
              state.breaches.push(
                `${at}: row ${row.getAttribute('data-row-index')} holds [${cells}], not [${expected}]`,
              );
            }
          }
          requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      },
      windowReport() {
        const state = windowWatch;
        windowWatch = null;
        if (!state) return { breaches: [], changes: 0, frames: 0 };
        state.active = false;
        state.stop();
        return { breaches: state.breaches, changes: state.changes, frames: state.frames };
      },
      bodyCells() {
        const rows = dataRows();
        return {
          rows: rows.length,
          cells: rows.reduce((n, row) => n + row.querySelectorAll('.dt-cell').length, 0),
        };
      },
      wrongCellsInView() {
        const wrong: string[] = [];
        const columns = probes.inView();
        for (const row of dataRows()) {
          const r = Number(row.getAttribute('data-row-index'));
          for (const column of columns) {
            const cell = row.querySelector(`.dt-cell[data-column="${column}"]`);
            const want = generated(r, column);
            const text = cell?.textContent ?? null;
            const right =
              text !== null &&
              (typeof want === 'number' ? Number(text.replace(/,/g, '')) === want : text === want);
            if (!right && wrong.length < 20) wrong.push(`${r}/${column}: ${text ?? 'no cell'}`);
          }
        }
        return wrong;
      },
      rowFetchWidths() {
        return rowFetches.splice(0);
      },
      cellHeaderMisalignment() {
        let worst = { px: 0, column: null as string | null };
        const row = dataRows()[0];
        if (!row) return worst;
        for (const cell of row.querySelectorAll<HTMLElement>('.dt-cell[data-column]')) {
          const column = cell.getAttribute('data-column')!;
          const header = headerOf(column);
          if (!header) continue;
          const px = Math.abs(
            cell.getBoundingClientRect().left - header.getBoundingClientRect().left,
          );
          if (px > worst.px) worst = { px, column };
        }
        return worst;
      },
    };
    w.__dtTest = probes;

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
 * Every rendered header and every cell of the first row with data carries
 * the `aria-colindex` its column has in `columnOrder`, which counts hidden
 * columns too, and there is at least one of each.
 *
 * The exact value, not only ascending order: numbering the columns a row
 * happens to render, from 1, also ascends.
 */
export async function expectAriaColIndexes(page: Page): Promise<void> {
  const { columnOrder, headers, cells } = await probe(page, 'ariaColIndexes');
  for (const [kind, list] of [
    ['header', headers],
    ['cell', cells],
  ] as const) {
    expect(list.length, `${kind}s carrying aria-colindex`).toBeGreaterThan(0);
    for (const [column, index] of list) {
      expect(index, `aria-colindex of the ${kind} of ${column}`).toBe(
        columnOrder.indexOf(column) + 1,
      );
    }
  }
}

/**
 * Scroll sideways with real wheel events until the table has moved by `dx`
 * or stopped moving, then wait for it to settle.
 *
 * Wheel events rather than `scrollLeft` writes: a wheel scroll arrives as a
 * run of moves, which is what a user produces and what observers and
 * windowing have to keep up with. Steps grow with the distance, and the last
 * one is cut to what is left.
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
  const maxStep = opts.stepPx ?? Math.max(400, Math.min(2_000, Math.abs(dx) / 10));
  if (opts.over !== 'pointer') {
    const target = opts.over === 'header' ? '.dt-header-scroll' : '.dt-body-scroll';
    const box = (await page.locator(`#${HOST_ID} ${target}`).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 60));
  }

  const start = (await probe(page, 'scroll')).left;
  let last = start;
  let lastMoved = Date.now();
  while (Math.abs(last - start) < Math.abs(dx) - 0.5) {
    const remaining = Math.abs(dx) - Math.abs(last - start);
    await page.mouse.wheel(Math.sign(dx) * Math.max(1, Math.min(maxStep, remaining)), 0);
    await page.waitForTimeout(16);
    const now = (await probe(page, 'scroll')).left;
    if (now !== last) {
      last = now;
      lastMoved = Date.now();
    } else if (Date.now() - lastMoved > 1_000) {
      // At an edge, or nothing is scrolling it any more.
      break;
    }
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

/**
 * Wheel until `column` is wholly in view, from whichever side it is on. Works
 * from the table's state, so the column needs no header until it arrives.
 */
export async function wheelIntoView(page: Page, column: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const view = await probe(page, 'column', column);
    expect(view, `${column} is not a visible column`).not.toBeNull();
    if (view!.inView) return;
    await wheelBy(
      page,
      view!.left < view!.viewLeft ? view!.left - view!.viewLeft : view!.right - view!.viewRight,
    );
  }
  throw new Error(`could not wheel ${column} into view`);
}
