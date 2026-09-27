/**
 * ColumnWindowController — the one owner of the table's horizontal scroll,
 * and of which columns are worth mounting.
 *
 * The header row and the body scroll sideways together, in two scrollers.
 * Until this class, five places wrote `scrollLeft` on their own: the sync
 * between the two scrollers, the hold that follows a filter change,
 * `TableContainer.render()`'s restore after a rebuild, the smooth scroll to a
 * column just added, and the keyboard's scroll into view. Each had to allow
 * for the others, and when one did not, it undid the others' scrolls. Here
 * they are the methods of one object, which is the only code in `src/` that
 * writes the grid's `scrollLeft` (`tests/table/scrollWriters.test.ts` checks).
 *
 * The browser still scrolls the grid by itself, and the controller follows
 * it like a user's scroll: a wheel, a scrollbar, and focus moving to a
 * header button without `preventScroll`, which is how `ModalHost` brings a
 * column back into view when its panel closes.
 *
 * It also sizes the header's scrollbar gutter, which is part of keeping the
 * two scrollers the same width, and so the same scroll range.
 *
 * Because every scroll passes through it, it is also where the table learns
 * which columns are near the view. {@link ColumnWindowController.mountedColumns}
 * publishes them: the pinned block, a run around the view
 * ({@link columnWindow}), and the columns the table is holding on to wherever
 * they are, which are the cursor's and the one with DOM focus.
 *
 * `TableContainer` creates one and keeps it across renders: `render()`
 * replaces what is inside the scrollers, never the scrollers themselves. Not
 * exported from the package entry points.
 */

import { type Signal, createSignal } from '../core/Signal';
import type { TableState } from '../core/State';
import { type ColumnLayout, getColumnLayout } from './ColumnLayout';
import { type ColumnRange, columnWindow } from './ColumnWindow';

/** Input that means the user is about to scroll, or have the table scroll for them. */
const USER_SCROLL_INPUTS = ['wheel', 'keydown', 'pointerdown', 'touchstart'] as const;

/** How long a filter change holds the horizontal position. */
const FILTER_HOLD_MS = 1000;

/** Construction options for {@link ColumnWindowController}. */
export interface ColumnWindowControllerOptions {
  state: TableState;
  /**
   * `.dt-root`. A wheel, key, pointer press or touch anywhere in it ends the
   * hold that follows a filter change.
   */
  rootElement: HTMLElement;
  /** `.dt-header-area`: the header scroller and the gutter beside it. */
  headerArea: HTMLElement;
  /** `.dt-header-scroll`. */
  headerScroll: HTMLElement;
  /** `.dt-scrollbar-gutter`, sized to the body's vertical scrollbar. */
  scrollbarGutter: HTMLElement;
  /** `.dt-body-scroll`, which scrolls both ways. */
  bodyScroll: HTMLElement;
  /**
   * `.dt-grid`. While focus is on an element inside it that belongs to a
   * column, a header button or a clicked cell, that column stays mounted.
   */
  gridElement: HTMLElement;
}

/** The body's scroll position, as {@link ColumnWindowController.savePosition} saw it. */
export interface ScrollPosition {
  left: number;
  top: number;
}

/**
 * Where `scrollLeft` has to go for `column` to be in view, or `null` when it
 * already is, is pinned, is not visible, or there is no view to scroll.
 *
 * The pinned block covers the left edge of the viewport, so a column counts
 * as in view only right of it. A column wider than what is left goes to its
 * start, unless it already fills the view: aligning whichever edge was out of
 * view flipped between the two on every call.
 */
export function revealTarget(
  layout: ColumnLayout,
  column: string,
  scrollLeft: number,
  viewportWidth: number,
): number | null {
  const index = layout.indexOf(column);
  if (index < 0 || layout.pinnedPlacement(column) || viewportWidth <= 0) return null;

  const colLeft = layout.leftAt(index);
  const colRight = colLeft + layout.widthAt(index);
  const pinnedWidth = layout.pinnedWidth;
  const effectiveLeft = scrollLeft + pinnedWidth;
  const effectiveRight = scrollLeft + viewportWidth;

  let target = scrollLeft;
  if (colRight - colLeft > effectiveRight - effectiveLeft) {
    if (colLeft > effectiveLeft || colRight < effectiveRight) target = colLeft - pinnedWidth;
  } else if (colLeft < effectiveLeft) {
    target = colLeft - pinnedWidth;
  } else if (colRight > effectiveRight) {
    target = colRight - viewportWidth;
  }
  return target === scrollLeft ? null : target;
}

