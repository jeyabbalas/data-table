/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ColumnHeader } from '@/table/ColumnHeader';
import { AnnotationPopover } from '@/table/AnnotationPopover';
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

describe('ColumnHeader — column header tooltip override', () => {
  let state: TableState;
  let actions: StateActions;
  let column: ColumnSchema;

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, mockBridge);
    column = {
      name: 'fare_amount',
      type: 'float',
      nullable: false,
      originalType: 'DOUBLE',
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function getNameTitle(header: ColumnHeader): string | null {
    const nameEl = header.getElement().querySelector('.dt-col-name');
    return nameEl?.getAttribute('title') ?? null;
  }

  it('default: name span title equals the column name (no override)', () => {
    const header = new ColumnHeader(column, state, actions);
    expect(getNameTitle(header)).toBe('fare_amount');
    header.destroy();
  });

  it('after setColumnHeaderTooltip: title equals the override text', () => {
    const header = new ColumnHeader(column, state, actions);
    actions.setColumnHeaderTooltip('fare_amount', 'Fare in USD');
    expect(getNameTitle(header)).toBe('Fare in USD');
    header.destroy();
  });

  it('setting tooltip BEFORE constructing the header still applies on render', () => {
    actions.setColumnHeaderTooltip('fare_amount', 'Fare in USD');
    const header = new ColumnHeader(column, state, actions);
    expect(getNameTitle(header)).toBe('Fare in USD');
    header.destroy();
  });

  it('clearing with null reverts the title to the column name', () => {
    const header = new ColumnHeader(column, state, actions);
    actions.setColumnHeaderTooltip('fare_amount', 'Fare in USD');
    expect(getNameTitle(header)).toBe('Fare in USD');

    actions.setColumnHeaderTooltip('fare_amount', null);
    expect(getNameTitle(header)).toBe('fare_amount');
    header.destroy();
  });

  it('clearing with empty string reverts the title to the column name', () => {
    const header = new ColumnHeader(column, state, actions);
    actions.setColumnHeaderTooltip('fare_amount', 'Fare in USD');
    actions.setColumnHeaderTooltip('fare_amount', '');
    expect(getNameTitle(header)).toBe('fare_amount');
    header.destroy();
  });

  it('setting tooltip on a different column does not mutate this header', () => {
    const header = new ColumnHeader(column, state, actions);
    actions.setColumnHeaderTooltip('other_col', 'irrelevant');
    expect(getNameTitle(header)).toBe('fare_amount');
    header.destroy();
  });

  it('reactivity uses the same DOM element (no rebuild)', () => {
    const header = new ColumnHeader(column, state, actions);
    const elBefore = header.getElement();
    const nameElBefore = elBefore.querySelector('.dt-col-name');

    actions.setColumnHeaderTooltip('fare_amount', 'changed');

    const elAfter = header.getElement();
    const nameElAfter = elAfter.querySelector('.dt-col-name');

    expect(elAfter).toBe(elBefore);
    expect(nameElAfter).toBe(nameElBefore);
    expect(nameElAfter?.getAttribute('title')).toBe('changed');
    header.destroy();
  });

  it('after destroy(): mutating the tooltip signal does not throw', () => {
    const header = new ColumnHeader(column, state, actions);
    header.destroy();
    expect(() => {
      actions.setColumnHeaderTooltip('fare_amount', 'post-destroy');
    }).not.toThrow();
  });

  it('Phase 4 non-interference: a column with both an annotation and a tooltip gets BOTH', () => {
    const store = new AnnotationStore();
    const portal = document.createElement('div');
    document.body.appendChild(portal);
    const popover = new AnnotationPopover({ portalTarget: portal });

    try {
      const header = new ColumnHeader(column, state, actions, {
        annotations: store,
        annotationPopover: popover,
      });
      const el = header.getElement();

      // Tooltip override + column annotation, both on `fare_amount`
      actions.setColumnHeaderTooltip(
        'fare_amount',
        'Sum of fare components in USD',
      );
      store.add({
        scope: 'column',
        column: 'fare_amount',
        severity: 'error',
        message: 'column has an error',
      });

      // Annotation classes applied (Phase 4)
      expect(el.classList.contains('dt-col-header--annotated')).toBe(true);
      expect(el.classList.contains('dt-col-header--annotation-error')).toBe(
        true,
      );
      expect(el.dataset.dtAnnotationCount).toBe('1');

      // Native tooltip on the name span reflects the Phase-5 override —
      // not the column name, not the annotation message
      expect(getNameTitle(header)).toBe('Sum of fare components in USD');

      header.destroy();
    } finally {
      popover.destroy();
      store.destroy();
      portal.remove();
    }
  });

  it('removing the annotation does not disturb the tooltip override', () => {
    const store = new AnnotationStore();
    const portal = document.createElement('div');
    document.body.appendChild(portal);
    const popover = new AnnotationPopover({ portalTarget: portal });

    try {
      const header = new ColumnHeader(column, state, actions, {
        annotations: store,
        annotationPopover: popover,
      });

      actions.setColumnHeaderTooltip('fare_amount', 'My override');
      const ann = store.add({
        scope: 'column',
        column: 'fare_amount',
        severity: 'error',
        message: 'err',
      });
      expect(getNameTitle(header)).toBe('My override');

      store.remove(ann.id);
      // Tooltip override survives independently of annotation lifecycle
      expect(getNameTitle(header)).toBe('My override');

      header.destroy();
    } finally {
      popover.destroy();
      store.destroy();
      portal.remove();
    }
  });
});
