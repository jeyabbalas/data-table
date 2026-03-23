/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HiddenColumnsGutter } from '@/table/HiddenColumnsGutter';
import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';

const mockBridge = {
  initialize: vi.fn(),
  query: vi.fn(),
  terminate: vi.fn(),
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
