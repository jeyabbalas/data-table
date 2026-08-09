/**
 * Read the rendered column-header row by **role**, not by child position.
 *
 * The header row is about to stop being "one `.dt-col-header` per visible
 * column, in order". A windowed row is
 * `[left spacer][P pinned headers][W headers][right spacer]`, where the
 * spacers are exactly the `role="presentation"` / `aria-hidden="true"` divs
 * `TableBody.createSpacer` already builds for body rows. Once that lands,
 * `querySelectorAll('.dt-col-header')[i]` no longer means "the header for
 * `visibleColumns[i]`" and `.length` no longer means "the visible-column
 * count" — the two things every positional read of this row was asserting
 * implicitly, and the two ways it would go quietly wrong rather than red.
 *
 * **Every helper is correct against today's DOM and the windowed one.** Before
 * the structural rewrite there are no spacers and the window is the whole
 * list, so `headerCells` is the full header run, `headerColumns` is
 * `visibleColumns`, and `headerSpacers` is `{ left: null, right: null }` — the
 * same answers the migrated assertions expect afterwards. Landing the readers
 * while the header row is still built in full is what proves them faithful
 * rather than merely convenient; it is the same order `tableBodyDom.ts` went
 * in for the body.
 *
 * Selection is by **role**, never by `:not(.dt-col-spacer)`. The role is the
 * contract a spacer actually declares — `aria-hidden` is what keeps it out of
 * the accessibility tree and `role="presentation"` says out loud that it is
 * not a cell — while the class is a paint hook that a later stylesheet is free
 * to rename or reuse. A class-based exclusion would still read correctly the
 * day it stopped being true.
 *
 * Deliberately its own module rather than an addition to `tableBodyDom.ts`:
 * that file reads a *row element* the caller already has in hand and reaches
 * into `TableBody`'s private render path to get one. These take a container —
 * a table root, a `.dt-header`, or the header row itself — and touch nothing
 * private, so a suite that only wants to look at headers imports no render
 * machinery to do it.
 */

/** Default class prefix — every suite in the repo uses it. */
const PREFIX = 'dt';

// =========================================
// The row
// =========================================

/**
 * The `.dt-header-row` element under `root`, or `null` when no row is mounted.
 *
 * `null` is a real state, not a failure: `TableContainer.render` only appends
 * the row once it owns at least one header, so an empty visible set — or a
 * schema write that lands before `visibleColumns` catches up — legitimately
 * has none. A childless `role="row"` would be a critical
 * `aria-required-children` violation, which is why the row is withheld rather
 * than emptied.
 *
 * Accepts the row itself as well as an ancestor, so a call site that already
 * narrowed to it does not have to care which it is holding.
 */
export function headerRowEl(root: HTMLElement, prefix = PREFIX): HTMLElement | null {
  if (root.classList.contains(`${prefix}-header-row`)) return root;
  return root.querySelector<HTMLElement>(`.${prefix}-header-row`);
}

// =========================================
// The header cells
// =========================================

/**
 * Every rendered column header under `root`, in DOM order, with column spacers
 * excluded.
 *
 * A descendant `[role="columnheader"]` query rather than a filter over the
 * row's `children`, which is where this parts company with
 * `tableBodyDom.bodyCells`. Two reasons: the role is what a spacer breaks (see
 * the module comment), and every call site here hands in some ancestor — the
 * table root, `getHeaderRow()`, the container the table was mounted into —
 * rather than the row, because that is the element the suites already hold.
 *
 * Prefix-free on purpose: `role` is the same under any `classPrefix`, so a
 * suite that mounts with `classPrefix: 'custom'` reads correctly without
 * remembering to say so. A prefixed class selector would have returned an
 * empty list instead, which is indistinguishable from "no headers rendered".
 */
export function headerCells(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[role="columnheader"]'));
}

/**
 * The rendered header for `column`, or `null` when that column is outside the
 * rendered window.
 *
 * `null` becomes a legitimate answer once the header row windows, so a test
 * that needs the header to exist should say so —
 * `expect(headerFor(root, 'price')).not.toBeNull()` — rather than let a `?.`
 * swallow it.
 *
 * Compares `data-column` per element instead of embedding it in a selector: a
 * column name is user data (a CSV header, a derived-column name) and has no
 * obligation to be a valid CSS attribute-selector value.
 */
export function headerFor(root: HTMLElement, column: string): HTMLElement | null {
  for (const cell of headerCells(root)) {
    if (cell.getAttribute('data-column') === column) return cell;
  }
  return null;
}

/**
 * The `data-column` sequence of the rendered headers, in DOM order.
 *
 * This is the assertion an index-based lookup used to carry implicitly: where
 * a test said `headers[2]` and meant "the header for `created`", the ordering
 * was being asserted for free. Say it explicitly instead.
 *
 * `ColumnHeader.createElement` stamps `data-column` on every header it builds.
 * The one exception is `TableContainer`'s actions-less shell path, which emits
 * a bare `role="columnheader"` div with the name in a `<strong>` and no
 * attribute at all; those read as `''` here, exactly as a cell without one
 * reads in `tableBodyDom.renderedColumns`. Suites on that path assert over
 * `headerCells` directly.
 */
export function headerColumns(root: HTMLElement): string[] {
  return headerCells(root).map((cell) => cell.getAttribute('data-column') ?? '');
}

// =========================================
// The spacers
// =========================================

/**
 * The header row's column spacer for `side`, or `null` when it has none.
 *
 * `null` today for both sides — the header row is still built in full and has
 * no spacers to find. That is the answer, not an error: a helper that threw
 * here could not be used to assert the pre-windowing shape, and asserting the
 * pre-windowing shape is the whole point of landing this first.
 *
 * Scoped to the header row rather than queried off `root`, which is the one
 * place these readers cannot be as loose as {@link headerCells}: body rows
 * already carry `[data-col-spacer]`, so an unscoped query rooted at the table
 * would answer with the first *body* row's spacer and look entirely
 * plausible while doing it. That scoping is why this one takes a `prefix`.
 */
export function headerSpacer(
  root: HTMLElement,
  side: 'left' | 'right',
  prefix = PREFIX,
): HTMLElement | null {
  const row = headerRowEl(root, prefix);
  return row?.querySelector<HTMLElement>(`[data-col-spacer="${side}"]`) ?? null;
}

/** Both of the header row's column spacers — see {@link headerSpacer}. */
export function headerSpacers(
  root: HTMLElement,
  prefix = PREFIX,
): { left: HTMLElement | null; right: HTMLElement | null } {
  return {
    left: headerSpacer(root, 'left', prefix),
    right: headerSpacer(root, 'right', prefix),
  };
}
