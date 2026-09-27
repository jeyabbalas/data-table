/**
 * An `IntersectionObserver` for jsdom that reports the way a browser does.
 *
 * A browser reports a target once after `observe()`, then only when it
 * crosses the observer's edge: from outside the root's box, grown by
 * `rootMargin`, to inside it or back. A fake that reported every target on
 * every scroll would hide exactly the bugs worth testing — code that relies
 * on a report the browser never sends.
 *
 * Geometry is horizontal only. The test places each column at `[left,
 * right)` in scroll content coordinates, sets the viewport width and scroll
 * offset, and calls {@link FakeIntersectionWorld.flush} where a browser
 * would compute intersections (once per frame).
 */

interface Observation {
  target: Element;
  /** The last reported state, or `null` before the first report. */
  reported: boolean | null;
}

/** Shared geometry, and every observer created against it. */
export class FakeIntersectionWorld {
  viewportWidth = 1000;
  scrollLeft = 0;
  private readonly spans = new Map<string, [number, number]>();
  readonly observers: FakeIntersectionObserver[] = [];

  /** Place column `name` at `[left, right)` in content coordinates. */
  place(name: string, left: number, right: number): void {
    this.spans.set(name, [left, right]);
  }

  /** Lay `names` out left to right, `width` apart. */
  placeRow(names: string[], width: number): void {
    names.forEach((name, i) => this.place(name, i * width, (i + 1) * width));
  }

  /** Scroll to `left` and report, as one frame would. */
  scrollTo(left: number): void {
    this.scrollLeft = left;
    this.flush();
  }

  /** Report every crossing since the last flush, per observer. */
  flush(): void {
    for (const observer of [...this.observers]) observer.deliver();
  }

  /** The observer factory to inject, or to install as the global class. */
  readonly factory = (
    callback: IntersectionObserverCallback,
    init: IntersectionObserverInit = {},
  ): IntersectionObserver => new FakeIntersectionObserver(this, callback, init);

  /** `target`'s horizontal extent in viewport coordinates, if placed. */
  rectOf(target: Element): { left: number; right: number } | null {
    const name = target.closest('[data-column]')?.getAttribute('data-column');
    const span = name ? this.spans.get(name) : undefined;
    if (!span) return null;
    return { left: span[0] - this.scrollLeft, right: span[1] - this.scrollLeft };
  }

  /** Whether `target` intersects the root grown by `margin` on each side. */
  intersects(target: Element, margin: number): boolean {
    const rect = this.rectOf(target);
    return !!rect && rect.right > -margin && rect.left < this.viewportWidth + margin;
  }
}

/** A `DOMRectReadOnly`-shaped box, one pixel tall. */
function box(left: number, right: number): DOMRectReadOnly {
  const width = Math.max(0, right - left);
  return {
    x: left,
    y: 0,
    left,
    right,
    top: 0,
    bottom: 1,
    width,
    height: 1,
    toJSON: () => ({}),
  };
}

export class FakeIntersectionObserver {
  readonly root: Element | null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[] = [0];
  readonly margin: number;
  private readonly observations: Observation[] = [];

  constructor(
    private readonly world: FakeIntersectionWorld,
    private readonly callback: IntersectionObserverCallback,
    init: IntersectionObserverInit,
  ) {
    this.root = (init.root as Element | null | undefined) ?? null;
    this.rootMargin = init.rootMargin ?? '0px';
    // `0px 200px` — the horizontal margin is the second value.
    const parts = this.rootMargin.trim().split(/\s+/);
    this.margin = Number.parseFloat(parts[1] ?? parts[0] ?? '0') || 0;
    world.observers.push(this);
  }

  observe(target: Element): void {
    if (this.observations.some((o) => o.target === target)) return;
    this.observations.push({ target, reported: null });
  }

  unobserve(target: Element): void {
    const i = this.observations.findIndex((o) => o.target === target);
    if (i >= 0) this.observations.splice(i, 1);
  }

  disconnect(): void {
    this.observations.length = 0;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Targets currently observed. */
  get observedCount(): number {
    return this.observations.length;
  }

  deliver(): void {
    const records: IntersectionObserverEntry[] = [];
    for (const observation of this.observations) {
      const now = this.world.intersects(observation.target, this.margin);
      if (observation.reported === now) continue;
      observation.reported = now;
      const rect = this.world.rectOf(observation.target) ?? { left: 0, right: 0 };
      records.push({
        target: observation.target,
        isIntersecting: now,
        intersectionRatio: now ? 1 : 0,
        time: 0,
        rootBounds: box(-this.margin, this.world.viewportWidth + this.margin),
        boundingClientRect: box(rect.left, rect.right),
        intersectionRect: now ? box(rect.left, rect.right) : box(0, 0),
      });
    }
    if (records.length > 0) {
      this.callback(records, this as unknown as IntersectionObserver);
    }
  }
}
