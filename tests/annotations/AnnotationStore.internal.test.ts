/**
 * The internal reads renderers, persistence and navigation build on:
 * per-scope summaries, lists and masks, `annotatedRows`, and the two
 * revision counters. The seeded model test checks them against brute force;
 * these cases pin the documented behavior one rule at a time.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import {
  ALL_SEVERITIES_MASK,
  createScopeSummary,
  SEVERITY_BIT,
  severitiesOfMask,
  severityMaskOf,
} from '@/annotations/severity';
import type { AnnotationFile } from '@/annotations/types';

function makeStore(): AnnotationStore {
  let seq = 0;
  return new AnnotationStore({
    idGenerator: () => `ann_${++seq}`,
    now: () => '2026-04-24T00:00:00.000Z',
  });
}

describe('severity helpers', () => {
  it('gives each severity one bit, rising as the severity falls', () => {
    expect(SEVERITY_BIT).toEqual({ error: 1, warning: 2, info: 4 });
    expect(ALL_SEVERITIES_MASK).toBe(7);
    expect(Object.isFrozen(SEVERITY_BIT)).toBe(true);
  });

  it('converts between filters, masks and severity lists', () => {
    expect(severityMaskOf({ error: true, warning: true, info: true })).toBe(7);
    expect(severityMaskOf({ error: false, warning: true, info: false })).toBe(2);
    expect(severityMaskOf({ error: false, warning: false, info: false })).toBe(0);
    expect(severitiesOfMask(7)).toEqual(['error', 'warning', 'info']);
    expect(severitiesOfMask(5)).toEqual(['error', 'info']);
    expect(severitiesOfMask(0)).toEqual([]);
    expect(createScopeSummary()).toEqual({ count: 0, severity: null });
  });
});

describe('AnnotationStore — per-scope reads', () => {
  let store: AnnotationStore;

  beforeEach(() => {
    store = makeStore();
    store.addMany([
      { scope: 'row', rowId: 1, severity: 'info', message: 'r1 info' },
      { scope: 'row', rowId: 1, severity: 'warning', message: 'r1 warning' },
      { scope: 'column', column: 'age', severity: 'error', message: 'age error' },
      { scope: 'cell', rowId: 1, column: 'age', severity: 'info', message: 'c info' },
      { scope: 'cell', rowId: 1, column: 'age', severity: 'error', message: 'c error' },
      { scope: 'cell', rowId: 1, column: 'name', severity: 'warning', message: 'other cell' },
      { scope: 'cell', rowId: 2, column: 'age', severity: 'warning', message: 'other row' },
    ]);
  });

  it('summarizes one scope at one key: unfiltered count, highest shown severity', () => {
    const out = createScopeSummary();
    expect(store.summarizeRowScope(1, out)).toBe(out);
    expect(out).toEqual({ count: 2, severity: 'warning' });
    expect(store.summarizeColumnScope('age', out)).toEqual({ count: 1, severity: 'error' });
    expect(store.summarizeCellScope(1, 'age', out)).toEqual({ count: 2, severity: 'error' });
    expect(store.summarizeCellScope(1, 'zip', out)).toEqual({ count: 0, severity: null });
    expect(store.summarizeRowScope(99, out)).toEqual({ count: 0, severity: null });

    store.setSeverityFilter({ error: false });
    expect(store.summarizeCellScope(1, 'age', out)).toEqual({ count: 2, severity: 'info' });
    expect(store.summarizeColumnScope('age', out)).toEqual({ count: 1, severity: null });
    store.setSeverityFilter({ warning: false, info: false });
    expect(store.summarizeRowScope(1, out)).toEqual({ count: 2, severity: null });
  });

  it('lists one scope at one key, sorted as getByCell sorts, whatever the filter shows', () => {
    store.setSeverityFilter({ error: false, warning: false, info: false });
    expect(store.listRowScope(1).map((a) => a.message)).toEqual(['r1 warning', 'r1 info']);
    expect(store.listColumnScope('age').map((a) => a.message)).toEqual(['age error']);
    expect(store.listCellScope(1, 'age').map((a) => a.message)).toEqual(['c error', 'c info']);
    expect(store.listCellScope(3, 'age')).toEqual([]);
  });

  it('masks one scope at one key, whatever the filter shows', () => {
    store.setSeverityFilter({ info: false });
    expect(store.rowScopeMask(1)).toBe(SEVERITY_BIT.warning | SEVERITY_BIT.info);
    expect(store.columnScopeMask('age')).toBe(SEVERITY_BIT.error);
    expect(store.cellScopeMask(1, 'age')).toBe(SEVERITY_BIT.error | SEVERITY_BIT.info);
    expect(store.cellScopeMask(1, 'zip')).toBe(0);
    expect(store.rowScopeMask(42)).toBe(0);
    expect(store.columnScopeMask('zip')).toBe(0);
  });

  it('keeps the counts and masks of a shared bucket through updates and removes', () => {
    const [cInfo, cError] = store.listCellScope(1, 'age').reverse();
    const out = createScopeSummary();
    store.update(cError!.id, { severity: 'warning' });
    expect(store.cellScopeMask(1, 'age')).toBe(SEVERITY_BIT.warning | SEVERITY_BIT.info);
    expect(store.summarizeCellScope(1, 'age', out)).toEqual({ count: 2, severity: 'warning' });
    store.remove(cInfo!.id);
    expect(store.cellScopeMask(1, 'age')).toBe(SEVERITY_BIT.warning);
    expect(store.summarizeCellScope(1, 'age', out)).toEqual({ count: 1, severity: 'warning' });
    store.remove(cError!.id);
    expect(store.cellScopeMask(1, 'age')).toBe(0);
    expect(store.summarizeCellScope(1, 'age', out)).toEqual({ count: 0, severity: null });
  });
});

describe('AnnotationStore — annotatedRows', () => {
  it('lists distinct rows with row or cell annotations, ascending, with their masks', () => {
    const store = makeStore();
    store.addMany([
      { scope: 'cell', rowId: 10, column: 'a', severity: 'info', message: 'x' },
      { scope: 'row', rowId: 10, severity: 'error', message: 'x' },
      { scope: 'cell', rowId: -3, column: 'a', severity: 'warning', message: 'x' },
      { scope: 'row', rowId: 2.5, severity: 'info', message: 'x' },
      { scope: 'column', column: 'a', severity: 'error', message: 'no row' },
      { scope: 'cell', rowId: 10, column: 'b', severity: 'info', message: 'x' },
    ]);
    const { rowIds, masks } = store.annotatedRows();
    expect(Array.from(rowIds)).toEqual([-3, 2.5, 10]);
    expect(Array.from(masks)).toEqual([
      SEVERITY_BIT.warning,
      SEVERITY_BIT.info,
      SEVERITY_BIT.error | SEVERITY_BIT.info,
    ]);
    expect(store.annotatedRowMask(10)).toBe(SEVERITY_BIT.error | SEVERITY_BIT.info);
    expect(store.annotatedRowMask(-3)).toBe(SEVERITY_BIT.warning);
    expect(store.annotatedRowMask(11)).toBe(0);
    expect(store.annotatedRowMask(Number.NaN)).toBe(0);
  });

  it('ignores the severity filter, and is rebuilt after a row or cell change', () => {
    const store = makeStore();
    const a = store.add({ scope: 'cell', rowId: 5, column: 'a', severity: 'info', message: 'x' });
    const first = store.annotatedRows();
    store.setSeverityFilter({ info: false });
    expect(store.annotatedRows()).toBe(first);
    expect(store.annotatedRowMask(5)).toBe(SEVERITY_BIT.info);

    store.update(a.id, { severity: 'error' });
    expect(store.annotatedRowMask(5)).toBe(SEVERITY_BIT.error);
    store.add({ scope: 'row', rowId: 1, severity: 'warning', message: 'r' });
    expect(Array.from(store.annotatedRows().rowIds)).toEqual([1, 5]);
    store.remove(a.id);
    expect(Array.from(store.annotatedRows().rowIds)).toEqual([1]);
    store.clear('row');
    expect(store.annotatedRows().rowIds).toHaveLength(0);
  });

  it('reads the by-row index of cells when getByRow has built it', () => {
    const store = makeStore();
    store.add({ scope: 'cell', rowId: 3, column: 'a', severity: 'info', message: 'x' });
    store.add({ scope: 'cell', rowId: 3, column: 'b', severity: 'error', message: 'y' });
    expect(store.getByRow(3)).toHaveLength(2);
    expect(store.annotatedRowMask(3)).toBe(SEVERITY_BIT.error | SEVERITY_BIT.info);
  });
});

describe('AnnotationStore — revisions', () => {
  let store: AnnotationStore;

  beforeEach(() => {
    store = makeStore();
  });

  function revisions() {
    return [store.revision, store.contentRevision];
  }

  it('moves both on every change to the contents, by one per call', () => {
    expect(revisions()).toEqual([0, 0]);
    const a = store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'a' });
    expect(revisions()).toEqual([1, 1]);
    store.addMany([
      { scope: 'row', rowId: 2, severity: 'info', message: 'b' },
      { scope: 'row', rowId: 3, severity: 'info', message: 'c' },
    ]);
    expect(revisions()).toEqual([2, 2]);
    store.update(a.id, { message: 'edited' });
    expect(revisions()).toEqual([3, 3]);
    store.remove(a.id);
    expect(revisions()).toEqual([4, 4]);
    store.removeMany(store.getAll().map((x) => x.id));
    expect(revisions()).toEqual([5, 5]);
  });

  it('moves only revision on an effective severity-filter change', () => {
    store.setSeverityFilter({ info: false });
    expect(revisions()).toEqual([1, 0]);
    store.setSeverityFilter({ info: false });
    expect(revisions()).toEqual([1, 0]);
  });

  it('stays put when nothing changes', () => {
    store.add({ id: 'x', scope: 'row', rowId: 1, severity: 'info', message: 'a' });
    const before = revisions();
    expect(() =>
      store.add({ id: 'x', scope: 'row', rowId: 2, severity: 'info', message: 'b' }),
    ).toThrow();
    expect(() => store.update('x', { scope: 'cell' } as never)).toThrow();
    expect(store.remove('nope')).toBe(false);
    expect(store.removeMany(['nope'])).toBe(0);
    expect(store.addMany([])).toEqual([]);
    expect(store.clear('column')).toBe(0);
    expect(revisions()).toEqual(before);
    store.clear('all');
    const empty = revisions();
    expect(store.clear('all')).toBe(0);
    expect(revisions()).toEqual(empty);
  });

  it('moves on loadJSON, and on clear("all") of file-level fields alone', () => {
    const file: AnnotationFile = { version: 1, annotations: [], exportedBy: 'qc' };
    store.loadJSON(file, 'replace');
    expect(revisions()).toEqual([1, 1]);
    expect(store.toJSON().exportedBy).toBe('qc');
    expect(store.clear('all')).toBe(0);
    expect(revisions()).toEqual([2, 2]);
    expect(store.toJSON().exportedBy).toBeUndefined();
    // A merge that adds nothing and carries no file-level fields changes nothing.
    store.loadJSON({ version: 1, annotations: [] }, 'merge');
    expect(revisions()).toEqual([2, 2]);
  });
});
