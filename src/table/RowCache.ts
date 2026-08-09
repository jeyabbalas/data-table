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
 * pre-clipping behaviour, exactly, with no special case in the code. The
 * budget's multiplicand has to be the *fetch* width for that to hold at any
 * width, not the render window: what `cellCount` accumulates is what a fetch
 * projected, and the window is roughly a third of it.
 *
 * **Rejected alternative: composite `(row × column-window)` cache keys.** It
 * duplicates storage for the pinned columns and for every overlap between two
 * windows; it turns "is this row resolved for the current render?" from one
 * lookup into a scan over every window key the row might be split across; and
 * it turns whole-block eviction — which exists so a surviving block is never
 * half-populated — into cross-product bookkeeping over (block × window) pairs.
 * A single row entry with a union-ing coverage set keeps all three cheap.
 *
 * **Both axes evict.** {@link RowCache.delete} drops a whole row;
 * {@link RowCache.prune} drops the columns of a row that have drifted off the
 * live window. The second exists because the first cannot reach the block the
 * user is parked on — that block is exempt from eviction by design, and a
 * horizontal sweep pours the entire column axis into it. Row eviction alone
 * makes the cell budget unsatisfiable exactly when it matters most.
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
 * How many entries each of the interner's three maps holds before it is
 * flushed wholesale.
 *
 * The set count is *not* small and bounded, which an earlier draft of this
 * file claimed. Fetch bands are quantized and there are only `columns /
 * quantum` of them, but that draft also interned the render *need* — the
 * unquantized window — which produced one set per distinct scroll position:
 * measured 342 after one 300-column sweep and 1,149 after a single scrollbar
 * drag at 1,000 columns, still climbing. {@link RowCache.covers} takes a
 * plain set now, so that producer is gone and a sweep interns ~42.
 *
 * What remains is genuinely bounded but not provably so from this file: a
 * horizontal sweep can merge bands that overlap without subsuming, and every
 * `visibleColumns` permutation mints fresh name sets. Hence a cap rather than
 * an argument.
 *
 * Flushing is always safe, because all three maps are pure caches. Losing a
 * `byKey` entry means the next `intern` of those names mints a fresh
 * {@link CoverageSet} with a new id rather than returning the one live rows
 * already hold. Nothing reads `id` for meaning: `covers` falls back to
 * comparing names, `union` to `subsumes`, and the fetch-dedupe key
 * `${blockStart}:${coverage.id}` at worst misses once and issues a duplicate
 * fetch, which merges idempotently. The two memo maps hold answers that are
 * re-derivable by definition.
 *
 * A wholesale flush rather than an LRU because the access pattern is a sweep:
 * what a table is about to ask for is what is near where it currently is, and
 * within a few fetches after a flush it has re-interned exactly that.
 */
const MEMO_CAPACITY = 1024;

/**
 * Hands out one shared {@link CoverageSet} per distinct set of column names,
 * and memoizes the two set relations the fetch pipeline asks for constantly:
 * union (a merge) and subsumption (a coverage test).
 *
 * Each of the three maps is capped at {@link MEMO_CAPACITY} and flushed when
 * it overflows — see that constant for why that costs nothing but a memo miss.
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
    if (this.byKey.size >= MEMO_CAPACITY) this.byKey.clear();
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
    if (this.unions.size >= MEMO_CAPACITY) this.unions.clear();
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
    if (this.subsumptions.size >= MEMO_CAPACITY) this.subsumptions.clear();
    this.subsumptions.set(key, result);
    return result;
  }

  /**
   * Coverage sets currently interned — never more than {@link MEMO_CAPACITY},
   * and it drops to 1 when the map flushes. Test/diagnostic only; it is a
   * gauge of the cache, not a count of the sets a session has produced.
   */
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
   *
   * `need` is a plain set rather than an interned {@link CoverageSet}, and
   * that is the point. The need is the *unquantized* render window, so it
   * changes at every scroll position rather than every quantum; interning it
   * to buy a memoized `subsumes` meant minting a set per position and a memo
   * entry per (band, position) pair — an `O(columns²/quantum)` structure with
   * no ceiling. Direct containment is ~30 `Set.has` calls per row per
   * reconcile, which is not a cost worth caching.
   */
  covers(index: number, need: ReadonlySet<string>): boolean {
    const held = this.coverage.get(index);
    if (held === undefined) return false;
    if (need.size > held.names.size) return false;
    for (const name of need) {
      if (!held.names.has(name)) return false;
    }
    return true;
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

  /**
   * Drop every stored column of row `index` that `keep` does not name.
   *
   * The column-axis counterpart of {@link delete}, and the only way to reclaim
   * from a block eviction may not touch. `TableBody` exempts the block the
   * viewport sits on, and a horizontal sweep pours the whole column axis into
   * exactly that block — 128 rows × 1,000 columns where the budget allows
   * 2,048 × ~100. Row eviction responds by deleting every *other* block and
   * still failing to meet the budget, which both leaves the overage in place
   * and throws away the vertical scroll-back cache `rowCacheRows` exists to
   * hold. Pruning back to the band a fresh fetch would have landed fixes both.
   *
   * Only names the row's own coverage claims are removed, so `__rowid__` — and
   * anything else outside coverage by construction — survives. A row already
   * within `keep` is untouched, coverage identity included, so the common case
   * costs one memoized `subsumes`.
   *
   * A row left covering **nothing** is deleted rather than kept as an empty
   * husk. An empty row still answers `has` and still occupies a key, but
   * contributes zero cells — so eviction, which ranks blocks by cell count,
   * would never reclaim it and the row map would grow for the session.
   *
   * Safe to call while iterating {@link keys}: `Map` iteration is defined
   * under deletion of the entry being visited.
   */
  prune(index: number, keep: CoverageSet): void {
    const held = this.coverage.get(index);
    if (held === undefined) return;
    if (this.interner.subsumes(keep, held)) return;
    const row = this.rows.get(index)!;
    const kept: string[] = [];
    for (const name of held.names) {
      if (keep.names.has(name)) kept.push(name);
      else delete row[name];
    }
    if (kept.length === 0) {
      this.delete(index);
      return;
    }
    const pruned = this.interner.intern(kept);
    this.coverage.set(index, pruned);
    this.cells += pruned.names.size - held.names.size;
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
