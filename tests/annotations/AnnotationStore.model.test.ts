/**
 * Seeded random operations against a brute-force model of the documented
 * behavior of `AnnotationStore`.
 *
 * The model keeps one array in insertion order and answers every question by
 * scanning it. After each operation the test compares, in one deep-equality
 * check, everything the store answers: `count`, `getAll`, `get`, every
 * `getBy*` lookup, the per-scope summaries, lists and masks, `annotatedRows`,
 * `toJSON`, both revisions, the operation's return value or error, the
 * events it fired and their payloads, and how often it read the clock.
 *
 * Rows include negative, fractional and `-0` rowIds (any finite rowId is
 * accepted; `-0` and `0` are one key, as in a `Map`), and columns and rows
 * collide often, so buckets of two or more entries are common.
 */

import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';
import { AnnotationStore } from '@/annotations/AnnotationStore';
import { createScopeSummary, SEVERITY_BIT } from '@/annotations/severity';
import type {
  Annotation,
  AnnotationChangePayload,
  AnnotationFile,
  AnnotationScope,
  AnnotationSeverity,
  SeverityFilter,
} from '@/annotations/types';

const ROW_POOL = [0, 1, 2, 3, 4, 5, 6, 7, -1, 2.5, -0, 1e9];
/** `-0` looks up as `0`, so it is not listed separately. */
const LOOKUP_ROWS = [0, 1, 2, 3, 4, 5, 6, 7, -1, 2.5, 1e9, 42];
const COLUMNS = ['a', 'b', 'c', 'd', 'e'];
const LOOKUP_COLUMNS = [...COLUMNS, 'zz'];
const SEVERITIES: AnnotationSeverity[] = ['error', 'warning', 'info'];
const MESSAGES = ['m1', 'm2', 'm3', '<b>m4</b>'];
const CREATED = [
  '2026-01-02T00:00:00.000Z',
  '2026-01-01T00:00:00.000Z',
  '2026-01-03T00:00:00.000Z',
];
const TABLE = 'model_table';

const RESERVED = new Set([
  'id',
  'scope',
  'severity',
  'message',
  'code',
  'source',
  'metadata',
  'createdAt',
  'updatedAt',
  'rowId',
  'column',
]);
const FILE_RESERVED = new Set(['version', 'tableName', 'createdAt', 'updatedAt', 'annotations']);
const RANK: Record<AnnotationSeverity, number> = { error: 0, warning: 1, info: 2 };

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  private readonly next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]!;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
}

type Raw = Record<string, unknown>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function extrasOf(raw: Raw, reserved: Set<string>): Record<string, unknown> | undefined {
  let extras: Record<string, unknown> | undefined;
  for (const key of Object.keys(raw)) {
    if (reserved.has(key)) continue;
    extras ??= {};
    extras[key] = raw[key];
  }
  return extras;
}

interface ModelEntry {
  ann: Annotation;
  extras: Record<string, unknown> | undefined;
}

type ExpectedError = { code: string; details: Record<string, unknown> | undefined };

/** The documented normalization of a valid raw annotation. */
function normalize(raw: Raw, id: string, defaultCreatedAt: string | undefined): ModelEntry {
  const createdAt = typeof raw['createdAt'] === 'string' ? raw['createdAt'] : defaultCreatedAt;
  const ann: Record<string, unknown> = {
    id,
    severity: raw['severity'],
    message: raw['message'],
  };
  if (typeof raw['code'] === 'string') ann['code'] = raw['code'];
  if (typeof raw['source'] === 'string') ann['source'] = raw['source'];
  if (isPlainObject(raw['metadata'])) ann['metadata'] = structuredClone(raw['metadata']);
  if (createdAt !== undefined) ann['createdAt'] = createdAt;
  if (typeof raw['updatedAt'] === 'string') ann['updatedAt'] = raw['updatedAt'];
  ann['scope'] = raw['scope'];
  if (raw['scope'] !== 'column') ann['rowId'] = raw['rowId'];
  if (raw['scope'] !== 'row') ann['column'] = raw['column'];
  return { ann: ann as unknown as Annotation, extras: extrasOf(raw, RESERVED) };
}

