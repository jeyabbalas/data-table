# 03 — Programmatic filters

Four external buttons add semantically meaningful filters to a 100 K-row NYC taxi dataset and the `filterChange` event drives an external row-count label.

## Run

```bash
npm run example
# open http://localhost:5173/03-programmatic-filters/
```

## API surface

- [`actions.addFilter`](../../docs/api-reference.md#filters) — typed discriminated-union filters (`set`, `range`)
- [`actions.addRawSQLFilter`](../../docs/api-reference.md#raw-sql-filters) — raw expression escape hatch
- [`actions.clearFilters`](../../docs/api-reference.md#filters)
- [`filterChange` event](../../docs/api-reference.md#event-catalog)

## Data

100,000 rows × 19 columns — [`tests/fixtures/datasets/csv/nyc_taxi.csv`](../../tests/fixtures/datasets/csv/nyc_taxi.csv).

## What to observe

1. **Paid by card** → `SetFilter` on `payment_type` with `values: [1]` (1 = credit card in the TLC codebook); the row count drops to card-only trips.
2. **Fare $10–$50** → `RangeFilter` on `fare_amount` with `min: 10, max: 50, maxInclusive: true`.
3. **Tip > 20%** → `addRawSQLFilter('tip_amount / NULLIF(fare_amount, 0) > 0.20', 'tip > 20%')` — this ratio isn't expressible as a typed filter, so the raw-SQL path is the right tool.
4. **Trip < 2 mi** → a second `RangeFilter` with `maxInclusive: false`, stacked on top of any filter above.
5. **Clear all** calls `actions.clearFilters()` which wipes typed filters AND the raw-SQL filter in one snapshot.
6. The console logs the full `filters` array each time so you can inspect the discriminated-union shape.
