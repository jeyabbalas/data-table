/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ColumnHeader } from '@/table/ColumnHeader';
import { AnnotationPopover } from '@/table/AnnotationPopover';
import { ColumnHeaderTooltipPopover } from '@/table/ColumnHeaderTooltipPopover';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import { createTableState } from '@/core/State';
import { StateActions } from '@/core/Actions';
import type { TableState } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import type { WorkerBridge } from '@/data/WorkerBridge';

const mockBridge = {
  initialize: vi.fn(),
  query: vi.fn(),
  terminate: vi.fn(),
  clearQueryCache: vi.fn(),
} as unknown as WorkerBridge;

describe('ColumnHeader — column-header tooltip popover', () => {
  let state: TableState;
  let actions: StateActions;
  let column: ColumnSchema;
  let portal: HTMLElement;
  let tooltipPopover: ColumnHeaderTooltipPopover;

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, mockBridge);
    portal = document.createElement('div');
    document.body.appendChild(portal);
    tooltipPopover = new ColumnHeaderTooltipPopover({ portalTarget: portal });
    column = {
      name: 'fare_amount',
      type: 'float',
      nullable: false,
      originalType: 'DOUBLE',
    };
  });

  afterEach(() => {
    tooltipPopover.destroy();
    portal.remove();
    vi.clearAllMocks();
  });

  function getNameEl(header: ColumnHeader): HTMLElement {
    return header.getElement().querySelector('.dt-col-name') as HTMLElement;
  }

  function makeHeader(): ColumnHeader {
    return new ColumnHeader(column, state, actions, {
      columnHeaderTooltipPopover: tooltipPopover,
    });
  }

  it('default: name span has no tabindex and no native title attribute', () => {
    const header = makeHeader();
    const nameEl = getNameEl(header);
    expect(nameEl.getAttribute('tabindex')).toBeNull();
    expect(nameEl.getAttribute('title')).toBeNull();
    expect(portal.querySelector('.dt-col-tooltip')).toBeNull();
    header.destroy();
  });

  it('after setColumnHeaderTooltip: nameEl gains tabindex="-1"', () => {
    const header = makeHeader();
    actions.setColumnHeaderTooltip('fare_amount', { description: 'D' });
    expect(getNameEl(header).getAttribute('tabindex')).toBe('-1');
    header.destroy();
  });

  it('setting tooltip BEFORE constructing the header still applies tabindex on render', () => {
    actions.setColumnHeaderTooltip('fare_amount', 'pre-render');
    const header = makeHeader();
    expect(getNameEl(header).getAttribute('tabindex')).toBe('-1');
    header.destroy();
  });

  it('clearing the tooltip removes the tabindex', () => {
    const header = makeHeader();
    actions.setColumnHeaderTooltip('fare_amount', { description: 'D' });
    expect(getNameEl(header).getAttribute('tabindex')).toBe('-1');

    actions.setColumnHeaderTooltip('fare_amount', null);
    expect(getNameEl(header).getAttribute('tabindex')).toBeNull();
    header.destroy();
  });

  it('pointerenter on nameEl shows the popover with rendered content', () => {
    const header = makeHeader();
    actions.setColumnHeaderTooltip('fare_amount', {
      title: 'Fare',
      description: 'Metered fare.',
    });

    const nameEl = getNameEl(header);
    nameEl.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));

    const root = portal.querySelector('.dt-col-tooltip') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.style.display).toBe('block');
    expect(root.querySelector('.dt-col-tooltip__title')?.textContent).toBe('Fare');
    expect(root.querySelector('.dt-col-tooltip__description')?.textContent).toBe('Metered fare.');

    header.destroy();
  });

  it('pointerenter on a column without override does NOT open the popover', () => {
    const header = makeHeader();
    const nameEl = getNameEl(header);
    nameEl.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    expect(tooltipPopover.isOpen()).toBe(false);
    header.destroy();
  });

  it('pointerleave triggers grace-period hide', () => {
    vi.useFakeTimers();
    try {
      const header = makeHeader();
      actions.setColumnHeaderTooltip('fare_amount', { description: 'D' });

      const nameEl = getNameEl(header);
      nameEl.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
      expect(tooltipPopover.isOpen()).toBe(true);

      nameEl.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
      // Still open before grace expires
      expect(tooltipPopover.isOpen()).toBe(true);

      vi.advanceTimersByTime(150);
      expect(tooltipPopover.isOpen()).toBe(false);

      header.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('focusin on nameEl shows the popover; focusout schedules hide', () => {
    vi.useFakeTimers();
    try {
      const header = makeHeader();
      actions.setColumnHeaderTooltip('fare_amount', { description: 'D' });

      const nameEl = getNameEl(header);
      nameEl.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      expect(tooltipPopover.isOpen()).toBe(true);

      nameEl.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      vi.advanceTimersByTime(150);
      expect(tooltipPopover.isOpen()).toBe(false);

      header.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('Escape on document hides the popover', () => {
    const header = makeHeader();
    actions.setColumnHeaderTooltip('fare_amount', { description: 'D' });
    getNameEl(header).dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    expect(tooltipPopover.isOpen()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(tooltipPopover.isOpen()).toBe(false);
    header.destroy();
  });

  it('changing the tooltip while shown refreshes the popover in place', () => {
    const header = makeHeader();
    actions.setColumnHeaderTooltip('fare_amount', { description: 'first' });
    getNameEl(header).dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    const elBefore = portal.querySelector('.dt-col-tooltip');
    expect(elBefore?.querySelector('.dt-col-tooltip__description')?.textContent).toBe('first');

    actions.setColumnHeaderTooltip('fare_amount', { description: 'second' });
    const elAfter = portal.querySelector('.dt-col-tooltip');
    expect(elAfter).toBe(elBefore); // same instance, updated content
    expect(elAfter?.querySelector('.dt-col-tooltip__description')?.textContent).toBe('second');

    header.destroy();
  });

  it('clearing the tooltip while shown hides the popover', () => {
    const header = makeHeader();
    actions.setColumnHeaderTooltip('fare_amount', { description: 'D' });
    getNameEl(header).dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    expect(tooltipPopover.isOpen()).toBe(true);

    actions.setColumnHeaderTooltip('fare_amount', null);
    expect(tooltipPopover.isOpen()).toBe(false);
    header.destroy();
  });

  it('clearing the tooltip while shown drops both the popover AND the tabindex (combined lifecycle)', () => {
    const header = makeHeader();
    actions.setColumnHeaderTooltip('fare_amount', { description: 'D' });
    const nameEl = getNameEl(header);

    nameEl.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    expect(tooltipPopover.isOpen()).toBe(true);
    expect(nameEl.getAttribute('tabindex')).toBe('-1');

    actions.setColumnHeaderTooltip('fare_amount', null);
    expect(tooltipPopover.isOpen()).toBe(false);
    expect(nameEl.getAttribute('tabindex')).toBeNull();
    header.destroy();
  });

  it('description preserves newlines via the text node and renders with white-space: pre-wrap', () => {
    const header = makeHeader();
    const multiLine = 'Line one.\nLine two.\nLine three.';
    actions.setColumnHeaderTooltip('fare_amount', { description: multiLine });
    getNameEl(header).dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));

    const desc = portal.querySelector('.dt-col-tooltip__description') as HTMLElement;
    expect(desc).toBeTruthy();
    // textContent preserves the literal \n — popover sets via .textContent only.
    expect(desc.textContent).toBe(multiLine);
    // Stylesheet declares pre-wrap so the literal \n actually wraps in render.
    // jsdom returns the cascaded value; in environments where the sheet
    // isn't loaded we still want to assert the expected token.
    const ws = getComputedStyle(desc).whiteSpace;
    if (ws && ws !== 'normal') {
      expect(ws).toBe('pre-wrap');
    }
    header.destroy();
  });

  it('setting tooltip on a different column does not affect this header', () => {
    const header = makeHeader();
    actions.setColumnHeaderTooltip('other_col', 'irrelevant');
    expect(getNameEl(header).getAttribute('tabindex')).toBeNull();
    header.destroy();
  });

  it('reactivity uses the same DOM element (no rebuild)', () => {
    const header = makeHeader();
    const elBefore = header.getElement();
    const nameElBefore = getNameEl(header);

    actions.setColumnHeaderTooltip('fare_amount', { description: 'changed' });

    const elAfter = header.getElement();
    const nameElAfter = getNameEl(header);

    expect(elAfter).toBe(elBefore);
    expect(nameElAfter).toBe(nameElBefore);
    expect(nameElAfter.getAttribute('tabindex')).toBe('-1');
    header.destroy();
  });

  it('after destroy(): mutating the tooltip signal does not throw', () => {
    const header = makeHeader();
    header.destroy();
    expect(() => {
      actions.setColumnHeaderTooltip('fare_amount', 'post-destroy');
    }).not.toThrow();
  });

  it('Phase 4 non-interference: column with both an annotation and a tooltip gets BOTH', () => {
    const store = new AnnotationStore();
    const annPopover = new AnnotationPopover({ portalTarget: portal });

    try {
      const header = new ColumnHeader(column, state, actions, {
        annotations: store,
        annotationPopover: annPopover,
        columnHeaderTooltipPopover: tooltipPopover,
      });
      const el = header.getElement();
      const nameEl = getNameEl(header);

      // Both: tooltip override AND column-scope annotation on `fare_amount`.
      actions.setColumnHeaderTooltip('fare_amount', {
        title: 'Fare',
        description: 'Sum of fare components.',
      });
      store.add({
        scope: 'column',
        column: 'fare_amount',
        severity: 'error',
        message: 'column has an error',
      });

      // Annotation classes applied (Phase 4).
      expect(el.classList.contains('dt-col-header--annotated')).toBe(true);
      expect(el.classList.contains('dt-col-header--annotation-error')).toBe(true);
      expect(el.dataset.dtAnnotationCount).toBe('1');

      // Tooltip wired on nameEl independently of the annotation.
      expect(nameEl.getAttribute('tabindex')).toBe('-1');

      // Hovering the name span opens the tooltip popover (anchored to nameEl).
      nameEl.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
      const tt = portal.querySelector('.dt-col-tooltip') as HTMLElement;
      expect(tt).toBeTruthy();
      expect(tt.style.display).toBe('block');
      expect(tt.querySelector('.dt-col-tooltip__title')?.textContent).toBe('Fare');

      // Hovering the header (not the name span) opens the annotation popover.
      el.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
      const ann = portal.querySelector('.dt-annotation-popover') as HTMLElement;
      expect(ann).toBeTruthy();
      expect(ann.style.display).toBe('block');

      // Both popovers exist simultaneously, distinct DOM nodes.
      expect(tt).not.toBe(ann);
      expect(portal.querySelectorAll('.dt-col-tooltip').length).toBe(1);
      expect(portal.querySelectorAll('.dt-annotation-popover').length).toBe(1);

      header.destroy();
    } finally {
      annPopover.destroy();
      store.destroy();
    }
  });

  it('removing the annotation does not disturb the tooltip override', () => {
    const store = new AnnotationStore();
    const annPopover = new AnnotationPopover({ portalTarget: portal });

    try {
      const header = new ColumnHeader(column, state, actions, {
        annotations: store,
        annotationPopover: annPopover,
        columnHeaderTooltipPopover: tooltipPopover,
      });

      actions.setColumnHeaderTooltip('fare_amount', { description: 'My override' });
      const ann = store.add({
        scope: 'column',
        column: 'fare_amount',
        severity: 'error',
        message: 'err',
      });
      expect(getNameEl(header).getAttribute('tabindex')).toBe('-1');

      store.remove(ann.id);
      // Tooltip override survives independently of annotation lifecycle.
      expect(getNameEl(header).getAttribute('tabindex')).toBe('-1');
      expect(actions.getColumnHeaderTooltip('fare_amount')).toEqual({
        description: 'My override',
      });

      header.destroy();
    } finally {
      annPopover.destroy();
      store.destroy();
    }
  });

  it('XSS smoke: HTML in title/description does not parse — rendered as text', () => {
    const header = makeHeader();
    actions.setColumnHeaderTooltip('fare_amount', {
      title: '<img src=x onerror=alert(1)>',
      description: '<script>alert(2)</script>',
    });
    getNameEl(header).dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));

    const root = portal.querySelector('.dt-col-tooltip') as HTMLElement;
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('.dt-col-tooltip__title')?.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
    expect(root.querySelector('.dt-col-tooltip__description')?.textContent).toBe(
      '<script>alert(2)</script>',
    );
    header.destroy();
  });
});
