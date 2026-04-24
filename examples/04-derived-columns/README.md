# 04 — Derived columns

Add a SQL-evaluated **expression** column and a JS-materialized **vector** column on top of 100 K NYC taxi trips.

## Run

```bash
npm run dev
# open http://localhost:5173/data-table/examples/04-derived-columns/
```

## API surface

- [`actions.addDerivedColumn`](../../docs/api-reference.md#derived-columns) — `kind: 'expression'` and `kind: 'vector'`
- [`actions.replaceDerivedColumn`](../../docs/api-reference.md#derived-columns) — same-name replacement with dependency re-validation
- [`bridge.query`](../../docs/api-reference.md#tier-1-exports) — run an ad-hoc SELECT to drive the vector column
- [`derivedChange` event](../../docs/api-reference.md#event-catalog) — carries `kind: 'added' | 'removed' | 'updated' | 'replaced'`

## Data

100,000 rows × 19 columns — [`tests/fixtures/datasets/csv/nyc_taxi.csv`](../../tests/fixtures/datasets/csv/nyc_taxi.csv).

## What to observe

1. **Add expression: `tip_pct`** — `100 * tip_amount / NULLIF(fare_amount, 0)` is evaluated by DuckDB and appears at the right edge of the table. Because it's a DuckDB expression, it filters and sorts like a native column.
2. **Add vector: `is_airport`** — the example queries `PULocationID` from the worker, builds a `Uint8Array` flagging EWR/JFK/LGA pickups (TLC zones 1, 132, 138), and hands it to `addDerivedColumn`. Vector length mismatches emit `VECTOR_LENGTH_MISMATCH` on the `error` event.
3. **Add dependent: `tip_pct_flag`** — `tip_pct > 10` references the expression column above; exists to demonstrate what happens when a replacement would break a downstream column.
4. **Replace `tip_pct` (compatible)** — calls `actions.replaceDerivedColumn('tip_pct', ...)` with an expression whose result type still matches what `tip_pct_flag` needs. Values recompute; dependent keeps working.
5. **Replace `tip_pct` (incompatible)** — swaps to `CAST(tip_amount AS VARCHAR)`. The pre-flight catches that `tip_pct_flag` would fail (`> 10` on a VARCHAR) and the alert enumerates `dependentsAffected` with per-dependent reasons. The replace is rejected cleanly — no state change.
6. The `derivedChange` event fires after each add / replace / remove — the event-log panel shows the most recent payload including `kind`.

## When to reach for vector vs expression

- **Expression** — when the value is a pure function of other columns already loaded into DuckDB. Free: no JS round-trip, arbitrary filter/sort support.
- **Vector** — when the value comes from outside DuckDB: a JS-side ML model, an external API, or a geo/categorical lookup table that's easier to keep in memory than to import as a second DuckDB table. Stored as a typed array; length must equal `state.totalRows`.

## Gotcha — vector columns need `ORDER BY __rowid__`

If your vector values are sourced from a DuckDB query (e.g., `SELECT PULocationID FROM nyc_taxi` here), you **must** add `ORDER BY __rowid__` to that query. The `DerivedColumnManager` materializes the array into a helper table keyed by array index, then joins `base.__rowid__ = helper.__rowid__`. Without an explicit order, DuckDB may return rows in arbitrary scan order and the join silently misaligns — the derived column appears but every row is `NULL`. This is the single most common pitfall when building vector columns that depend on the loaded data.
