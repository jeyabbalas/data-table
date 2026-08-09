/**
 * `RowCache` / `CoverageInterner` — the merge algebra behind column-clipped
 * row fetches.
 *
 * Written before any `TableBody` wiring, because "a row is assembled from
 * several partial fetches" is the phase's riskiest new assumption and the one
 * a green rendering suite is least able to falsify: a cell that shows a stale
 * or absent value looks exactly like a cell that has not been painted yet.
 *
 * The bulk of the file is a randomized model check — thousands of
 * merge / delete / clear interleavings against a plain `Map` of
 * `{ row, coverage }` — with a fixed seed so a failure names a reproducible
 * script. Runs in the default `node` environment: nothing here touches the DOM.
 */
import { describe, expect, it } from 'vitest';

import { CoverageInterner, RowCache } from '@/table/RowCache';

/** Deterministic 32-bit PRNG — reruns replay the identical operation script. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLUMNS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** A row payload carrying `__rowid__` plus one distinctive value per column. */
function rowFor(index: number, columns: readonly string[]): Record<string, unknown> {
  const row: Record<string, unknown> = { __rowid__: index };
  for (const column of columns) row[column] = `${column}@${index}`;
  return row;
}

describe('CoverageInterner', () => {
  it('hands out one object per distinct column set, whatever the order', () => {
    const interner = new CoverageInterner();
    const first = interner.intern(['b', 'a', 'c']);
    const second = interner.intern(['c', 'b', 'a']);
    const third = interner.intern(['a', 'b', 'c', 'b']);

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect([...first.names].sort()).toEqual(['a', 'b', 'c']);
    expect(interner.internedCount).toBe(1);
  });

  it('separates sets that merely look alike after joining', () => {
    // A `join(' ')` key would collapse these two into one id, and the
    // in-flight dedupe key is built from that id.
    const interner = new CoverageInterner();
    const spaced = interner.intern(['a b']);
    const split = interner.intern(['a', 'b']);
    expect(spaced).not.toBe(split);
    expect(interner.internedCount).toBe(2);
  });

  it('numbers ids densely and freezes what it hands out', () => {
    const interner = new CoverageInterner();
    const first = interner.intern(['a']);
    const second = interner.intern(['b']);
    expect(first.id).toBe(0);
    expect(second.id).toBe(1);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('unions to the set union and memoizes the pair', () => {
    const interner = new CoverageInterner();
    const ab = interner.intern(['a', 'b']);
    const bc = interner.intern(['b', 'c']);
    const merged = interner.union(ab, bc);
    expect([...merged.names].sort()).toEqual(['a', 'b', 'c']);
    // Identical object on a repeat, and the same object the interner would
    // hand out for the union computed directly.
    expect(interner.union(ab, bc)).toBe(merged);
    expect(interner.intern(['c', 'b', 'a'])).toBe(merged);
  });

  it('returns the containing operand unchanged rather than a fresh equal set', () => {
    const interner = new CoverageInterner();
    const abc = interner.intern(['a', 'b', 'c']);
    const ab = interner.intern(['a', 'b']);
    expect(interner.union(abc, ab)).toBe(abc);
    expect(interner.union(ab, abc)).toBe(abc);
    expect(interner.union(abc, abc)).toBe(abc);
  });

  it('answers subsumption both ways and memoizes it', () => {
    const interner = new CoverageInterner();
    const abc = interner.intern(['a', 'b', 'c']);
    const ab = interner.intern(['a', 'b']);
    const ad = interner.intern(['a', 'd']);
    const empty = interner.intern([]);

    expect(interner.subsumes(abc, ab)).toBe(true);
    expect(interner.subsumes(ab, abc)).toBe(false);
    expect(interner.subsumes(abc, ad)).toBe(false);
    expect(interner.subsumes(abc, empty)).toBe(true);
    expect(interner.subsumes(empty, abc)).toBe(false);
    // Repeats are answered from the memo, not recomputed — same answer.
    expect(interner.subsumes(abc, ab)).toBe(true);
    expect(interner.subsumes(ab, abc)).toBe(false);
  });
});

describe('RowCache', () => {
  it('starts empty', () => {
    const cache = new RowCache();
    expect(cache.size).toBe(0);
    expect(cache.cellCount).toBe(0);
    expect(cache.get(0)).toBeUndefined();
    expect(cache.has(0)).toBe(false);
    expect(cache.coverageOf(0)).toBeUndefined();
  });

  it('merges two disjoint fetches into one row covering the union', () => {
    const cache = new RowCache();
    const interner = cache.coverageInterner;
    const ab = interner.intern(['a', 'b']);
    const cd = interner.intern(['c', 'd']);

    cache.merge(7, rowFor(7, ['a', 'b']), ab);
    expect(cache.covers(7, cd.names)).toBe(false);
    cache.merge(7, rowFor(7, ['c', 'd']), cd);

    expect(cache.get(7)).toEqual({
      __rowid__: 7,
      a: 'a@7',
      b: 'b@7',
      c: 'c@7',
      d: 'd@7',
    });
    expect(cache.covers(7, ab.names)).toBe(true);
    expect(cache.covers(7, cd.names)).toBe(true);
    expect(cache.covers(7, interner.intern(['a', 'd']).names)).toBe(true);
    expect(cache.covers(7, interner.intern(['a', 'e']).names)).toBe(false);
    expect(cache.size).toBe(1);
    expect(cache.cellCount).toBe(4);
  });

  it('never claims coverage a fetch did not project', () => {
    // The landing fetch carried three columns but only asserts the two it
    // says it projected — the third stays uncovered, so the reconciler will
    // ask for it again rather than the renderer painting it as resolved.
    const cache = new RowCache();
    const ab = cache.coverageInterner.intern(['a', 'b']);
    cache.merge(3, rowFor(3, ['a', 'b', 'c']), ab);

    expect(cache.coverageOf(3)!.names.has('c')).toBe(false);
    expect(cache.covers(3, cache.coverageInterner.intern(['c']).names)).toBe(false);
    expect(cache.cellCount).toBe(2);
  });

  it('a re-fetch of the same columns leaves the count and the coverage alone', () => {
    const cache = new RowCache();
    const ab = cache.coverageInterner.intern(['a', 'b']);
    cache.merge(1, rowFor(1, ['a', 'b']), ab);
    const before = cache.coverageOf(1);
    cache.merge(1, rowFor(1, ['a', 'b']), ab);
    expect(cache.coverageOf(1)).toBe(before);
    expect(cache.cellCount).toBe(2);
    expect(cache.size).toBe(1);
  });

  it('overwrites values on re-merge — the newest fetch wins', () => {
    const cache = new RowCache();
    const a = cache.coverageInterner.intern(['a']);
    cache.merge(2, { __rowid__: 2, a: 'old' }, a);
    cache.merge(2, { __rowid__: 2, a: 'new' }, a);
    expect(cache.get(2)).toEqual({ __rowid__: 2, a: 'new' });
  });

  it('deletes whole rows, data and coverage together', () => {
    const cache = new RowCache();
    const ab = cache.coverageInterner.intern(['a', 'b']);
    cache.merge(4, rowFor(4, ['a', 'b']), ab);
    cache.merge(5, rowFor(5, ['a', 'b']), ab);
    expect(cache.cellCount).toBe(4);

    cache.delete(4);
    expect(cache.has(4)).toBe(false);
    expect(cache.get(4)).toBeUndefined();
    expect(cache.coverageOf(4)).toBeUndefined();
    expect(cache.covers(4, ab.names)).toBe(false);
    expect(cache.size).toBe(1);
    expect(cache.cellCount).toBe(2);

    // Deleting an absent row is a no-op, not a negative cell count.
    cache.delete(4);
    cache.delete(999);
    expect(cache.cellCount).toBe(2);
  });

  it('prunes a row to a band, dropping the values as well as the coverage', () => {
    const cache = new RowCache();
    const interner = cache.coverageInterner;
    const abc = interner.intern(['a', 'b', 'c']);
    cache.merge(3, rowFor(3, ['a', 'b', 'c']), abc);
    expect(cache.cellCount).toBe(3);

    cache.prune(3, interner.intern(['b', 'c', 'z']));
    expect([...cache.coverageOf(3)!.names].sort()).toEqual(['b', 'c']);
    expect(cache.cellCount).toBe(2);
    // The value went with the coverage — a pruned column that kept its value
    // would paint as data the moment the window came back over it, without a
    // fetch having confirmed it is still current.
    expect(cache.get(3)).not.toHaveProperty('a');
    expect(cache.get(3)!['b']).toBe('b@3');
    // Outside coverage by construction, so untouched.
    expect(cache.get(3)!['__rowid__']).toBe(3);

    // A row already inside `keep` keeps its coverage object identity.
    const before = cache.coverageOf(3)!;
    cache.prune(3, interner.intern(['a', 'b', 'c', 'd']));
    expect(cache.coverageOf(3)).toBe(before);
    expect(cache.cellCount).toBe(2);
  });

  it('drops a row pruned to nothing rather than keeping an empty husk', () => {
    const cache = new RowCache();
    const interner = cache.coverageInterner;
    cache.merge(9, rowFor(9, ['a', 'b']), interner.intern(['a', 'b']));

    cache.prune(9, interner.intern(['y', 'z']));
    // Not `has(9) && cellCount === 0`: eviction ranks blocks by cell count, so
    // a zero-cell row could never be reclaimed and the map would grow for the
    // session.
    expect(cache.has(9)).toBe(false);
    expect(cache.size).toBe(0);
    expect(cache.cellCount).toBe(0);

    // Pruning an absent row is a no-op.
    cache.prune(9, interner.intern(['a']));
    expect(cache.cellCount).toBe(0);
  });

  it('clears everything but keeps the interner and its ids', () => {
    const cache = new RowCache();
    const interner = cache.coverageInterner;
    const ab = interner.intern(['a', 'b']);
    cache.merge(1, rowFor(1, ['a', 'b']), ab);
    cache.clear();

    expect(cache.size).toBe(0);
    expect(cache.cellCount).toBe(0);
    expect([...cache.keys()]).toEqual([]);
    expect(interner.intern(['b', 'a'])).toBe(ab);
  });

  it('enumerates its row indices in insertion order', () => {
    const cache = new RowCache();
    const a = cache.coverageInterner.intern(['a']);
    for (const index of [5, 1, 9]) cache.merge(index, rowFor(index, ['a']), a);
    expect([...cache.keys()]).toEqual([5, 1, 9]);
  });

  it('degenerates to row counting when one fetch covers every column', () => {
    // The claim the whole cell-budget design rests on: with coverage ≡ the
    // visible column set, `cellCount` is exactly `rows × N`, so a budget of
    // `rowCacheRows × N` evicts at exactly `rowCacheRows` rows.
    const cache = new RowCache();
    const all = cache.coverageInterner.intern(COLUMNS);
    for (let i = 0; i < 50; i++) cache.merge(i, rowFor(i, COLUMNS), all);
    expect(cache.cellCount).toBe(50 * COLUMNS.length);
    expect(cache.size).toBe(50);
  });

  it('shares one coverage object across every row a fetch lands', () => {
    const cache = new RowCache();
    const ab = cache.coverageInterner.intern(['a', 'b']);
    for (let i = 0; i < 10; i++) cache.merge(i, rowFor(i, ['a', 'b']), ab);
    for (let i = 0; i < 10; i++) expect(cache.coverageOf(i)).toBe(ab);
  });

  it('accepts an injected interner so two caches can share ids', () => {
    const interner = new CoverageInterner();
    const first = new RowCache(interner);
    const second = new RowCache(interner);
    expect(first.coverageInterner).toBe(interner);
    expect(second.coverageInterner).toBe(interner);
    const ab = interner.intern(['a', 'b']);
    first.merge(0, rowFor(0, ['a', 'b']), ab);
    expect(first.covers(0, second.coverageInterner.intern(['b', 'a']).names)).toBe(true);
  });
});

describe('RowCache — randomized interleavings against a model', () => {
  interface ModelEntry {
    row: Record<string, unknown>;
    coverage: Set<string>;
    /** Every column name any merge for this row has ever carried. */
    everMerged: Set<string>;
  }

  /**
   * Drive `operations` random merges / deletes / clears and re-check the whole
   * cache against a plain-`Map` model after each one.
   */
  function runScript(seed: number, operations: number): void {
    const random = mulberry32(seed);
    const pick = (n: number): number => Math.floor(random() * n);

    const cache = new RowCache();
    const interner = cache.coverageInterner;
    const model = new Map<number, ModelEntry>();
    const ROWS = 12;

    /** A random non-empty subset of COLUMNS. */
    const someColumns = (): string[] => {
      const chosen = COLUMNS.filter(() => random() < 0.4);
      if (chosen.length === 0) chosen.push(COLUMNS[pick(COLUMNS.length)]!);
      return chosen;
    };

    for (let step = 0; step < operations; step++) {
      const roll = random();
      if (roll < 0.75) {
        const index = pick(ROWS);
        const columns = someColumns();
        // The payload deliberately carries a column the coverage omits, so a
        // cache that asserted coverage from the payload would be caught.
        const extra = COLUMNS[pick(COLUMNS.length)]!;
        const payload = rowFor(index, [...new Set([...columns, extra])]);
        cache.merge(index, payload, interner.intern(columns));

        const entry = model.get(index);
        if (entry) {
          for (const column of [...columns, extra]) entry.row[column] = payload[column];
          for (const column of columns) entry.coverage.add(column);
          for (const column of [...columns, extra]) entry.everMerged.add(column);
        } else {
          model.set(index, {
            row: { ...payload },
            coverage: new Set(columns),
            everMerged: new Set([...columns, extra]),
          });
        }
      } else if (roll < 0.88) {
        // Column-axis eviction, interleaved with the rest so `cellCount` and
        // the coverage bookkeeping are checked across every ordering of
        // merge / prune / delete rather than only after a clean merge.
        const index = pick(ROWS);
        const keep = interner.intern(someColumns());
        cache.prune(index, keep);

        const entry = model.get(index);
        if (entry) {
          for (const column of [...entry.coverage]) {
            if (!keep.names.has(column)) {
              entry.coverage.delete(column);
              delete entry.row[column];
            }
          }
          // A row left covering nothing is dropped, not kept as a husk.
          if (entry.coverage.size === 0) model.delete(index);
        }
      } else if (roll < 0.95) {
        const index = pick(ROWS);
        cache.delete(index);
        model.delete(index);
      } else {
        cache.clear();
        model.clear();
      }

      // ---- invariants, re-checked in full after every operation ----------
      expect(cache.size).toBe(model.size);

      let cells = 0;
      for (const [index, entry] of model) cells += entry.coverage.size;
      expect(cache.cellCount).toBe(cells);

      expect([...cache.keys()].sort((a, b) => a - b)).toEqual(
        [...model.keys()].sort((a, b) => a - b),
      );

      for (let index = 0; index < ROWS; index++) {
        const entry = model.get(index);
        if (!entry) {
          expect(cache.has(index)).toBe(false);
          expect(cache.get(index)).toBeUndefined();
          expect(cache.coverageOf(index)).toBeUndefined();
          // An absent row covers nothing, including the empty need.
          expect(cache.covers(index, interner.intern([]).names)).toBe(false);
          continue;
        }
        expect(cache.has(index)).toBe(true);
        expect(cache.get(index)).toEqual(entry.row);
        const held = cache.coverageOf(index)!;
        expect([...held.names].sort()).toEqual([...entry.coverage].sort());
        // Never-invented coverage: nothing outside what some merge carried.
        for (const name of held.names) expect(entry.everMerged.has(name)).toBe(true);

        // `covers` agrees with the model for every subset probe.
        for (let probe = 0; probe < 3; probe++) {
          const need = someColumns();
          const wanted = need.every((column) => entry.coverage.has(column));
          expect(cache.covers(index, interner.intern(need).names)).toBe(wanted);
        }
      }
    }
  }

  for (const seed of [1, 7, 42, 1337, 90210]) {
    it(`holds every invariant across 400 operations (seed ${seed})`, () => {
      runScript(seed, 400);
    });
  }
});
