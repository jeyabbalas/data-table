/**
 * How the grid shows annotations: a small code for what each scope shows at
 * an element, the state a row, a cell or a header shows packed into one
 * number, and the class names each code maps to.
 *
 * A row shows its row scope; a body cell shows all three scopes, side by
 * side (`.dt-cell--row-annotated`, `.dt-cell--col-annotated`,
 * `.dt-cell--annotated`, each with its severity class); a column header shows
 * its column scope. What one scope shows is one of five codes:
 *
 * - `0`: nothing of that scope.
 * - `1`: annotated, but the severity filter hides every severity there. The
 *   marker class stays, and so does the count, which track annotations
 *   whatever the filter shows.
 * - `2`, `3`, `4`: annotated, and the highest severity the filter shows there
 *   is error, warning or info: the marker class and that severity's class.
 *
 * The renderers keep the state each element shows and compare the state the
 * store gives now with it, so an element whose state did not change is not
 * written at all, and one whose state did gets only the tokens that differ
 * (see {@link applyScope}). Every lookup here is one of the store's O(1)
 * `summarize*Scope` calls: a renderer pays the same at a million annotations
 * as at none.
 *
 * Internal to the grid; not part of the package's entry points.
 */

import type { AnnotationStore } from '../annotations/AnnotationStore';
import { type ScopeSummary, createScopeSummary } from '../annotations/severity';
import type { AnnotationChangePayload } from '../annotations/types';

/**
 * The code for what a scope shows, from the store's summary of it. See the
 * module comment for the five codes.
 *
 * @internal
 */
export function scopeCode(summary: ScopeSummary): number {
  if (summary.count === 0) return 0;
  switch (summary.severity) {
    case 'error':
      return 2;
    case 'warning':
      return 3;
    case 'info':
      return 4;
    default:
      return 1;
  }
}

/**
 * One scope at one key, packed: its code in the low 3 bits, and above them
 * how many annotations of that scope are there, whatever the filter shows.
 * Packed with arithmetic rather than shifts, so a count past 2^28 cannot
 * overflow; read back with {@link codeOf} and {@link countOf}.
 */
const SCOPE_COUNT_UNIT = 8;

/**
 * A cell's state, packed: the codes of its row, column and cell scopes in
 * bits 0–2, 3–5 and 6–8, and above them the annotations of the three scopes
 * there, whatever the filter shows: the count `data-dt-annotation-count`
 * carries.
 */
const CELL_COUNT_UNIT = 512;

/**
 * The code part of a packed scope state. Exact for any count the store can hold.
 *
 * @internal
 */
export function codeOf(scopeState: number): number {
  return scopeState % SCOPE_COUNT_UNIT;
}

/**
 * The count part of a packed scope state.
 *
 * @internal
 */
export function countOf(scopeState: number): number {
  return Math.floor(scopeState / SCOPE_COUNT_UNIT);
}

// One summary reused for every lookup: each is read back at once, and the
// grid renders on one thread.
const scratch = createScopeSummary();

function packScope(summary: ScopeSummary): number {
  return scopeCode(summary) + summary.count * SCOPE_COUNT_UNIT;
}

/**
 * What the row scope shows at `rowId`, packed (see {@link codeOf}).
 *
 * @internal
 */
export function rowScopeState(store: AnnotationStore, rowId: number): number {
  return packScope(store.summarizeRowScope(rowId, scratch));
}

/**
 * What the column scope shows at `column`, packed (see {@link codeOf}).
 *
 * @internal
 */
export function columnScopeState(store: AnnotationStore, column: string): number {
  return packScope(store.summarizeColumnScope(column, scratch));
}

/**
 * What a cell shows: its row's and its column's scope states, as
 * {@link rowScopeState} and {@link columnScopeState} give them, and the cell
 * scope at exactly `(rowId, column)`, packed into one number.
 *
 * @internal
 */