/** The documented validation order; `null` when the entry is valid. */
function firstDefect(raw: unknown, index: number, requireId: boolean): ExpectedError | null {
  const shape = (field?: string): ExpectedError => ({
    code: 'ANNOTATION_INVALID_SHAPE',
    details: field === undefined ? { index } : { index, field },
  });
  if (!isPlainObject(raw)) return shape();
  const scope = raw['scope'];
  if (scope !== 'row' && scope !== 'column' && scope !== 'cell') return shape('scope');
  if (!SEVERITIES.includes(raw['severity'] as AnnotationSeverity)) return shape('severity');
  if (typeof raw['message'] !== 'string' || raw['message'].length === 0) return shape('message');
  const id = raw['id'];
  if (id === undefined || id === null) {
    if (requireId) return shape('id');
  } else if (typeof id !== 'string' || id.length === 0) {
    return shape('id');
  }
  const rowId = raw['rowId'];
  if (scope !== 'column' && (typeof rowId !== 'number' || !Number.isFinite(rowId))) {
    return shape('rowId');
  }
  const column = raw['column'];
  if (scope !== 'row' && (typeof column !== 'string' || column.length === 0)) {
    return shape('column');
  }
  return null;
}

function compareForCell(a: ModelEntry, b: ModelEntry, order: Map<ModelEntry, number>): number {
  const sev = RANK[a.ann.severity] - RANK[b.ann.severity];
  if (sev !== 0) return sev;
  const at = a.ann.createdAt;
  const bt = b.ann.createdAt;
  if (at !== bt) {
    if (at === undefined) return 1;
    if (bt === undefined) return -1;
    return at < bt ? -1 : 1;
  }
  return order.get(a)! - order.get(b)!;
}

class Model {
  entries: ModelEntry[] = [];
  fileExtras: Record<string, unknown> | undefined;
  fileCreatedAt: string | undefined;
  filter: SeverityFilter = { error: true, warning: true, info: true };
  revision = 0;
  contentRevision = 0;

  has(id: string): boolean {
    return this.entries.some((e) => e.ann.id === id);
  }

  touch(): void {
    this.revision++;
    this.contentRevision++;
  }

  private order(): Map<ModelEntry, number> {
    return new Map(this.entries.map((e, i) => [e, i]));
  }

  private sortedForCell(list: ModelEntry[]): string[] {
    const order = this.order();
    return [...list].sort((a, b) => compareForCell(a, b, order)).map((e) => e.ann.id);
  }

  private onRow(e: ModelEntry, rowId: number): boolean {
    return e.ann.scope !== 'column' && (e.ann as { rowId: number }).rowId === rowId;
  }

  private onColumn(e: ModelEntry, column: string): boolean {
    return e.ann.scope !== 'row' && (e.ann as { column: string }).column === column;
  }

  rowScope(rowId: number): ModelEntry[] {
    return this.entries.filter((e) => e.ann.scope === 'row' && this.onRow(e, rowId));
  }

  columnScope(column: string): ModelEntry[] {
    return this.entries.filter((e) => e.ann.scope === 'column' && this.onColumn(e, column));
  }

  cellScope(rowId: number, column: string): ModelEntry[] {
    return this.entries.filter(
      (e) => e.ann.scope === 'cell' && this.onRow(e, rowId) && this.onColumn(e, column),
    );
  }

  maskOf(list: ModelEntry[]): number {
    let mask = 0;
    for (const e of list) mask |= SEVERITY_BIT[e.ann.severity];
    return mask;
  }

  summaryOf(list: ModelEntry[]): { count: number; severity: AnnotationSeverity | null } {
    const shown = list.filter((e) => this.filter[e.ann.severity]);
    shown.sort((a, b) => RANK[a.ann.severity] - RANK[b.ann.severity]);
    return { count: list.length, severity: shown[0]?.ann.severity ?? null };
  }

