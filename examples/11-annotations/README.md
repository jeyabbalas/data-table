# 11 — Annotations

Programmatic row / column / cell annotations: their tints and popover, a
severity filter, JSON round-trip, persistence with the session, and, at
scale, 100,000 annotations at a click, navigation from one to the next, the
annotated rows alone, and an issue list that takes the user to each error.

## Run

```bash
npm run dev
```

Then navigate to `examples/` and click **11 — Annotations**.

## API surface

- `table.annotations.add(ann)` — add one annotation, returns the stored copy.
- `table.annotations.addMany(anns)` — atomic batch add, one `change` event.
- `table.annotations.update(id, patch)` — `id`, `scope`, `rowId` and `column`
  are immutable: changing one throws.
- `table.annotations.remove(id)` / `removeMany(ids)` / `clear(scope?)`.
- `table.annotations.getByRow(rowId)` / `getByColumn(column)` — a row's or a
  column's own annotations and its cells'.
- `table.annotations.getByCell(rowId, column)` — the exact intersection: the
  row's row annotations, the column's column annotations and that cell's own,
  sorted by severity, then `createdAt`, then insertion order.
- `table.annotations.setSeverityFilter(flags)` — hide a severity's tints,
  popover entries and navigation stops without changing the store.
- `table.annotations.toJSON()` / `loadJSON(file, mode?)` — round-trip preserves
  unknown top-level and per-annotation fields.
- `table.annotations.on('change', handler)` — one event per mutation that
  changes something, batches included, with the affected annotations.
- `table.actions.nextAnnotation()` / `previousAnnotation()` — what `F8` /
  `Shift+F8` (`Alt+↓` / `Alt+↑`) run.
- `table.actions.revealRow(rowId, column?)` — scroll a row into view and put
  the cursor on it.
- `table.actions.showAnnotatedRows()` / `hideAnnotatedRows()` — show only the
  rows with annotations, as a filter.

## Data

Same `nyc_taxi.parquet` fixture as example 10, 100,000 rows × 19 columns
(`tableName: 'nyc_taxi_annotations'` to avoid colliding with that example's
saved session).

## What to observe

1. **Scenarios A–E** each clear the store and add a set of annotations: a row,
   a column, a cell, three meeting at one cell, and three of each scope piled
   on one cell. Hover the tinted cells and headers: the popover lists them by
   scope, Row, Column and Cell, most severe first.
2. **Add 100,000 annotations** adds them in one `addMany`, 90% on cells, 9% on
   rows and 1% on columns, and says how long it took. Scroll, sort and filter
   afterwards; click it again for more. A popover lists five annotations per
   section and counts the rest ("+3 more").
3. **Navigate.** Click in the table and press `F8` and `Shift+F8`, or use
   **Next** and **Previous**: the cursor goes to the next annotated cell in the
   view as filtered and sorted, the row scrolls to the middle, and the live
   region reads the annotation out. Past the last one it goes round to the
   first.
4. **Show only the annotated rows** adds an annotated filter, with its chip in
   the filter bar. Add annotations or clear the store while it is on: when the
   rows it keeps change, the view refreshes in place, keeping the scroll
   position, and the cursor follows its row.
5. **Errors** lists the first 20 errors on rows and cells. Click one:
   `revealRow` scrolls its row into view and puts the cursor on its cell, or
   says the filters hide it.
6. **Severity filter** hides a severity's tints, leaves it out of the popover
   ("N hidden by the severity filter") and out of `F8`'s stops. The store, the
   lookups and the annotated rows stay as they are.
7. **Download JSON → edit → Load JSON** replaces the store: one `cleared`, then
   one `added` event.
8. **Reload the browser** — annotations come back with the session, from the
   `dt-annotations` database. A sort or a filter change saves the session
   without writing them again; they are written when they change.
9. **Clear all** vs **Clear session + reload** — `Clear all` empties the store;
   the next save deletes the annotations' record, so a reload restores none,
   while filters, sort and presets stay. `Clear session + reload` also deletes
   the session, resets filters, sort, presets and undo, and loads the file
   again so the grid stays interactive.

## Why

Both downstream apps (harmonization, data-quality control) need overlay
metadata that doesn't participate in undo/redo, survives reloads, round-trips
cleanly to and from app-owned JSON, and stays fast when a validator reports
on every row: the library is tested with a million annotations. See the
[annotations guide](../../docs/guides/annotations.md).

### `rowId` is a `number` in JSON

When the app needs the real `__rowid__` value, call
`table.actions.getColumnValues('__rowid__')`. That returns a `BigInt64Array`;
convert with `Number(rowIds[i])` before passing to `add({ rowId: ... })`.
Practical row counts stay well under `2⁵³`. `revealRow` takes either.

## See also

For column-header tooltips (a structured popover anchored on the
column-name span), see **example 12 — Column header tooltips**. The two
features are independent: a column may have both an annotation overlay
and a tooltip popover visible at once.
