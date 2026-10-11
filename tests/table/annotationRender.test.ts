/**
 * @vitest-environment jsdom
 *
 * The pieces the grid's annotation rendering is built from: the code a scope
 * shows, the packed cell state, the class diff, and what a store event can
 * have changed.
 */
import { describe, expect, it } from 'vitest';

import { AnnotationStore } from '@/annotations/AnnotationStore';
import type { Annotation, AnnotationChangePayload } from '@/annotations/types';
import {
  ALL_ANNOTATIONS,
  MAX_TARGETED_KEYS,
  annotationChangeOf,
  annotationClasses,
  applyCount,
  applyScope,
  cellCellCode,
  cellColumnCode,
  cellCount,
  cellRowCode,
  cellShowsSeverity,
  cellState,
  codeOf,
  columnScopeState,
  countOf,
  rowScopeState,
  scopeCode,
} from '@/table/annotationRender';

/** Every add/remove call made on a token list, in order. */
function recordingList(initial: string[] = []): {
  list: DOMTokenList;
  calls: string[];
} {
  const el = document.createElement('div');
  for (const name of initial) el.classList.add(name);
  const calls: string[] = [];
  const list = el.classList;
  const add = list.add.bind(list);
  const remove = list.remove.bind(list);
  list.add = (...tokens: string[]) => {
    calls.push(`add ${tokens.join(' ')}`);
    add(...tokens);
  };
  list.remove = (...tokens: string[]) => {
    calls.push(`remove ${tokens.join(' ')}`);
    remove(...tokens);
  };
  return { list, calls };
}

const classes = annotationClasses('dt').cell;

describe('scopeCode', () => {
  it('is 0 for none, 1 for all hidden, and 2–4 for the highest severity shown', () => {
    expect(scopeCode({ count: 0, severity: null })).toBe(0);
    expect(scopeCode({ count: 3, severity: null })).toBe(1);
    expect(scopeCode({ count: 1, severity: 'error' })).toBe(2);
    expect(scopeCode({ count: 1, severity: 'warning' })).toBe(3);
    expect(scopeCode({ count: 1, severity: 'info' })).toBe(4);
  });
});

describe('packed states', () => {
  it('keep each scope code and the total count apart, at any count', () => {
    const store = new AnnotationStore();
    store.add({ scope: 'row', rowId: 7, severity: 'warning', message: 'r' });
    store.add({ scope: 'column', column: 'a', severity: 'info', message: 'c' });
    store.add({ scope: 'column', column: 'a', severity: 'info', message: 'c2' });
    store.add({ scope: 'cell', rowId: 7, column: 'a', severity: 'error', message: 'x' });
    const row = rowScopeState(store, 7);
    const column = columnScopeState(store, 'a');
    expect([codeOf(row), countOf(row)]).toEqual([3, 1]);
    expect([codeOf(column), countOf(column)]).toEqual([4, 2]);
    const state = cellState(store, 7, 'a', row, column);
    expect(cellRowCode(state)).toBe(3);
    expect(cellColumnCode(state)).toBe(4);
    expect(cellCellCode(state)).toBe(2);
    expect(cellCount(state)).toBe(4);
    expect(cellShowsSeverity(state)).toBe(true);

    // Counts far past what a 32-bit shift would hold.
    const huge = 2 + 3_000_000_000 * 8;
    expect(codeOf(huge)).toBe(2);
    expect(countOf(huge)).toBe(3_000_000_000);
  });

  it('show no severity when the filter hides every one there', () => {
    const store = new AnnotationStore();
    store.add({ scope: 'cell', rowId: 1, column: 'a', severity: 'info', message: 'x' });
    store.setSeverityFilter({ info: false });
    const state = cellState(store, 1, 'a', rowScopeState(store, 1), columnScopeState(store, 'a'));
    expect(cellCellCode(state)).toBe(1);
    expect(cellCount(state)).toBe(1);
    expect(cellShowsSeverity(state)).toBe(false);
  });
});

