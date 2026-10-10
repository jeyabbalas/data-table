/**
 * Annotation navigation: the next or previous annotated cell or row in the
 * view as filtered and sorted, and where a row with a given `__rowid__` is
 * in that view. What `actions.nextAnnotation`, `actions.previousAnnotation`,
 * `actions.revealRow` and the `F8` / `Alt+↓` keys run.
 *
 * A chunk of its own: `TableContainer` loads it the first time navigation
 * runs, so a table that never navigates never downloads it.
 *
 * The next annotated row is found cheapest first:
 *
 * 0. the next annotated visible cell in the cursor's own row, from the
 *    store's per-cell severity masks;
 * 1. the rows the grid holds around the cursor, by the store's mask of each
 *    row's `__rowid__`;
 * 2. with no filter and no sort, where a row's position is its `__rowid__`,
 *    a binary search over the store's sorted annotated rows;
 * 3. SQL, against the helper table of annotated rows (see
 *    `annotatedRowsSource`). Unsorted, the smallest `__rowid__` past the
 *    cursor's, and a count of the rows between the two for its position.
 *    Sorted, the first row in the grid's order past the cursor's row, found
 *    by comparing each row with it key by key as the grid's `ORDER BY` does
 *    (NULLS LAST, `__rowid__` last), and a count of the rows before it.
 *    A sort column whose type the parser could not read falls back to
 *    numbering the view with `row_number()`, which is exact for any type
 *    and slow.
 */

import type { StateActions } from '../core/Actions';
import { holdsVariant, parseDuckDBType } from '../core/duckdbType';
import { ConfigurationError, QueryError } from '../core/errors';
import { nextTask } from '../core/nextTask';
import { effectiveRowCount, type TableState } from '../core/State';
import type { Strings } from '../core/Strings';
import { ROWID_COLUMN, type ColumnSchema, type SortColumn } from '../core/types';
import { rowIdLiteral } from '../data/cellValue';
import type { WorkerBridge } from '../data/WorkerBridge';
import { filtersToWhereClause, quoteIdentifier } from '../filters/FilterSQL';
import { buildRowQuery } from '../table/rowQuery';
import type { TableBody } from '../table/TableBody';
import type { AnnotatedRowsSource } from './annotatedRowsSource';
import type { AnnotationStore } from './AnnotationStore';
import type {
  AnnotationNavigation,
  AnnotationNavigationOptions,
  AnnotationNavigationResult,
  RevealRowOptions,
  RevealRowResult,
} from './navigationTypes';
import { ALL_SEVERITIES_MASK, SEVERITY_BIT, severityMaskOf } from './severity';
import type { Annotation } from './types';

/**
 * What the navigator reads of the annotation store: O(1) masks, the
 * annotated rows, lookups.
 *
 * @internal
 */
export type NavigatorStore = Pick<
  AnnotationStore,
  | 'getByCell'
  | 'getByRow'
  | 'getSeverityFilter'
  | 'cellScopeMask'
  | 'rowScopeMask'
  | 'annotatedRowMask'
  | 'annotatedRows'
>;

/**
 * What the navigator reads and moves of the grid's body.
 *
 * @internal
 */
export type NavigatorBody = Pick<
  TableBody,
  | 'cachedRowId'
  | 'cachedPositionOf'
  | 'rowIdsArePositions'
  | 'cancelScrollAnimation'
  | 'scrollToRow'
>;

/**
 * The table an {@link AnnotationNavigator} navigates. `TableContainer`
 * builds it.
 *
 * @internal
 */
export interface AnnotationNavigatorHost {
  readonly state: TableState;
  readonly actions: Pick<
    StateActions,
    'isRelationReadable' | 'whenRelationReadable' | 'setFocusedCell'
  >;
  readonly bridge: Pick<WorkerBridge, 'query'>;
  /** `null` when the table has none: next and previous find nothing. */
  readonly store: NavigatorStore | null;
  /** Keeps the helper table of annotated rows current, for the SQL search. */
  readonly source: AnnotatedRowsSource;
  readonly messages: Strings;
  getTableBody(): NavigatorBody | null;
  /**
   * Resolves once the filters in state have had their row count: the
   * grid's scroll range, and the "of N" a landing announces, are then theirs.
   */
  whenFilterCycleSettled(): Promise<void>;
  /** Scroll sideways so that `column` is in view. */
  revealColumn(column: string): void;
  /** Close the annotation popover and the value inspector. */
  closeOverlays(): void;
  /** Say `message` in the table's live region. */
  announce(message: string): void;
}

