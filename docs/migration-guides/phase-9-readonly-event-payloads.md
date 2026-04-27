# Phase 9 — `TableEvents` payload arrays / Sets are now `readonly`

**Status:** Landing in `0.2.0`.
**Affects:** TypeScript consumers compiling against `@jeyabbalas/data-table`'s `.d.ts`. Runtime behavior is unchanged.

## What changed

Phase 8 made every `TableEvents` payload field carrying a mutable collection an independent shallow copy at emit time. Handlers that pushed into `filters` / `selectedRows` / `visibleColumns` / etc. could no longer corrupt the live state signal — but the type still said `Filter[]` / `Set<number>` / `string[]`, so TypeScript happily compiled handlers that intended to mutate.

Phase 9 closes that gap. The following payload fields are now `readonly`:

| Event             | Field            | Old type             | New type                      |
| ----------------- | ---------------- | -------------------- | ----------------------------- |
| `loadComplete`    | `schema`         | `ColumnSchema[]`     | `readonly ColumnSchema[]`     |
| `filterChange`    | `filters`        | `Filter[]`           | `readonly Filter[]`           |
| `sortChange`      | `sortColumns`    | `SortColumn[]`       | `readonly SortColumn[]`       |
| `selectionChange` | `selectedRows`   | `Set<number>`        | `ReadonlySet<number>`         |
| `columnChange`    | `visibleColumns` | `string[]`           | `readonly string[]`           |
| `columnChange`    | `pinnedColumns`  | `string[]`           | `readonly string[]`           |
| `columnChange`    | `columnOrder`    | `string[]`           | `readonly string[]`           |
| `derivedChange`   | `derivedColumns` | `DerivedColumnDef[]` | `readonly DerivedColumnDef[]` |

Item identity inside the collection is unchanged — items are still typed as their original interfaces (`Filter`, `SortColumn`, `ColumnSchema`, …). The contract is **the collection is yours; the items inside are still shared, treat them read-only**.

## Who is affected

**No change required** if your handlers only read from the payload:

```ts
table.on('filterChange', ({ filters, filteredRowCount }) => {
  console.log(`${filters.length} active filters, ${filteredRowCount} rows match`);
  for (const f of filters) console.log(f.column, f.type);
});
```

**TS2540 errors** if you destructured-and-mutated (the corruption Phase 8 fixed at runtime):

```ts
table.on('filterChange', ({ filters }) => {
  filters.push({ type: 'point', column: 'x', value: 1 }); // ❌ TS2540: 'push' does not exist on 'readonly Filter[]'
  filters.length = 0; // ❌ TS2540
});
```

If you need a mutable copy at the consumer, clone explicitly:

```ts
table.on('filterChange', ({ filters }) => {
  const mutable = filters.slice(); // or: [...filters]
  mutable.push({ type: 'point', column: 'x', value: 1 }); // ✓ Local mutation, doesn't reach state
});

table.on('selectionChange', ({ selectedRows }) => {
  const mutable = new Set(selectedRows); // ReadonlySet<T> → Set<T>
  mutable.add(99); // ✓
});

table.on('derivedChange', ({ derivedColumns }) => {
  const sorted = derivedColumns.toSorted((a, b) => a.name.localeCompare(b.name)); // ✓ ES2023
  // or: [...derivedColumns].sort(...)
});
```

## Why now

Phase 8 introduced the runtime clone but deferred the type tightening to avoid forcing TS2540 on consumer code under strict mode. With the cumulative consumer base still pre-1.0, Phase 9 lands the type contract before the 1.0 cut. Consumers compiling against `0.1.x` upgrading to `0.2.0` see one `tsc` pass; the fix is mechanical (`.slice()` or `new Set(...)` / `new Map(...)` at the destructuring point).

## Verification

If you have a JavaScript consumer (no TypeScript), nothing changes — `readonly` is a compile-time-only marker.

If you have a TypeScript consumer, run `tsc` against your code after upgrading. Any handler that previously mutated a payload field will surface a TS2540 error at the mutation site. Apply the `.slice()` / `new Set()` / `new Map()` fix above.

## Related

- Phase 8 — `phase-8-event-payload-immutability.md` (the runtime clone that paired with this contract).
- `src/core/TableEvents.ts` — type definitions.
- `src/DataTable.ts:865-908` — emit-site clones (Phase 8).
- `src/core/Actions.ts:emitDerivedChange` — emit-site clone for derived columns (Phase 8).
