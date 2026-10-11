/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HiddenColumnsGutter } from '@/table/HiddenColumnsGutter';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';
import { fakeChipStrip, nextFrame, type FakeStrip } from '../helpers/fakeChipStrip';

const mockBridge = {
  initialize: vi.fn(),
  query: vi.fn(),
  terminate: vi.fn(),
  clearQueryCache: vi.fn(),
} as unknown as WorkerBridge;

const sampleSchema: ColumnSchema[] = [
  { name: 'id', type: 'integer', nullable: false, originalType: 'INTEGER' },
  { name: 'name', type: 'string', nullable: true, originalType: 'VARCHAR' },
  { name: 'age', type: 'integer', nullable: true, originalType: 'INTEGER' },
  { name: 'email', type: 'string', nullable: true, originalType: 'VARCHAR' },
];

describe('HiddenColumnsGutter', () => {
  let state: TableState;
  let actions: StateActions;

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, mockBridge);
    initializeColumnsFromSchema(state, sampleSchema);
  });

  it('should be hidden when no columns are hidden', () => {
    const gutter = new HiddenColumnsGutter(state, actions);
    const el = gutter.getElement();

    expect(el.classList.contains('dt-hidden-gutter--hidden')).toBe(true);
    expect(el.querySelector('.dt-hidden-chips')?.children.length).toBe(0);

    gutter.destroy();
  });

  it('should have correct DOM structure', () => {
    const gutter = new HiddenColumnsGutter(state, actions);
    const el = gutter.getElement();

    expect(el.classList.contains('dt-hidden-gutter')).toBe(true);
    expect(el.getAttribute('role')).toBe('toolbar');
    expect(el.getAttribute('aria-label')).toBe('Hidden columns');
    expect(el.querySelector('.dt-gutter-label')).toBeTruthy();
    expect(el.querySelector('.dt-gutter-label')!.textContent).toBe('Hidden columns');
    expect(el.querySelector('.dt-hidden-chips')).toBeTruthy();
    expect(el.querySelector('.dt-hidden-show-all')).toBeTruthy();

    gutter.destroy();
  });

  it('should show chip when a column is hidden', () => {
    const gutter = new HiddenColumnsGutter(state, actions);
    const el = gutter.getElement();

    actions.hideColumn('name');

    expect(el.classList.contains('dt-hidden-gutter--hidden')).toBe(false);
    const chips = el.querySelector('.dt-hidden-chips')!;
    expect(chips.children.length).toBe(1);
    expect(chips.textContent).toContain('name');

    gutter.destroy();
  });

  it('should show multiple chips when multiple columns are hidden', () => {
    const gutter = new HiddenColumnsGutter(state, actions);
    const el = gutter.getElement();

    actions.hideColumn('name');
    actions.hideColumn('age');

    const chips = el.querySelector('.dt-hidden-chips')!;
    expect(chips.children.length).toBe(2);
    expect(chips.textContent).toContain('name');
    expect(chips.textContent).toContain('age');

    gutter.destroy();
  });

  it('should call showColumn when chip restore button is clicked', () => {
    const gutter = new HiddenColumnsGutter(state, actions);
    const el = gutter.getElement();

    actions.hideColumn('name');

    const restoreBtn = el.querySelector('.dt-hidden-chip-restore') as HTMLButtonElement;
    const showSpy = vi.spyOn(actions, 'showColumn');
    restoreBtn.click();

    expect(showSpy).toHaveBeenCalledWith('name');

    gutter.destroy();
  });

  it('should collapse when all columns are restored', () => {
    const gutter = new HiddenColumnsGutter(state, actions);
    const el = gutter.getElement();

    actions.hideColumn('name');
    expect(el.classList.contains('dt-hidden-gutter--hidden')).toBe(false);

    actions.showColumn('name');
    expect(el.classList.contains('dt-hidden-gutter--hidden')).toBe(true);

    gutter.destroy();
  });

  it('should show "Show all" button only when 2+ columns hidden', () => {
    const gutter = new HiddenColumnsGutter(state, actions);
    const el = gutter.getElement();
    const showAllBtn = el.querySelector('.dt-hidden-show-all') as HTMLButtonElement;

    // 0 hidden - button not visible
    expect(showAllBtn.style.display).toBe('none');

    // 1 hidden - button still not visible
    actions.hideColumn('name');
    expect(showAllBtn.style.display).toBe('none');

    // 2 hidden - button visible
    actions.hideColumn('age');
    expect(showAllBtn.style.display).toBe('');

    gutter.destroy();
  });

  it('should call showAllColumns when "Show all" is clicked', () => {
    const gutter = new HiddenColumnsGutter(state, actions);
    const el = gutter.getElement();

    actions.hideColumn('name');
    actions.hideColumn('age');

    const showAllBtn = el.querySelector('.dt-hidden-show-all') as HTMLButtonElement;
    const showAllSpy = vi.spyOn(actions, 'showAllColumns');
    showAllBtn.click();

    expect(showAllSpy).toHaveBeenCalled();

    gutter.destroy();
  });

  it('should destroy cleanly', () => {
    const gutter = new HiddenColumnsGutter(state, actions);
    const el = gutter.getElement();

    // Attach to DOM so we can verify removal
    document.body.appendChild(el);
    expect(document.body.contains(el)).toBe(true);

    gutter.destroy();

    expect(document.body.contains(el)).toBe(false);
  });

  /**
   * The gutter is a `role="toolbar"` with a roving tabindex: one tab stop for
   * the whole gutter however many columns are hidden. jsdom cannot observe
   * sequential focus navigation, so the stop count is asserted through
   * `tabindex` attributes rather than by tabbing.
   */
  describe('roving tabindex (APG toolbar)', () => {
    /** Every button in the gutter, in DOM order. */
    function buttons(gutter: HiddenColumnsGutter): HTMLButtonElement[] {
      return Array.from(gutter.getElement().querySelectorAll('button'));
    }

    function press(target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
      });
      target.dispatchEvent(event);
      return event;
    }

    /** Mount into the document — jsdom only focuses attached elements. */
    function mount(): HiddenColumnsGutter {
      const gutter = new HiddenColumnsGutter(state, actions);
      document.body.appendChild(gutter.getElement());
      return gutter;
    }

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('exposes exactly one tabindex="0" however many columns are hidden', () => {
      const gutter = mount();
      actions.hideColumn('name');
      actions.hideColumn('age');
      actions.hideColumn('email');

      const all = buttons(gutter);
      // 3 chip restores + "Show all"
      expect(all).toHaveLength(4);
      expect(all.filter((b) => b.getAttribute('tabindex') === '0')).toHaveLength(1);
      expect(all[0]!.getAttribute('tabindex')).toBe('0');
      expect(all.slice(1).every((b) => b.getAttribute('tabindex') === '-1')).toBe(true);

      gutter.destroy();
    });

    it('keeps exactly one reachable stop as columns are hidden and restored', () => {
      const gutter = mount();
      // The jsdom stand-in for "how many tab stops does the gutter
      // contribute": a `tabindex="0"` on a `display: none` control is not a
      // tab stop. In a live table the gutter always holds at least one chip —
      // the internal `__rowid__` column ships hidden — so this is the
      // resting state, not an edge case.
      const stops = () =>
        buttons(gutter).filter(
          (b) => b.getAttribute('tabindex') === '0' && b.style.display !== 'none',
        );

      actions.hideColumn('name');
      expect(stops()).toHaveLength(1);

      actions.hideColumn('age');
      actions.hideColumn('email');
      expect(buttons(gutter)).toHaveLength(4);
      expect(stops()).toHaveLength(1);

      actions.showColumn('age');
      expect(stops()).toHaveLength(1);

      gutter.destroy();
    });

    it('moves the stop off a control the render hides', () => {
      const gutter = mount();
      actions.hideColumn('name');
      actions.hideColumn('age');

      const showAll = gutter.getElement().querySelector('.dt-hidden-show-all') as HTMLButtonElement;
      showAll.focus();
      expect(showAll.getAttribute('tabindex')).toBe('0');

      // Back down to one hidden column, so "Show all" goes back to
      // `display: none`. A stop stranded on it would take the whole gutter
      // out of the tab order.
      actions.showColumn('age');

      expect(showAll.style.display).toBe('none');
      expect(showAll.getAttribute('tabindex')).toBe('-1');
      expect(
        buttons(gutter).filter(
          (b) => b.getAttribute('tabindex') === '0' && b.style.display !== 'none',
        ),
      ).toHaveLength(1);

      gutter.destroy();
    });

    it('contributes no tab stop at all while it is collapsed', () => {
      const gutter = mount();
      actions.hideColumn('name');
      actions.showColumn('name');

      const all = buttons(gutter);
      expect(all.some((b) => b.getAttribute('tabindex') === '0')).toBe(false);
      // "Show all" is hidden as well, so the collapsed gutter — which is
      // `max-height: 0; overflow: hidden`, i.e. clipped but not unfocusable —
      // holds nothing reachable.
      expect(all.every((b) => b.style.display === 'none')).toBe(true);

      gutter.destroy();
    });

    it('moves the stop with ← / →, and not ↑ / ↓, since the chips sit in one row', () => {
      const gutter = mount();
      actions.hideColumn('name');
      actions.hideColumn('age');
      const [first, second] = buttons(gutter);

      first!.focus();
      press(first!, 'ArrowRight');
      expect(document.activeElement).toBe(second);
      expect(second!.getAttribute('tabindex')).toBe('0');
      expect(first!.getAttribute('tabindex')).toBe('-1');

      press(second!, 'ArrowLeft');
      expect(document.activeElement).toBe(first);

      const down = press(first!, 'ArrowDown');
      expect(document.activeElement).toBe(first);
      expect(down.defaultPrevented).toBe(false);

      gutter.destroy();
    });

    it('jumps to the ends with Home / End and wraps past them', () => {
      const gutter = mount();
      actions.hideColumn('name');
      actions.hideColumn('age');
      const all = buttons(gutter);
      const first = all[0]!;
      const showAll = all[all.length - 1]!;
      expect(showAll.className).toContain('dt-hidden-show-all');

      first.focus();
      press(first, 'End');
      expect(document.activeElement).toBe(showAll);

      // Wraps rather than clamping.
      press(showAll, 'ArrowRight');
      expect(document.activeElement).toBe(first);

      press(first, 'ArrowLeft');
      expect(document.activeElement).toBe(showAll);

      press(showAll, 'Home');
      expect(document.activeElement).toBe(first);

      gutter.destroy();
    });

    it('skips the hidden "Show all" button when only one column is hidden', () => {
      const gutter = mount();
      actions.hideColumn('name');

      const all = buttons(gutter);
      const showAll = all[all.length - 1]!;
      expect(showAll.style.display).toBe('none');

      all[0]!.focus();
      press(all[0]!, 'ArrowRight');

      // The only navigable control wraps to itself; the hidden button is
      // still swept to -1 so it cannot resurface as a second tab stop.
      expect(document.activeElement).toBe(all[0]);
      expect(showAll.getAttribute('tabindex')).toBe('-1');

      gutter.destroy();
    });

    it('hands the stop, and focus, to the next chip when a chip restores itself away', () => {
      const gutter = mount();
      actions.hideColumn('name');
      actions.hideColumn('age');
      actions.hideColumn('email');

      const second = buttons(gutter)[1]!;
      second.focus();
      expect(second.getAttribute('tabindex')).toBe('0');

      // The restore button removes its own chip, so the stop's element is gone.
      second.click();

      const all = buttons(gutter);
      expect(all.filter((b) => b.getAttribute('tabindex') === '0')).toHaveLength(1);
      // The chip that took its place, not the first: in a row scrolled to the
      // middle, the first chip is out of sight, and going to it would scroll
      // the row back to its start.
      expect(all[1]!.getAttribute('aria-label')).toBe('Show email');
      expect(all[1]!.getAttribute('tabindex')).toBe('0');
      // Focus followed the stop instead of falling out of the gutter.
      expect(document.activeElement).toBe(all[1]);

      gutter.destroy();
    });

    it('hands them to the chip before when the last chip restores itself away', () => {
      const gutter = mount();
      actions.hideColumn('name');
      actions.hideColumn('age');
      actions.hideColumn('email');

      const last = buttons(gutter)[2]!;
      expect(last.getAttribute('aria-label')).toBe('Show email');
      last.focus();
      last.click();

      // Not "Show all", next in the row: a second Enter there would restore
      // every column.
      const age = buttons(gutter)[1]!;
      expect(age.getAttribute('aria-label')).toBe('Show age');
      expect(document.activeElement).toBe(age);

      gutter.destroy();
    });

    it('keeps the stop on its chip through a rebuild that leaves the chip', () => {
      const gutter = mount();
      actions.hideColumn('name');
      actions.hideColumn('email');
      const email = buttons(gutter)[1]!;
      email.focus();

      // Hiding another column rebuilds every chip.
      actions.hideColumn('age');

      const stop = buttons(gutter).find((b) => b.getAttribute('tabindex') === '0');
      expect(stop?.getAttribute('aria-label')).toBe('Show email');
      expect(document.activeElement).toBe(stop);

      gutter.destroy();
    });

    it('never preventDefaults Tab, and lets it bubble out of the gutter', () => {
      const gutter = mount();
      actions.hideColumn('name');
      actions.hideColumn('age');
      const first = buttons(gutter)[0]!;
      const onAncestorKey = vi.fn();
      document.body.addEventListener('keydown', onAncestorKey);

      first.focus();
      const tab = press(first, 'Tab');
      const shiftTab = press(first, 'Tab', { shiftKey: true });

      expect(tab.defaultPrevented).toBe(false);
      expect(shiftTab.defaultPrevented).toBe(false);
      expect(onAncestorKey).toHaveBeenCalledTimes(2);

      document.body.removeEventListener('keydown', onAncestorKey);
      gutter.destroy();
    });

    it('keeps its arrow keys away from the grid cursor listener', () => {
      const gutter = mount();
      actions.hideColumn('name');
      actions.hideColumn('age');
      const first = buttons(gutter)[0]!;
      // Stands in for KeyboardNavigator's bubble-phase listener on `.dt-root`.
      const onRootKey = vi.fn();
      document.body.addEventListener('keydown', onRootKey);

      first.focus();
      const arrow = press(first, 'ArrowRight');
      expect(arrow.defaultPrevented).toBe(true);
      expect(onRootKey).not.toHaveBeenCalled();

      // Ctrl chords stay table-wide: undo/redo/copy still reach the root.
      press(document.activeElement!, 'z', { ctrlKey: true });
      expect(onRootKey).toHaveBeenCalledTimes(1);

      document.body.removeEventListener('keydown', onRootKey);
      gutter.destroy();
    });

    it('scrolls the whole chip the arrows move to into view, clear of "Show all"', () => {
      const gutter = mount();
      actions.hideColumn('name');
      actions.hideColumn('age');
      actions.hideColumn('email');
      const el = gutter.getElement();
      // 200px of row, the last 60 under "Show all"; chips 100 wide, 10 apart.
      const layout = fakeChipStrip(
        el.querySelector('.dt-hidden-scroll')!,
        el.querySelector('.dt-hidden-actions')!,
        '.dt-hidden-chip',
        { width: 200, end: 60, chip: 100, gap: 10 },
      );
      const [first, second, third] = buttons(gutter);

      try {
        first!.focus();
        press(first!, 'ArrowRight');
        expect(document.activeElement).toBe(second);
        // The second chip spans 110–210, the room ends at 140.
        expect(layout.scrollLeft).toBe(70);

        press(second!, 'ArrowRight');
        expect(document.activeElement).toBe(third);
        expect(layout.scrollLeft).toBe(320 - 140);

        // "Show all" is pinned in view: no scroll.
        press(third!, 'ArrowRight');
        expect(layout.scrollLeft).toBe(180);

        // Wrapping to the first chip shows it whole, from its start.
        press(document.activeElement!, 'ArrowRight');
        expect(document.activeElement).toBe(first);
        expect(layout.scrollLeft).toBe(0);
      } finally {
        layout.restore();
        gutter.destroy();
      }
    });
  });

  describe('one row that scrolls sideways', () => {
    /** Twelve columns, `c0`…`c11`. */
    const wideSchema: ColumnSchema[] = Array.from({ length: 12 }, (_, i) => ({
      name: `c${i}`,
      type: 'integer',
      nullable: false,
      originalType: 'INTEGER',
    }));

    let gutter: HiddenColumnsGutter;
    let layout: FakeStrip;

    beforeEach(() => {
      state = createTableState();
      actions = new StateActions(state, mockBridge);
      initializeColumnsFromSchema(state, wideSchema);
      gutter = new HiddenColumnsGutter(state, actions);
      document.body.appendChild(gutter.getElement());
      const el = gutter.getElement();
      // 400px of row, the last 80 under "Show all"; chips 100 wide, 10 apart.
      layout = fakeChipStrip(
        el.querySelector('.dt-hidden-scroll')!,
        el.querySelector('.dt-hidden-actions')!,
        '.dt-hidden-chip',
        { width: 400, end: 80, chip: 100, gap: 10 },
      );
    });

    afterEach(() => {
      layout.restore();
      gutter.destroy();
      vi.unstubAllGlobals();
      document.body.innerHTML = '';
    });

    function chipNames(): string[] {
      return Array.from(gutter.getElement().querySelectorAll('.dt-hidden-chip-name')).map(
        (n) => n.textContent ?? '',
      );
    }

    it('keeps "Show all" inside the row that scrolls, so the tab stop always is', () => {
      // axe's `scrollable-region-focusable` wants something in the tab order
      // inside a region that overflows, and the roving stop may rest on
      // "Show all".
      const el = gutter.getElement();
      const scroll = el.querySelector('.dt-hidden-scroll')!;
      expect(scroll.querySelector('.dt-hidden-chips')).not.toBeNull();
      expect(scroll.querySelector('.dt-hidden-actions .dt-hidden-show-all')).not.toBeNull();
      expect(Array.from(el.querySelectorAll('button')).every((b) => scroll.contains(b))).toBe(true);
    });

    it('glides to the chip a hidden column adds out of view, at the next frame', async () => {
      for (const c of ['c0', 'c1', 'c2', 'c3']) actions.hideColumn(c);
      await nextFrame();
      layout.scrollTo.mockClear();
      layout.scrollLeft = 0;

      actions.hideColumn('c9');
      expect(layout.scrollTo).not.toHaveBeenCalled();
      await nextFrame();

      // c9 is the fifth chip: 440–540, and the room ends at 320.
      expect(chipNames()).toEqual(['c0', 'c1', 'c2', 'c3', 'c9']);
      expect(layout.scrollTo).toHaveBeenCalledWith({ left: 540 - 320, behavior: 'smooth' });
    });

    it('makes one scroll for columns hidden together, to the right-most of their chips', async () => {
      for (const c of ['c8', 'c2', 'c10', 'c5', 'c0']) actions.hideColumn(c);
      await nextFrame();

      // In column order, not hiding order: c10 is the last chip, 440–540.
      expect(chipNames()).toEqual(['c0', 'c2', 'c5', 'c8', 'c10']);
      expect(layout.scrollTo).toHaveBeenCalledTimes(1);
      expect(layout.scrollTo).toHaveBeenCalledWith({ left: 540 - 320, behavior: 'smooth' });
    });

    it('glides back for a chip that lands before the view', async () => {
      for (const c of ['c2', 'c3', 'c4', 'c5', 'c6', 'c7']) actions.hideColumn(c);
      await nextFrame();
      layout.scrollLeft = 300;
      layout.scrollTo.mockClear();

      actions.hideColumn('c0');
      await nextFrame();

      // c0 goes first in the row, at 0.
      expect(layout.scrollTo).toHaveBeenCalledWith({ left: 0, behavior: 'smooth' });
    });

    it('does not scroll for a chip in view, for a chip that goes, or for a reorder', async () => {
      for (const c of ['c1', 'c4', 'c6', 'c9', 'c11']) actions.hideColumn(c);
      await nextFrame();
      layout.scrollTo.mockClear();
      layout.scrollLeft = 100;

      actions.hideColumn('c5'); // between c4 and c6: 220–320, in view
      await nextFrame();
      actions.showColumn('c9');
      await nextFrame();
      actions.setColumnOrder(['c3', 'c0', 'c2', 'c7', 'c8', 'c9', 'c10']);
      await nextFrame();

      expect(layout.scrollTo).not.toHaveBeenCalled();
      expect(layout.scrollLeft).toBe(100);
    });

    it('does not scroll for the chips its first render finds', async () => {
      gutter.destroy();
      layout.restore();
      for (const c of ['c3', 'c7', 'c11']) actions.hideColumn(c);

      gutter = new HiddenColumnsGutter(state, actions);
      document.body.appendChild(gutter.getElement());
      const el = gutter.getElement();
      layout = fakeChipStrip(
        el.querySelector('.dt-hidden-scroll')!,
        el.querySelector('.dt-hidden-actions')!,
        '.dt-hidden-chip',
        { width: 200, end: 80, chip: 100, gap: 10 },
      );
      await nextFrame();

      expect(chipNames()).toEqual(['c3', 'c7', 'c11']);
      expect(layout.scrollTo).not.toHaveBeenCalled();
    });

    it('jumps rather than glides when the user prefers reduced motion', async () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' })),
      );
      for (const c of ['c0', 'c1', 'c2', 'c3', 'c4']) actions.hideColumn(c);
      await nextFrame();

      expect(layout.scrollTo).not.toHaveBeenCalled();
      expect(layout.scrollLeft).toBe(540 - 320);
    });
  });

  it('should support custom classPrefix', () => {
    const gutter = new HiddenColumnsGutter(state, actions, { classPrefix: 'my' });
    const el = gutter.getElement();

    expect(el.classList.contains('my-hidden-gutter')).toBe(true);
    expect(el.querySelector('.my-gutter-label')).toBeTruthy();
    expect(el.querySelector('.my-hidden-chips')).toBeTruthy();
    expect(el.querySelector('.my-hidden-show-all')).toBeTruthy();

    gutter.destroy();
  });
});
