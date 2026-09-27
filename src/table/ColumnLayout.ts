/**
 * ColumnLayout — where every visible column sits, computed once from state.
 *
 * The header row, the body rows, the pinned-column offsets, the pinned
 * divider, the scroll extent and keyboard scroll-into-view all place columns
 * by adding widths up. Each used to do its own sum over
 * `columnWidths.get(c) ?? 150`, and they disagreed wherever one of them had a
 * bug the others lacked: the sticky offsets walked `pinnedColumns`, hidden
 * ones included, so hiding a pinned column pushed every later pinned column
 * right by its width. This module is the one sum, and the one definition of
 * a column's width.
 *
 * It measures nothing and reads no element. That works because header and
 * body cells are `box-sizing: border-box` (see `.dt-cell` in
 * `05-data-grid.css`): the declared width is the occupied width.
 *
 * Not exported from the package entry points. Every consumer calls
 * {@link getColumnLayout} with the table's `TableState` and gets the same
 * cached snapshot.
 */
import type { TableState } from '../core/State';

/** Width of a column that `columnWidths` has no usable entry for. */
export const DEFAULT_COLUMN_WIDTH = 150;

/**
 * The width a declared column width occupies: rounded to a whole pixel, or
 * {@link DEFAULT_COLUMN_WIDTH} when it is missing, not finite or negative.
 *
 * Rounded so the header, the body and any sum of their widths land on the
 * same pixels: the layout engine snaps each box to its own unit, so a
 * fractional width summed across many columns drifts from the boxes it
 * describes. `setColumnWidth` validates nothing and a restored session copies
 * `columnWidths` in wholesale, so the guard is not hypothetical: `NaNpx` is
 * rejected by CSSOM, which left the cell at whatever width it had before.
 *
 * @example
 * ```typescript
 * resolveColumnWidth(undefined); // → 150
 * resolveColumnWidth(151.6); // → 152
 * ```
 */
export function resolveColumnWidth(declared: number | undefined): number {
  return declared !== undefined && Number.isFinite(declared) && declared >= 0
    ? Math.round(declared)
    : DEFAULT_COLUMN_WIDTH;
}

/** Sticky placement of one visible pinned column. */
export interface PinnedPlacement {
  /** `left` in px: the widths of the visible pinned columns before it. */
  left: number;
  /**
   * Added to the `--dt-z-pinned-col` base for its `z-index`. Descends left
   * to right, so an earlier pinned column paints over a later one.
   */
  zOffset: number;
}

/**
 * An immutable snapshot of the visible columns' geometry.
 *
 * Indices are positions in {@link ColumnLayout.columns}, the visible columns
 * in presented order.
 */
export class ColumnLayout {
  /** Visible columns, in presented order. */
  readonly columns: readonly string[];
  /** Sum of every visible column's width: the horizontal scroll extent. */
  readonly totalWidth: number;
  /** Number of visible pinned columns. */
  readonly pinnedCount: number;
  /** Sum of the visible pinned columns' widths: where unpinned content starts. */
  readonly pinnedWidth: number;

  private readonly widths: number[];
  private readonly lefts: number[];
  private readonly indexByName: Map<string, number>;
  private readonly pinned: Map<string, PinnedPlacement>;
  private readonly ariaIndexByName: Map<string, number>;
  private readonly declaredWidths: ReadonlyMap<string, number>;

