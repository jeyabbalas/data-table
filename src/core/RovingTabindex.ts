/**
 * RovingTabindex — the WAI-ARIA Authoring Practices toolbar keyboard model.
 *
 * A toolbar is *one* tab stop, not one per control: exactly one descendant
 * carries `tabindex="0"`, the rest carry `tabindex="-1"`, and the arrow keys
 * move that stop between them. Without it the hidden-columns gutter emitted a
 * plain focusable button per hidden column — 251 extra tab stops on the
 * 266-column table from issue #84, most of them clipped out of sight by the
 * gutter's `max-height` — and the "the table is a constant number of tab
 * stops" claim in the accessibility guide was false.
 *
 * `Tab` and `Shift+Tab` are never intercepted. Trapping Tab is what made the
 * grid a WCAG 2.1.2 keyboard trap to begin with (see {@link KeyboardNavigator}
 * for that history); this controller calls `preventDefault()` only on the
 * arrow keys and Home/End, and only when it actually moves the stop.
 */

/**
 * Which arrow keys move the roving stop.
 *
 * `'both'` is the right choice for a toolbar that wraps onto several rows,
 * where both axes read as "the next control" — the controls are still walked
 * as one flat DOM-order list.
 */
export type RovingOrientation = 'horizontal' | 'vertical' | 'both';

/** Construction options for {@link RovingTabindex}. */
export interface RovingTabindexOptions {
  /** Arrow keys that move the stop. Default: `'horizontal'`. */
  orientation?: RovingOrientation | undefined;
  /**
   * Selector for the controls that participate, matched against the
   * container's descendants and taken in DOM order. Defaults to the standard
   * focusable elements.
   */
  controlSelector?: string | undefined;
}

/** Options for {@link RovingTabindex.refresh}. */
export interface RovingRefreshOptions {
  /**
   * Hand DOM focus to the new stop when the rebuild left focus nowhere.
   * Callers pass the answer to "was focus inside this toolbar before the
   * rebuild?" — only they can know it, because by the time `refresh()` runs
   * the focused element is already detached and `document.activeElement` has
   * fallen back to `<body>`.
   */
  restoreFocus?: boolean | undefined;
}

/**
 * Controls that take part in the roving order.
 *
 * Deliberately not `:not([disabled])` and deliberately including
 * `[tabindex="-1"]`: this selector drives the sweep that rewrites every
 * `tabindex`, so it has to reach the controls the stop is being taken *away*
 * from. A disabled control left holding `tabindex="0"` would silently become
 * a second tab stop the moment it is re-enabled, and a `-1` exclusion would
 * shrink the list to a single entry after the first sweep. Skipping disabled
 * and hidden controls is `isNavigable`'s job instead.
 */
const DEFAULT_CONTROL_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[tabindex]',
].join(',');

/**
 * Gives a `role="toolbar"` container the APG roving-tabindex behavior: one tab
 * stop for the whole toolbar, arrows/Home/End to move between its controls,
 * and a stop that survives the toolbar being re-rendered.
 *
 * Movement wraps at both ends, matching the header-cell controls mode in
 * {@link KeyboardNavigator} — a toolbar this short is quicker to cycle than
 * to reverse out of.
 *
 * @example
 * const roving = new RovingTabindex(toolbarEl, { orientation: 'both' });
 * // after rebuilding the toolbar's children:
 * roving.refresh({ restoreFocus: hadFocus });
 * // unmount:
 * roving.destroy();
 */
export class RovingTabindex {
  private readonly container: HTMLElement;
  private readonly orientation: RovingOrientation;
  private readonly controlSelector: string;
  private readonly keydownHandler: (e: KeyboardEvent) => void;
  private readonly focusinHandler: (e: FocusEvent) => void;
  private active: HTMLElement | null = null;
  private destroyed = false;

  constructor(container: HTMLElement, options: RovingTabindexOptions = {}) {
    this.container = container;
    this.orientation = options.orientation ?? 'horizontal';
    this.controlSelector = options.controlSelector ?? DEFAULT_CONTROL_SELECTOR;

    this.keydownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);
    this.focusinHandler = (e: FocusEvent) => this.handleFocusIn(e);
    this.container.addEventListener('keydown', this.keydownHandler);
    this.container.addEventListener('focusin', this.focusinHandler);

