/**
 * Read a rendered `TableBody` row by **role**, not by child position.
 *
 * Body rows are about to stop being "one cell per visible column, in order".
 * A windowed row is `[P pinned cells][left spacer][W cells][right spacer]`, so
 * `rowEl.children[i]` no longer means "the cell for `visibleColumns[i]`" — it
 * can be a spacer, or a cell for a completely different column. Roughly 140
 * assertions across the suites depended on that identity; every one of them
 * now goes through here.
 *
 * **Every helper is correct against today's DOM and the windowed one.** Before
 * the structural rewrite there are no spacers and the window is the whole
 * list, so `bodyCells` is `children`, `renderedColumns` is `visibleColumns`,
 * and `spacerWidths` is `{ left: 0, right: 0 }` — the same answers the
 * migrated assertions expect afterwards. That is what lets the migration land
 * green with zero product delta, which is the only way to know the helpers are
 * faithful rather than merely convenient.
 *
 * The private-method wrappers exist for the same reason. `getOrCreateRow` and
 * `updateRowContent` are reached through `as unknown as { … }` casts at ~80
 * call sites, and both signatures change. Confining that knowledge to this
 * file turns a signature change into a one-line edit here instead of 80
 * structural casts that each have to be re-typed by hand.
 *
 * Deliberately its own module rather than an addition to
 * `tableBodyHarness.ts`: most of the suites that need these helpers build
 * their `TableBody` inline and must not be made to import mounting machinery
 * to get a cell accessor.
 */
import type { TableState } from '@/core/State';
import type { ColumnWindow } from '@/table/ColumnWindow';
import type { RowData, TableBody } from '@/table/TableBody';

/** Default class prefix — every suite in the repo uses it. */
const PREFIX = 'dt';

/**
 * Presentational children every **data** row carries besides its cells: the
 * left and right column spacers.
 *
 * Written as `cells + SPACERS_PER_ROW` at the exact-count assertions rather
 * than folded into a helper, so those assertions stay exact and a dropped
 * spacer still fails them. Placeholder rows have no spacers.
 */
export const SPACERS_PER_ROW = 2;

/**
 * The private surface these helpers reach through. One cast, one place to
 * re-type when the render pipeline's signatures move.
 */
interface TableBodyInternals {
  state: TableState;
  rowElementMap: Map<number, HTMLElement>;
  rowPool: HTMLElement[];
  columnWindow: ColumnWindow;
  beginRenderPass(): RenderPass;
  getOrCreateRow(win: ColumnWindow): HTMLElement;
  updateRowContent(rowEl: HTMLElement, index: number, data: RowData, pass: RenderPass): void;
  returnRowToPool(rowEl: HTMLElement): void;
  createPlaceholderRow(index: number): HTMLElement;
  renderVisibleRows(): void;
}

/** `TableBody`'s private per-pass bundle. Opaque here — only passed through. */
type RenderPass = { win: ColumnWindow };

function internals(body: TableBody): TableBodyInternals {
  return body as unknown as TableBodyInternals;
}

// =========================================
// Reading a rendered row
// =========================================

/**
 * Every rendered data cell of `rowEl`, in DOM order, with column spacers
 * excluded.
 *
 * Filters `children` by class rather than running a selector so a placeholder
 * row (one `.dt-cell.dt-cell--placeholder`) reads consistently: it has one
 * body cell, which is the truth.
 */
export function bodyCells(rowEl: HTMLElement, prefix = PREFIX): HTMLElement[] {
  const cells: HTMLElement[] = [];
  for (const child of Array.from(rowEl.children)) {
    if (child.classList.contains(`${prefix}-cell`)) cells.push(child as HTMLElement);
  }
  return cells;
}

/**
 * The rendered cell for `column`, or `null` when that column is outside the
 * rendered window.
 *
 * `null` is a legitimate answer once windowing is on, so a test that needs the
 * cell to exist should say so — `expect(cellFor(row, 'price')).not.toBeNull()`
 * — rather than let a `?.` swallow it.
 */
export function cellFor(rowEl: HTMLElement, column: string, prefix = PREFIX): HTMLElement | null {
  for (const cell of bodyCells(rowEl, prefix)) {
    if (cell.getAttribute('data-column') === column) return cell;
  }
  return null;
}

/**
 * The `data-column` sequence of a row's rendered cells, in DOM order.
 *
 * This is the assertion an index-based lookup used to carry implicitly: where
 * a test said `children[2]` and meant "the cell for `price`", the ordering was
 * being asserted for free. Say it explicitly instead.
 */
export function renderedColumns(rowEl: HTMLElement, prefix = PREFIX): string[] {
  return bodyCells(rowEl, prefix).map((cell) => cell.getAttribute('data-column') ?? '');
}

