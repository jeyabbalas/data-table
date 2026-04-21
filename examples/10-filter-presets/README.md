# 10 — Filter presets

Save the current filter state as a named preset, export all presets to a
JSON file, and import presets back from JSON.

## Run

```bash
npm run dev
# open http://localhost:5173/data-table/examples/10-filter-presets/
```

## API surface

- [`FilterPresetManager.save`](../../docs/api-reference.md#filterpresetmanager) — persist the current filters under a name
- [`FilterPresetManager.load`](../../docs/api-reference.md#filterpresetmanager) — apply a preset atomically (one undo step)
- [`FilterPresetManager.exportToJSON`](../../docs/api-reference.md#filterpresetmanager) / [`importFromJSON`](../../docs/api-reference.md#filterpresetmanager) — share presets across sessions or users
- [`presets.subscribe`](../../docs/api-reference.md#filterpresetmanager) — reactive list of presets for custom UI

## Data

100,000 rows × 19 columns — [`tests/fixtures/datasets/csv/nyc_taxi.csv`](../../tests/fixtures/datasets/csv/nyc_taxi.csv).

## What to observe

1. **Apply some filters** — use the filter bar or click in histograms / value-counts lists.
2. **Save current filters** — prompts for a name; `save()` captures a `FilterPreset` with the current filters and sort.
3. **Load latest preset** — applies the most recently saved preset via `load()`. This calls `actions.loadFilterPreset()` which replaces filters (and sort) in one undo step — Cmd/Ctrl-Z restores the previous filter state atomically.
4. **Export JSON** — downloads `presets.json` with `{ version: 1, presets: [...] }`. Dates in filters are wrapped as `{ __date__: ISO8601 }` for lossless round-trip.
5. **Import JSON** — pick the file you exported (or a friend's export). Imported presets receive fresh UUIDs, so ID stability isn't relied on across sessions. Invalid filters are skipped with errors logged; malformed JSON is rejected.
6. **Clear filters** — only clears active filters, not the saved presets.

## Related

- Filter presets guide: [docs/guides/filter-presets.md](../../docs/guides/filter-presets.md)
- Filters guide: [docs/guides/filters.md](../../docs/guides/filters.md)
- Multi-table guide: [docs/guides/multi-table.md](../../docs/guides/multi-table.md) for patterns sharing presets across tables
