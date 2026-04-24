import { describe, it, expect, beforeEach } from 'vitest';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import { AnnotationError } from '@/core/errors';
import type { AnnotationFile } from '@/annotations/types';

function makeStore(tableName?: string): AnnotationStore {
  let seq = 0;
  return new AnnotationStore({
    tableName: tableName ?? null,
    idGenerator: () => `ann_test_${++seq}`,
    now: () => '2026-04-24T00:00:00.000Z',
  });
}

describe('AnnotationStore — JSON I/O', () => {
  let store: AnnotationStore;

  beforeEach(() => {
    store = makeStore('my_table');
  });

  describe('toJSON', () => {
    it('emits version 1, the table name, timestamps, and annotations in insertion order', () => {
      const a = store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'a' });
      const b = store.add({ scope: 'column', column: 'age', severity: 'error', message: 'b' });
      const c = store.add({ scope: 'cell', rowId: 2, column: 'age', severity: 'warning', message: 'c' });
      const file = store.toJSON();
      expect(file.version).toBe(1);
      expect(file.tableName).toBe('my_table');
      expect(file.createdAt).toBeTypeOf('string');
      expect(file.updatedAt).toBeTypeOf('string');
      expect(file.annotations.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
    });

    it('omits tableName when the source is null', () => {
      const nameless = makeStore();
      nameless.add({ scope: 'row', rowId: 0, severity: 'info', message: 'x' });
      const file = nameless.toJSON();
      expect(file.tableName).toBeUndefined();
    });
  });

  describe('loadJSON — replace', () => {
    it('round-trips ids and insertion order', () => {
      store.addMany([
        { id: 'keep-1', scope: 'row', rowId: 0, severity: 'info', message: 'a' },
        { id: 'keep-2', scope: 'row', rowId: 1, severity: 'info', message: 'b' },
      ]);
      const file = store.toJSON();
      const restored = makeStore('my_table');
      restored.loadJSON(file, 'replace');
      expect(restored.getAll().map((x) => x.id)).toEqual(['keep-1', 'keep-2']);
    });

    it('wipes prior contents on replace', () => {
      store.add({ scope: 'row', rowId: 0, severity: 'info', message: 'seed' });
      const file: AnnotationFile = {
        version: 1,
        annotations: [{ id: 'x', scope: 'row', rowId: 99, severity: 'error', message: 'new' }],
      };
      store.loadJSON(file, 'replace');
      expect(store.count()).toBe(1);
      expect(store.get('x')?.message).toBe('new');
    });

    it('preserves unknown top-level fields across round-trip', () => {
      const file: AnnotationFile = {
        version: 1,
        annotations: [],
        exportedBy: 'tester@example.com',
        schemaHint: { provider: 'qc-app' },
      };
      store.loadJSON(file, 'replace');
      const out = store.toJSON();
      expect(out.exportedBy).toBe('tester@example.com');
      expect(out.schemaHint).toEqual({ provider: 'qc-app' });
    });

    it('preserves unknown per-annotation fields across round-trip', () => {
      const file: AnnotationFile = {
        version: 1,
        annotations: [
          {
            id: 'x',
            scope: 'row',
            rowId: 0,
            severity: 'info',
            message: 'a',
            reviewerNotes: 'looks fine',
            _futureVersionFlag: true,
          } as unknown as AnnotationFile['annotations'][number],
        ],
      };
      store.loadJSON(file, 'replace');
      const out = store.toJSON();
      const ann = out.annotations[0] as Record<string, unknown>;
      expect(ann.reviewerNotes).toBe('looks fine');
      expect(ann._futureVersionFlag).toBe(true);
    });

    it('throws VERSION_UNSUPPORTED for a newer file version', () => {
      const file = { version: 2, annotations: [] } as unknown as AnnotationFile;
      try { store.loadJSON(file); }
      catch (e) {
        expect(e).toBeInstanceOf(AnnotationError);
        expect((e as AnnotationError).code).toBe('ANNOTATION_VERSION_UNSUPPORTED');
        expect((e as AnnotationError).details).toMatchObject({ requested: 2, current: 1 });
      }
    });

    it('throws INVALID_SHAPE for bad top-level', () => {
      expect(() => store.loadJSON(null as unknown as AnnotationFile)).toThrow(AnnotationError);
      expect(() => store.loadJSON({} as unknown as AnnotationFile)).toThrow(AnnotationError);
      expect(() =>
        store.loadJSON({ version: 1 } as unknown as AnnotationFile),
      ).toThrow(AnnotationError);
      expect(() =>
        store.loadJSON({ version: 1, annotations: 'not an array' } as unknown as AnnotationFile),
      ).toThrow(AnnotationError);
    });

    it('throws INVALID_SHAPE for malformed annotation entries', () => {
      const file: AnnotationFile = {
        version: 1,
        annotations: [{} as unknown as AnnotationFile['annotations'][number]],
      };
      try { store.loadJSON(file); }
      catch (e) {
        expect((e as AnnotationError).code).toBe('ANNOTATION_INVALID_SHAPE');
        expect((e as AnnotationError).details).toMatchObject({ index: 0 });
      }
    });
  });

  describe('loadJSON — merge', () => {
    it('adds new annotations without clearing existing ones', () => {
      store.add({ id: 'existing', scope: 'row', rowId: 0, severity: 'info', message: 'seed' });
      const file: AnnotationFile = {
        version: 1,
        annotations: [{ id: 'new', scope: 'row', rowId: 1, severity: 'info', message: 'new' }],
      };
      const result = store.loadJSON(file, 'merge');
      expect(result).toEqual({ added: 1, skipped: 0 });
      expect(store.count()).toBe(2);
      expect(store.get('existing')?.message).toBe('seed');
      expect(store.get('new')?.message).toBe('new');
    });

    it('throws DUPLICATE_ID on first conflict and does not partially merge', () => {
      store.add({ id: 'x', scope: 'row', rowId: 0, severity: 'info', message: 'seed' });
      const file: AnnotationFile = {
        version: 1,
        annotations: [
          { id: 'y', scope: 'row', rowId: 1, severity: 'info', message: 'a' },
          { id: 'x', scope: 'row', rowId: 2, severity: 'info', message: 'dup' },
        ],
      };
      try { store.loadJSON(file, 'merge'); }
      catch (e) {
        expect((e as AnnotationError).code).toBe('ANNOTATION_DUPLICATE_ID');
        expect((e as AnnotationError).details).toMatchObject({ id: 'x' });
      }
      expect(store.count()).toBe(1);
      expect(store.get('y')).toBeNull();
    });
  });
});