/** Navigation queries: someone is waiting on them, and nothing reads them twice. */
const QUERY_OPTIONS = { cache: false, priority: 'elevated' } as const;

const ROWID = quoteIdentifier(ROWID_COLUMN);

/** The view's alias in the sorted search, and the one-row relation of the row it compares with. */
const VIEW = '"__dt_v__"';
const ANCHOR = '"__dt_a__"';

/** Where the search starts: a row of the view, or before the first (-1) or after the last. */
interface Anchor {
  pos: number;
  /** The row's `__rowid__`; `null` before the first row and after the last. */
  rowId: number | null;
  /** The cursor's column, on a body row. */
  column: string | null;
}

/** A row found, and where in the view. */
interface Hit {
  pos: number;
  rowId: number;
}

/** Where a navigation lands: the row, and the cell when the cursor's row had it. */
interface Stop extends Hit {
  column: string | null;
  wrapped: boolean;
}

/**
 * One key of the grid's order (see `buildRowQuery`): a sort column, or
 * `__rowid__`, which ends the order.
 */
interface OrderKey {
  /** The column, quoted. */
  column: string;
  desc: boolean;
  /**
   * Compared by `create_sort_key`, as a plain `ORDER BY` sorts a nested or
   * VARIANT column: a VARIANT does not compare with `<` across the kinds of
   * value it holds, and a nested value holding an INTERVAL compares unlike
   * it sorts. A scalar compares as it sorts, INTERVAL and TIME WITH TIME
   * ZONE included, whose sort keys do not.
   */
  byKey: boolean;
}

function aborted(): QueryError {
  return new QueryError('The navigation was aborted', { code: 'QUERY_ABORTED' });
}

function noTable(): QueryError {
  return new QueryError('No table loaded', { code: 'NO_TABLE' });
}

function invalidOption(message: string, received: unknown): ConfigurationError {
  return new ConfigurationError(message, { code: 'OPTIONS_INVALID', details: { received } });
}

/**
 * The grid's order as keys, `__rowid__` last; `null` when a sort column's
 * type is one the parser could not read, which only numbering the view
 * orders exactly.
 */
function gridOrder(
  sortColumns: readonly SortColumn[],
  schema: readonly ColumnSchema[],
): OrderKey[] | null {
  const keys: OrderKey[] = [];
  for (const sort of sortColumns) {
    const desc = sort.direction === 'desc';
    // Unique: the keys after it never decide.
    if (sort.column === ROWID_COLUMN) return [...keys, { column: ROWID, desc, byKey: false }];
    const type = schema.find((c) => c.name === sort.column)?.originalType;
    const node = parseDuckDBType(type ?? '');
    if (node.kind === 'unknown') return null;
    keys.push({
      column: quoteIdentifier(sort.column),
      desc,
      byKey: node.kind !== 'scalar' && node.kind !== 'json',
    });
  }
  keys.push({ column: ROWID, desc: false, byKey: false });
  return keys;
}

/**
 * Whether row `x` comes after row `y` in the grid's order, as SQL: `x(i)`
 * and `y(i)` name each row's value of key `i`. Exactly the order of the
 * grid's `ORDER BY`: NULL last whatever the direction, NaN after every
 * number, -0 and 0 tied, ties broken by `__rowid__`.
 */
function afterSQL(
  keys: readonly OrderKey[],
  x: (i: number) => string,
  y: (i: number) => string,
): string {
  let sql = '';
  for (let i = keys.length - 1; i >= 0; i--) {
    const key = keys[i]!;
    const a = x(i);
    const b = y(i);
    let after: string;
    let same: string;
    if (key.byKey) {
      const order = `'${key.desc ? 'DESC' : 'ASC'} NULLS LAST'`;
      after = `create_sort_key(${a}, ${order}) > create_sort_key(${b}, ${order})`;
      same = `create_sort_key(${a}, ${order}) = create_sort_key(${b}, ${order})`;
    } else {
      const op = key.desc ? '<' : '>';
      after =
        key.column === ROWID
          ? `${a} ${op} ${b}`
          : `CASE WHEN ${b} IS NULL THEN FALSE ELSE (${a} IS NULL OR ${a} ${op} ${b}) END`;
      same = `${a} IS NOT DISTINCT FROM ${b}`;
    }
    sql = sql ? `(${after}) OR ((${same}) AND (${sql}))` : after;
  }
  return `(${sql})`;
}

