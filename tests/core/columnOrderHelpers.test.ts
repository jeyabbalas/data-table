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

describe('mergeMissingColumns, against the quadratic merge it replaced', () => {
  /** The merge `setColumnOrder` used to do inline: before each insert, a scan. */
  function reference(columns: readonly string[], order: readonly string[]): string[] {
    const merged = [...columns];
    const present = new Set(columns);
    for (let k = 0; k < order.length; k++) {
      const missing = order[k]!;
      if (present.has(missing)) continue;
      let at = merged.length;
      for (let i = k + 1; i < order.length; i++) {
        const index = merged.indexOf(order[i]!);
        if (index !== -1) {
          at = index;
          break;
        }
      }
      merged.splice(at, 0, missing);
      present.add(missing);
    }
    return merged;
  }

  /** A small deterministic generator, so a failure names its seed. */
  function random(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
  }

  it('gives the same order for random shows, hides and reorders', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const r = random(seed);
      const n = 1 + Math.floor(r() * 12);
      const order = Array.from({ length: n }, (_, i) => `c${i}`).sort(() => r() - 0.5);
      // The shown columns: a random subset, in a random order, sometimes with
      // a name the order does not have.
      const columns = order.filter(() => r() < 0.5).sort(() => r() - 0.5);
      if (r() < 0.2) columns.splice(Math.floor(r() * (columns.length + 1)), 0, 'extra');
      expect(mergeMissingColumns(columns, order), `seed ${seed}`).toEqual(
        reference(columns, order),
      );
    }
  });

  it('merges 900 hidden columns into 100 in a moment', () => {
    const order = Array.from({ length: 1000 }, (_, i) => `c${i}`);
    const columns = order.filter((_, i) => i % 10 === 0).reverse();
    const started = performance.now();
    for (let i = 0; i < 50; i++) mergeMissingColumns(columns, order);
    // Fifty merges, as a restore with fifty undo entries does. The quadratic
    // merge took about 15 s here; generous, so a slow machine cannot fail it.
    expect(performance.now() - started).toBeLessThan(1000);
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

  it('shows a column listed twice once', () => {
    expect(consistentColumnOrder(['a', 'b', 'a'], ['a', 'b', 'c'], [])).toEqual({
      columnOrder: ['a', 'b', 'c'],
      visibleColumns: ['a', 'b'],
      pinnedColumns: [],
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
