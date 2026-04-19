# 05 — Event listeners

The side panel flows in both directions: **Observe** reflects table state via `on('filterChange' | 'sortChange' | 'selectionChange')`, and **Drive** mutates table state via `actions.*` methods — any Drive click immediately updates the corresponding Observe pane.

## Run

```bash
npm run example
# open http://localhost:5173/05-event-listeners/
```

## API surface

- [`DataTable.on / .off`](../../docs/api-reference.md#datatable-interface) — returns an unsubscribe function
- [`filterChange`, `sortChange`, `selectionChange`](../../docs/api-reference.md#event-catalog)
- [`actions.addFilter`, `.clearFilters`, `.setSort`, `.clearSelection`](../../docs/api-reference.md#state-actions)
- [`state.selectedRows`](../../docs/api-reference.md#state-signals) — direct signal write

## Data

891 rows × 12 columns — [`tests/fixtures/datasets/csv/titanic.csv`](../../tests/fixtures/datasets/csv/titanic.csv).

## What to observe

1. **Observe pane** — interact with the table itself (sort a header, open a filter chip, shift-click rows) and the three labels update on the same tick.
2. **Drive pane** — click any of the four buttons; the table re-renders AND the matching Observe label refreshes because each `actions.*` call goes through the same signal that fires the public event.
3. The unsubscribe functions returned from `on()` are captured in the `unsubs` array and called on `beforeunload`. Always tear down listeners paired with any `destroy()` call.
4. `state.selectedRows.set(...)` is the low-level write for selections; `actions.clearSelection()` and `.selectAll()` are the canonical helpers for common cases.