  /** Everything the store should answer, in one comparable value. */
  expected(clock: string, withRows: boolean): unknown {
    const annotated = new Map<number, number>();
    for (const e of this.entries) {
      if (e.ann.scope === 'column') continue;
      const rowId = (e.ann as { rowId: number }).rowId;
      annotated.set(rowId, (annotated.get(rowId) ?? 0) | SEVERITY_BIT[e.ann.severity]);
    }
    const annotatedIds = [...annotated.keys()].sort((a, b) => a - b);
    return {
      count: this.entries.length,
      all: this.entries.map((e) => e.ann),
      revision: this.revision,
      contentRevision: this.contentRevision,
      rows: LOOKUP_ROWS.map((r) => ({
        byRow: withRows
          ? this.entries.filter((e) => this.onRow(e, r)).map((e) => e.ann.id)
          : 'skipped',
        list: this.sortedForCell(this.rowScope(r)),
        summary: this.summaryOf(this.rowScope(r)),
        mask: this.maskOf(this.rowScope(r)),
        annotated: annotated.get(r) ?? 0,
      })),
      columns: LOOKUP_COLUMNS.map((c) => ({
        byColumn: this.entries.filter((e) => this.onColumn(e, c)).map((e) => e.ann.id),
        list: this.sortedForCell(this.columnScope(c)),
        summary: this.summaryOf(this.columnScope(c)),
        mask: this.maskOf(this.columnScope(c)),
      })),
      cells: LOOKUP_ROWS.flatMap((r) =>
        LOOKUP_COLUMNS.map((c) => ({
          byCell: this.sortedForCell([
            ...this.rowScope(r),
            ...this.columnScope(c),
            ...this.cellScope(r, c),
          ]),
          list: this.sortedForCell(this.cellScope(r, c)),
          summary: this.summaryOf(this.cellScope(r, c)),
          mask: this.maskOf(this.cellScope(r, c)),
        })),
      ),
      annotatedRows: {
        rowIds: annotatedIds,
        masks: annotatedIds.map((r) => annotated.get(r)!),
      },
      json: {
        ...(this.fileExtras ?? {}),
        version: 1,
        tableName: TABLE,
        createdAt: this.fileCreatedAt ?? clock,
        updatedAt: clock,
        annotations: this.entries.map((e) => (e.extras ? { ...e.extras, ...e.ann } : e.ann)),
      },
    };
  }
}

function observed(store: AnnotationStore, withRows: boolean): unknown {
  const summary = createScopeSummary();
  const sum = (s: typeof summary) => ({ count: s.count, severity: s.severity });
  const all = store.getAll();
  const rows = store.annotatedRows();
  return {
    count: store.count(),
    all,
    revision: store.revision,
    contentRevision: store.contentRevision,
    rows: LOOKUP_ROWS.map((r) => ({
      byRow: withRows ? store.getByRow(r).map((a) => a.id) : 'skipped',
      list: store.listRowScope(r).map((a) => a.id),
      summary: sum(store.summarizeRowScope(r, summary)),
      mask: store.rowScopeMask(r),
      annotated: store.annotatedRowMask(r),
    })),
    columns: LOOKUP_COLUMNS.map((c) => ({
      byColumn: store.getByColumn(c).map((a) => a.id),
      list: store.listColumnScope(c).map((a) => a.id),
      summary: sum(store.summarizeColumnScope(c, summary)),
      mask: store.columnScopeMask(c),
    })),
    cells: LOOKUP_ROWS.flatMap((r) =>
      LOOKUP_COLUMNS.map((c) => ({
        byCell: store.getByCell(r, c).map((a) => a.id),
        list: store.listCellScope(r, c).map((a) => a.id),
        summary: sum(store.summarizeCellScope(r, c, summary)),
        mask: store.cellScopeMask(r, c),
      })),
    ),
    annotatedRows: { rowIds: Array.from(rows.rowIds), masks: Array.from(rows.masks) },
    json: store.toJSON(),
  };
}

function assertSame(actual: unknown, expected: unknown, context: string): void {
  if (!isDeepStrictEqual(actual, expected)) {
    // Only on a mismatch: let vitest render the diff.
    expect(actual, context).toStrictEqual(expected);
  }
}

function captureError(fn: () => unknown): { value: unknown; error: ExpectedError | null } {
  try {
    return { value: fn(), error: null };
  } catch (err) {
    const e = err as { code?: string; details?: Record<string, unknown> };
    return { value: undefined, error: { code: e.code ?? String(err), details: e.details } };
  }
}