/** `ORDER BY` terms for the grid's order, or its reverse. */
function orderBySQL(
  keys: readonly OrderKey[],
  ref: (i: number) => string,
  forward: boolean,
): string {
  return keys
    .map((key, i) =>
      key.byKey
        ? `create_sort_key(${ref(i)}, '${key.desc ? 'DESC' : 'ASC'} NULLS LAST') ${forward ? 'ASC' : 'DESC'}`
        : `${ref(i)} ${key.desc === forward ? 'DESC' : 'ASC'} NULLS ${forward ? 'LAST' : 'FIRST'}`,
    )
    .join(', ');
}

/**
 * The grid's order for a window, which compares VARIANT values one by one
 * and throws on two of different kinds: those columns are ordered by their
 * sort keys, which is how a plain `ORDER BY` sorts them.
 */
function windowOrderSQL(
  sortColumns: readonly SortColumn[],
  schema: readonly ColumnSchema[],
): string {
  const parts = sortColumns.map((sort) => {
    const column = quoteIdentifier(sort.column);
    const direction = sort.direction.toUpperCase();
    const type = schema.find((c) => c.name === sort.column)?.originalType ?? '';
    return holdsVariant(parseDuckDBType(type))
      ? `create_sort_key(${column}, '${direction} NULLS LAST')`
      : `${column} ${direction}`;
  });
  if (!sortColumns.some((sort) => sort.column === ROWID_COLUMN)) parts.push(`${ROWID} ASC`);
  return parts.join(', ');
}

/**
 * Finds annotations and rows in the view, and takes the cursor there. One
 * navigation at a time: a newer one, a cursor move or a change of the
 * filters, the sort or the relation aborts the one running, which rejects
 * with a `QueryError` coded `QUERY_ABORTED`.
 *
 * @internal
 */
export class AnnotationNavigator implements AnnotationNavigation {
  private readonly host: AnnotationNavigatorHost;
  /** The navigation running, if any. */
  private running: AbortController | null = null;
  private readonly unsubscribes: (() => void)[];
  /**
   * The row the last navigation showed, and the view it was in: the
   * cursor's row there needs no query to be found again before the grid has
   * fetched it, as when `F8` is pressed again at once.
   */
  private shown: { row: number; rowId: number; view: readonly unknown[] } | null = null;

  constructor(host: AnnotationNavigatorHost) {
    this.host = host;
    const { state } = host;
    const abort = (): void => this.abort();
    this.unsubscribes = [
      state.focusedCell.subscribe(abort),
      state.filters.subscribe(abort),
      state.sortColumns.subscribe(abort),
      state.tableName.subscribe(abort),
    ];
  }

  /** Go to the next annotation; see `actions.nextAnnotation`. */
  next(options?: AnnotationNavigationOptions): Promise<AnnotationNavigationResult | null> {
    return this.navigate(1, options);
  }

  /** Go to the previous annotation; see `actions.previousAnnotation`. */
  previous(options?: AnnotationNavigationOptions): Promise<AnnotationNavigationResult | null> {
    return this.navigate(-1, options);
  }

  /** Show the row whose `__rowid__` is `rowId`; see `actions.revealRow`. */
  async reveal(
    rowId: number | bigint,
    column?: string,
    options: RevealRowOptions = {},
  ): Promise<RevealRowResult | null> {
    const literal = rowIdLiteral(rowId);
    const { state } = this.host;
    if (column !== undefined && !state.schema.get().some((c) => c.name === column)) {
      throw new QueryError(`Column "${column}" not found`, {
        code: 'COLUMN_NOT_FOUND',
        details: { column },
      });
    }
    const { align = 'center', focus = true } = options;
    if (align !== 'start' && align !== 'center' && align !== 'end') {
      throw invalidOption(`revealRow: align must be 'start', 'center' or 'end'`, align);
    }
    if (typeof focus !== 'boolean')
      throw invalidOption('revealRow: focus must be a boolean', focus);

    const run = this.begin(options.signal);
    try {
      await this.settle(run.signal);
      const row = await this.positionOf(rowId, literal, run.signal);
      this.end(run);
      if (row === null) return null;
      const visible = state.visibleColumns.get();
      const cursor = state.focusedCell.get();
      const at =
        column !== undefined && visible.includes(column)
          ? column
          : cursor && visible.includes(cursor.column)
            ? cursor.column
            : (visible[0] ?? '');
      this.show(row, Number(rowId), align, focus ? at : null, at);
      return { row, column: at };
    } finally {
      this.end(run);
    }
  }