describe('applyScope', () => {
  it('writes nothing when the code is unchanged', () => {
    const { list, calls } = recordingList(['dt-cell--annotated', 'dt-cell--annotation-error']);
    applyScope(list, classes, 2, 2);
    applyScope(list, classes, 0, 0);
    expect(calls).toEqual([]);
  });

  it('adds the marker and the severity in one call, and removes them in one', () => {
    const { list, calls } = recordingList();
    applyScope(list, classes, 0, 3);
    expect(calls).toEqual(['add dt-cell--annotated dt-cell--annotation-warning']);
    expect([...list]).toEqual(['dt-cell--annotated', 'dt-cell--annotation-warning']);
    calls.length = 0;
    applyScope(list, classes, 3, 0);
    expect(calls).toEqual(['remove dt-cell--annotated dt-cell--annotation-warning']);
    expect([...list]).toEqual([]);
  });

  it('swaps only the severity when the marker stays', () => {
    const { list, calls } = recordingList();
    applyScope(list, classes, 0, 2);
    calls.length = 0;
    applyScope(list, classes, 2, 4);
    expect(calls).toEqual(['remove dt-cell--annotation-error', 'add dt-cell--annotation-info']);
    calls.length = 0;
    // Every severity hidden: the marker stays alone.
    applyScope(list, classes, 4, 1);
    expect(calls).toEqual(['remove dt-cell--annotation-info']);
    expect([...list]).toEqual(['dt-cell--annotated']);
    calls.length = 0;
    applyScope(list, classes, 1, 3);
    expect(calls).toEqual(['add dt-cell--annotation-warning']);
  });

  it('builds the class names once per prefix', () => {
    expect(annotationClasses('dt')).toBe(annotationClasses('dt'));
    expect(annotationClasses('acme').header).toEqual([
      'acme-col-header--annotated',
      'acme-col-header--annotation-error',
      'acme-col-header--annotation-warning',
      'acme-col-header--annotation-info',
    ]);
  });
});

describe('applyCount', () => {
  it('writes the count only when it changes, and none for zero', () => {
    const el = document.createElement('div');
    applyCount(el, 0, 0);
    expect(el.hasAttribute('data-dt-annotation-count')).toBe(false);
    applyCount(el, 0, 3);
    expect(el.getAttribute('data-dt-annotation-count')).toBe('3');
    applyCount(el, 3, 0);
    expect(el.hasAttribute('data-dt-annotation-count')).toBe(false);
  });
});

describe('annotationChangeOf', () => {
  const row = (rowId: number): Annotation => ({
    id: `r${rowId}`,
    scope: 'row',
    rowId,
    severity: 'info',
    message: 'm',
  });
  const column = (name: string): Annotation => ({
    id: `c${name}`,
    scope: 'column',
    column: name,
    severity: 'info',
    message: 'm',
  });
  const cell = (rowId: number, name: string): Annotation => ({
    id: `x${rowId}${name}`,
    scope: 'cell',
    rowId,
    column: name,
    severity: 'info',
    message: 'm',
  });

  it('is all for a severity-filter change, a clear, and a payload without annotations', () => {
    expect(annotationChangeOf({ kind: 'filterChanged', ids: [] })).toBe(ALL_ANNOTATIONS);
    expect(annotationChangeOf({ kind: 'cleared', ids: ['a'], annotations: [row(1)] })).toBe(
      ALL_ANNOTATIONS,
    );
    expect(annotationChangeOf({ kind: 'added', ids: ['a'] })).toBe(ALL_ANNOTATIONS);
  });

  it('is all past the targeted-key limit', () => {
    const many = Array.from({ length: MAX_TARGETED_KEYS + 1 }, (_, i) => row(i));
    const payload: AnnotationChangePayload = {
      kind: 'added',
      ids: many.map((a) => a.id),
      annotations: many,
    };
    expect(annotationChangeOf(payload).all).toBe(true);
    const fewer = { ...payload, annotations: many.slice(0, MAX_TARGETED_KEYS) };
    expect(annotationChangeOf(fewer).all).toBe(false);
  });

  it('collects the keys of each scope, and an update’s keys before it', () => {
    const change = annotationChangeOf({
      kind: 'updated',
      ids: ['a', 'b', 'c'],
      annotations: [row(4), column('price'), cell(9, 'name')],
      previous: [row(4), column('price'), cell(9, 'name')],
    });
    expect(change.all).toBe(false);
    expect([...change.rows]).toEqual([4]);
    expect([...change.columns]).toEqual(['price']);
    expect([...change.cells].map(([id, cols]) => [id, [...cols]])).toEqual([[9, ['name']]]);
  });
});
