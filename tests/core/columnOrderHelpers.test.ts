/**
 * The pure helpers that keep a column order consistent: pinned columns
 * first, hidden columns beside their old neighbours, visible columns in the
 * order.
 */
import { describe, expect, it } from 'vitest';
import { consistentColumnOrder, mergeMissingColumns, pinnedColumnsFirst } from '@/core/State';

describe('pinnedColumnsFirst', () => {
  it('moves the pinned columns to the front, each group in its own order', () => {
    expect(pinnedColumnsFirst(['a', 'b', 'c', 'd'], ['d', 'b'])).toEqual(['b', 'd', 'a', 'c']);
    expect(pinnedColumnsFirst(['a', 'b'], [])).toEqual(['a', 'b']);
    expect(pinnedColumnsFirst(['a', 'b'], ['gone'])).toEqual(['a', 'b']);
  });
});

describe('mergeMissingColumns', () => {
  it('puts each missing column before the next column of the old order that is there', () => {
    expect(mergeMissingColumns(['c', 'a'], ['a', 'b', 'c'])).toEqual(['b', 'c', 'a']);
    expect(mergeMissingColumns(['a'], ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(mergeMissingColumns([], ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('keeps two missing neighbours together, in their old order', () => {
    expect(mergeMissingColumns(['d', 'a'], ['a', 'b', 'c', 'd'])).toEqual(['b', 'c', 'd', 'a']);
  });
});

describe('consistentColumnOrder', () => {
  it('keeps the shown order, puts hidden columns back and the pinned ones first', () => {
    expect(consistentColumnOrder(['c', 'a', 'b'], ['a', 'x', 'b', 'c'], ['b'])).toEqual({
      columnOrder: ['b', 'c', 'a', 'x'],
      visibleColumns: ['b', 'c', 'a'],
      pinnedColumns: ['b'],
    });
  });

  it('orders pinnedColumns as the pinned columns are shown, keeping names the order lacks', () => {
    expect(consistentColumnOrder(['d', 'b', 'a'], ['a', 'b', 'd'], ['b', 'gone', 'd'])).toEqual({
      columnOrder: ['d', 'b', 'a'],
      visibleColumns: ['d', 'b', 'a'],
      pinnedColumns: ['d', 'b', 'gone'],
    });
  });

  it('changes nothing in state that keeps the rules', () => {
    const state = consistentColumnOrder(['p', 'a', 'c'], ['p', 'a', 'b', 'c'], ['p']);
    expect(state).toEqual({
      columnOrder: ['p', 'a', 'b', 'c'],
      visibleColumns: ['p', 'a', 'c'],
      pinnedColumns: ['p'],
    });
  });
});