function randomRaw(rng: Rng, idMode: 'add' | 'file'): Raw {
  const scope = rng.pick<AnnotationScope>(['row', 'row', 'column', 'cell', 'cell', 'cell']);
  const raw: Raw = {};
  if (idMode === 'file' || rng.chance(0.5)) raw['id'] = `x${rng.int(120)}`;
  else if (rng.chance(0.2)) raw['id'] = null;
  raw['scope'] = scope;
  raw['severity'] = rng.pick(SEVERITIES);
  raw['message'] = rng.pick(MESSAGES);
  if (scope !== 'column') raw['rowId'] = rng.pick(ROW_POOL);
  if (scope !== 'row') raw['column'] = rng.pick(COLUMNS);
  // A field of another scope is ignored, not kept as an extra.
  if (scope === 'column' && rng.chance(0.05)) raw['rowId'] = 3;
  if (scope === 'row' && rng.chance(0.05)) raw['column'] = 'b';
  if (rng.chance(0.35)) raw['createdAt'] = rng.pick(CREATED);
  else if (rng.chance(0.05)) raw['createdAt'] = 7; // not a string: ignored
  if (rng.chance(0.1)) raw['code'] = rng.chance(0.8) ? 'RULE_1' : 5;
  if (rng.chance(0.08)) raw['source'] = 'validator';
  if (rng.chance(0.1)) raw['metadata'] = rng.chance(0.8) ? { n: rng.int(9), deep: [1] } : [1];
  if (rng.chance(0.06)) raw['updatedAt'] = '2026-02-01T00:00:00.000Z';
  if (rng.chance(0.08)) raw['note'] = `extra ${rng.int(3)}`;
  return raw;
}

/** Gives a valid raw annotation exactly one defect. */
function corrupt(rng: Rng, raw: Raw): unknown {
  const options = ['object', 'scope', 'severity', 'message', 'id'];
  if (raw['scope'] !== 'column') options.push('rowId');
  if (raw['scope'] !== 'row') options.push('column');
  switch (rng.pick(options)) {
    case 'object':
      return rng.pick([42, null, [raw], 'text']);
    case 'scope':
      return { ...raw, scope: 'table' };
    case 'severity':
      return { ...raw, severity: 'fatal' };
    case 'message':
      return { ...raw, message: rng.chance(0.5) ? '' : 3 };
    case 'id':
      return { ...raw, id: rng.chance(0.5) ? '' : 12 };
    case 'rowId':
      return { ...raw, rowId: rng.pick([Number.NaN, Infinity, '3', undefined]) };
    default:
      return { ...raw, column: rng.chance(0.5) ? '' : 4 };
  }
}

function payload(
  kind: AnnotationChangePayload['kind'],
  anns: Annotation[],
  previous?: Annotation[],
) {
  return {
    kind,
    ids: anns.map((a) => a.id),
    annotations: anns,
    ...(previous ? { previous } : {}),
  };
}

