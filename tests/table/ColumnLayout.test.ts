/**
 * The column layout: one definition of every visible column's width and
 * position, shared by the header, the body, the pinned styles and keyboard
 * navigation.
 */
import { describe, expect, it, vi } from 'vitest';

import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import { isInspectableColumn } from '@/nested/typeOutline';
import {
  ColumnLayout,
  DEFAULT_COLUMN_WIDTH,
  NESTED_COLUMN_WIDTH,
  defaultColumnWidth,
  getColumnLayout,
  resolveColumnWidth,
} from '@/table/ColumnLayout';

// Counted, to show the layout decides each column's default once per schema
// rather than on every rebuild. It answers as it always does.
vi.mock('@/nested/typeOutline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/nested/typeOutline')>();
  return { ...actual, isInspectableColumn: vi.fn(actual.isInspectableColumn) };
});

type ColumnType = Pick<ColumnSchema, 'type' | 'originalType'>;

const LIST: ColumnType = { type: 'nested', originalType: 'VARCHAR[]' };
const JSON_TEXT: ColumnType = { type: 'string', originalType: 'JSON' };

/** A schema entry as the loaders write it: an INTEGER unless `type` says otherwise. */
function entry(name: string, type: ColumnType = { type: 'integer', originalType: 'INTEGER' }) {
  return { name, nullable: true, ...type } satisfies ColumnSchema;
}

function layout(
  opts: {
    visible?: string[];
    pinned?: string[];
    widths?: [string, number][];
    order?: string[];
    schema?: string[];
    /** The type of each column named here; every other column is an INTEGER. */
    types?: Record<string, ColumnType>;
  } = {},
): ColumnLayout {
  const visible = opts.visible ?? ['a', 'b', 'c', 'd'];
  return new ColumnLayout({
    visibleColumns: visible,
    pinnedColumns: opts.pinned ?? [],
    columnWidths: new Map(opts.widths ?? []),
    columnOrder: opts.order ?? visible,
    schema: (opts.schema ?? visible).map((name) => entry(name, opts.types?.[name])),
  });
}

describe('defaultColumnWidth', () => {
  it('is 168 px for a nested or JSON column, 150 for every other', () => {
    expect(NESTED_COLUMN_WIDTH).toBe(168);
    expect(DEFAULT_COLUMN_WIDTH).toBe(150);
  });

  it.each([
    ['VARCHAR[]', 'nested'],
    ['INTEGER[3]', 'nested'],
    ['STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)', 'nested'],
    ['MAP(VARCHAR, INTEGER)', 'nested'],
    ['UNION(num INTEGER, str VARCHAR)', 'nested'],
    ['VARIANT', 'nested'],
    ['JSON', 'string'],
  ] as const)('gives a %s column 168 px', (originalType, type) => {
    expect(defaultColumnWidth(entry('n', { type, originalType }))).toBe(168);
  });

  it.each([
    ['VARCHAR', 'string'],
    ['INTEGER', 'integer'],
    ['DOUBLE', 'float'],
    ['TIMESTAMP', 'timestamp'],
  ] as const)('gives a %s column 150 px', (originalType, type) => {
    expect(defaultColumnWidth(entry('n', { type, originalType }))).toBe(150);
  });

  it('gives __rowid__ 150 px', () => {
    const rowid: ColumnSchema = {
      name: '__rowid__',
      type: 'integer',
      nullable: false,
      originalType: 'BIGINT',
      system: true,
    };
    expect(defaultColumnWidth(rowid)).toBe(150);
  });

  it('counts a derived nested or JSON column', () => {
    const derived = (type: ColumnType, expression: string): ColumnSchema => ({
      ...entry('d', type),
      isDerived: true,
      expression,
    });
    expect(defaultColumnWidth(derived(LIST, "['a', 'b']"))).toBe(168);
    expect(defaultColumnWidth(derived(JSON_TEXT, "'{}'::JSON"))).toBe(168);
    expect(defaultColumnWidth(derived({ type: 'float', originalType: 'DOUBLE' }, 'x * 2'))).toBe(
      150,
    );
  });

  it('gives a column the schema does not have 150 px', () => {
    expect(defaultColumnWidth(undefined)).toBe(150);
  });
});

