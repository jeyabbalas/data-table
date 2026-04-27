# Phase 8 — Event payload immutability (defensive shallow clones)

**Status:** behavior change, no public-API rename or runtime symbol move,
no `tests/api-surface.*.test.ts` snapshot drift.

## What changed

Before Phase 8, every `TableEvents` payload field that carried a mutable
collection — `Filter[]`, `SortColumn[]`, `Set<number>`, `string[]`,
`DerivedColumnDef[]` — was the **same reference** the underlying signal
stored. The dispatch sites at `src/DataTable.ts:865-908` and
`src/core/Actions.ts:emitDerivedChange` handed back
`state.<signal>.get()` directly. A handler doing
`handler({ filters }) { filters.push(newFilter) }` would mutate the live
signal value, silently corrupting subsequent reads of
`state.filters.get()`.

After Phase 8, every emit allocates a fresh shallow copy:

| Event             | Field                                              | Clone                                          |
| ----------------- | -------------------------------------------------- | ---------------------------------------------- |
| `filterChange`    | `filters`                                          | `[...filters]`                                 |
| `sortChange`      | `sortColumns`                                      | `[...sortColumns]`                             |
| `selectionChange` | `selectedRows`                                     | `new Set(selectedRows)`                        |
| `columnChange`    | `visibleColumns` / `pinnedColumns` / `columnOrder` | spread each                                    |
| `derivedChange`   | `derivedColumns`                                   | spread at the `Actions.emitDerivedChange` site |

Item identity inside the collection is **not** deep-cloned. The contract
is "the collection is yours; the items inside are still shared, treat
them as read-only." For example, mutating `filters[0].column` from a
handler still corrupts state (and is unsupported); pushing `newFilter`
into the cloned `filters` array does not.

## Why

This was deferred from Phase 3 — the original audit flagged the
references as a contract leak, but the fix lives in the dispatch layer
that Phase 8 owns (rendering + facade plumbing). Every Phase between
3 and 7 inherited the leak silently. Two practical scenarios surfaced
the cost:

1. **React `useState` adapters.** Patterns like
   `table.on('filterChange', ({ filters }) => setFilters(filters))`
   pass the live array straight into React state. Subsequent React
   internal mutations to the captured array (e.g., a downstream effect
   that calls `setFilters((prev) => [...prev, newFilter])`) are safe,
   but a custom adapter that resorts to `array.sort()` or `array.push()`
   in-place — common in dashboards that group filters by column — would
   clobber `state.filters` mid-emission.
2. **Set-typed selection in legacy code.** `selectionChange.selectedRows`
   was a `Set<number>` and consumers occasionally called `.delete(id)`
   from a handler to "fix up" a stale selection. The mutation reached
   the live signal and the signal's next emit observed the partial set.

The fix is a four-line change at the emit site that removes the entire
class of bug for negligible allocation cost.

## Performance note

Each emit now allocates a fresh array (or `Set`) of length N where N is
the field's size. For `filterChange` / `sortChange` / `columnChange` /
`derivedChange` this fires ≤ a handful of times per user interaction
and the arrays are short (≤ a dozen entries typically). For
`selectionChange` the `Set` clone runs on every selection mutation —
including shift-click range-select, where the user may sweep through
hundreds of rows. Each clone is `O(N)` in the selection size; for a
1000-row sweep that's 1000 micro-allocations of varying size summing
to ~500 ms of wall-clock work in a worst-case profile (1000 emits × ~500
ns each on a modern laptop). Below the threshold of perceptible UI lag
in our benchmarks; document for the record.

If a future profile shows this is hot, the cheap mitigation is to
debounce `selectionChange` (e.g., `requestAnimationFrame`-trailing) at
the dispatcher — outside this migration's scope.

## Affected behavior for consumers

**Before:**

```ts
table.on('filterChange', ({ filters }) => {
  // BUG: pushes into state.filters!
  filters.push({ type: 'point', column: 'audit', value: '*' });
});

// Later read returns the mutated array.
table.state.filters.get(); // includes the synthetic 'audit' filter
```

**After:**

```ts
table.on('filterChange', ({ filters }) => {
  // Mutates the local copy only.
  filters.push({ type: 'point', column: 'audit', value: '*' });
});

table.state.filters.get(); // unchanged
```

Read-only consumers (the overwhelming majority — destructure, log,
forward to React/Vue/Svelte state) see **no change in behavior**.
Adapter code that opportunistically mutated the payload was always
unsupported; it stops corrupting state silently.

## What's locked

`tests/core/eventPayloadImmutability.test.ts` (9 cases) covers each
event's payload field, double-emit independence, and selection-Set
identity. Suites continue to pass on the 3300+ existing cases unchanged.

## What's NOT included (deferred to Phase 9)

The runtime clone is **paired with a deferred type-tightening**:
`TableEvents` still declares `Filter[]` / `Set<number>` / `string[]` /
`DerivedColumnDef[]` (mutable types). Phase 9 will add `readonly`
markers on these fields and an `Object.freeze` dev-build guard, after
this migration has shipped and consumers have had a release cycle to
spot any residual mutations.

`loadComplete.schema` (`ColumnSchema[]`) is also a live signal value
today; that hardening is bundled into the Phase 9 review of remaining
mutable-payload fields. The leak is lower-impact (the schema is
consumed once per load, primarily by `TableContainer` rendering).

## What you should do

- **Nothing** if your handlers don't mutate the payload (the common
  case).
- **Audit** any handler that calls `.push()`, `.splice()`, `.sort()`,
  `.delete()`, `.add()`, `.clear()`, etc. on a payload field; its
  effect on state is now silently dropped (which was the intended
  behavior — the corruption was the bug).
- **Forward to immutable state stores as before**; the clone protects
  you, but a downstream `setFilters([...filters])` is still the
  recommended pattern for React / Vue / Svelte / Solid.
