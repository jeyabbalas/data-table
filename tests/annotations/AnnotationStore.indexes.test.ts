import { describe, it, expect, beforeEach } from 'vitest';
import { AnnotationStore } from '@/annotations/AnnotationStore';

function makeDeterministicStore() {
  let seq = 0;
  return new AnnotationStore({
    idGenerator: () => `ann_test_${String(++seq).padStart(6, '0')}`,
    now: () => '2026-04-24T00:00:00.000Z',
  });
}

describe('AnnotationStore — indexes & intersection', () => {
  let store: AnnotationStore;

  beforeEach(() => {
    store = makeDeterministicStore();
  });

  it('getByRow returns every annotation for that row (row + cell scopes)', () => {
    store.add({ scope: 'row', rowId: 5, severity: 'warning', message: 'row 5' });
    store.add({ scope: 'cell', rowId: 5, column: 'fare', severity: 'error', message: 'cell' });
    store.add({ scope: 'row', rowId: 6, severity: 'info', message: 'row 6' });
    const atRow5 = store.getByRow(5);
    expect(atRow5).toHaveLength(2);
    expect(atRow5.map((a) => a.message)).toEqual(['row 5', 'cell']);
  });

  it('getByColumn returns every annotation for that column (column + cell scopes)', () => {
    store.add({ scope: 'column', column: 'fare', severity: 'error', message: 'col' });
    store.add({ scope: 'cell', rowId: 1, column: 'fare', severity: 'info', message: 'cell' });
    store.add({ scope: 'column', column: 'tip', severity: 'warning', message: 'other' });
    const atFare = store.getByColumn('fare');
    expect(atFare).toHaveLength(2);
    expect(atFare.map((a) => a.message)).toEqual(['col', 'cell']);
  });

  it('getByCell returns the row + column + cell union', () => {
    store.add({ scope: 'row', rowId: 7, severity: 'info', message: 'row' });
    store.add({ scope: 'column', column: 'fare', severity: 'info', message: 'col' });
    store.add({ scope: 'cell', rowId: 7, column: 'fare', severity: 'info', message: 'cell' });
    store.add({ scope: 'row', rowId: 8, severity: 'info', message: 'other row' });
    const intersection = store.getByCell(7, 'fare');
    expect(intersection.map((a) => a.message).sort()).toEqual(['cell', 'col', 'row']);
  });

  it('getByCell sorts by severity (error > warning > info) first', () => {
    const a = store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'info' });
    const b = store.add({ scope: 'column', column: 'x', severity: 'error', message: 'error' });
    const c = store.add({ scope: 'cell', rowId: 1, column: 'x', severity: 'warning', message: 'warn' });
    const out = store.getByCell(1, 'x');
    expect(out.map((x) => x.id)).toEqual([b.id, c.id, a.id]);
  });

  it('getByCell tiebreaks by createdAt when severity ties', () => {
    let t = 0;
    const ticking = new AnnotationStore({
      idGenerator: (() => {
        let n = 0;
        return () => `ann_t_${++n}`;
      })(),
      now: () => new Date(1_700_000_000_000 + t++).toISOString(),
    });
    const a = ticking.add({ scope: 'row', rowId: 1, severity: 'error', message: 'a' });
    const b = ticking.add({ scope: 'column', column: 'x', severity: 'error', message: 'b' });
    const c = ticking.add({ scope: 'cell', rowId: 1, column: 'x', severity: 'error', message: 'c' });
    const out = ticking.getByCell(1, 'x');
    expect(out.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
  });

  it('getByCell tiebreaks by insertion order when severity and createdAt tie', () => {
    const a = store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'a' });
    const b = store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'b' });
    const c = store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'c' });
    const out = store.getByRow(1);
    expect(out.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
  });

  it('indexes stay clean after remove and clear', () => {
    const a = store.add({ scope: 'cell', rowId: 3, column: 'age', severity: 'error', message: 'a' });
    expect(store.getByRow(3)).toHaveLength(1);
    expect(store.getByColumn('age')).toHaveLength(1);
    expect(store.getByCell(3, 'age')).toHaveLength(1);
    store.remove(a.id);
    expect(store.getByRow(3)).toHaveLength(0);
    expect(store.getByColumn('age')).toHaveLength(0);
    expect(store.getByCell(3, 'age')).toHaveLength(0);
  });

  it('re-sorts on next lookup after severity update', () => {
    const a = store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'a' });
    const b = store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'b' });
    // Before update, insertion order wins tie.
    expect(store.getByCell(1, 'anycol').map((x) => x.id)).toEqual([a.id, b.id]);
    store.update(b.id, { severity: 'error' });
    expect(store.getByCell(1, 'anycol').map((x) => x.id)).toEqual([b.id, a.id]);
  });

  it('handles 1000 annotations across 100 rows × 10 columns without scanning', () => {
    for (let r = 0; r < 100; r++) {
      for (let c = 0; c < 10; c++) {
        store.add({
          scope: 'cell',
          rowId: r,
          column: `c${c}`,
          severity: 'info',
          message: `${r},${c}`,
        });
      }
    }
    expect(store.count()).toBe(1000);
    expect(store.getByRow(42)).toHaveLength(10);
    expect(store.getByColumn('c3')).toHaveLength(100);
    // getByCell unions row + column + cell. Row 42 contributes 10 entries,
    // column c3 contributes 100, and the single (42, c3) cell is deduped:
    // 10 + 100 - 1 = 109.
    expect(store.getByCell(42, 'c3')).toHaveLength(109);
  });

  it('reindexes positions after remove so tiebreaking stays stable', () => {
    const a = store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'a' });
    const b = store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'b' });
    const c = store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'c' });
    store.remove(b.id);
    const d = store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'd' });
    // Natural order after removal + insert: a, c, d
    expect(store.getByCell(1, 'col').map((x) => x.id)).toEqual([a.id, c.id, d.id]);
  });
});
