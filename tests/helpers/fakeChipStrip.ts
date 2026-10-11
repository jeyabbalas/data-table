/**
 * A chip strip's layout for jsdom, which has none: every rect is zero, so
 * nothing a strip does to scroll could be seen without this.
 *
 * Lays the chips `chip` px wide and `gap` px apart from the scroller's left
 * edge, in a scroller `width` px wide whose sticky end covers its last `end`
 * px. The scroller sits at x = 0. Positions follow the scroller's
 * `scrollLeft`, which `scrollTo` sets at once, clamped to the content as a
 * browser clamps it, and records. A control in a chip sits at the chip's
 * right end, as a remove or restore button does.
 */
import { vi, type Mock } from 'vitest';

export interface FakeStripLayout {
  /** The scroller's width. */
  width: number;
  /** The sticky end's width, at the scroller's right edge. */
  end: number;
  /** Every chip's width. */
  chip: number;
  /** The space between two chips. */
  gap: number;
}

export interface FakeStrip {
  /** The scroller's `scrollTo`, which moves `scrollLeft` at once. */
  readonly scrollTo: Mock<(options: ScrollToOptions) => void>;
  /** The scroller's `scrollLeft`. */
  scrollLeft: number;
  /** Where chip `index` starts, in content coordinates. */
  chipLeft(index: number): number;
  /** Put `Element.prototype.getBoundingClientRect` back. */
  restore(): void;
}

function rect(left: number, width: number): DOMRect {
  return {
    left,
    right: left + width,
    width,
    top: 0,
    bottom: 24,
    height: 24,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

/**
 * Fake the layout of the chips that `chipSelector` finds in `scroller`.
 *
 * @example
 * const strip = fakeChipStrip(scroller, end, '.dt-hidden-chip', { width: 400, end: 80, chip: 100, gap: 10 });
 * // … act, then flush a frame …
 * expect(strip.scrollTo).toHaveBeenCalledWith({ left: 330, behavior: 'smooth' });
 * strip.restore();
 */
export function fakeChipStrip(
  scroller: HTMLElement,
  end: HTMLElement,
  chipSelector: string,
  layout: FakeStripLayout,
): FakeStrip {
  let scrollLeft = 0;
  const chips = (): HTMLElement[] =>
    Array.from(scroller.querySelectorAll<HTMLElement>(chipSelector));
  const chipLeft = (index: number): number => index * (layout.chip + layout.gap);
  const maxScroll = (): number => {
    const n = chips().length;
    const content = n === 0 ? 0 : chipLeft(n - 1) + layout.chip + layout.gap + layout.end;
    return Math.max(0, content - layout.width);
  };
  const clamp = (left: number): number => Math.min(Math.max(0, left), maxScroll());

  Object.defineProperty(scroller, 'scrollLeft', {
    configurable: true,
    get: () => scrollLeft,
    set: (value: number) => {
      scrollLeft = clamp(value);
    },
  });
  Object.defineProperty(scroller, 'clientWidth', { configurable: true, get: () => layout.width });
  Object.defineProperty(scroller, 'clientLeft', { configurable: true, get: () => 0 });
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    scrollLeft = clamp(options.left ?? scrollLeft);
  });
  scroller.scrollTo = scrollTo as unknown as typeof scroller.scrollTo;

  const real = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    if (this === scroller) return rect(0, layout.width);
    if (end.contains(this)) return rect(layout.width - layout.end, layout.end);
    const all = chips();
    const index = all.findIndex((chip) => chip === this || chip.contains(this));
    if (index < 0) return real.call(this);
    const left = chipLeft(index) - scrollLeft;
    // A control in a chip: its 18px button at the chip's right end.
    return all[index] === this ? rect(left, layout.chip) : rect(left + layout.chip - 22, 18);
  };

  return {
    scrollTo,
    get scrollLeft() {
      return scrollLeft;
    },
    set scrollLeft(value: number) {
      scrollLeft = clamp(value);
    },
    chipLeft,
    restore() {
      Element.prototype.getBoundingClientRect = real;
    },
  };
}

/** Let a frame go by, so that what was asked for in the last one has run. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
