/**
 * ChipStrip — a toolbar's chips in one row that scrolls sideways.
 *
 * The filter bar and the hidden-columns gutter lay their chips out the same
 * way: one row in a scroller (`.dt-filter-scroll`, `.dt-hidden-scroll`), whose
 * end is the toolbar's other buttons ("Clear all", "Show all", …), sticky, so
 * that the chips scroll beneath them and they stay in view. The buttons sit
 * inside the scroller rather than beside it so that the toolbar's one tab stop
 * is always inside the region that scrolls: axe's `scrollable-region-focusable`
 * asks a region that overflows to hold something in the tab order, and a
 * roving tabindex leaves a single control in it, which can be any of them.
 *
 * This class brings chips into view in that row, whole and clear of its
 * sticky end: smoothly for the chips a render added, and at once for a chip
 * whose control takes keyboard focus.
 */

/**
 * Whether the user asked for less motion. A `behavior: 'smooth'` scroll does
 * not read the stylesheet's `scroll-behavior`, so the reduced-motion rule in
 * the stylesheet cannot stop one: the scroll has to be asked for instant.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Whether `el` has focus the browser shows as keyboard focus: focus a Tab
 * moved, not a press of the pointer. Selector engines without
 * `:focus-visible` answer no.
 */
function hasVisibleFocus(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return false;
  }
}

/**
 * The key that should take over from `key` when a render may have removed its
 * chip: `key` itself while its chip is still there, else the nearest chip
 * after it in `previous` that still is, else the nearest before it, else
 * `null`. It is how a toolbar keeps its tab stop, and focus, where the user
 * was when a chip goes, such as one restored or removed with its own button.
 *
 * @param previous - The chips' keys before the render, in order.
 * @param key - The key whose chip held the stop.
 * @param current - The keys after the render.
 */
export function nearestSurvivingKey(
  previous: readonly string[],
  key: string,
  current: ReadonlySet<string>,
): string | null {
  if (current.has(key)) return key;
  const at = previous.indexOf(key);
  if (at < 0) return null;
  for (let i = at + 1; i < previous.length; i++) {
    if (current.has(previous[i]!)) return previous[i]!;
  }
  for (let i = at - 1; i >= 0; i--) {
    if (current.has(previous[i]!)) return previous[i]!;
  }
  return null;
}

/** Construction options for {@link ChipStrip}. */
export interface ChipStripOptions {
  /** The element that scrolls. */
  scroller: HTMLElement;
  /** The sticky group at the scroller's end, laid over the chips beneath it. */
  end: HTMLElement;
  /** The chip that shows a key now, or `undefined` when none does. */
  chipFor: (key: string) => HTMLElement | undefined;
  /** The chip that holds an element, or `null` for an element in none. */
  chipOf: (el: HTMLElement) => HTMLElement | null;
}

/**
 * Scrolls a toolbar's row of chips to show the chips the toolbar names.
 *
 * @example
 * const strip = new ChipStrip({ scroller, end, chipFor, chipOf });
 * // after a render that added chips:
 * strip.revealAdded(['age', 'price']);
 * // as RovingTabindex's `reveal` option:
 * strip.reveal(control);
 * // unmount:
 * strip.destroy();
 */
export class ChipStrip {
  private readonly scroller: HTMLElement;
  private readonly end: HTMLElement;
  private readonly chipFor: (key: string) => HTMLElement | undefined;
  private readonly chipOf: (el: HTMLElement) => HTMLElement | null;
  private readonly focusinHandler: (e: FocusEvent) => void;
  private pending = new Set<string>();
  private frame: number | null = null;
  private destroyed = false;

  constructor(options: ChipStripOptions) {
    this.scroller = options.scroller;
    this.end = options.end;
    this.chipFor = options.chipFor;
    this.chipOf = options.chipOf;

    // Tab scrolls a control into the scroller as the browser sees it, which
    // can leave it under the sticky end, or its chip's name cut off at the
    // edge. Keyboard focus only: a press of the pointer focuses before the
    // click lands, and a scroll in between would move the chip from under
    // the pointer and lose the click.
    this.focusinHandler = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement && hasVisibleFocus(e.target)) this.reveal(e.target);
    };
    this.scroller.addEventListener('focusin', this.focusinHandler);
  }

  /**
   * Note the chips a render has just added. At the next frame the row
   * scrolls, smoothly, to show the last of them in it, the right-most on a
   * left-to-right page, and does not move when that chip is in view. The
   * chips several renders add before that frame, as hiding columns in a loop
   * does with one render a column, make one scroll; a chip removed meanwhile
   * is passed over.
   */
  revealAdded(keys: Iterable<string>): void {
    if (this.destroyed) return;
    for (const key of keys) this.pending.add(key);
    if (this.pending.size === 0 || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      const added = this.pending;
      this.pending = new Set();
      if (this.destroyed) return;
      let last: HTMLElement | undefined;
      for (const key of added) {
        const chip = this.chipFor(key);
        if (!chip || !this.scroller.contains(chip)) continue;
        if (!last || last.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING) {
          last = chip;
        }
      }
      if (last) this.reveal(last, prefersReducedMotion() ? 'auto' : 'smooth');
    });
  }

  /**
   * Scroll the row the least distance that shows all of the chip holding
   * `el`, or of `el` when no chip holds it: inside the scroller and clear of
   * its sticky end. A control in the end needs no scroll, and `el` outside
   * the row is left alone. Instant unless `behavior` says otherwise, as the
   * arrow keys want it.
   *
   * In jsdom every layout number is 0, which makes this a no-op.
   */
  reveal(el: HTMLElement, behavior: ScrollBehavior = 'auto'): void {
    if (this.destroyed || this.end.contains(el) || !this.scroller.contains(el)) return;
    const target = this.chipOf(el) ?? el;
    const box = this.scroller.getBoundingClientRect();
    let from = box.left + this.scroller.clientLeft;
    let to = from + this.scroller.clientWidth;
    const end = this.end.getBoundingClientRect();
    if (end.width > 0) {
      // The end sticks to the scroller's right edge, or to its left edge on
      // a right-to-left page, and covers whatever scrolls beneath it.
      if (end.left + end.width / 2 >= (from + to) / 2) to = Math.min(to, end.left);
      else from = Math.max(from, end.right);
    }
    const rect = target.getBoundingClientRect();
    let delta = 0;
    if (rect.width > to - from) {
      // Wider than the room: show where it starts.
      const rtl = getComputedStyle(this.scroller).direction === 'rtl';
      delta = rtl ? rect.right - to : rect.left - from;
    } else if (rect.left < from) {
      delta = rect.left - from;
    } else if (rect.right > to) {
      delta = rect.right - to;
    }
    // Fractional layout leaves sub-pixel gaps that no scroll would close.
    if (Math.abs(delta) < 1) return;
    const left = this.scroller.scrollLeft + delta;
    if (behavior === 'smooth' && typeof this.scroller.scrollTo === 'function') {
      this.scroller.scrollTo({ left, behavior });
    } else {
      this.scroller.scrollLeft = left;
    }
  }

  /** Cancel a pending scroll and stop listening. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scroller.removeEventListener('focusin', this.focusinHandler);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.pending.clear();
  }
}
