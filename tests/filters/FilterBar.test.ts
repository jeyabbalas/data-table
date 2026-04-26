/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FilterBar } from '@/filters/FilterBar';
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
});