  constructor(inputs: {
    visibleColumns: readonly string[];
    pinnedColumns: readonly string[];
    columnWidths: ReadonlyMap<string, number>;
    columnOrder: readonly string[];
    schema: readonly { name: string }[];
  }) {
    const { visibleColumns, columnWidths } = inputs;
    this.columns = visibleColumns;
    this.declaredWidths = columnWidths;

    const pinnedSet = new Set(inputs.pinnedColumns);
    this.widths = new Array<number>(visibleColumns.length);
    this.lefts = new Array<number>(visibleColumns.length);
    this.indexByName = new Map();
    let left = 0;
    let pinnedCount = 0;
    for (let i = 0; i < visibleColumns.length; i++) {
      const name = visibleColumns[i]!;
      const width = resolveColumnWidth(columnWidths.get(name));
      this.widths[i] = width;
      this.lefts[i] = left;
      // The first occurrence, as `Array.indexOf` answers: a duplicated name
      // (only malformed state gets one) must not give two cells one id.
      if (!this.indexByName.has(name)) this.indexByName.set(name, i);
      left += width;
      if (pinnedSet.has(name)) pinnedCount++;
    }
    this.totalWidth = left;
    this.pinnedCount = pinnedCount;

    // Only the visible pinned columns, in presented order. `pinnedColumns`
    // keeps a column that has been hidden, and its order is not necessarily
    // the order on screen.
    this.pinned = new Map();
    let pinnedLeft = 0;
    let rank = 0;
    for (let i = 0; i < visibleColumns.length; i++) {
      const name = visibleColumns[i]!;
      if (!pinnedSet.has(name)) continue;
      this.pinned.set(name, { left: pinnedLeft, zOffset: pinnedCount - rank });
      pinnedLeft += this.widths[i]!;
      rank++;
    }
    this.pinnedWidth = pinnedLeft;

    // `aria-colindex` is a position in the presented table, hidden columns
    // included — the gaps are what tell assistive tech a column is missing
    // rather than renumbered — so it counts through `columnOrder`, which
    // `visibleColumns` is a subsequence of. A column `columnOrder` does not
    // know yet (between a schema write and the order write that follows)
    // falls back to its schema position.
    this.ariaIndexByName = new Map();
    for (let i = 0; i < inputs.columnOrder.length; i++) {
      this.ariaIndexByName.set(inputs.columnOrder[i]!, i + 1);
    }
    for (let i = 0; i < inputs.schema.length; i++) {
      const name = inputs.schema[i]!.name;
      if (!this.ariaIndexByName.has(name)) this.ariaIndexByName.set(name, i + 1);
    }
  }

  /**
   * Position of `column` in {@link ColumnLayout.columns}, or `-1` when it is
   * not visible. The first position when the name occurs twice.
   */
  indexOf(column: string): number {
    return this.indexByName.get(column) ?? -1;
  }

  /** Width of the column at `index`. */
  widthAt(index: number): number {
    return this.widths[index] ?? 0;
  }

  /** Left edge of the column at `index`, from the start of the row. */
  leftAt(index: number): number {
    return this.lefts[index] ?? this.totalWidth;
  }

  /**
   * Width of `column`, visible or not: {@link resolveColumnWidth} of its
   * declared width.
   */
  widthOf(column: string): number {
    const index = this.indexByName.get(column);
    return index === undefined
      ? resolveColumnWidth(this.declaredWidths.get(column))
      : this.widths[index]!;
  }

  /** Sticky placement for a visible pinned column, `undefined` for any other. */
  pinnedPlacement(column: string): PinnedPlacement | undefined {
    return this.pinned.get(column);
  }

  /** 1-based `aria-colindex` for `column`, `undefined` when neither the order nor the schema has it. */
  ariaColIndex(column: string): number | undefined {
    return this.ariaIndexByName.get(column);
  }
}

interface CachedLayout {
  visibleColumns: readonly string[];
  pinnedColumns: readonly string[];
  columnWidths: ReadonlyMap<string, number>;
  columnOrder: readonly string[];
  schema: readonly { name: string }[];
  layout: ColumnLayout;
}

const cache = new WeakMap<TableState, CachedLayout>();

/**
 * The column layout for `state`'s current signals.
 *
 * Cached per state and rebuilt only when one of its inputs changes identity.
 * The state layer replaces arrays and maps wholesale rather than mutating
 * them, so identity is a sound key, and every consumer of one table shares
 * one snapshot.
 *
 * @example
 * ```typescript
 * const layout = getColumnLayout(state);
 * const i = layout.indexOf('price');
 * scroller.scrollLeft = layout.leftAt(i) - layout.pinnedWidth;
 * ```
 */
export function getColumnLayout(state: TableState): ColumnLayout {
  const visibleColumns = state.visibleColumns.get();
  const pinnedColumns = state.pinnedColumns.get();
  const columnWidths = state.columnWidths.get();
  const columnOrder = state.columnOrder.get();
  const schema = state.schema.get();
  const hit = cache.get(state);
  if (
    hit &&
    hit.visibleColumns === visibleColumns &&
    hit.pinnedColumns === pinnedColumns &&
    hit.columnWidths === columnWidths &&
    hit.columnOrder === columnOrder &&
    hit.schema === schema
  ) {
    return hit.layout;
  }
  const layout = new ColumnLayout({
    visibleColumns,
    pinnedColumns,
    columnWidths,
    columnOrder,
    schema,
  });
  cache.set(state, { visibleColumns, pinnedColumns, columnWidths, columnOrder, schema, layout });
  return layout;
}
