---
'@jeyabbalas/data-table': patch
---

Fix: `loadData` and `clearSession` no longer leak per-dataset session state across dataset switches or shared preset managers.

- `loadData` now clears the owned filter-preset manager, the annotation store, and the bridge query cache before loading the new dataset. The next snapshot persisted by `AutoSave` therefore reflects only the current dataset, not state inherited from whichever dataset was loaded previously.
- `clearSession` now only clears `FilterPresetManager` instances created by the library itself. User-supplied managers passed via `presets: { manager }` (multi-table dashboards) are left untouched, since wiping them would destroy the other tables' presets.
- A single table that uses the default `presets: true` is unaffected by the second change — its manager is owned, so `clearSession` keeps clearing it as before.

Symptom this fixes: in a single-table app, saving a filter preset on dataset A and then loading dataset B left A's preset visible on B. After this change, the preset list resets between datasets, while session-restore on the same dataset (matching `tableName`) still re-populates it from the saved snapshot.