/**
 * Scroll `scroller` so `column` is in view, as
 * {@link ColumnWindowController.revealColumn} does. For a `KeyboardNavigator`
 * in a shell that has no controller.
 *
 * @returns whether it scrolled.
 */
export function revealColumnIn(scroller: HTMLElement, state: TableState, column: string): boolean {
  const target = revealTarget(
    getColumnLayout(state),
    column,
    scroller.scrollLeft,
    scroller.clientWidth,
  );
  if (target === null) return false;
  scroller.scrollLeft = target;
  return true;
}

/** Whether two column lists hold the same names in the same order. */
function sameColumns(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Keeps the header and body scrollers together, makes every programmatic
 * sideways scroll of the table, and publishes the columns to mount.
 *
 * @example
 * ```typescript
 * const columnWindow = new ColumnWindowController({
 *   state, rootElement, headerArea, headerScroll, scrollbarGutter, bodyScroll, gridElement,
 * });
 * columnWindow.revealColumn('price'); // scrolls only if it is out of view
 * columnWindow.destroy();
 * ```
 */
export class ColumnWindowController {
  private readonly state: TableState;
  private readonly rootElement: HTMLElement;
  private readonly headerArea: HTMLElement;
  private readonly headerScroll: HTMLElement;
  private readonly scrollbarGutter: HTMLElement;
  private readonly bodyScroll: HTMLElement;
  private readonly gridElement: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly unsubscribes: (() => void)[] = [];
  private destroyed = false;

  /** A sync in progress, so the scroll it causes does not sync back. */
  private syncing = false;

  /** Header→body sync is off while {@link scrollToEnd}'s smooth scroll runs. */
  private suppressReverseSync = false;

  /**
   * Where the header stopped short of the body on the last sync, until the
   * header's scroll event for it arrives (see {@link syncHeaderScroll}).
   */
  private headerEcho: number | null = null;

  /** Ends the hold that follows a filter change, while one is running. */
  private releaseFilterHold: (() => void) | null = null;

  private readonly mounted: Signal<readonly string[]> = createSignal<readonly string[]>([]);

  /**
   * The columns to mount, in layout order: the pinned block, the run
   * around the view, and the cursor's column and the one holding DOM focus
   * wherever they are. Every visible column until the body has a width.
   *
   * A new array only when the list changes, so a subscriber hears of a
   * change, not of every scroll.
   */
  readonly mountedColumns: Pick<Signal<readonly string[]>, 'get' | 'subscribe'> = this.mounted;

  /**
   * The run {@link mountedColumns} was last built from, the column list its
   * indices point into, and the viewport width it was sized for. A new list
   * (a column shown, hidden, moved or pinned) makes the indices point at
   * other columns, and a new width asks for a run of another size: either
   * way the run is worked out afresh. New column widths keep it.
   */
  private range: ColumnRange | null = null;
  private rangeColumns: readonly string[] | null = null;
  private rangeWidth = -1;

  /** The column of the element holding DOM focus inside the grid, if any. */
  private focusColumn: string | null = null;

  /** An update for a focus change is queued (see {@link updateForFocus}). */
  private focusUpdateQueued = false;

  constructor(options: ColumnWindowControllerOptions) {
    this.state = options.state;
    this.rootElement = options.rootElement;
    this.headerArea = options.headerArea;
    this.headerScroll = options.headerScroll;
    this.scrollbarGutter = options.scrollbarGutter;
    this.bodyScroll = options.bodyScroll;
    this.gridElement = options.gridElement;

    this.bodyScroll.addEventListener('scroll', this.handleBodyScroll, { passive: true });
    this.headerScroll.addEventListener('scroll', this.handleHeaderScroll, { passive: true });
    this.gridElement.addEventListener('focusin', this.handleFocusIn);
    this.gridElement.addEventListener('focusout', this.handleFocusOut);

    // The body's client width changes when its vertical scrollbar comes or
    // goes, as well as when the table is resized.
    this.resizeObserver = new ResizeObserver((entries) => {
      if (this.destroyed) return;
      for (const entry of entries) {
        if (entry.target !== this.bodyScroll) continue;
        this.syncScrollbarGutter(entry);
        this.update('kept');
      }
    });
    this.resizeObserver.observe(this.bodyScroll);

    // Everything the layout is made of. `schema` and `columnOrder` included:
    // loading data and adding or renaming a derived column write `schema`
    // before `visibleColumns` in one batch, and `TableContainer` renders on
    // `schema`, so without them the body would be built from the old set.
    // Subscribed before `TableContainer` and any `TableBody` are, so the set
    // is current by the time they hear of the same change.
    this.unsubscribes.push(
      this.state.filters.subscribe(() => this.holdAfterFilterChange()),
      this.state.schema.subscribe(() => this.update('fresh')),
      this.state.columnOrder.subscribe(() => this.update('fresh')),
      this.state.visibleColumns.subscribe(() => this.update('fresh')),
      this.state.pinnedColumns.subscribe(() => this.update('fresh')),
      this.state.columnWidths.subscribe(() => this.update('kept')),
      this.state.focusedCell.subscribe(() => this.update('kept')),
    );
    this.update('fresh');
  }

  // =========================================
  // The two scrollers
  // =========================================

  private readonly handleBodyScroll = (): void => {
    if (this.destroyed || this.syncing) return;
    this.syncing = true;
    this.syncHeaderScroll();
    this.syncing = false;
    this.update('kept');
  };

  private readonly handleHeaderScroll = (): void => {
    const echo = this.headerEcho;
    this.headerEcho = null;
    if (this.destroyed || this.syncing || this.suppressReverseSync) return;
    const left = this.headerScroll.scrollLeft;
    // The echo of a sync the header could not follow, or of one it could:
    // either way the body is where it should be.
    if (left === echo || left === this.bodyScroll.scrollLeft) return;
    this.syncing = true;
    this.bodyScroll.scrollLeft = left;
    this.syncing = false;
    this.update('kept');
  };

  /**
   * Scroll the header to where the body is.
   *
   * The header can stop short: its viewport is wider than the body's for the
   * frame between a vertical scrollbar appearing and the gutter being measured
   * to match. Its scroll event then carries the shorter position, and syncing
   * that back would pull the body away from its far right, so the header
   * handler drops that one event.
   */
  private syncHeaderScroll(): void {
    const left = this.bodyScroll.scrollLeft;
    this.headerScroll.scrollLeft = left;
    const landed = this.headerScroll.scrollLeft;
    this.headerEcho = landed === left ? null : landed;
  }

  /** Scroll the body, and the header with it, to `left`. */
  private scrollBodyTo(left: number): void {
    this.bodyScroll.scrollLeft = left;
    this.syncHeaderScroll();
    this.update('kept');
  }

  /**
   * Make the header's scrollbar gutter as wide as the body's vertical
   * scrollbar.
   *
   * The header scrolls in step with the body, so its viewport has to be
   * exactly as wide as the body's. A fixed 17 px gutter was right for one
   * scrollbar only: overlay scrollbars take no width, and neither does a body
   * with too few rows to scroll, so at the far right the last header was cut
   * off by up to 17 px, and keyboard navigation left a header cursor at the
   * right edge partly out of view.
   *
   * The scrollbar's width is the body's border box less its content box, which
   * keeps the fraction of a pixel `clientWidth` rounds away at some zoom
   * levels.
   *
   * Until this runs, a scrollbar that has just appeared leaves the gutter too
   * narrow and the header stopped short of a body scrolled to its far right,
   * so the header is put back where the body is whenever the width changes.
   */
  private syncScrollbarGutter(entry: ResizeObserverEntry): void {
    const border = entry.borderBoxSize?.[0]?.inlineSize;
    const content = entry.contentBoxSize?.[0]?.inlineSize;
    const scrollbar =
      border !== undefined && content !== undefined
        ? border - content
        : this.headerArea.clientWidth - this.bodyScroll.clientWidth;
    const width = `${Math.max(0, Math.round(scrollbar * 100) / 100)}px`;
    if (this.scrollbarGutter.style.width === width) return;
    this.scrollbarGutter.style.width = width;
    this.syncHeaderScroll();
  }

  // =========================================
  // Programmatic scrolls
  // =========================================

  /**
   * Scroll sideways so `column` is in view right of the pinned block. A
   * pinned column is always in view; a column that is already in view, or is
   * not visible, stays where it is.
   *
   * @returns whether it scrolled.
   */
  revealColumn(column: string): boolean {
    if (this.destroyed) return false;
    const target = revealTarget(
      getColumnLayout(this.state),
      column,
      this.bodyScroll.scrollLeft,
      this.bodyScroll.clientWidth,
    );
    if (target === null) return false;
    this.scrollBodyTo(target);
    return true;
  }

  /** Where the body is scrolled, for {@link restorePosition} after a rebuild. */
  savePosition(): ScrollPosition {
    return { left: this.bodyScroll.scrollLeft, top: this.bodyScroll.scrollTop };
  }

  /**
   * Put the body back where {@link savePosition} found it, and the header
   * with it.
   *
   * For a rebuild of what is inside the scrollers. Emptying them clamps both
   * to 0 as soon as anything reads layout, so the position has to be put back
   * as soon as the new content has its full size, in the same task. A frame
   * later was too late: it undid any scroll made right after the rebuild (the
   * keyboard bringing a moved column into view), and a second rebuild before
   * then saved the clamped 0 and put that back instead.
   */
  restorePosition(position: ScrollPosition): void {
    if (this.destroyed) return;
    this.bodyScroll.scrollLeft = position.left;
    this.bodyScroll.scrollTop = position.top;
    this.syncHeaderScroll();
    this.update('kept');
  }

  /**
   * Smooth-scroll to the right end, where a column just added lands.
   *
   * Waits two frames first, for the render the new column causes.
   */
  scrollToEnd(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.destroyed) return;
        const targetLeft = this.bodyScroll.scrollWidth;

        // Suppress header→body sync so the smooth scroll animation isn't
        // cancelled by stale scrollLeft values bouncing back from the header.
        this.suppressReverseSync = true;

        // Scroll the header instantly to the target, then smooth-scroll the body.
        this.headerScroll.scrollLeft = targetLeft;
        this.bodyScroll.scrollTo({ left: targetLeft, behavior: 'smooth' });

        // Re-enable sync once the body has stopped, and align both
        // scrollers: on `scrollend`, or where there is none, once the
        // position has held for a few frames. Not after a fixed time: a wide
        // table outlasted the 600ms that used to end this, and the header's
        // position, synced back into the still-moving body, stopped it short
        // of the column just added.
        let ended = false;
        const onEnd = (): void => {
          if (ended) return;
          ended = true;
          this.bodyScroll.removeEventListener('scrollend', onEnd);
          if (this.destroyed) return;
          this.suppressReverseSync = false;
          this.syncHeaderScroll();
        };
        this.bodyScroll.addEventListener('scrollend', onEnd, { once: true });
        const started = performance.now();
        let last = Number.NaN;
        let still = 0;
        const watch = (): void => {
          if (ended || this.destroyed) return;
          const left = this.bodyScroll.scrollLeft;
          still = left === last ? still + 1 : 0;
          last = left;
          // The time floor covers a smooth scroll that has not started yet.
          if (still >= 3 && performance.now() - started > 100) onEnd();
          else requestAnimationFrame(watch);
        };
        requestAnimationFrame(watch);
      });
    });
  }

  /**
   * Hold the horizontal position for a second after a filter change.
   *
   * A filter change triggers a row re-fetch, the filter bar's max-height
   * reveal or collapse, and chart re-renders — any of which could transiently
   * clamp `scrollLeft` to 0. The hold puts it back every animation frame for
   * 1s: the 300ms smooth scroll to the top, the 200ms bar transition in both
   * directions, and the async row and chart fetches.
   *
   * The first wheel, key, pointer press or touch in the table ends it early.
   * A scroll the user makes in that second, or the keyboard makes for them, is
   * not drift: undoing it snapped a sideways wheel after a chart brush
   * straight back, and left a cursor moved with End out of view. A second
   * filter change ends it too, and starts its own from where the table is
   * then.
   */
  private holdAfterFilterChange(): void {
    if (this.destroyed) return;
    this.releaseFilterHold?.();
    const savedLeft = this.bodyScroll.scrollLeft;
    if (savedLeft === 0) return;

    const deadline = performance.now() + FILTER_HOLD_MS;
    let held = true;
    const release = (): void => {
      held = false;
      for (const type of USER_SCROLL_INPUTS) {
        this.rootElement.removeEventListener(type, release, true);
      }
      if (this.releaseFilterHold === release) this.releaseFilterHold = null;
    };
    for (const type of USER_SCROLL_INPUTS) {
      this.rootElement.addEventListener(type, release, { capture: true, passive: true });
    }
    this.releaseFilterHold = release;

    const correct = (): void => {
      if (this.destroyed || !held) return;
      if (this.bodyScroll.scrollLeft !== savedLeft) this.scrollBodyTo(savedLeft);
      if (performance.now() < deadline) {
        requestAnimationFrame(correct);
      } else {
        release();
      }
    };
    requestAnimationFrame(correct);
  }

  // =========================================
  // What is mounted
  // =========================================

  /**
   * Work out the columns to mount and publish them if they changed.
   *
   * `'fresh'` computes the run around the view from nothing: the column list
   * has changed, and the old run's indices may name other columns. `'kept'`
   * keeps the old run while it still covers the view (see
   * {@link columnWindow}), for a scroll, new widths, a change to what is
   * held, or a resize that leaves the viewport as wide as it was: the filter
   * bar opening changes only the body's height.
   *
   * `scrollLeft` is clamped to where the new layout lets the body scroll. A
   * change that shortens the table reaches here before the browser clamps
   * the body, which it reports a frame later: at the far right, the old
   * position lies past the new end, and the set came out empty.
   */
  private update(mode: 'fresh' | 'kept'): void {
    if (this.destroyed) return;
    const layout = getColumnLayout(this.state);
    const width = this.bodyScroll.clientWidth;
    const current =
      mode === 'kept' && this.rangeColumns === layout.columns && this.rangeWidth === width
        ? (this.range ?? undefined)
        : undefined;
    const scrollLeft = Math.min(
      Math.max(0, this.bodyScroll.scrollLeft),
      Math.max(0, layout.totalWidth - width),
    );
    const range = columnWindow(layout, { scrollLeft, width }, current);
    this.range = range;
    this.rangeColumns = layout.columns;
    this.rangeWidth = width;

    // The columns held on to, where they fall outside the pinned block and
    // the run: at most two, so a sort is nothing.
    const held: number[] = [];
    for (const column of [this.state.focusedCell.get()?.column, this.focusColumn]) {
      if (column === undefined || column === null) continue;
      const index = layout.indexOf(column);
      if (index < layout.pinnedCount || (index >= range.start && index < range.end)) continue;
      if (!held.includes(index)) held.push(index);
    }
    held.sort((a, b) => a - b);

    const next: string[] = [];
    for (let i = 0; i < layout.pinnedCount; i++) next.push(layout.columns[i]!);
    let h = 0;
    while (h < held.length && held[h]! < range.start) next.push(layout.columns[held[h++]!]!);
    for (let i = range.start; i < range.end; i++) next.push(layout.columns[i]!);
    while (h < held.length) next.push(layout.columns[held[h++]!]!);

    if (!sameColumns(next, this.mounted.get())) this.mounted.set(next);
  }

  private readonly handleFocusIn = (event: FocusEvent): void => {
    const target = event.target;
    const owner = target instanceof Element ? target.closest('[data-column]') : null;
    const column =
      owner && this.gridElement.contains(owner) ? owner.getAttribute('data-column') : null;
    if (column === this.focusColumn) return;
    this.focusColumn = column;
    this.updateForFocus();
  };

  private readonly handleFocusOut = (event: FocusEvent): void => {
    // Focus moving within the grid is the next focusin's to report.
    const next = event.relatedTarget;
    if (next instanceof Node && this.gridElement.contains(next)) return;
    if (this.focusColumn === null) return;
    // The window losing focus (another app, DevTools) reports a focusout to
    // nowhere, yet leaves the element focused, to have it back on return.
    if (next === null) {
      const root = this.gridElement.getRootNode() as Document | ShadowRoot;
      const active = 'activeElement' in root ? root.activeElement : null;
      if (active instanceof Node && this.gridElement.contains(active)) return;
    }
    this.focusColumn = null;
    this.updateForFocus();
  };

  /**
   * {@link update} for a focus change, in a microtask rather than at once.
   *
   * Focus moves in the middle of other work: the body moves it to the grid
   * as it removes the element holding it, part-way through a render.
   * Publishing then would start another render inside that one.
   */
  private updateForFocus(): void {
    if (this.focusUpdateQueued) return;
    this.focusUpdateQueued = true;
    queueMicrotask(() => {
      this.focusUpdateQueued = false;
      this.update('kept');
    });
  }

  // =========================================
  // What is in view
  // =========================================

  /** The first column at least partly in view right of the pinned block. */
  firstUnpinnedColumnInView(): string | undefined {
    const layout = getColumnLayout(this.state);
    const edge = this.bodyScroll.scrollLeft + layout.pinnedWidth;
    for (let i = layout.pinnedCount; i < layout.columns.length; i++) {
      if (layout.leftAt(i) + layout.widthAt(i) > edge) return layout.columns[i];
    }
    return undefined;
  }

  // =========================================
  // Lifecycle
  // =========================================

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.releaseFilterHold?.();
    this.resizeObserver.disconnect();
    this.bodyScroll.removeEventListener('scroll', this.handleBodyScroll);
    this.headerScroll.removeEventListener('scroll', this.handleHeaderScroll);
    this.gridElement.removeEventListener('focusin', this.handleFocusIn);
    this.gridElement.removeEventListener('focusout', this.handleFocusOut);
    for (const unsubscribe of this.unsubscribes) unsubscribe();
    this.unsubscribes.length = 0;
  }
}
