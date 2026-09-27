/**
 * The column layout: one definition of every visible column's width and
 * position, shared by the header, the body, the pinned styles and keyboard
 * navigation.
 */
import { describe, expect, it } from 'vitest';

import { createTableState, initializeColumnsFromSchema } from '@/core/State';
import type { ColumnSchema } from '@/core/types';
import {
  ColumnLayout,
  DEFAULT_COLUMN_WIDTH,
  getColumnLayout,
  resolveColumnWidth,
} from '@/table/ColumnLayout';

function layout(
  opts: {
    visible?: string[];
    pinned?: string[];
    widths?: [string, number][];
    order?: string[];
    schema?: string[];
  } = {},
): ColumnLayout {
  const visible = opts.visible ?? ['a', 'b', 'c', 'd'];
  return new ColumnLayout({
    visibleColumns: visible,
    pinnedColumns: opts.pinned ?? [],
    columnWidths: new Map(opts.widths ?? []),
    columnOrder: opts.order ?? visible,
    schema: (opts.schema ?? visible).map((name) => ({ name })),
  });
}

describe('resolveColumnWidth', () => {
  it('defaults a missing width', () => {
    expect(resolveColumnWidth(undefined)).toBe(DEFAULT_COLUMN_WIDTH);
  });

  it('rounds to a whole pixel', () => {
    expect(resolveColumnWidth(151.6)).toBe(152);
    expect(resolveColumnWidth(151.4)).toBe(151);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])('defaults an unusable width (%s)', (w) => {
    expect(resolveColumnWidth(w)).toBe(DEFAULT_COLUMN_WIDTH);
  });

  it('keeps a zero width', () => {
    expect(resolveColumnWidth(0)).toBe(0);
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
});