describe('resolveColumnWidth', () => {
  it('defaults a missing width', () => {
    expect(resolveColumnWidth(undefined)).toBe(DEFAULT_COLUMN_WIDTH);
  });

  it('defaults a missing or unusable width to the fallback it is given', () => {
    expect(resolveColumnWidth(undefined, 168)).toBe(168);
    expect(resolveColumnWidth(Number.NaN, 168)).toBe(168);
    expect(resolveColumnWidth(-1, 168)).toBe(168);
  });

  it('keeps a width that was set whatever the fallback, 150 included', () => {
    expect(resolveColumnWidth(150, 168)).toBe(150);
    expect(resolveColumnWidth(220.4, 168)).toBe(220);
    expect(resolveColumnWidth(10, 168)).toBe(50);
  });

  it('rounds to a whole pixel', () => {
    expect(resolveColumnWidth(151.6)).toBe(152);
    expect(resolveColumnWidth(151.4)).toBe(151);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])('defaults an unusable width (%s)', (w) => {
    expect(resolveColumnWidth(w)).toBe(DEFAULT_COLUMN_WIDTH);
  });

  it('draws a width under the minimum at the minimum', () => {
    // A cell cannot be narrower than its padding and border, so a smaller
    // width would take more room than it says.
    expect(resolveColumnWidth(0)).toBe(50);
    expect(resolveColumnWidth(24.4)).toBe(50);
    expect(resolveColumnWidth(50)).toBe(50);
  });
});

describe('ColumnLayout', () => {
  it('lays the visible columns end to end', () => {
    const l = layout({ widths: [['b', 200]] });
    expect([0, 1, 2, 3].map((i) => l.leftAt(i))).toEqual([0, 150, 350, 500]);
    expect([0, 1, 2, 3].map((i) => l.widthAt(i))).toEqual([150, 200, 150, 150]);
    expect(l.totalWidth).toBe(650);
    expect(l.indexOf('c')).toBe(2);
    expect(l.indexOf('hidden')).toBe(-1);
  });

  it('indexes a duplicated name at its first position, as Array.indexOf does', () => {
    const l = layout({ visible: ['a', 'b', 'a'] });
    expect(l.indexOf('a')).toBe(0);
  });

  it('answers widthOf for a column that is not visible', () => {
    const l = layout({ visible: ['a'], widths: [['z', 99.6]] });
    expect(l.widthOf('z')).toBe(100);
    expect(l.widthOf('unknown')).toBe(DEFAULT_COLUMN_WIDTH);
  });

  it('lays a nested or JSON column out at 168 px until it is sized', () => {
    const l = layout({ types: { b: LIST, c: JSON_TEXT } });
    expect([0, 1, 2, 3].map((i) => l.widthAt(i))).toEqual([150, 168, 168, 150]);
    expect([0, 1, 2, 3].map((i) => l.leftAt(i))).toEqual([0, 150, 318, 486]);
    expect(l.totalWidth).toBe(636);
  });

  it('keeps a width set on a nested column, even 150', () => {
    const l = layout({
      types: { b: LIST, c: LIST },
      widths: [
        ['b', 150],
        ['c', 220],
      ],
    });
    expect(l.widthOf('b')).toBe(150);
    expect(l.widthOf('c')).toBe(220);
    expect(l.totalWidth).toBe(670);
  });

  it('answers widthOf for a hidden nested or JSON column with its own default', () => {
    const l = layout({
      visible: ['a'],
      schema: ['a', 'tags', 'doc'],
      types: { tags: LIST, doc: JSON_TEXT },
      widths: [['doc', 90]],
    });
    expect(l.widthOf('tags')).toBe(168);
    expect(l.widthOf('doc')).toBe(90);
    expect(l.widthOf('unknown')).toBe(150);
  });

  it('answers defaultWidthOf for any column, sized or not, visible or not', () => {
    // What a reset brings the column back to.
    const l = layout({
      visible: ['a', 'tags'],
      schema: ['a', 'tags', 'doc'],
      types: { tags: LIST, doc: JSON_TEXT },
      widths: [['tags', 300]],
    });
    expect(l.widthOf('tags')).toBe(300);
    expect(l.defaultWidthOf('tags')).toBe(168);
    expect(l.defaultWidthOf('doc')).toBe(168);
    expect(l.defaultWidthOf('a')).toBe(150);
    expect(l.defaultWidthOf('unknown')).toBe(150);
  });

  it('places a pinned column after a nested one by the nested one’s 168 px', () => {
    const l = layout({ pinned: ['a', 'b'], types: { a: LIST } });
    expect(l.pinnedPlacement('b')).toEqual({ left: 168, zOffset: 1 });
    expect(l.pinnedWidth).toBe(318);
  });

  it('places pinned columns by the widths of the pinned columns before them', () => {
    const l = layout({ pinned: ['a', 'b'], widths: [['a', 120]] });
    expect(l.pinnedPlacement('a')).toEqual({ left: 0, zOffset: 2 });
    expect(l.pinnedPlacement('b')).toEqual({ left: 120, zOffset: 1 });
    expect(l.pinnedPlacement('c')).toBeUndefined();
    expect(l.pinnedCount).toBe(2);
    expect(l.pinnedWidth).toBe(270);
  });

  it('leaves a hidden pinned column out of the pinned block', () => {
    // `pinnedColumns` keeps `a` after `hideColumn('a')`.
    const l = layout({ visible: ['b', 'c', 'd'], pinned: ['a', 'b'] });
    expect(l.pinnedPlacement('b')).toEqual({ left: 0, zOffset: 1 });
    expect(l.pinnedPlacement('a')).toBeUndefined();
    expect(l.pinnedCount).toBe(1);
    expect(l.pinnedWidth).toBe(150);
  });

  it('orders pinned columns as they appear, not as they were pinned', () => {
    const l = layout({ visible: ['b', 'a', 'c'], pinned: ['a', 'b'], widths: [['b', 100]] });
    expect(l.pinnedPlacement('b')).toEqual({ left: 0, zOffset: 2 });
    expect(l.pinnedPlacement('a')).toEqual({ left: 100, zOffset: 1 });
  });

  it('numbers aria-colindex through columnOrder, hidden columns included', () => {
    const l = layout({
      visible: ['c', 'a'],
      order: ['c', 'hidden', 'a'],
      schema: ['a', 'hidden', 'c', 'new'],
    });
    expect(l.ariaColIndex('c')).toBe(1);
    expect(l.ariaColIndex('a')).toBe(3);
    // Not in columnOrder yet: its schema position.
    expect(l.ariaColIndex('new')).toBe(4);
    expect(l.ariaColIndex('nowhere')).toBeUndefined();
  });
});