  /** Abort the navigation running, and stop following the state. */
  destroy(): void {
    this.abort();
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }

  // =========================================
  // A navigation's life
  // =========================================

  /** Start a navigation: the one running is aborted, and so is this one with `signal`. */
  private begin(signal: AbortSignal | undefined): AbortController {
    this.abort();
    const run = new AbortController();
    this.running = run;
    if (signal?.aborted) run.abort();
    else signal?.addEventListener('abort', () => run.abort(), { once: true, signal: run.signal });
    return run;
  }

  /**
   * The navigation has done its searching (or failed): nothing aborts it
   * any more, its own cursor move included. Ending it also drops its
   * listener on the caller's signal.
   */
  private end(run: AbortController): void {
    if (this.running !== run) return;
    this.running = null;
    run.abort();
  }

  private abort(): void {
    const run = this.running;
    this.running = null;
    run?.abort();
  }

  /** Throw when `signal` has aborted the navigation. */
  private check(signal: AbortSignal): void {
    if (signal.aborted) throw aborted();
  }

  /** `promise`, unless the navigation is aborted first. */
  private until<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal.aborted) return reject(aborted());
      const onAbort = (): void => reject(aborted());
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          if (signal.aborted) reject(aborted());
          else resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(signal.aborted ? aborted() : error);
        },
      );
    });
  }

  private async query<T>(sql: string, signal: AbortSignal): Promise<T[]> {
    const rows = await this.host.bridge.query<T>(sql, signal, QUERY_OPTIONS);
    this.check(signal);
    return rows;
  }

  /**
   * Wait for the view to be what state says: the filters' row count in, the
   * relation readable (a derived-column change rebuilds it), and the scroll
   * back to the top that a filter change animates ended, since the grid's
   * rows are the old filters' until it has.
   */
  private async settle(signal: AbortSignal): Promise<void> {
    const { actions, state } = this.host;
    await this.until(this.host.whenFilterCycleSettled(), signal);
    while (!actions.isRelationReadable()) {
      await this.until(actions.whenRelationReadable(), signal);
      // The state update that follows the change lands a task later.
      await this.until(nextTask(), signal);
    }
    if (!state.tableName.get()) throw noTable();
    this.host.getTableBody()?.cancelScrollAnimation();
  }

  // =========================================
  // Next / previous
  // =========================================

  private async navigate(
    dir: 1 | -1,
    options: AnnotationNavigationOptions = {},
  ): Promise<AnnotationNavigationResult | null> {
    const { store } = this.host;
    const { severities, wrap = true } = options;
    if (
      severities !== undefined &&
      (!Array.isArray(severities) || !severities.every((s) => Object.hasOwn(SEVERITY_BIT, s)))
    ) {
      throw invalidOption("severities must list 'error', 'warning' or 'info'", severities);
    }
    if (typeof wrap !== 'boolean') throw invalidOption('wrap must be a boolean', wrap);

    const run = this.begin(options.signal);
    try {
      await this.settle(run.signal);
      let selected = 0;
      if (store) {
        if (severities === undefined) selected = severityMaskOf(store.getSeverityFilter());
        else for (const severity of severities) selected |= SEVERITY_BIT[severity];
      }
      const stop =
        store && selected !== 0 ? await this.find(store, dir, selected, wrap, run.signal) : null;
      this.end(run);
      if (stop === null) {
        const n = this.host.messages.annotations.navigation;
        this.host.announce(
          wrap || selected === 0 ? n.noneShown : dir > 0 ? n.noMoreBelow : n.noMoreAbove,
        );
        return null;
      }
      return this.land(store!, stop, dir, selected);
    } finally {
      this.end(run);
    }
  }

  /** The next stop from the cursor in direction `dir`, going round the end when `wrap`. */
  private async find(
    store: NavigatorStore,
    dir: 1 | -1,
    selected: number,
    wrap: boolean,
    signal: AbortSignal,
  ): Promise<Stop | null> {
    const total = effectiveRowCount(this.host.state);
    if (total <= 0) return null;
    const anchor = await this.anchor(dir, total, signal);

    // (0) The cursor's own row: its next annotated visible cell.
    if (anchor.rowId !== null && anchor.column !== null) {
      const visible = this.host.state.visibleColumns.get();
      const from = visible.indexOf(anchor.column);
      if (from >= 0) {
        for (let i = from + dir; i >= 0 && i < visible.length; i += dir) {
          if (store.cellScopeMask(anchor.rowId, visible[i]!) & selected) {
            return { pos: anchor.pos, rowId: anchor.rowId, column: visible[i]!, wrapped: false };
          }
        }
      }
    }

    const hit = await this.findRow(store, anchor, dir, selected, total, signal);
    if (hit) return { ...hit, column: null, wrapped: false };
    // A search from the start (or, going back, the end) has seen every row.
    if (!wrap || (dir > 0 ? anchor.pos < 0 : anchor.pos >= total)) return null;
    const start: Anchor = { pos: dir > 0 ? -1 : total, rowId: null, column: null };
    const first = await this.findRow(store, start, dir, selected, total, signal);
    return first ? { ...first, column: null, wrapped: true } : null;
  }

  /**
   * Where a search starts: the cursor's row, or before the first row (no
   * cursor going forward, the header row) or after the last (no cursor
   * going back, a cursor past the end).
   */
  private async anchor(dir: 1 | -1, total: number, signal: AbortSignal): Promise<Anchor> {
    const cursor = this.host.state.focusedCell.get();
    if (!cursor || cursor.row < 0 || cursor.row >= total) {
      const before = cursor ? cursor.row < 0 : dir > 0;
      return { pos: before ? -1 : total, rowId: null, column: null };
    }
    const rowId =
      this.host.getTableBody()?.cachedRowId(cursor.row) ??
      this.shownRowId(cursor.row) ??
      (await this.rowIdAt(cursor.row, signal));
    // A row that has gone (the view changed under the cursor) leaves the end to start from.
    if (rowId === null) return { pos: dir > 0 ? -1 : total, rowId: null, column: null };
    return { pos: cursor.row, rowId, column: cursor.column };
  }

  /** The `__rowid__` of the row at `pos`, by the grid's own query for it. */
  private async rowIdAt(pos: number, signal: AbortSignal): Promise<number | null> {
    if (this.host.getTableBody()?.rowIdsArePositions()) return pos;
    const { state } = this.host;
    const tableName = state.tableName.get();
    if (!tableName) throw noTable();
    const [row] = await this.query<Record<string, unknown>>(
      buildRowQuery({
        tableName,
        columns: [],
        sortColumns: state.sortColumns.get(),
        filters: state.filters.get(),
        offset: pos,
        limit: 1,
        schema: state.schema.get(),
        rowidFastPath: false,
      }),
      signal,
    );
    const rowId = row?.[ROWID_COLUMN];
    return typeof rowId === 'number' ? rowId : null;
  }

  /** The first annotated row past `anchor` (not its own row) in direction `dir`. */
  private async findRow(
    store: NavigatorStore,
    anchor: Anchor,
    dir: 1 | -1,
    selected: number,
    total: number,
    signal: AbortSignal,
  ): Promise<Hit | null> {
    const body = this.host.getTableBody();

    // (1) The rows the grid holds next to the anchor, up to the first it lacks.
    if (body) {
      let pos = anchor.pos + dir;
      for (; pos >= 0 && pos < total; pos += dir) {
        const rowId = body.cachedRowId(pos);
        if (rowId === null) break;
        if (store.annotatedRowMask(rowId) & selected) return { pos, rowId };
      }
      // It holds every row to the end of the view: there is none.
      if (pos < 0 || pos >= total) return null;
    }

    // (2) Unfiltered and unsorted, a row's position is its `__rowid__`.
    if (body?.rowIdsArePositions())
      return this.searchAnnotatedRows(store, anchor.pos, dir, selected, total);

    // (3) SQL.
    return this.queryRow(anchor, dir, selected, signal);
  }

  /**
   * Binary search of the store's annotated rows, ascending by `__rowid__`,
   * for the first past `pos` whose mask meets `selected`. A `rowId` that is
   * not a row's (not an integer, or out of range) is skipped.
   */
  private searchAnnotatedRows(
    store: NavigatorStore,
    pos: number,
    dir: 1 | -1,
    selected: number,
    total: number,
  ): Hit | null {
    const { rowIds, masks } = store.annotatedRows();
    let lo = 0;
    let hi = rowIds.length;
    // The first index past `pos` going forward; the first at or past it going back.
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (dir > 0 ? rowIds[mid]! <= pos : rowIds[mid]! < pos) lo = mid + 1;
      else hi = mid;
    }
    for (let i = dir > 0 ? lo : lo - 1; i >= 0 && i < rowIds.length; i += dir) {
      const rowId = rowIds[i]!;
      // Past the end going forward, before the start going back: no more rows.
      if (dir > 0 ? rowId >= total : rowId < 0) return null;
      // Between them, -0.5 or 2.5 is no row's.
      if (rowId >= 0 && Number.isInteger(rowId) && masks[i]! & selected) {
        return { pos: rowId, rowId };
      }
    }
    return null;
  }

  /** The SQL search, against the helper table of annotated rows. */
  private async queryRow(
    anchor: Anchor,
    dir: 1 | -1,
    selected: number,
    signal: AbortSignal,
  ): Promise<Hit | null> {
    const { state } = this.host;
    const helper = await this.until(this.host.source.ensureFresh(signal), signal);
    const tableName = state.tableName.get();
    if (!tableName) throw noTable();
    const view = quoteIdentifier(tableName);
    const where = filtersToWhereClause(state.filters.get());
    const filtered = where ? `(${where}) AND ` : '';
    const mask = selected === ALL_SEVERITIES_MASK ? '' : ` WHERE ("__mask__" & ${selected}) <> 0`;
    const annotated = (rowid: string): string =>
      `${rowid} IN (SELECT ${ROWID} FROM ${quoteIdentifier(helper)}${mask})`;
    const keys = gridOrder(state.sortColumns.get(), state.schema.get());
    const at = anchor.rowId;

    if (keys === null) {
      // Numbered as the grid orders it: exact for any type, and a full sort.
      const numbered = this.numbered(view, where);
      const [hit] = await this.query<{ r: number; p: number }>(
        `${numbered}SELECT ${ROWID} AS r, "__dt_p__" AS p FROM "__dt_n__" WHERE ${annotated(ROWID)}` +
          ` AND "__dt_p__" ${dir > 0 ? '>' : '<'} ${anchor.pos}` +
          ` ORDER BY "__dt_p__" ${dir > 0 ? 'ASC' : 'DESC'} LIMIT 1`,
        signal,
      );
      return hit ? { pos: hit.p, rowId: hit.r } : null;
    }

    if (keys[0]!.column === ROWID) {
      // Ordered by `__rowid__`: the nearest one past the anchor's.
      const desc = keys[0]!.desc;
      const up = dir > 0 !== desc;
      const [hit] = await this.query<{ r: number | null }>(
        `SELECT ${up ? 'min' : 'max'}(${ROWID}) AS r FROM ${view} WHERE ${filtered}${annotated(ROWID)}` +
          (at === null ? '' : ` AND ${ROWID} ${up ? '>' : '<'} ${at}`),
        signal,
      );
      const rowId = hit?.r;
      if (rowId === null || rowId === undefined) return null;
      if (at === null) {
        // The rows before it.
        const [count] = await this.query<{ n: number }>(
          `SELECT count(*) AS n FROM ${view} WHERE ${filtered}${ROWID} ${desc ? '>' : '<'} ${rowId}`,
          signal,
        );
        return { pos: count!.n, rowId };
      }
      // The rows between the anchor and it, a range the scan skips to.
      const [lo, hi] = up ? [at, rowId] : [rowId, at];
      const [count] = await this.query<{ n: number }>(
        `SELECT count(*) AS n FROM ${view} WHERE ${filtered}${ROWID} > ${lo} AND ${ROWID} < ${hi}`,
        signal,
      );
      return { pos: anchor.pos + dir * (count!.n + 1), rowId };
    }

    // Sorted: the first row past the anchor's in the grid's order.
    const v = (i: number): string => `${VIEW}.${keys[i]!.column}`;
    const a = (i: number): string => `${ANCHOR}."__dt_k${i}__"`;
    const [hit] = await this.query<{ r: number }>(
      at === null
        ? `SELECT ${ROWID} AS r FROM ${view} WHERE ${filtered}${annotated(ROWID)}` +
            ` ORDER BY ${orderBySQL(keys, (i) => keys[i]!.column, dir > 0)} LIMIT 1`
        : `${this.anchorRow(keys, view, at)}SELECT ${VIEW}.${ROWID} AS r FROM ${view} AS ${VIEW}, ${ANCHOR}` +
            ` WHERE ${filtered}${annotated(`${VIEW}.${ROWID}`)}` +
            ` AND ${dir > 0 ? afterSQL(keys, v, a) : afterSQL(keys, a, v)}` +
            ` ORDER BY ${orderBySQL(keys, v, dir > 0)} LIMIT 1`,
      signal,
    );
    if (!hit) return null;
    return { pos: await this.countBefore(keys, view, filtered, hit.r, signal), rowId: hit.r };
  }

  /** `WITH` one row, the one whose `__rowid__` is `rowId`: its value of each key. */
  private anchorRow(keys: readonly OrderKey[], view: string, rowId: number | string): string {
    const values = keys.map((key, i) => `${key.column} AS "__dt_k${i}__"`).join(', ');
    return `WITH ${ANCHOR} AS (SELECT ${values} FROM ${view} WHERE ${ROWID} = ${rowId}) `;
  }

  /** `WITH` the view numbered as the grid orders it, from 0. */
  private numbered(view: string, where: string): string {
    const { state } = this.host;
    const order = windowOrderSQL(state.sortColumns.get(), state.schema.get());
    return (
      `WITH "__dt_n__" AS (SELECT ${ROWID}, row_number() OVER (ORDER BY ${order}) - 1 AS "__dt_p__"` +
      ` FROM ${view}${where ? ` WHERE ${where}` : ''}) `
    );
  }

  /** How many rows of the sorted view come before the row whose `__rowid__` is `rowId`: its position. */
  private async countBefore(
    keys: readonly OrderKey[],
    view: string,
    filtered: string,
    rowId: number | string,
    signal: AbortSignal,
  ): Promise<number> {
    const before = afterSQL(
      keys,
      (i) => `${ANCHOR}."__dt_k${i}__"`,
      (i) => `${VIEW}.${keys[i]!.column}`,
    );
    const [count] = await this.query<{ n: number }>(
      `${this.anchorRow(keys, view, rowId)}SELECT count(*) AS n FROM ${view} AS ${VIEW}, ${ANCHOR}` +
        ` WHERE ${filtered}${before}`,
      signal,
    );
    return count!.n;
  }

  // =========================================
  // Landing
  // =========================================

  /**
   * Take the cursor to `stop`: on its first annotated visible cell going
   * forward, its last going back, or, for a row whose annotations are its
   * own or in hidden columns, in the cursor's column. Then say where it is.
   */
  private land(
    store: NavigatorStore,
    stop: Stop,
    dir: 1 | -1,
    selected: number,
  ): AnnotationNavigationResult {
    const { state, messages } = this.host;
    const n = messages.annotations.navigation;
    const visible = state.visibleColumns.get();
    let column = stop.column;
    for (
      let i = dir > 0 ? 0 : visible.length - 1;
      column === null && i >= 0 && i < visible.length;
      i += dir
    ) {
      if (store.cellScopeMask(stop.rowId, visible[i]!) & selected) column = visible[i]!;
    }
    // The cell whose annotations are listed, and how the announcement names it.
    let cell: string;
    let place: string | null = column;
    if (column !== null) {
      cell = column;
    } else {
      const cursor = state.focusedCell.get();
      column = cursor && visible.includes(cursor.column) ? cursor.column : (visible[0] ?? '');
      cell = column;
      if (!(store.rowScopeMask(stop.rowId) & selected)) {
        const hidden = this.hiddenCell(store, stop.rowId, dir, selected);
        if (hidden !== null) {
          cell = hidden;
          place = n.hiddenColumn(hidden);
        }
      }
    }
    const annotations = store
      .getByCell(stop.rowId, cell)
      .filter(
        (a) =>
          (SEVERITY_BIT[a.severity] & selected) !== 0 &&
          (a.scope === 'row' || (a.scope === 'cell' && a.column === cell)),
      );
    this.show(stop.pos, stop.rowId, 'center', column, column);

    const first: Annotation | undefined = annotations[0];
    const landed = n.landed(
      stop.pos + 1,
      effectiveRowCount(state),
      place,
      first ? messages.annotations.severityNames[first.severity] : null,
      first ? first.message : null,
      Math.max(0, annotations.length - 1),
    );
    this.host.announce(
      stop.wrapped ? (dir > 0 ? n.wrappedToFirst(landed) : n.wrappedToLast(landed)) : landed,
    );
    return {
      rowId: stop.rowId,
      row: stop.pos,
      column,
      wrapped: stop.wrapped,
      annotations,
    };
  }

  /**
   * The first column going forward (the last going back), not shown, whose
   * cell in the row holds an annotation `selected` picks: a hidden column,
   * or one the table does not have at all.
   */
  private hiddenCell(
    store: NavigatorStore,
    rowId: number,
    dir: 1 | -1,
    selected: number,
  ): string | null {
    const { state } = this.host;
    const shown = new Set(state.visibleColumns.get());
    const order = state.columnOrder.get();
    for (let i = dir > 0 ? 0 : order.length - 1; i >= 0 && i < order.length; i += dir) {
      const column = order[i]!;
      if (!shown.has(column) && store.cellScopeMask(rowId, column) & selected) return column;
    }
    const known = new Set(order);
    for (const annotation of store.getByRow(rowId)) {
      if (
        annotation.scope === 'cell' &&
        !known.has(annotation.column) &&
        SEVERITY_BIT[annotation.severity] & selected
      ) {
        return annotation.column;
      }
    }
    return null;
  }

  /**
   * Bring row `row` (whose `__rowid__` is `rowId`) into view, aligned as
   * asked, and `column` beside it; put the cursor on `cursor` when given. The
   * popover and the value inspector belong to the cell the user has left.
   */
  private show(
    row: number,
    rowId: number,
    align: 'start' | 'center' | 'end',
    cursor: string | null,
    column: string,
  ): void {
    const body = this.host.getTableBody();
    if (!body) throw noTable();
    this.shown = { row, rowId, view: this.view() };
    body.cancelScrollAnimation();
    body.scrollToRow(row, align);
    if (cursor) this.host.actions.setFocusedCell({ row, column: cursor });
    if (column) this.host.revealColumn(column);
    this.host.closeOverlays();
  }

  /** What makes a position name a row: the relation, the filters, the sort. */
  private view(): readonly unknown[] {
    const { state } = this.host;
    return [state.tableName.get(), state.filters.get(), state.sortColumns.get()];
  }

  /** The `__rowid__` at `row` when the last navigation showed it there, in this view. */
  private shownRowId(row: number): number | null {
    const shown = this.shown;
    if (shown?.row !== row) return null;
    const view = this.view();
    return shown.view.every((part, i) => part === view[i]) ? shown.rowId : null;
  }

  // =========================================
  // Reveal
  // =========================================

  /**
   * The position of the row whose `__rowid__` is `rowId` (`literal` in SQL)
   * in the view, or `null` when the filters hide it.
   *
   * @throws `QueryError` coded `INVALID_ROWID` when no row has it.
   */
  private async positionOf(
    rowId: number | bigint,
    literal: string,
    signal: AbortSignal,
  ): Promise<number | null> {
    const { state } = this.host;
    const body = this.host.getTableBody();
    // Past 2^53 a number cannot be a row's, and no row's equals it.
    const id = Number(rowId);
    if (body?.rowIdsArePositions()) {
      if (id < state.totalRows.get()) return id;
      throw this.noRow(rowId);
    }
    const cached = body?.cachedPositionOf(id) ?? null;
    if (cached !== null) return cached;

    const tableName = state.tableName.get();
    if (!tableName) throw noTable();
    const view = quoteIdentifier(tableName);
    const where = filtersToWhereClause(state.filters.get());
    const [found] = await this.query<{ shown: boolean }>(
      `SELECT ${where ? `coalesce((${where}), false)` : 'true'} AS shown FROM ${view} WHERE ${ROWID} = ${literal}`,
      signal,
    );
    if (!found) throw this.noRow(rowId);
    if (!found.shown) return null;

    const keys = gridOrder(state.sortColumns.get(), state.schema.get());
    if (keys === null) {
      const [row] = await this.query<{ p: number }>(
        `${this.numbered(view, where)}SELECT "__dt_p__" AS p FROM "__dt_n__" WHERE ${ROWID} = ${literal}`,
        signal,
      );
      return row ? row.p : null;
    }
    const filtered = where ? `(${where}) AND ` : '';
    if (keys[0]!.column === ROWID) {
      const [count] = await this.query<{ n: number }>(
        `SELECT count(*) AS n FROM ${view} WHERE ${filtered}${ROWID} ${keys[0]!.desc ? '>' : '<'} ${literal}`,
        signal,
      );
      return count!.n;
    }
    return this.countBefore(keys, view, filtered, literal, signal);
  }

  /** The error for a `__rowid__` no row of the table has, as `getCellValue` throws it. */
  private noRow(rowId: number | bigint): QueryError {
    return new QueryError(`No row has rowId ${String(rowId)}`, {
      code: 'INVALID_ROWID',
      details: { rowId },
    });
  }
}