export function cellState(
  store: AnnotationStore,
  rowId: number,
  column: string,
  rowState: number,
  columnState: number,
): number {
  store.summarizeCellScope(rowId, column, scratch);
  const codes = codeOf(rowState) + codeOf(columnState) * 8 + scopeCode(scratch) * 64;
  const count = countOf(rowState) + countOf(columnState) + scratch.count;
  return codes + count * CELL_COUNT_UNIT;
}

/**
 * The code of a cell state's row scope.
 *
 * @internal
 */
export function cellRowCode(state: number): number {
  return state & 7;
}

/**
 * The code of a cell state's column scope.
 *
 * @internal
 */
export function cellColumnCode(state: number): number {
  return (state >> 3) & 7;
}

/**
 * The code of a cell state's cell scope.
 *
 * @internal
 */
export function cellCellCode(state: number): number {
  return (state >> 6) & 7;
}

/**
 * The annotations a cell state counts, across its three scopes.
 *
 * @internal
 */
export function cellCount(state: number): number {
  return Math.floor(state / CELL_COUNT_UNIT);
}

/**
 * Whether a cell in this state shows a severity in any scope: whether its
 * popover has anything to list. Such a cell gives up its native `title`,
 * since the popover is its tooltip. A cell whose every annotation the
 * severity filter hides opens no popover, and keeps its title.
 *
 * @internal
 */
export function cellShowsSeverity(state: number): boolean {
  return cellRowCode(state) >= 2 || cellColumnCode(state) >= 2 || cellCellCode(state) >= 2;
}

/**
 * The class names of one scope's family on one kind of element: the marker
 * class, then the severity classes for error, warning and info, so that a
 * code `c ≥ 2` maps to `[c - 1]`.
 *
 * @internal
 */
export type ScopeClasses = readonly [marker: string, error: string, warning: string, info: string];

/**
 * Every annotation class family the grid writes, for one class prefix.
 *
 * @internal
 */
export interface AnnotationClasses {
  /** A row's own markers: `-row--annotated`, `-row--annotation-<severity>`. */
  readonly row: ScopeClasses;
  /** A cell's row scope: `-cell--row-annotated`, `-cell--row-annotation-<severity>`. */
  readonly cellRow: ScopeClasses;
  /** A cell's column scope: `-cell--col-annotated`, `-cell--col-annotation-<severity>`. */
  readonly cellColumn: ScopeClasses;
  /** A cell's own scope: `-cell--annotated`, `-cell--annotation-<severity>`. */
  readonly cell: ScopeClasses;
  /** A header's column scope: `-col-header--annotated`, `-col-header--annotation-<severity>`. */
  readonly header: ScopeClasses;
}

function family(marker: string, severity: string): ScopeClasses {
  return [marker, `${severity}-error`, `${severity}-warning`, `${severity}-info`];
}

const classesByPrefix = new Map<string, AnnotationClasses>();

/**
 * The annotation class names for `prefix`, built once per prefix: a render
 * reads them for every cell, and interpolating them there allocated a dozen
 * strings a cell.
 *
 * @internal
 */
export function annotationClasses(prefix: string): AnnotationClasses {
  let classes = classesByPrefix.get(prefix);
  if (!classes) {
    classes = {
      row: family(`${prefix}-row--annotated`, `${prefix}-row--annotation`),
      cellRow: family(`${prefix}-cell--row-annotated`, `${prefix}-cell--row-annotation`),
      cellColumn: family(`${prefix}-cell--col-annotated`, `${prefix}-cell--col-annotation`),
      cell: family(`${prefix}-cell--annotated`, `${prefix}-cell--annotation`),
      header: family(`${prefix}-col-header--annotated`, `${prefix}-col-header--annotation`),
    };
    classesByPrefix.set(prefix, classes);
  }
  return classes;
}

/**
 * Change an element's classes from showing scope code `prev` to showing
 * `next`, touching only the tokens that differ: nothing when the codes are
 * equal, one token when only the severity changes.
 *
 * @internal
 */