function runSeed(seed: number, steps: number): void {
  const rng = new Rng(seed);
  let clock = 'C0';
  let nowCalls = 0;
  let generated = 0;
  const store = new AnnotationStore({
    tableName: TABLE,
    idGenerator: () => `g${++generated}`,
    now: () => {
      nowCalls++;
      return clock;
    },
  });
  const model = new Model();
  const events: AnnotationChangePayload[] = [];
  let unsubscribe: (() => void) | null = store.on('change', (e) => events.push(e));

  for (let step = 0; step < steps; step++) {
    clock = `C${Math.floor(step / 3)}`;
    events.length = 0;
    nowCalls = 0;
    const listening = unsubscribe !== null;
    const expectedEvents: unknown[] = [];
    const context = `seed ${seed}, step ${step}`;
    const size = model.entries.length;
    const roll = rng.int(100);

    if (roll < 22) {
      // add
      let raw: unknown = randomRaw(rng, 'add');
      if (rng.chance(0.1)) raw = corrupt(rng, raw as Raw);
      const result = captureError(() => store.add(raw as never));
      let expectedError: ExpectedError | null;
      if (!isPlainObject(raw)) {
        expectedError = { code: 'ANNOTATION_INVALID_SHAPE', details: undefined };
      } else {
        expectedError = firstDefect(raw, -1, false);
        const id = raw['id'];
        if (!expectedError && typeof id === 'string' && model.has(id)) {
          expectedError = { code: 'ANNOTATION_DUPLICATE_ID', details: { id } };
        }
      }
      assertSame(result.error, expectedError, `${context}: add error`);
      if (!expectedError) {
        const added = result.value as Annotation;
        const needsClock = typeof (raw as Raw)['createdAt'] !== 'string';
        const entry = normalize(raw as Raw, added.id, needsClock ? clock : undefined);
        assertSame(added, entry.ann, `${context}: add result`);
        expect(nowCalls, context).toBe(needsClock ? 1 : 0);
        model.entries.push(entry);
        model.touch();
        expectedEvents.push(payload('added', [entry.ann]));
      }
    } else if (roll < 36) {
      // addMany
      const n = 1 + rng.int(8);
      const batch: unknown[] = Array.from({ length: n }, () => randomRaw(rng, 'add'));
      const fault = rng.int(10);
      if (fault === 0) batch[rng.int(n)] = corrupt(rng, batch[rng.int(n)] as Raw);
      if (fault === 1 && n > 1) {
        // A duplicate inside the batch.
        const i = 1 + rng.int(n - 1);
        (batch[i] as Raw)['id'] = `dup${seed}`;
        (batch[rng.int(i)] as Raw)['id'] = `dup${seed}`;
      }
      let expectedError: ExpectedError | null = null;
      for (let i = 0; i < n && !expectedError; i++) {
        expectedError = firstDefect(batch[i], i, false);
      }
      if (!expectedError) {
        const seen = new Set<string>();
        for (let i = 0; i < n && !expectedError; i++) {
          const id = (batch[i] as Raw)['id'];
          if (typeof id !== 'string') continue;
          if (seen.has(id) || model.has(id)) {
            expectedError = { code: 'ANNOTATION_DUPLICATE_ID', details: { id, index: i } };
          }
          seen.add(id);
        }
      }
      const result = captureError(() => store.addMany(batch as never));
      assertSame(result.error, expectedError, `${context}: addMany error`);
      expect(nowCalls, context).toBeLessThanOrEqual(1);
      if (!expectedError) {
        const added = result.value as Annotation[];
        const needsClock = batch.some((raw) => typeof (raw as Raw)['createdAt'] !== 'string');
        const entries = batch.map((raw, i) =>
          normalize(raw as Raw, added[i]!.id, needsClock ? clock : undefined),
        );
        assertSame(
          added,
          entries.map((e) => e.ann),
          `${context}: addMany result`,
        );
        expect(nowCalls, context).toBe(needsClock ? 1 : 0);
        model.entries.push(...entries);
        model.touch();
        expectedEvents.push(
          payload(
            'added',
            entries.map((e) => e.ann),
          ),
        );
      }
    } else if (roll < 51) {
      // update
      const target = size > 0 && rng.chance(0.93) ? rng.pick(model.entries) : null;
      const id = target ? target.ann.id : 'missing';
      const ann = target?.ann as (Annotation & { rowId?: number; column?: string }) | undefined;
      const variants: [Record<string, unknown>, ExpectedError | null][] = [
        [{ severity: rng.pick(SEVERITIES) }, null],
        [{ message: rng.pick(MESSAGES) }, null],
        [{ severity: undefined }, null],
        [{ message: undefined, severity: undefined }, null],
        [{ code: rng.chance(0.5) ? 'RULE_2' : undefined }, null],
        [{ metadata: { k: rng.int(5) } }, null],
        [{ createdAt: rng.chance(0.7) ? rng.pick(CREATED) : undefined }, null],
        [{ scope: ann?.scope, rowId: ann?.rowId }, null],
        [
          { severity: 'fatal' },
          { code: 'ANNOTATION_INVALID_SHAPE', details: { id, field: 'severity' } },
        ],
        [{ message: '' }, { code: 'ANNOTATION_INVALID_SHAPE', details: { id, field: 'message' } }],
        [{ id: 'other' }, { code: 'ANNOTATION_ID_IMMUTABLE', details: { id } }],
        [
          { scope: ann?.scope === 'row' ? 'cell' : 'row' },
          { code: 'ANNOTATION_SCOPE_IMMUTABLE', details: { id } },
        ],
        [{ rowId: 99 }, { code: 'ANNOTATION_ROWID_IMMUTABLE', details: { id } }],
        [{ column: 'zz' }, { code: 'ANNOTATION_COLUMN_IMMUTABLE', details: { id } }],
      ];
      const [patch, patchError] = rng.pick(variants);
      if (patch['scope'] !== undefined && patch['rowId'] === undefined && 'rowId' in patch) {
        delete patch['rowId']; // a column annotation has no rowId to restate
      }
      const expectedError: ExpectedError | null = target
        ? patchError
        : { code: 'ANNOTATION_NOT_FOUND', details: { id } };
      const result = captureError(() => store.update(id, patch as never));
      assertSame(result.error, expectedError, `${context}: update error`);
      if (!expectedError && target) {
        const effective: Record<string, unknown> = { ...patch };
        if ('severity' in effective && effective['severity'] === undefined) {
          delete effective['severity'];
        }
        if ('message' in effective && effective['message'] === undefined) {
          delete effective['message'];
        }
        if (isPlainObject(effective['metadata'])) {
          effective['metadata'] = structuredClone(effective['metadata']);
        }
        const previous = target.ann;
        const merged = {
          ...previous,
          ...effective,
          id: previous.id,
          scope: previous.scope,
          updatedAt: clock,
        } as Annotation;
        assertSame(result.value, merged, `${context}: update result`);
        expect(nowCalls, context).toBe(1);
        target.ann = merged;
        model.touch();
        expectedEvents.push(payload('updated', [merged], [previous]));
      } else {
        expect(nowCalls, context).toBe(0);
      }
    } else if (roll < 61) {
      // remove
      const target = size > 0 && rng.chance(0.9) ? rng.pick(model.entries) : null;
      const id = target ? target.ann.id : `x${rng.int(120)}`;
      const existing = model.entries.find((e) => e.ann.id === id);
      const result = store.remove(id);
      expect(result, context).toBe(existing !== undefined);
      if (existing) {
        model.entries.splice(model.entries.indexOf(existing), 1);
        model.touch();
        expectedEvents.push(payload('removed', [existing.ann]));
      }
    } else if (roll < 66) {
      // removeMany
      const ids = Array.from({ length: rng.int(6) }, () =>
        size > 0 && rng.chance(0.8) ? rng.pick(model.entries).ann.id : `x${rng.int(120)}`,
      );
      const removed: ModelEntry[] = [];
      for (const id of ids) {
        const existing = model.entries.find((e) => e.ann.id === id);
        if (!existing) continue;
        model.entries.splice(model.entries.indexOf(existing), 1);
        removed.push(existing);
      }
      expect(store.removeMany(ids), context).toBe(removed.length);
      if (removed.length > 0) {
        model.touch();
        expectedEvents.push(
          payload(
            'removed',
            removed.map((e) => e.ann),
          ),
        );
      }
    } else if (roll < 70) {
      // clear
      const scope = rng.pick<AnnotationScope | 'all'>(['row', 'column', 'cell', 'cell', 'all']);
      const removed = model.entries.filter((e) => scope === 'all' || e.ann.scope === scope);
      const hadFileFields = model.fileExtras !== undefined || model.fileCreatedAt !== undefined;
      expect(store.clear(scope), context).toBe(removed.length);
      model.entries = model.entries.filter((e) => !removed.includes(e));
      if (scope === 'all') {
        model.fileExtras = undefined;
        model.fileCreatedAt = undefined;
      }
      if (removed.length > 0 || (scope === 'all' && hadFileFields)) model.touch();
      if (removed.length > 0) {
        expectedEvents.push(
          payload(
            'cleared',
            removed.map((e) => e.ann),
          ),
        );
      }
    } else if (roll < 78) {
      // loadJSON
      const n = rng.int(10);
      const anns: unknown[] = Array.from({ length: n }, () => randomRaw(rng, 'file'));
      const fault = rng.int(8);
      if (fault === 0 && n > 0) {
        const i = rng.int(n);
        anns[i] = rng.chance(0.5)
          ? corrupt(rng, anns[i] as Raw)
          : { ...(anns[i] as Raw), id: undefined };
      }
      if (fault === 1 && n > 1) (anns[n - 1] as Raw)['id'] = (anns[0] as Raw)['id'];
      const file: Raw = { version: 1, annotations: anns };
      if (rng.chance(0.3)) file['tableName'] = TABLE;
      if (rng.chance(0.3)) file['createdAt'] = rng.pick(CREATED);
      if (rng.chance(0.3)) file['exportedBy'] = `tester ${rng.int(3)}`;
      const mode = rng.pick(['replace', 'merge'] as const);
      const duplicates = rng.pick(['throw', 'skip', undefined] as const);
      const options =
        duplicates === undefined && rng.chance(0.5)
          ? mode
          : { mode, ...(duplicates ? { duplicates } : {}) };

      let expectedError: ExpectedError | null = null;
      for (let i = 0; i < n && !expectedError; i++) expectedError = firstDefect(anns[i], i, true);
      const staged: ModelEntry[] = [];
      let skipped = 0;
      if (!expectedError) {
        const seen = new Set<string>();
        for (let i = 0; i < n && !expectedError; i++) {
          const raw = anns[i] as Raw;
          const id = raw['id'] as string;
          if (seen.has(id)) {
            if (duplicates === 'skip') {
              skipped++;
              continue;
            }
            expectedError = { code: 'ANNOTATION_DUPLICATE_ID', details: { id, index: i } };
          } else if (mode === 'merge' && model.has(id)) {
            expectedError = { code: 'ANNOTATION_DUPLICATE_ID', details: { id, index: i } };
          } else {
            seen.add(id);
            staged.push(normalize(raw, id, undefined));
          }
        }
      }
      const result = captureError(() =>
        store.loadJSON(file as unknown as AnnotationFile, options as never),
      );
      assertSame(result.error, expectedError, `${context}: loadJSON error`);
      if (!expectedError) {
        assertSame(result.value, { added: staged.length, skipped }, `${context}: loadJSON result`);
        const incoming = extrasOf(file, FILE_RESERVED);
        if (mode === 'replace') {
          const prior = model.entries;
          model.entries = staged;
          model.fileExtras = incoming;
          model.fileCreatedAt =
            typeof file['createdAt'] === 'string' ? (file['createdAt'] as string) : undefined;
          model.touch();
          if (prior.length > 0) {
            expectedEvents.push(
              payload(
                'cleared',
                prior.map((e) => e.ann),
              ),
            );
          }
        } else {
          model.entries.push(...staged);
          if (incoming) model.fileExtras = { ...(model.fileExtras ?? {}), ...incoming };
          if (staged.length > 0 || incoming) model.touch();
        }
        if (staged.length > 0) {
          expectedEvents.push(
            payload(
              'added',
              staged.map((e) => e.ann),
            ),
          );
        }
      }
    } else if (roll < 88) {
      // setSeverityFilter
      const patch: Partial<SeverityFilter> = {};
      for (const sev of SEVERITIES) {
        if (rng.chance(0.5)) patch[sev] = rng.chance(0.5);
      }
      let changed = false;
      for (const sev of SEVERITIES) {
        const next = patch[sev];
        if (typeof next === 'boolean' && model.filter[sev] !== next) {
          model.filter[sev] = next;
          changed = true;
        }
      }
      store.setSeverityFilter(patch);
      if (changed) {
        model.revision++;
        expectedEvents.push({ kind: 'filterChanged', ids: [] });
      }
      assertSame(store.getSeverityFilter(), model.filter, `${context}: filter`);
    } else if (roll < 91) {
      // Subscribe or unsubscribe: payloads are built only for listeners.
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      } else {
        unsubscribe = store.on('change', (e) => events.push(e));
      }
    } else {
      // Reads only: get() returns the stored objects themselves.
      for (const e of model.entries.slice(0, 5)) {
        const got = store.get(e.ann.id);
        assertSame(got, e.ann, `${context}: get`);
        expect(store.getAll()).toContain(got);
      }
      expect(store.get('nope')).toBeNull();
    }

    assertSame(events, listening ? expectedEvents : [], `${context}: events`);
    // `getByRow` builds its by-row index on first use: check it on some steps
    // only, so ops run both with and without that index.
    const withRows = rng.chance(0.5);
    assertSame(observed(store, withRows), model.expected(clock, withRows), `${context}: state`);
  }
}

describe('AnnotationStore — seeded model', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    it(`matches the brute-force model (seed ${seed})`, () => {
      runSeed(seed, 500);
    });
  }
});
