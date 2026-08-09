/**
 * RowCache — the row store behind `TableBody`, with per-row column coverage.
 *
 * Before column-clipped projections a cached row was a complete row: every
 * visible column, always, so "is index `i` cached?" was `map.has(i)` and
 * eviction could count row keys. Clipping breaks both premises. A block fetch
 * now projects a padded slice of the column axis, so a row arrives in pieces
 * and the questions become "which columns of row `i` do I hold?" and "how many
 * *values* am I holding?".
 *
 * This module answers exactly those two, and nothing else — it is DOM-free and
 * state-free on purpose, so the merge algebra can be property-tested directly
 * rather than through a rendered table.
 *
 * **Coverage is name-based and interned.** All rows landed by one fetch share a
 * single frozen {@link CoverageSet}, so per-row memory is one reference rather
 * than a copy of ~100 strings. Names, not window indices, because a
 * `visibleColumns` reorder permutes indices while leaving every cached value
 * exactly where it was — index-keyed coverage would silently start describing
 * the wrong columns.
 *
 * **`__rowid__` is deliberately outside coverage.** `buildRowQuery` prepends it
 * to every projection by construction and the fast path's density valve
 * verifies it, so tracking it would add a constant to every count and buy
 * nothing. The consequence is the one that matters for eviction: on a table
 * narrow enough that one fetch covers every visible column, coverage ≡ the
 * visible column set, `cellCount ≡ rows × N`, and a budget of
 * `rowCacheRows × N` cells evicts at exactly `rowCacheRows` rows — i.e. the
 * pre-clipping behaviour, exactly, with no special case in the code.
 *
 * **Rejected alternative: composite `(row × column-window)` cache keys.** It
 * duplicates storage for the pinned columns and for every overlap between two
 * windows; it turns "is this row resolved for the current render?" from one
 * lookup into a scan over every window key the row might be split across; and
 * it turns whole-block eviction — which exists so a surviving block is never
 * half-populated — into cross-product bookkeeping over (block × window) pairs.
 * A single row entry with a union-ing coverage set keeps all three cheap.
 *
 * **Not built, deliberately:** pruning columns that have drifted far from the
 * live window off a row's coverage. Whole-block eviction already bounds the
 * total, and a partial prune would have to invalidate the `covers` memo and
 * re-derive `cellCount` per row. Recorded as future work, not as a gap.
 *
 * `@internal` — exported from neither `src/index.ts` nor `src/advanced.ts`;
 * `tests/api-surface.exports.test.ts` asserts that.
 *
 * @internal
 */

/**
 * A row as the worker returned it: column name → value.
 *
 * Structurally identical to `TableBody`'s public `RowData`, and deliberately
 * *not* imported from there: `TableBody` imports this module, and
 * `import-x/no-cycle` counts a type-only edge as a cycle.
 */
type CachedRow = Record<string, unknown>;

/**
 * An interned, immutable set of column names one fetch actually projected.
 *
 * Two coverage sets with equal `names` always share one `id`, so identity
 * comparisons and `Map` keys built from `id` are exact. Produced only by
 * {@link CoverageInterner}; never constructed directly.
 *
 * @internal
 */
export interface CoverageSet {
  /** Dense, interner-scoped identity. Equal names ⇒ equal id. */
  readonly id: number;
  /** The projected column names. Never contains `__rowid__`. */
  readonly names: ReadonlySet<string>;
}

/**
 * Hands out one shared {@link CoverageSet} per distinct set of column names,
 * and memoizes the two set relations the fetch pipeline asks for constantly:
 * union (a merge) and subsumption (a coverage test).
 *
 * A table's fetch sets come from a quantized window, so the number of distinct
 * sets a session produces is small and bounded — roughly `columns / quantum`
 * plus the pinned variants — which is what makes unbounded memoization the
 * right call here rather than a leak.
 *
 * @internal
 */
export class CoverageInterner {
  private readonly byKey = new Map<string, CoverageSet>();
  private readonly unions = new Map<string, CoverageSet>();
  private readonly subsumptions = new Map<string, boolean>();
  private nextId = 0;

  /**
   * The shared {@link CoverageSet} for `names`, creating it on first sight.
   *
   * Order- and duplicate-insensitive: the canonical key is the *sorted*
   * de-duplicated list, so `['b', 'a']` and `['a', 'b', 'a']` intern to the
   * same object. That matters beyond tidiness — the in-flight dedupe key is
   * built from `id`, so a `visibleColumns` reorder that produces the same
   * column set must not be able to issue a duplicate fetch for it.
   *
   * `JSON.stringify` rather than a `join`, because a separator character is
   * only unambiguous until someone loads a column whose name contains it.
   */
  intern(names: readonly string[]): CoverageSet {
    const unique = [...new Set(names)].sort();
    const key = JSON.stringify(unique);
    const existing = this.byKey.get(key);
    if (existing) return existing;
    const created: CoverageSet = Object.freeze({
      id: this.nextId++,
      names: new Set(unique) as ReadonlySet<string>,
    });
    this.byKey.set(key, created);
    return created;
  }

  /**
   * The coverage a row holds after a fetch covering `b` merges into a row that
   * already covered `a`.
   *
   * Returns `a` or `b` unchanged whenever one already contains the other —
   * the overwhelmingly common case, since consecutive fetch sets overlap by
   * design — so a row scrolled back and forth over the same band keeps one
   * stable coverage object instead of accumulating equal-but-distinct ones.
   */
  union(a: CoverageSet, b: CoverageSet): CoverageSet {
    if (a === b) return a;
    const key = `${a.id}:${b.id}`;
    const cached = this.unions.get(key);
    if (cached) return cached;