export function applyScope(
  list: DOMTokenList,
  classes: ScopeClasses,
  prev: number,
  next: number,
): void {
  if (prev === next) return;
  const removeSeverity = prev >= 2 ? classes[prev - 1]! : null;
  const addSeverity = next >= 2 ? classes[next - 1]! : null;
  const marker = classes[0];
  if (prev > 0 && next === 0) {
    if (removeSeverity) list.remove(marker, removeSeverity);
    else list.remove(marker);
    return;
  }
  if (removeSeverity) list.remove(removeSeverity);
  if (prev === 0) {
    if (addSeverity) list.add(marker, addSeverity);
    else list.add(marker);
  } else if (addSeverity) {
    list.add(addSeverity);
  }
}

/**
 * Write `data-dt-annotation-count` for a change of count from `prev` to
 * `next`: nothing when they are equal, and no attribute for none.
 *
 * @internal
 */
export function applyCount(el: HTMLElement, prev: number, next: number): void {
  if (prev === next) return;
  if (next > 0) el.setAttribute('data-dt-annotation-count', String(next));
  else el.removeAttribute('data-dt-annotation-count');
}

/**
 * What a change in the store can have changed in the grid: the rows whose
 * row scope changed, the columns whose column scope changed, and the cells
 * whose cell scope changed; or `all`, when anything may have.
 *
 * A row scope paints every cell of its row; a column scope every cell of its
 * column and its header; a cell scope one cell.
 *
 * @internal
 */
export interface AnnotationRenderChange {
  /** Anything may have changed: re-read every rendered row, cell and header. */
  readonly all: boolean;
  /** Row ids whose row scope changed. */
  readonly rows: ReadonlySet<number>;
  /** Columns whose column scope changed. */
  readonly columns: ReadonlySet<string>;
  /** Cells whose cell scope changed: their columns, by row id. */
  readonly cells: ReadonlyMap<number, ReadonlySet<string>>;
}

const NO_ROWS: ReadonlySet<number> = new Set();
const NO_COLUMNS: ReadonlySet<string> = new Set();
const NO_CELLS: ReadonlyMap<number, ReadonlySet<string>> = new Map();

/**
 * The change that has the grid re-read everything it shows.
 *
 * @internal
 */
export const ALL_ANNOTATIONS: AnnotationRenderChange = Object.freeze({
  all: true,
  rows: NO_ROWS,
  columns: NO_COLUMNS,
  cells: NO_CELLS,
});

/**
 * Above this many affected annotations a change is treated as `all`. Reading
 * every rendered element again costs about as much as one key per element
 * (some 350 cells and 1,000 headers on a wide table), so past a few thousand
 * keys collecting them costs more than it saves.
 *
 * @internal
 */
export const MAX_TARGETED_KEYS = 4096;

/**
 * What a store `change` event can have changed in the grid.
 *
 * A severity-filter change can change what any scope shows, and a `cleared`
 * event removes whole scopes, so both are `all`; so is a payload without the
 * affected annotations, or with more than {@link MAX_TARGETED_KEYS} of them.
 * Otherwise the keys of the affected annotations, and for an update their
 * keys before it.
 *
 * @internal
 */
export function annotationChangeOf(payload: AnnotationChangePayload): AnnotationRenderChange {
  const affected = payload.annotations;
  if (
    payload.kind === 'filterChanged' ||
    payload.kind === 'cleared' ||
    !affected ||
    affected.length > MAX_TARGETED_KEYS
  ) {
    return ALL_ANNOTATIONS;
  }
  const rows = new Set<number>();
  const columns = new Set<string>();
  const cells = new Map<number, Set<string>>();
  const collect = (list: readonly (typeof affected)[number][]): void => {
    for (const ann of list) {
      if (ann.scope === 'row') rows.add(ann.rowId);
      else if (ann.scope === 'column') columns.add(ann.column);
      else {
        let atRow = cells.get(ann.rowId);
        if (!atRow) cells.set(ann.rowId, (atRow = new Set()));
        atRow.add(ann.column);
      }
    }
  };
  collect(affected);
  if (payload.previous) collect(payload.previous);
  return { all: false, rows, columns, cells };
}
