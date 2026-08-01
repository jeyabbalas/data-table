/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FilterBar, type FilterBarOptions } from '@/filters/FilterBar';
import { createTableState } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import type { Filter } from '@/filters/FilterTypes';

// Mock WorkerBridge
const mockBridge = {
  query: vi.fn().mockResolvedValue([]),
  initialize: vi.fn().mockResolvedValue(undefined),
  loadData: vi.fn().mockResolvedValue({ schema: [], rowCount: 0 }),
  destroy: vi.fn(),
  clearQueryCache: vi.fn(),
} as any;

describe('FilterBar', () => {
  let state: TableState;
  let actions: StateActions;

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, mockBridge);
  });

  it('should be hidden when no filters are active', () => {
    const bar = new FilterBar(state, actions);
    const el = bar.getElement();

    expect(el.classList.contains('dt-filter-bar--hidden')).toBe(true);
    expect(el.querySelector('.dt-filter-chips')?.children.length).toBe(0);

    bar.destroy();
  });

  it('should show chip when filter is added to state', () => {
    const bar = new FilterBar(state, actions);
    const el = bar.getElement();

    // Add a filter
    actions.addFilter({ type: 'point', column: 'color', value: 'blue' });

    expect(el.classList.contains('dt-filter-bar--hidden')).toBe(false);
    const chips = el.querySelector('.dt-filter-chips')!;
    expect(chips.children.length).toBe(1);
    expect(chips.textContent).toContain('color');
    expect(chips.textContent).toContain('= blue');

    bar.destroy();
  });

  it('should hide when all filters are removed', () => {
    const bar = new FilterBar(state, actions);
    const el = bar.getElement();

    // Add then remove
    actions.addFilter({ type: 'point', column: 'color', value: 'blue' });
    expect(el.classList.contains('dt-filter-bar--hidden')).toBe(false);

    actions.removeFilter('color');
    expect(el.classList.contains('dt-filter-bar--hidden')).toBe(true);
    expect(el.querySelector('.dt-filter-chips')?.children.length).toBe(0);

    bar.destroy();
  });

  it('should call actions.removeFilter when chip X is clicked', () => {
    const bar = new FilterBar(state, actions);
    const el = bar.getElement();

    actions.addFilter({ type: 'point', column: 'color', value: 'blue' });
    const removeBtn = el.querySelector('.dt-filter-chip-remove') as HTMLButtonElement;

    const removeSpy = vi.spyOn(actions, 'removeFilter');
    removeBtn.click();

    expect(removeSpy).toHaveBeenCalledWith('color');

    bar.destroy();
  });

  it('should call onFilterRemove callback when chip is removed', () => {
    const onFilterRemove = vi.fn();
    const bar = new FilterBar(state, actions, { onFilterRemove });
    const el = bar.getElement();

    actions.addFilter({ type: 'point', column: 'color', value: 'blue' });
    const removeBtn = el.querySelector('.dt-filter-chip-remove') as HTMLButtonElement;
    removeBtn.click();

    expect(onFilterRemove).toHaveBeenCalledWith('color');

    bar.destroy();
  });

  it('should show Clear All button only with 2+ filters', () => {
    const bar = new FilterBar(state, actions);
    const el = bar.getElement();
    const clearBtn = el.querySelector('.dt-filter-clear-all') as HTMLButtonElement;

    // 0 filters - hidden
    expect(clearBtn.style.display).toBe('none');

    // 1 filter - hidden
    actions.addFilter({ type: 'point', column: 'color', value: 'blue' });
    expect(clearBtn.style.display).toBe('none');

    // 2 filters - visible
    actions.addFilter({ type: 'range', column: 'age', min: 20, max: 40 });
    expect(clearBtn.style.display).toBe('');

    bar.destroy();
  });

  it('should clear all filters when Clear All is clicked', () => {
    const onFilterRemove = vi.fn();
    const bar = new FilterBar(state, actions, { onFilterRemove });
    const el = bar.getElement();

    actions.addFilter({ type: 'point', column: 'color', value: 'blue' });
    actions.addFilter({ type: 'range', column: 'age', min: 20, max: 40 });

    const clearBtn = el.querySelector('.dt-filter-clear-all') as HTMLButtonElement;
    clearBtn.click();

    expect(state.filters.get()).toEqual([]);
    expect(onFilterRemove).toHaveBeenCalledWith('color');
    expect(onFilterRemove).toHaveBeenCalledWith('age');
    expect(onFilterRemove).toHaveBeenCalledTimes(2);

    bar.destroy();
  });

  it('should update chips when filters change', () => {
    const bar = new FilterBar(state, actions);
    const el = bar.getElement();

    // Add first filter
    actions.addFilter({ type: 'point', column: 'color', value: 'blue' });
    expect(el.querySelector('.dt-filter-chips')?.children.length).toBe(1);

    // Replace with new filter on same column
    actions.addFilter({ type: 'point', column: 'color', value: 'red' });
    expect(el.querySelector('.dt-filter-chips')?.children.length).toBe(1);
    expect(el.querySelector('.dt-filter-chips')?.textContent).toContain('red');

    bar.destroy();
  });

  it('should show multiple chips for multiple columns', () => {
    const bar = new FilterBar(state, actions);
    const el = bar.getElement();

    actions.addFilter({ type: 'point', column: 'color', value: 'blue' });
    actions.addFilter({ type: 'null', column: 'notes' });

    const chips = el.querySelector('.dt-filter-chips')!;
    expect(chips.children.length).toBe(2);
    expect(chips.textContent).toContain('color');
    expect(chips.textContent).toContain('notes');
    expect(chips.textContent).toContain('is null');

    bar.destroy();
  });

  it('should destroy cleanly and unsubscribe from state', () => {
    const bar = new FilterBar(state, actions);
    const subscriberCountBefore = state.filters.subscriberCount();

    bar.destroy();

    // Subscriber count should decrease after destroy
    expect(state.filters.subscriberCount()).toBeLessThan(subscriberCountBefore);
  });

  it('should support custom classPrefix', () => {
    const bar = new FilterBar(state, actions, { classPrefix: 'my' });
    const el = bar.getElement();

    expect(el.classList.contains('my-filter-bar')).toBe(true);
    expect(el.classList.contains('my-filter-bar--hidden')).toBe(true);

    actions.addFilter({ type: 'point', column: 'x', value: 1 });
    expect(el.querySelector('.my-filter-chips')).toBeTruthy();
    expect(el.querySelector('.my-filter-chip')).toBeTruthy();

    bar.destroy();
  });

  it('should have correct ARIA attributes', () => {
    const bar = new FilterBar(state, actions);
    const el = bar.getElement();

    expect(el.getAttribute('role')).toBe('toolbar');
    expect(el.getAttribute('aria-label')).toBe('Active filters');

    bar.destroy();
  });

  it('should have "Active filters" gutter label', () => {
    const bar = new FilterBar(state, actions);
    const el = bar.getElement();

    const label = el.querySelector('.dt-gutter-label');
    expect(label).toBeTruthy();
    expect(label!.textContent).toBe('Active filters');

    bar.destroy();
  });

  it('should smooth-scroll to the rightmost chip when chips overflow', async () => {
    const bar = new FilterBar(state, actions);
    const el = bar.getElement();
    const chipsContainer = el.querySelector('.dt-filter-chips') as HTMLElement;

    // Mock scrollTo and layout properties to simulate overflow
    const scrollToMock = vi.fn();
    chipsContainer.scrollTo = scrollToMock;
    Object.defineProperty(chipsContainer, 'scrollWidth', {
      value: 500,
      configurable: true,
    });
    Object.defineProperty(chipsContainer, 'clientWidth', {
      value: 200,
      configurable: true,
    });

    // Add filters to trigger update
    actions.addFilter({ type: 'point', column: 'color', value: 'blue' });
    actions.addFilter({ type: 'range', column: 'age', min: 20, max: 40 });

    // Flush double-rAF (jsdom implements rAF as setTimeout(cb, 0))
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    expect(scrollToMock).toHaveBeenCalledWith({
      left: 500,
      behavior: 'smooth',
    });

    bar.destroy();
  });

  it('should not scroll when chips fit within the container', async () => {
    const bar = new FilterBar(state, actions);
    const el = bar.getElement();
    const chipsContainer = el.querySelector('.dt-filter-chips') as HTMLElement;

    const scrollToMock = vi.fn();
    chipsContainer.scrollTo = scrollToMock;
    // scrollWidth <= clientWidth means no overflow (jsdom defaults both to 0)

    actions.addFilter({ type: 'point', column: 'color', value: 'blue' });

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    expect(scrollToMock).not.toHaveBeenCalled();

    bar.destroy();
  });

  /**
   * The bar is a `role="toolbar"` with a roving tabindex: one tab stop for the
   * whole bar however many chips it holds. jsdom cannot observe sequential
   * focus navigation, so the stop count is asserted through `tabindex`
   * attributes rather than by tabbing.
   */
  describe('roving tabindex (APG toolbar)', () => {
    /** Every button in the bar, in DOM order. */
    function buttons(bar: FilterBar): HTMLButtonElement[] {
      return Array.from(bar.getElement().querySelectorAll('button'));
    }

    /** The buttons that are actually reachable — hidden ones do not count. */
    function visibleButtons(bar: FilterBar): HTMLButtonElement[] {
      return buttons(bar).filter((b) => b.style.display !== 'none');
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
    function mount(options?: FilterBarOptions): FilterBar {
      const bar = new FilterBar(state, actions, {
        onAddSQLFilter: () => {},
        onPresetsClick: () => {},
        ...options,
      });
      document.body.appendChild(bar.getElement());
      return bar;
    }

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('exposes exactly one tabindex="0" at rest', () => {
      const bar = mount();
      actions.addFilter({ type: 'point', column: 'color', value: 'blue' });
      actions.addFilter({ type: 'range', column: 'age', min: 20, max: 40 });

      const all = buttons(bar);
      // 2 chip removes + clear all + expression + presets
      expect(all).toHaveLength(5);
      expect(all.filter((b) => b.getAttribute('tabindex') === '0')).toHaveLength(1);
      // The stop was established on the empty bar's only control — the
      // expression button — and adding chips does not move it, because a stop
      // that survives the rebuild stays put.
      const expression = bar.getElement().querySelector('.dt-filter-expression-btn');
      expect(expression!.getAttribute('tabindex')).toBe('0');

      bar.destroy();
    });

    it('keeps exactly one reachable stop as filters come and go', () => {
      const bar = mount();
      // The jsdom stand-in for "how many tab stops does the bar contribute":
      // a `tabindex="0"` on a `display: none` control is not a tab stop.
      const stops = () =>
        buttons(bar).filter(
          (b) => b.getAttribute('tabindex') === '0' && b.style.display !== 'none',
        );

      expect(stops()).toHaveLength(1);

      actions.addFilter({ type: 'point', column: 'color', value: 'blue' });
      expect(stops()).toHaveLength(1);

      actions.addFilter({ type: 'range', column: 'age', min: 20, max: 40 });
      actions.addFilter({ type: 'null', column: 'notes' });
      expect(buttons(bar)).toHaveLength(6);
      expect(stops()).toHaveLength(1);

      actions.clearFilters();
      expect(stops()).toHaveLength(1);

      bar.destroy();
    });

    it('moves the stop off a control the render hides', () => {
      const bar = mount();
      actions.addFilter({ type: 'point', column: 'color', value: 'blue' });
      actions.addFilter({ type: 'range', column: 'age', min: 20, max: 40 });

      const clearAll = bar.getElement().querySelector('.dt-filter-clear-all') as HTMLButtonElement;
      clearAll.focus();
      expect(clearAll.getAttribute('tabindex')).toBe('0');

      // Down to one filter, "Clear all" goes back to `display: none`. A stop
      // stranded on it would take the whole bar out of the tab order.
      actions.removeFilter('age');

      expect(clearAll.style.display).toBe('none');
      expect(clearAll.getAttribute('tabindex')).toBe('-1');
      expect(
        buttons(bar).filter(
          (b) => b.getAttribute('tabindex') === '0' && b.style.display !== 'none',
        ),
      ).toHaveLength(1);

      bar.destroy();
    });

    it('moves the stop and DOM focus with the horizontal arrows', () => {
      const bar = mount();
      actions.addFilter({ type: 'point', column: 'color', value: 'blue' });
      actions.addFilter({ type: 'range', column: 'age', min: 20, max: 40 });
      const [first, second] = visibleButtons(bar);

      first!.focus();
      press(first!, 'ArrowRight');

      expect(document.activeElement).toBe(second);
      expect(second!.getAttribute('tabindex')).toBe('0');
      expect(first!.getAttribute('tabindex')).toBe('-1');

      press(second!, 'ArrowLeft');
      expect(document.activeElement).toBe(first);

      bar.destroy();
    });

    it('jumps to the ends with Home / End and wraps past them', () => {
      const bar = mount();
      actions.addFilter({ type: 'point', column: 'color', value: 'blue' });
      const controls = visibleButtons(bar);
      const first = controls[0]!;
      const last = controls[controls.length - 1]!;

      first.focus();
      press(first, 'End');
      expect(document.activeElement).toBe(last);

      // Wraps rather than clamping.
      press(last, 'ArrowRight');
      expect(document.activeElement).toBe(first);

      press(first, 'ArrowLeft');
      expect(document.activeElement).toBe(last);

      press(last, 'Home');
      expect(document.activeElement).toBe(first);

      bar.destroy();
    });

    it('skips the controls the bar has hidden', () => {
      // One filter keeps "Clear all" at display:none, and without the two
      // callbacks the expression and presets buttons are hidden too.
      const bar = mount({ onAddSQLFilter: undefined, onPresetsClick: undefined });
      actions.addFilter({ type: 'point', column: 'color', value: 'blue' });

      const all = buttons(bar);
      const reachable = all.filter((b) => b.getAttribute('tabindex') === '0');
      expect(reachable).toHaveLength(1);
      expect(reachable[0]).toBe(all[0]);
      expect(all[0]!.className).toContain('dt-filter-chip-remove');

      // Hidden controls are still swept to -1 so they cannot resurface as a
      // second tab stop when they become visible again.
      expect(
        all
          .slice(1)
          .every((b) => b.style.display === 'none' && b.getAttribute('tabindex') === '-1'),
      ).toBe(true);

      bar.destroy();
    });

    it('re-establishes the stop after a re-render removes the active control', () => {
      const bar = mount({ onAddSQLFilter: undefined, onPresetsClick: undefined });
      actions.addFilter({ type: 'point', column: 'color', value: 'blue' });
      actions.addFilter({ type: 'range', column: 'age', min: 20, max: 40 });

      const removeSecond = buttons(bar)[1]!;
      removeSecond.focus();
      expect(removeSecond.getAttribute('tabindex')).toBe('0');

      // The chip removes itself, so the element holding the stop is gone.
      removeSecond.click();

      const all = buttons(bar);
      expect(all.filter((b) => b.getAttribute('tabindex') === '0')).toHaveLength(1);
      expect(all[0]!.getAttribute('tabindex')).toBe('0');
      // Focus followed the stop instead of falling out of the bar entirely.
      expect(document.activeElement).toBe(all[0]);

      bar.destroy();
    });

    it('never preventDefaults Tab, and lets it bubble out of the bar', () => {
      const bar = mount();
      actions.addFilter({ type: 'point', column: 'color', value: 'blue' });
      const first = visibleButtons(bar)[0]!;
      const onAncestorKey = vi.fn();
      document.body.addEventListener('keydown', onAncestorKey);

      first.focus();
      const tab = press(first, 'Tab');
      const shiftTab = press(first, 'Tab', { shiftKey: true });

      expect(tab.defaultPrevented).toBe(false);
      expect(shiftTab.defaultPrevented).toBe(false);
      expect(onAncestorKey).toHaveBeenCalledTimes(2);

      document.body.removeEventListener('keydown', onAncestorKey);
      bar.destroy();
    });

    it('keeps its arrow keys away from the grid cursor listener', () => {
      const bar = mount();
      actions.addFilter({ type: 'point', column: 'color', value: 'blue' });
      const first = visibleButtons(bar)[0]!;
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
      bar.destroy();
    });
  });

  describe('raw-SQL chip edit gating (expressionFilter flag)', () => {
    const rawSqlFilter: Filter = {
      type: 'raw-sql',
      id: 'sql1',
      column: '__raw_sql_sql1__',
      sql: 'x > 0',
      label: 'x > 0',
    };

    it('omits the --clickable class and click listener when onRawSQLEdit is undefined', () => {
      const bar = new FilterBar(state, actions, {});
      actions.addFilter(rawSqlFilter);

      const label = bar.getElement().querySelector('.dt-filter-chip-label') as HTMLElement;
      expect(label).not.toBeNull();
      expect(label.classList.contains('dt-filter-chip-label--clickable')).toBe(false);

      // Clicking the label is a no-op (no callback to invoke). Asserting no
      // error is enough — the absence of the click listener is what we care
      // about; the row directly above already verifies the visual treatment.
      label.click();

      bar.destroy();
    });

    it('adds the --clickable class and wires the callback when onRawSQLEdit is provided', () => {
      const onEdit = vi.fn();
      const bar = new FilterBar(state, actions, { onRawSQLEdit: onEdit });
      actions.addFilter(rawSqlFilter);

      const label = bar.getElement().querySelector('.dt-filter-chip-label') as HTMLElement;
      expect(label.classList.contains('dt-filter-chip-label--clickable')).toBe(true);
      label.click();
      expect(onEdit).toHaveBeenCalledWith('sql1');

      bar.destroy();
    });
  });
});
