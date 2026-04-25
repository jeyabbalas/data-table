# 11 — Annotations (data layer)

Programmatic row / column / cell annotation CRUD, JSON round-trip, and
auto-persistence via IndexedDB. No visual rendering in this phase — the
Phase 4 example will add CSS classes + a popover on top.

## Run

```bash
npm run dev
```

Then navigate to `examples/` and click **11 — Annotations**.

## API surface

- `table.annotations.add(ann)` — add one annotation, returns the stored copy.
- `table.annotations.addMany(anns)` — atomic batch add.
- `table.annotations.update(id, patch)` — `scope`, `rowId`, `column` are immutable.
- `table.annotations.remove(id)` / `removeMany(ids)` / `clear(scope?)`.
- `table.annotations.getByRow(rowId)` / `getByColumn(column)`.
- `table.annotations.getByCell(rowId, column)` — row + column + cell union,
  sorted by severity then `createdAt` then insertion order.
- `table.annotations.toJSON()` / `loadJSON(file, mode?)` — round-trip preserves
  unknown top-level and per-annotation fields.
- `table.annotations.on('change', handler)` — one event per mutation, including
  batched calls.

## Data

Same `nyc_taxi.csv` fixture as example 10 (`tableName: 'nyc_taxi_annotations'`
to avoid colliding with that example's saved session).

## What to observe

1. Clicking any "Add" button updates the JSON viewer and event log
   synchronously (one `change` event per click).
2. "Add 100 random" produces a **single** event (batched) and is instant even
   with the viewer re-rendering every time.
3. Download → edit the message in the file → Load → the edit appears in the
   viewer; the event log shows a single `added` event.
4. Reload the browser — annotations persist (IndexedDB / `SessionSnapshot` v5).
5. Filter / sort the grid — annotations are not touched (they live outside
   `TableState`; no cross-talk with undo/redo or filter signals).
6. **Clear all** vs **Clear session + reload** — `Clear all` empties the
   annotation store in memory; AutoSave persists the empty state, so a
   reload reads an IDB snapshot with `annotations: []` but filters / sort /
   presets are retained. `Clear session + reload` additionally deletes the
   IDB row, resets filters / sort / presets / undo, and re-fetches the CSV
   so the grid stays interactive. Both produce a single `cleared`-kind
   change event.

## Why

Both downstream apps (harmonization, data-quality control) need overlay
metadata that doesn't participate in undo/redo, survives reloads, and round-
trips cleanly to and from app-owned JSON. The Phase 3 data layer is
intentionally visual-free so Phase 4 can layer CSS + a popover without
rewriting any of this.

### `rowId` is a `number` in JSON

When the app needs the real `__rowid__` value, call
`table.actions.getColumnValues('__rowid__')`. That returns a `BigInt64Array`;
convert with `Number(rowIds[i])` before passing to `add({ rowId: ... })`.
Practical row counts stay well under `2⁵³`.

## Phase 5 — Column header tooltips

The "Column header tooltips" section uses
`table.actions.setColumnHeaderTooltip(columnName, text | null)` to attach
an app-controlled native browser tooltip to the column-name span. Pass
`null` (or an empty string) to clear. Tooltips persist in the session
snapshot alongside `columnWidths`.

This is independent from annotation popovers (Phase 4): the popover
shows on hover of the entire header, while the native tooltip shows on
hover of the name span only. A column may have both at once — the
tooltip text on the span and the popover on the surrounding header.