describe('getColumnLayout', () => {
  const SCHEMA: ColumnSchema[] = ['a', 'b', 'c'].map((name) => ({
    name,
    type: 'integer',
    nullable: false,
    originalType: 'INTEGER',
  }));

  it('returns one snapshot until an input changes', () => {
    const state = createTableState();
    initializeColumnsFromSchema(state, SCHEMA);
    const first = getColumnLayout(state);
    expect(getColumnLayout(state)).toBe(first);

    state.columnWidths.set(new Map([['a', 300]]));
    const second = getColumnLayout(state);
    expect(second).not.toBe(first);
    expect(second.totalWidth).toBe(600);

    state.pinnedColumns.set(['a']);
    expect(getColumnLayout(state).pinnedWidth).toBe(300);
  });

  it('keeps one cache per table', () => {
    const one = createTableState();
    const two = createTableState();
    initializeColumnsFromSchema(one, SCHEMA);
    initializeColumnsFromSchema(two, SCHEMA.slice(0, 1));
    expect(getColumnLayout(one).totalWidth).toBe(450);
    expect(getColumnLayout(two).totalWidth).toBe(150);
  });

  it('rebuilds when a column turns nested', () => {
    // A derived column edited from a number to a list keeps its name and
    // gets a new schema entry.
    const state = createTableState();
    initializeColumnsFromSchema(state, SCHEMA);
    expect(getColumnLayout(state).widthOf('b')).toBe(150);

    state.schema.set(
      SCHEMA.map((c) =>
        c.name === 'b'
          ? { ...c, ...LIST, isDerived: true, expression: "['x', CAST(a AS VARCHAR)]" }
          : c,
      ),
    );

    const layout = getColumnLayout(state);
    expect(layout.widthOf('b')).toBe(168);
    expect(layout.leftAt(2)).toBe(318);
    expect(layout.totalWidth).toBe(468);
  });

  it('decides each column’s default once per schema, not on every rebuild', () => {
    // A resize drag writes a new `columnWidths` on every pointer event, and
    // each one rebuilds the layout. Going over the schema again each time
    // cost a lookup per column per event on a wide table.
    const schema = Array.from({ length: 300 }, (_, i) =>
      entry(`c${i}`, i % 3 === 0 ? LIST : undefined),
    );
    const state = createTableState();
    initializeColumnsFromSchema(state, schema);
    expect(getColumnLayout(state).widthOf('c0')).toBe(168);
    const decide = vi.mocked(isInspectableColumn);
    decide.mockClear();

    for (let width = 100; width < 140; width++) {
      state.columnWidths.set(new Map([['c1', width]]));
      expect(getColumnLayout(state).widthOf('c1')).toBe(width);
    }
    expect(decide).not.toHaveBeenCalled();

    // A new schema array is decided again, once per column.
    state.schema.set([...schema]);
    expect(getColumnLayout(state).widthOf('c3')).toBe(168);
    expect(decide).toHaveBeenCalledTimes(300);
  });

  it('gives a hidden nested column its default', () => {
    const state = createTableState();
    initializeColumnsFromSchema(state, [...SCHEMA, entry('tags', LIST)]);
    state.visibleColumns.set(['a', 'b', 'c']);
    const layout = getColumnLayout(state);
    expect(layout.indexOf('tags')).toBe(-1);
    expect(layout.widthOf('tags')).toBe(168);
    expect(layout.totalWidth).toBe(450);
  });
});