    this.refresh();
  }

  /**
   * Controls that can currently hold the stop, in DOM order. Disabled and
   * hidden controls are filtered out, so this is also the list the arrow keys
   * walk.
   */
  getControls(): HTMLElement[] {
    return this.queryAll().filter((el) => this.isNavigable(el));
  }

  /**
   * The control currently carrying `tabindex="0"`, or `null` when the toolbar
   * has no navigable control (an empty or fully hidden toolbar contributes no
   * tab stop at all).
   */
  getActiveControl(): HTMLElement | null {
    return this.active;
  }

  /**
   * Re-establish exactly one `tabindex="0"`. Call after every rebuild of the
   * toolbar's children — the previous stop keeps the tabindex when it survived
   * the rebuild, otherwise the first control takes over.
   */
  refresh(options: RovingRefreshOptions = {}): void {
    if (this.destroyed) return;

    const controls = this.getControls();
    const previous = this.active;
    this.active = previous && controls.includes(previous) ? previous : (controls[0] ?? null);
    this.applyTabindexes();

    // A control that removes itself (a filter chip's own remove button) drops
    // DOM focus onto <body>, which would throw a keyboard user back to the
    // top of the document. Hand focus to the replacement stop instead.
    if (options.restoreFocus && this.active && !this.containsFocus()) {
      this.focusControl(this.active);
    }
  }

  /** Detach the listeners. Leaves the tabindexes as they are. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.container.removeEventListener('keydown', this.keydownHandler);
    this.container.removeEventListener('focusin', this.focusinHandler);
  }

  // =========================================
  // Key handling
  // =========================================

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.destroyed) return;

    // Modifier chords are somebody else's: Ctrl/Cmd+Z/Y/C are table-wide and
    // reach KeyboardNavigator's listener on the table root only because this
    // handler lets them bubble untouched.
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

    const target = e.target instanceof HTMLElement ? e.target : null;
    if (!target) return;

    // A text field inside a toolbar owns its arrow keys — they move the caret.
    if (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    const controls = this.getControls();
    const from = controls.findIndex((c) => c === target || c.contains(target));
    // Keystrokes from something this controller does not manage (the
    // container itself, a chip's non-focusable label) are left alone.
    if (from < 0) return;

    const next = this.resolveTarget(e.key, controls, from);
    if (!next) return;

    // Claim the keystroke. The grid's bubble-phase listener on `.dt-root`
    // reads arrows as cursor movement and the browser reads Home/End as
    // "scroll to the end of the scroll container"; neither should happen
    // while the toolbar is moving its own stop. Tab never gets this far —
    // `resolveTarget` answers only to the arrows and Home/End.
    e.preventDefault();
    e.stopPropagation();
    this.moveTo(next);
  }

  /** Resolve a key to the control that should take the stop, or `null`. */
  private resolveTarget(key: string, controls: HTMLElement[], from: number): HTMLElement | null {
    if (key === 'Home') return controls[0] ?? null;
    if (key === 'End') return controls[controls.length - 1] ?? null;

    const horizontal = this.orientation !== 'vertical';
    const vertical = this.orientation !== 'horizontal';
    let delta: number;
    if ((horizontal && key === 'ArrowRight') || (vertical && key === 'ArrowDown')) {
      delta = 1;
    } else if ((horizontal && key === 'ArrowLeft') || (vertical && key === 'ArrowUp')) {
      delta = -1;
    } else {
      return null;
    }

    return controls[(from + delta + controls.length) % controls.length] ?? null;
  }

  private handleFocusIn(e: FocusEvent): void {
    if (this.destroyed) return;
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (!target) return;

    const control = this.getControls().find((c) => c === target || c.contains(target));
    if (!control || control === this.active) return;

    // Clicking a control makes it the stop too, so tabbing out and back
    // returns to wherever the pointer left off.
    this.active = control;
    this.applyTabindexes();
  }

  // =========================================
  // Tabindex + focus plumbing
  // =========================================

  private moveTo(control: HTMLElement): void {
    this.active = control;
    this.applyTabindexes();
    this.focusControl(control);
  }

  private focusControl(control: HTMLElement): void {
    // preventScroll, then reveal by hand: the browser's own scroll-into-view
    // walks every scrollable ancestor up to the viewport and would jump the
    // host page; reveal() touches only the toolbar's own scroll boxes.
    control.focus({ preventScroll: true });
    this.reveal(control);
  }

  private applyTabindexes(): void {
    for (const el of this.queryAll()) {
      el.setAttribute('tabindex', el === this.active ? '0' : '-1');
    }
  }

  /**
   * Scroll the toolbar's own scroll boxes so `control` is inside the visible
   * area.
   *
   * The hidden-columns gutter is `max-height: 200px; overflow: hidden`, which
   * clips every chip past the third or fourth row. `overflow: hidden` still
   * establishes a scroll box — it is only the *user* that cannot scroll it —
   * so assigning `scrollTop` reveals the clipped chip. The filter bar's chip
   * strip is the same story on the horizontal axis (`overflow-x: auto`).
   *
   * In jsdom every layout number is 0, which makes the whole walk a no-op.
   */
  private reveal(control: HTMLElement): void {
    if (!this.container.contains(control)) return;
    for (let el: HTMLElement | null = control.parentElement; el; el = el.parentElement) {
      const scrollsY = el.scrollHeight > el.clientHeight;
      const scrollsX = el.scrollWidth > el.clientWidth;
      if (scrollsY || scrollsX) {
        const box = el.getBoundingClientRect();
        const rect = control.getBoundingClientRect();
        if (scrollsY) {
          const over = rect.top - box.top - el.clientTop;
          const under = over + rect.height - el.clientHeight;
          if (over < 0) el.scrollTop += over;
          else if (under > 0) el.scrollTop += under;
        }
        if (scrollsX) {
          const before = rect.left - box.left - el.clientLeft;
          const after = before + rect.width - el.clientWidth;
          if (before < 0) el.scrollLeft += before;
          else if (after > 0) el.scrollLeft += after;
        }
      }
      if (el === this.container) break;
    }
  }

  // =========================================
  // Control discovery
  // =========================================

  private queryAll(): HTMLElement[] {
    return Array.from(this.container.querySelectorAll<HTMLElement>(this.controlSelector));
  }

  private isNavigable(el: HTMLElement): boolean {
    // `disabled` is a reflected attribute, so this catches `btn.disabled = true`
    // as well as the markup form. `aria-disabled` controls stay in the DOM but
    // out of the roving order.
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-disabled') === 'true') return false;

    // Hidden-ness is read from inline styles and the `hidden` attribute rather
    // than getComputedStyle, the same trade-off ModalHost's focus trap makes:
    // jsdom's layout numbers do not match a browser's, and every control these
    // toolbars hide is hidden with an inline `display: none`.
    for (let node: HTMLElement | null = el; node; node = node.parentElement) {
      if (node.hasAttribute('hidden')) return false;
      if (node.style.display === 'none' || node.style.visibility === 'hidden') return false;
      if (node === this.container) break;
    }
    return true;
  }

  private containsFocus(): boolean {
    const active = this.container.ownerDocument.activeElement;
    return active instanceof Node && this.container.contains(active);
  }
}
