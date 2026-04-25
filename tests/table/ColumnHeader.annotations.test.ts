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

describe('ColumnHeader — annotation overlay', () => {
  let state: TableState;
  let actions: StateActions;
  let store: AnnotationStore;
  let popover: AnnotationPopover;
  let column: ColumnSchema;
  let portal: HTMLElement;

  beforeEach(() => {
    state = createTableState();
    actions = new StateActions(state, mockBridge);
    store = new AnnotationStore();
    portal = document.createElement('div');
    document.body.appendChild(portal);
    popover = new AnnotationPopover({ portalTarget: portal });
    column = {
      name: 'fare_amount',
      type: 'float',
      nullable: false,
      originalType: 'DOUBLE',
    };
  });

  afterEach(() => {
    popover.destroy();
    store.destroy();
    portal.remove();
    vi.clearAllMocks();
  });

  it('header has no annotation class when store has no column-scope annotation', () => {
    const header = new ColumnHeader(column, state, actions, {
      annotations: store,
      annotationPopover: popover,
    });
    const el = header.getElement();
    expect(el.classList.contains('dt-col-header--annotated')).toBe(false);
    header.destroy();
  });

  it('header gains dt-col-header--annotated + severity class when a column annotation is added', () => {
    const header = new ColumnHeader(column, state, actions, {
      annotations: store,
      annotationPopover: popover,
    });
    const el = header.getElement();

    store.add({
      scope: 'column',
      column: 'fare_amount',
      severity: 'error',
      message: 'column broken',
    });

    expect(el.classList.contains('dt-col-header--annotated')).toBe(true);
    expect(el.classList.contains('dt-col-header--annotation-error')).toBe(true);
    expect(el.dataset.dtAnnotationCount).toBe('1');

    header.destroy();
  });

  it('severity class updates when a higher-severity annotation is added', () => {
    const header = new ColumnHeader(column, state, actions, {
      annotations: store,
      annotationPopover: popover,
    });
    const el = header.getElement();

    store.add({ scope: 'column', column: 'fare_amount', severity: 'info', message: 'i' });
    expect(el.classList.contains('dt-col-header--annotation-info')).toBe(true);

    store.add({ scope: 'column', column: 'fare_amount', severity: 'warning', message: 'w' });
    expect(el.classList.contains('dt-col-header--annotation-info')).toBe(false);
    expect(el.classList.contains('dt-col-header--annotation-warning')).toBe(true);

    store.add({ scope: 'column', column: 'fare_amount', severity: 'error', message: 'e' });
    expect(el.classList.contains('dt-col-header--annotation-warning')).toBe(false);
    expect(el.classList.contains('dt-col-header--annotation-error')).toBe(true);

    header.destroy();
  });

  it('clear() removes the header annotation classes', () => {
    const header = new ColumnHeader(column, state, actions, {
      annotations: store,
      annotationPopover: popover,
    });
    const el = header.getElement();
    const ann = store.add({ scope: 'column', column: 'fare_amount', severity: 'error', message: 'x' });
    expect(el.classList.contains('dt-col-header--annotated')).toBe(true);

    store.remove(ann.id);
    expect(el.classList.contains('dt-col-header--annotated')).toBe(false);
    expect(el.classList.contains('dt-col-header--annotation-error')).toBe(false);
    expect(el.dataset.dtAnnotationCount).toBeUndefined();

    header.destroy();
  });

  it('column annotations on other columns do not affect this header', () => {
    const header = new ColumnHeader(column, state, actions, {
      annotations: store,
      annotationPopover: popover,
    });
    const el = header.getElement();

    store.add({ scope: 'column', column: 'other_col', severity: 'error', message: 'nope' });

    expect(el.classList.contains('dt-col-header--annotated')).toBe(false);

    header.destroy();
  });

  it('cell-scope annotations in this column do NOT tint the header (header reacts to column scope only)', () => {
    const header = new ColumnHeader(column, state, actions, {
      annotations: store,
      annotationPopover: popover,
    });
    const el = header.getElement();

    store.add({
      scope: 'cell',
      rowId: 1,
      column: 'fare_amount',
      severity: 'error',
      message: 'one-cell',
    });

    expect(el.classList.contains('dt-col-header--annotated')).toBe(false);
    expect(el.classList.contains('dt-col-header--annotation-error')).toBe(false);
    expect(el.dataset.dtAnnotationCount).toBeUndefined();

    header.destroy();
  });

  it('pointerenter on a header with only cell-scope anns does not open the header popover', () => {
    const header = new ColumnHeader(column, state, actions, {
      annotations: store,
      annotationPopover: popover,
    });
    const el = header.getElement();
    document.body.appendChild(el);

    store.add({
      scope: 'cell',
      rowId: 0,
      column: 'fare_amount',
      severity: 'info',
      message: 'only cell',
    });

    el.dispatchEvent(new Event('pointerenter'));
    expect(popover.isOpen()).toBe(false);

    el.remove();
    header.destroy();
  });

  it('pointerenter on an annotated header opens the popover with column annotations', () => {
    const header = new ColumnHeader(column, state, actions, {
      annotations: store,
      annotationPopover: popover,
    });
    const el = header.getElement();
    document.body.appendChild(el);

    store.add({ scope: 'column', column: 'fare_amount', severity: 'error', message: 'boom' });

    el.dispatchEvent(new Event('pointerenter'));
    expect(popover.isOpen()).toBe(true);
    const popoverEl = portal.querySelector('.dt-annotation-popover') as HTMLElement;
    expect(popoverEl).toBeTruthy();
    const groups = popoverEl.querySelectorAll('.dt-annotation-popover__group');
    expect(groups.length).toBe(1);
    expect(groups[0].classList.contains('dt-annotation-popover__group--column')).toBe(true);
    expect(popoverEl.querySelector('.dt-annotation-message')?.textContent).toBe('boom');

    el.remove();
    header.destroy();
  });

  it('pointerenter on an un-annotated header does not open the popover', () => {
    const header = new ColumnHeader(column, state, actions, {
      annotations: store,
      annotationPopover: popover,
    });
    const el = header.getElement();
    document.body.appendChild(el);

    el.dispatchEvent(new Event('pointerenter'));
    expect(popover.isOpen()).toBe(false);

    el.remove();
    header.destroy();
  });

  it('works without a store (no annotation classes, no popover wiring)', () => {
    const header = new ColumnHeader(column, state, actions, {});
    const el = header.getElement();
    expect(el.classList.contains('dt-col-header--annotated')).toBe(false);
    el.dispatchEvent(new Event('pointerenter'));
    expect(popover.isOpen()).toBe(false);
    header.destroy();
  });

  // Within-scope max-severity hierarchy (regression). The existing
  // "severity class updates when a higher-severity annotation is added"
  // test only covers monotonically-increasing severities. This test
  // exercises mixed insertion orders to lock in maxSeverity routing
  // against any future change that uses anns[0] / anns.at(-1).
  it('column-scope multi-ann: highest severity wins regardless of insertion order', () => {
    const header = new ColumnHeader(column, state, actions, {
      annotations: store,
      annotationPopover: popover,
    });
    const el = header.getElement();

    // Phase 1: error added LAST (info → warning → error). Error must win.
    for (const sev of ['info', 'warning', 'error'] as const) {
      store.add({ scope: 'column', column: 'fare_amount', severity: sev, message: `c-${sev}` });
    }
    expect(el.classList.contains('dt-col-header--annotated')).toBe(true);
    expect(el.classList.contains('dt-col-header--annotation-error')).toBe(true);
    expect(el.classList.contains('dt-col-header--annotation-warning')).toBe(false);
    expect(el.classList.contains('dt-col-header--annotation-info')).toBe(false);
    expect(el.dataset.dtAnnotationCount).toBe('3');

    // Phase 2: error added FIRST (error → warning → info). Error must STILL win.
    store.clear('all');
    for (const sev of ['error', 'warning', 'info'] as const) {
      store.add({ scope: 'column', column: 'fare_amount', severity: sev, message: `c-${sev}` });
    }
    expect(el.classList.contains('dt-col-header--annotation-error')).toBe(true);
    expect(el.classList.contains('dt-col-header--annotation-warning')).toBe(false);
    expect(el.classList.contains('dt-col-header--annotation-info')).toBe(false);
    expect(el.dataset.dtAnnotationCount).toBe('3');

    header.destroy();
  });
});