/**
 * Whether `rowEl` is a loading placeholder.
 *
 * The `data-placeholder` attribute, which is what `TableBody.isPlaceholderRow`
 * itself reads — not a cell count. A count discriminator is ambiguous for a
 * single-column table and goes silently wrong the moment rows gain spacers.
 */
export function isPlaceholder(rowEl: HTMLElement): boolean {
  return rowEl.hasAttribute('data-placeholder');
}

/**
 * The two column spacers' declared widths in px.
 *
 * `{ left: 0, right: 0 }` when the row has no spacers (every row, before the
 * structural rewrite) and equally when the window covers everything, so the
 * same assertion holds on both sides of the change.
 */
export function spacerWidths(rowEl: HTMLElement): { left: number; right: number } {
  const read = (side: 'left' | 'right'): number => {
    const el = rowEl.querySelector<HTMLElement>(`[data-col-spacer="${side}"]`);
    if (!el) return 0;
    const declared = el.style.flexBasis || el.style.width;
    if (declared) return parseFloat(declared) || 0;
    // jsdom's CSSOM does not always expand the `flex` shorthand into
    // `flexBasis`, so fall back to the shorthand's own text.
    const shorthand = /(-?[\d.]+)px\s*$/.exec(el.style.flex);
    return shorthand ? parseFloat(shorthand[1]!) : 0;
  };
  return { left: read('left'), right: read('right') };
}

/** The column spacer elements present on `rowEl`, in DOM order. */
export function spacers(rowEl: HTMLElement): HTMLElement[] {
  return Array.from(rowEl.querySelectorAll<HTMLElement>('[data-col-spacer]'));
}

// =========================================
// Driving the private render path
// =========================================

/**
 * A fresh (or pooled) data row, shaped for the body's current column window.
 *
 * Publishes the window it built for, exactly as a render pass would, so a
 * later focus-ring lookup resolves against the structure that is actually in
 * the DOM.
 */
export function newRow(body: TableBody): HTMLElement {
  const i = internals(body);
  const pass = i.beginRenderPass();
  i.columnWindow = pass.win;
  return i.getOrCreateRow(pass.win);
}

/**
 * A row shaped for a synthetic window of exactly `cellCount` cells.
 *
 * For the pool-mechanics tests, which deliberately ask for a cell count that
 * is *not* `visibleColumns.length` — the whole point being the reshape. Does
 * not publish the window: the structure it builds is not the one the body
 * would render.
 */
export function newRowSized(body: TableBody, cellCount: number): HTMLElement {
  return internals(body).getOrCreateRow({
    start: 0,
    end: cellCount,
    pinnedCount: 0,
    leftSpacerPx: 0,
    rightSpacerPx: 0,
    pinnedWidthPx: 0,
    totalWidthPx: 0,
    pinnedPrefixViolated: false,
  });
}

/**
 * Render `data` into `rowEl` as row `index`, through the body's own private
 * path and against the body's own live state.
 *
 * The render pass — columns, schema map, window, pinned offsets — is built by
 * the body itself rather than reconstructed here, because that is what every
 * call site was doing by hand and what `renderVisibleRows` does for real.
 */
export function renderRow(
  body: TableBody,
  rowEl: HTMLElement,
  index: number,
  data: RowData,
): HTMLElement {
  const i = internals(body);
  const pass = i.beginRenderPass();
  i.columnWindow = pass.win;
  i.updateRowContent(rowEl, index, data, pass);
  return rowEl;
}

/** {@link newRow} + {@link renderRow} — the shape most call sites want. */
export function buildRow(body: TableBody, index: number, data: RowData): HTMLElement {
  return renderRow(body, newRow(body), index, data);
}

/** Return `rowEl` to the body's pool through its own private path. */
export function poolRow(body: TableBody, rowEl: HTMLElement): void {
  internals(body).returnRowToPool(rowEl);
}

/** Build a placeholder row through the body's own private path. */
export function placeholderRow(body: TableBody, index: number): HTMLElement {
  return internals(body).createPlaceholderRow(index);
}

/** Run one render pass through the body's own private path. */
export function renderVisibleRows(body: TableBody): void {
  internals(body).renderVisibleRows();
}

/** The body's live `rowIndex -> element` map. */
export function rowElements(body: TableBody): Map<number, HTMLElement> {
  return internals(body).rowElementMap;
}

/** The body's row pool. */
export function rowPool(body: TableBody): HTMLElement[] {
  return internals(body).rowPool;
}

/** The body's live `TableState`, for suites that already reach for it. */
export function bodyState(body: TableBody): TableState {
  return internals(body).state;
}
