import { describe, it, expect, beforeEach } from 'vitest';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import { AnnotationError } from '@/core/errors';

function makeStore(): AnnotationStore {
  let seq = 0;
  const fixedNow = () => '2026-04-24T00:00:00.000Z';
  return new AnnotationStore({
    idGenerator: () => `ann_test_${++seq}`,
    now: fixedNow,
  });
}

describe('AnnotationStore — CRUD', () => {
  let store: AnnotationStore;

  beforeEach(() => {
    store = makeStore();
  });

  describe('add', () => {
    it('generates an id when omitted and sets createdAt', () => {
      const ann = store.add({
        scope: 'row',
        rowId: 1,
        severity: 'error',
        message: 'boom',
      });
      expect(ann.id).toBe('ann_test_1');
      expect(ann.createdAt).toBe('2026-04-24T00:00:00.000Z');
      expect(ann.updatedAt).toBeUndefined();
    });

    it('preserves a caller-supplied id', () => {
      const ann = store.add({
        id: 'custom-id',
        scope: 'column',
        column: 'age',
        severity: 'info',
        message: 'ok',
      });
      expect(ann.id).toBe('custom-id');
    });

    it('rejects duplicate ids with ANNOTATION_DUPLICATE_ID', () => {
      store.add({ id: 'x', scope: 'row', rowId: 0, severity: 'info', message: 'a' });
      expect(() =>
        store.add({ id: 'x', scope: 'row', rowId: 1, severity: 'info', message: 'b' }),
      ).toThrow(AnnotationError);
      try {
        store.add({ id: 'x', scope: 'row', rowId: 1, severity: 'info', message: 'b' });
      } catch (err) {
        expect((err as AnnotationError).code).toBe('ANNOTATION_DUPLICATE_ID');
      }
    });

    it('rejects invalid scope, severity, and message', () => {
      expect(() =>
        store.add({
          // @ts-expect-error — runtime guard
          scope: 'nope',
          rowId: 1,
          severity: 'error',
          message: 'x',
        }),
      ).toThrow(AnnotationError);

      expect(() =>
        store.add({
          scope: 'row',
          rowId: 1,
          // @ts-expect-error — runtime guard
          severity: 'critical',
          message: 'x',
        }),
      ).toThrow(AnnotationError);

      expect(() =>
        store.add({
          scope: 'row',
          rowId: 1,
          severity: 'error',
          message: '',
        }),
      ).toThrow(AnnotationError);
    });

    it('rejects row/cell annotations missing rowId and column/cell annotations missing column', () => {
      expect(() =>
        store.add({
          scope: 'row',
          severity: 'error',
          message: 'x',
          // missing rowId
        } as unknown as Parameters<typeof store.add>[0]),
      ).toThrow(AnnotationError);

      expect(() =>
        store.add({
          scope: 'column',
          severity: 'error',
          message: 'x',
          // missing column
        } as unknown as Parameters<typeof store.add>[0]),
      ).toThrow(AnnotationError);

      expect(() =>
        store.add({
          scope: 'cell',
          rowId: 1,
          severity: 'error',
          message: 'x',
          // missing column
        } as unknown as Parameters<typeof store.add>[0]),
      ).toThrow(AnnotationError);
    });
  });

  describe('addMany', () => {
    it('adds all on success and returns them in order', () => {
      const added = store.addMany([
        { scope: 'row', rowId: 0, severity: 'info', message: 'a' },
        { scope: 'row', rowId: 1, severity: 'warning', message: 'b' },
        { scope: 'row', rowId: 2, severity: 'error', message: 'c' },
      ]);
      expect(added).toHaveLength(3);
      expect(store.count()).toBe(3);
    });

    it('aborts the batch on first failure and rolls back partial inserts', () => {
      store.add({ id: 'existing', scope: 'row', rowId: 99, severity: 'info', message: 'seed' });
      expect(() =>
        store.addMany([
          { scope: 'row', rowId: 0, severity: 'info', message: 'a' },
          { id: 'existing', scope: 'row', rowId: 1, severity: 'info', message: 'dup' },
          { scope: 'row', rowId: 2, severity: 'info', message: 'c' },
        ]),
      ).toThrow(AnnotationError);
      expect(store.count()).toBe(1);
      expect(store.getByRow(0)).toHaveLength(0);
      expect(store.getByRow(2)).toHaveLength(0);
    });
  });

  describe('get / getAll / count', () => {
    it('returns null for unknown ids', () => {
      expect(store.get('nope')).toBeNull();
    });

    it('returns insertion order', () => {
      const a = store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });
      const b = store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'b' });
      const c = store.add({ scope: 'row', rowId: 2, severity: 'info', message: 'c' });
      expect(store.getAll().map((x) => x.id)).toEqual([a.id, b.id, c.id]);
      expect(store.count()).toBe(3);
    });
  });

  describe('update', () => {
    it('applies a patch and sets updatedAt', () => {
      const a = store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });
      const updated = store.update(a.id, { severity: 'error', message: 'boom' });
      expect(updated.severity).toBe('error');
      expect(updated.message).toBe('boom');
      expect(updated.updatedAt).toBe('2026-04-24T00:00:00.000Z');
    });

    it('rejects scope / rowId / column / id changes with the right code', () => {
      const a = store.add({ scope: 'cell', rowId: 1, column: 'age', severity: 'info', message: 'x' });

      expect(() => store.update(a.id, { scope: 'row' } as unknown as { severity: 'info' })).toThrow(AnnotationError);
      try { store.update(a.id, { scope: 'row' } as unknown as { severity: 'info' }); }
      catch (e) { expect((e as AnnotationError).code).toBe('ANNOTATION_SCOPE_IMMUTABLE'); }

      try { store.update(a.id, { rowId: 2 } as unknown as { severity: 'info' }); }
      catch (e) { expect((e as AnnotationError).code).toBe('ANNOTATION_ROWID_IMMUTABLE'); }

      try { store.update(a.id, { column: 'other' } as unknown as { severity: 'info' }); }
      catch (e) { expect((e as AnnotationError).code).toBe('ANNOTATION_COLUMN_IMMUTABLE'); }

      try { store.update(a.id, { id: 'different' } as unknown as { severity: 'info' }); }
      catch (e) { expect((e as AnnotationError).code).toBe('ANNOTATION_FAILED'); }
    });

    it('throws NOT_FOUND on unknown id', () => {
      try { store.update('nope', { severity: 'info' }); }
      catch (e) { expect((e as AnnotationError).code).toBe('ANNOTATION_NOT_FOUND'); }
    });

    it('rejects invalid severity / empty message patches', () => {
      const a = store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'x' });
      expect(() => store.update(a.id, { severity: 'nope' as never })).toThrow(AnnotationError);
      expect(() => store.update(a.id, { message: '' })).toThrow(AnnotationError);
    });
  });

  describe('remove / removeMany', () => {
    it('returns true for known ids, false for unknown', () => {
      const a = store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });
      expect(store.remove(a.id)).toBe(true);
      expect(store.remove('nope')).toBe(false);
      expect(store.count()).toBe(0);
    });

    it('cleans indexes after remove', () => {
      const a = store.add({ scope: 'cell', rowId: 7, column: 'age', severity: 'error', message: 'x' });
      expect(store.getByCell(7, 'age')).toHaveLength(1);
      store.remove(a.id);
      expect(store.getByRow(7)).toHaveLength(0);
      expect(store.getByColumn('age')).toHaveLength(0);
      expect(store.getByCell(7, 'age')).toHaveLength(0);
    });

    it('removeMany returns the count of actually-removed ids', () => {
      const a = store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });
      const b = store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'b' });
      expect(store.removeMany([a.id, 'nope', b.id])).toBe(2);
      expect(store.count()).toBe(0);
    });
  });

  describe('clear', () => {
    it('clears all by default', () => {
      store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });
      store.add({ scope: 'column', column: 'x', severity: 'info', message: 'b' });
      store.add({ scope: 'cell', rowId: 1, column: 'y', severity: 'info', message: 'c' });
      expect(store.clear()).toBe(3);
      expect(store.count()).toBe(0);
    });

    it('clears by scope', () => {
      store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });
      store.add({ scope: 'row', rowId: 1, severity: 'info', message: 'b' });
      store.add({ scope: 'column', column: 'x', severity: 'info', message: 'c' });
      store.add({ scope: 'cell', rowId: 2, column: 'y', severity: 'info', message: 'd' });
      expect(store.clear('row')).toBe(2);
      expect(store.count()).toBe(2);
      expect(store.clear('column')).toBe(1);
      expect(store.count()).toBe(1);
      expect(store.clear('cell')).toBe(1);
      expect(store.count()).toBe(0);
    });

    it('returns 0 on an empty store', () => {
      expect(store.clear()).toBe(0);
    });
  });
});
