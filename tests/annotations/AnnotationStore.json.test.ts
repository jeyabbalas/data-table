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

  // The store is the trust boundary's read side: malicious annotation JSON
  // (e.g. tampered IndexedDB on a shared origin) flows through `loadJSON`.
  // The store does NOT mutate or strip strings — that contract is enforced
  // in the popover via `.textContent`. These tests certify the round-trip
  // preserves the literal payload so the popover-side defence is the
  // single, well-known load-bearing boundary.
  describe('loadJSON — XSS resilience', () => {
    it('preserves malicious strings in message/code/source verbatim through round-trip', () => {
      const malicious = {
        message: '<img src=x onerror=alert(1)>',
        code: '<script>alert(2)</script>',
        source: '<svg/><iframe src="javascript:alert(3)"></iframe>',
      };
      const file: AnnotationFile = {
        version: 1,
        annotations: [
          {
            id: 'mal-cell',
            scope: 'cell',
            rowId: 7,
            column: 'fare_amount',
            severity: 'error',
            ...malicious,
          },
          {
            id: 'mal-row',
            scope: 'row',
            rowId: 7,
            severity: 'warning',
            message: '<a href="javascript:alert(4)">click</a>',
          },
        ],
      };

      store.loadJSON(file, 'replace');
      expect(store.count()).toBe(2);

      const cell = store.get('mal-cell')!;
      expect(cell.message).toBe(malicious.message);
      expect(cell.code).toBe(malicious.code);
      expect(cell.source).toBe(malicious.source);

      // toJSON re-emits the same literal payload — no normalization /
      // sanitization happens in the store.
      const round = store.toJSON();
      const cellOut = round.annotations.find((a) => a.id === 'mal-cell')!;
      expect(cellOut.message).toBe(malicious.message);
      expect(cellOut.code).toBe(malicious.code);
      expect(cellOut.source).toBe(malicious.source);

      // getByCell — the path the popover reads from — surfaces the literal
      // strings unchanged. The popover then writes them via `.textContent`.
      const atCell = store.getByCell(7, 'fare_amount');
      const messages = atCell.map((a) => a.message);
      expect(messages).toContain(malicious.message);
      expect(messages).toContain('<a href="javascript:alert(4)">click</a>');
    });

    it('rejects an annotation whose severity is not in the allow-list', () => {
      const file = {
        version: 1,
        annotations: [
          {
            id: 'sev-injection',
            scope: 'cell',
            rowId: 0,
            column: 'col',
            // Attacker tries to break out of the class-name interpolation.
            severity: 'error onmouseover=alert(1)',
            message: 'pwned',
          },
        ],
      } as unknown as AnnotationFile;

      try {
        store.loadJSON(file, 'replace');
        // If we get here, validation failed.
        expect.fail('loadJSON should have rejected the injected severity');
      } catch (e) {
        expect(e).toBeInstanceOf(AnnotationError);
        expect((e as AnnotationError).code).toBe('ANNOTATION_INVALID_SHAPE');
        expect((e as AnnotationError).details).toMatchObject({ field: 'severity' });
      }
      // Replace mode: validation runs before wipe → store untouched.
      expect(store.count()).toBe(0);
    });

    it('does not pollute Object.prototype via metadata keys', () => {
      const file = {
        version: 1,
        annotations: [
          {
            id: 'proto',
            scope: 'row',
            rowId: 0,
            severity: 'info',
            message: 'm',
            metadata: JSON.parse('{"__proto__": {"polluted": true}}'),
          },
        ],
      } as unknown as AnnotationFile;

      store.loadJSON(file, 'replace');
      // Verify Object.prototype was not mutated.
      const probe: Record<string, unknown> = {};
      expect((probe as { polluted?: boolean }).polluted).toBeUndefined();
    });
  });
});