    let merged: CoverageSet;
    if (this.subsumes(a, b)) {
      merged = a;
    } else if (this.subsumes(b, a)) {
      merged = b;
    } else {
      merged = this.intern([...a.names, ...b.names]);
    }
    this.unions.set(key, merged);
    return merged;
  }

  /**
   * Whether `a` contains every name in `b` (`a ⊇ b`).
   *
   * Memoized by id pair: this is asked once per row per reconcile pass, and
   * the answer for a given pair of interned sets can never change.
   */
  subsumes(a: CoverageSet, b: CoverageSet): boolean {
    if (a === b) return true;
    if (b.names.size > a.names.size) return false;
    const key = `${a.id}:${b.id}`;
    const cached = this.subsumptions.get(key);
    if (cached !== undefined) return cached;
    let result = true;
    for (const name of b.names) {
      if (!a.names.has(name)) {
        result = false;
        break;
      }
    }
    this.subsumptions.set(key, result);
    return result;
  }

  /** Distinct coverage sets handed out so far. Test/diagnostic only. */
  get internedCount(): number {
    return this.byKey.size;
  }
}

/**
 * Row index → row data, plus which columns of it are actually present.
 *
 * The index is positional within the current result set — the same key
 * `TableBody` has always used. That stays valid under clipping for the same
 * reason it was valid before: any change to sort, filters, the visible column
 * set or the table name bumps `TableBody.epoch` and clears this cache
 * wholesale, so a key never outlives the ordering it was computed under.
 *
 * @internal
 */
export class RowCache {
  private readonly rows = new Map<number, CachedRow>();
  private readonly coverage = new Map<number, CoverageSet>();
  private cells = 0;

  constructor(private readonly interner: CoverageInterner = new CoverageInterner()) {}

  /** The interner whose {@link CoverageSet}s this cache is keyed by. */
  get coverageInterner(): CoverageInterner {
    return this.interner;
  }

  /** The stored row at `index`, however partially covered, or `undefined`. */
  get(index: number): CachedRow | undefined {
    return this.rows.get(index);
  }

  /** Whether any part of row `index` is stored. */
  has(index: number): boolean {
    return this.rows.has(index);
  }

  /** Which columns of row `index` are stored, or `undefined` when it is not. */
  coverageOf(index: number): CoverageSet | undefined {
    return this.coverage.get(index);
  }

  /**
   * Whether row `index` is present **and** holds every column of `need`.
   *
   * This is the "resolved for render" test: `false` for an absent row and for
   * a present row whose stored columns do not span what the current window
   * asks for, which is exactly the pair of cases the reconciler must fetch.
   */
  covers(index: number, need: CoverageSet): boolean {
    const held = this.coverage.get(index);
    if (held === undefined) return false;
    return this.interner.subsumes(held, need);
  }

  /**
   * Land the columns `coverage` names of row `index`, merging into whatever is
   * already stored.
   *
   * Assign-and-union, never replace: a horizontal scroll lands column bands
   * one at a time and each must add to the row rather than supersede it.
   *
   * **The coverage asserted is the fetch's own, never the render's need.** A
   * fetch that projected 33 columns marks 33 columns covered even if the
   * caller wanted 40 — so a late or partial result can never claim a column it
   * did not carry, and the reconciler re-issues the remainder instead of
   * painting a hole as data.
   */
  merge(index: number, row: CachedRow, coverage: CoverageSet): void {
    const existing = this.rows.get(index);
    if (existing === undefined) {
      this.rows.set(index, row);
      this.coverage.set(index, coverage);
      this.cells += coverage.names.size;
      return;
    }
    Object.assign(existing, row);
    const previous = this.coverage.get(index)!;
    const merged = this.interner.union(previous, coverage);
    if (merged !== previous) {
      this.coverage.set(index, merged);
      this.cells += merged.names.size - previous.names.size;
    }
  }

  /**
   * Drop row `index` entirely — data and coverage together.
   *
   * Named for `Map` rather than `deleteRow`, along with `get` / `has` /
   * `size` / `keys` / `clear` above: this class replaced a bare
   * `Map<number, RowData>` field that ten fetch-pipeline suites reach into
   * directly to assert what survived an eviction or a race. Keeping the core
   * surface Map-shaped is what lets those suites — the behavioural proof that
   * clipping is a no-op on a narrow table — pass with no edits at all.
   */
  delete(index: number): void {
    const held = this.coverage.get(index);
    if (held === undefined) return;
    this.cells -= held.names.size;
    this.rows.delete(index);
    this.coverage.delete(index);
  }

  /** Drop every row. The interner survives — its ids stay valid. */
  clear(): void {
    this.rows.clear();
    this.coverage.clear();
    this.cells = 0;
  }

  /** Every stored row index, in insertion order. */
  keys(): IterableIterator<number> {
    return this.rows.keys();
  }

  /** `[index, row]` pairs, in insertion order. */
  entries(): IterableIterator<[number, CachedRow]> {
    return this.rows.entries();
  }

  /** Iterating yields `[index, row]`, exactly as iterating a `Map` does. */
  [Symbol.iterator](): IterableIterator<[number, CachedRow]> {
    return this.entries();
  }

  /** Rows held, however partially. */
  get size(): number {
    return this.rows.size;
  }

  /**
   * Σ covered columns over every stored row — the quantity eviction is
   * budgeted against, maintained incrementally so eviction never walks the
   * cache to find out how full it is.
   *
   * `__rowid__` is excluded (see the module header), so on a table where one
   * fetch covers everything this is exactly `size × visibleColumns.length`.
   */
  get cellCount(): number {
    return this.cells;
  }
}
