# Filter presets

A *preset* is a named collection of filters (plus optional sort state) that
can be saved, loaded, renamed, deleted, exported to JSON, and imported
back. The built-in preset panel in the filter bar handles the common UI,
but the `FilterPresetManager` API is also directly accessible if you want
to drive it from your own UI.

## You'll learn how to

- Save the current filter state as a named preset
- Load, rename, and delete presets
- Export presets to JSON for sharing between users
- Import presets (including validation and error handling)
- Share presets across multiple tables

## Prerequisites

- Read: [Filters guide](./filters.md), [API reference — `FilterPresetManager`](../api-reference.md#filterpresetmanager)
- Runnable example: [`examples/10-filter-presets`](../../examples/10-filter-presets/)

## Minimal example

```ts
const preset = sharedPresets.save('Weekend trips', table.state.filters.get());
console.log('Saved preset:', preset.id);

// Later:
sharedPresets.load(preset.id, table.actions);
```

The built-in UI (a "Presets" button in the filter bar) covers the same
operations; reach for the API directly when you need custom UI or
automation.

## Accessing the manager

If you didn't pass a manager, `createDataTable` creates one internally.
You can pass your own to control its lifetime:

```ts
import { FilterPresetManager } from '@jeyabbalas/data-table';

const manager = new FilterPresetManager();

await createDataTable({
  container,
  source,
  presets: { manager },
});
```

Reach it via `manager.presets.subscribe(...)` for a reactive list, or the
convenience `manager.getPresets()`.

## Preset shape

```ts
interface FilterPreset {
  id: string;           // UUID
  name: string;
  description?: string;
  filters: SerializedFilter[];    // Dates wrapped as { __date__: ISO8601 }
  sortColumns?: SortColumn[];
  createdAt: number;    // Unix ms
  updatedAt: number;    // Unix ms
}
```

`filters` is stored in serialized form so the preset JSON-serializes
losslessly (Dates round-trip via the `__date__` wrapper). When loaded,
filters are deserialized back to live `Date` objects.

## CRUD

```ts
// Save
const preset = manager.save(
  'Weekend trips',
  table.state.filters.get(),
  table.state.sortColumns.get(),   // optional
  'Filters for weekend traffic',   // optional description
);

// Load — replaces current filters and optional sort, as one undo step
manager.load(preset.id, table.actions);

// Update — overwrite a preset's filters with the current state
manager.update(preset.id, table.state.filters.get());

// Rename
manager.rename(preset.id, 'Weekend analysis');

// Delete
manager.delete(preset.id);

// Replace all (rarely used; for session restore)
manager.loadPresets(arrayOfPresets);
```

A load applies via `actions.loadFilterPreset()`, which replaces the entire
filter list (and optionally sort) inside a single undo step. Ctrl/Cmd-Z
then restores the whole pre-load state, not filter by filter.

## Subscribing to changes

`manager.presets` is a `Signal<FilterPreset[]>`. Subscribe for reactive
UI:

```ts
const unsub = manager.presets.subscribe((presets) => {
  renderPresetList(presets);
});

// unsub() when done
```

Reading once:

```ts
const all = manager.getPresets();   // FilterPreset[]
```

## Export to JSON

```ts
const json = manager.exportToJSON();
// { "version": 1, "presets": [ { id, name, filters, … }, … ] }

const blob = new Blob([json], { type: 'application/json' });
const url = URL.createObjectURL(blob);

const a = document.createElement('a');
a.href = url;
a.download = 'presets.json';
a.click();
URL.revokeObjectURL(url);
```

The exported object is stable JSON — 2-space indented for readability,
`version: 1` at the top for future compatibility.

## Import from JSON

```ts
const fileInput = document.getElementById('preset-file') as HTMLInputElement;
fileInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const json = await file.text();
  const { imported, errors } = manager.importFromJSON(json);
  console.log(`Imported ${imported} presets`);
  for (const err of errors) console.warn(err);
});
```

`importFromJSON` returns `{ imported: number, errors: string[] }`. Key
behaviors:

- **Validation.** Rejects invalid JSON, missing `version`, non-array `presets`, malformed entries. Each problem surfaces in `errors` as a descriptive string.
- **Per-filter validation.** Each filter's `type` must be one of the known discriminants; required fields are checked per type (e.g., `range` needs `min` and `max`).
- **New IDs assigned on import.** Imported presets get new UUIDs to avoid collisions with existing ones.
- **Partial success OK.** A preset with some invalid filters is imported with those filters skipped and an error logged. A preset with *zero* valid filters is rejected entirely.
- **Unknown filter types are silently dropped.** If a future library version adds a new filter type and you import a preset with it from a newer export, the unknown filter is skipped rather than failing the whole import. That's deliberate for forward compatibility.

## Presets across multiple tables

A single `FilterPresetManager` can back any number of tables. A preset
saved while working with table A is visible to table B's preset panel; if
the target table has the referenced columns, the preset loads fine. If
it doesn't, the filters still apply (the underlying `addFilter` accepts
any column name), but they'll match zero rows.

```ts
const shared = new FilterPresetManager();
const trips = await createDataTable({ …, presets: { manager: shared } });
const users = await createDataTable({ …, presets: { manager: shared } });
```

See [multi-table guide](./multi-table.md) for the full pattern.

## Persistence

Presets are *not* auto-persisted by the `FilterPresetManager` itself —
they live in a memory signal. However, session persistence (IndexedDB) does
store filter presets as part of the session snapshot, so they survive
page reloads. The flow:

1. User saves a preset → `FilterPresetManager` updates its signal
2. AutoSave debounces and writes a `SessionSnapshot` (including `filterPresets`) to IDB
3. On next mount, `createDataTable` reads the snapshot and calls `manager.loadPresets(snapshot.filterPresets)`

If you've disabled session persistence (`persistence: false`), presets
don't survive reloads unless you export them yourself.

## Recipes

### Prompt the user for a preset name

```ts
const btn = document.getElementById('save-preset')!;
btn.addEventListener('click', () => {
  const name = prompt('Preset name:');
  if (!name) return;
  manager.save(name, table.state.filters.get(), table.state.sortColumns.get());
});
```

### Share a preset link via URL

```ts
// Sharing:
const preset = manager.save('Shared', table.state.filters.get());
const singleJson = JSON.stringify({ version: 1, presets: [preset] });
const url = `${location.origin}?preset=${encodeURIComponent(btoa(singleJson))}`;
navigator.clipboard.writeText(url);

// On the receiving page:
const params = new URLSearchParams(location.search);
const encoded = params.get('preset');
if (encoded) {
  const { imported } = manager.importFromJSON(atob(encoded));
  if (imported > 0) {
    const latest = manager.getPresets().at(-1)!;
    manager.load(latest.id, table.actions);
  }
}
```

### Build your own preset list UI

```ts
const listEl = document.getElementById('presets')!;

manager.presets.subscribe((presets) => {
  listEl.innerHTML = '';
  for (const p of presets) {
    const li = document.createElement('li');
    li.textContent = p.name;
    li.addEventListener('click', () => manager.load(p.id, table.actions));
    listEl.appendChild(li);
  }
});
```

## Gotchas

- **`save()` throws on empty name.** A name trimmed to empty string is rejected with `ConfigurationError`.
- **`rename()` on empty name is a no-op.** Unlike `save`, rename silently skips — the built-in panel uses this to avoid accidentally clearing names.
- **Loading a preset clears all existing filters.** It's a replace, not a merge. If you want to merge, read the preset's filters and call `addFilter` per entry yourself.
- **Presets don't track which table saved them.** If you save in one table and load in another, no compatibility check is done. Encode the source table in the preset name, or wrap `load` in your own guard.
- **Import assigns fresh UUIDs.** A preset exported with id `abc` becomes a preset with id `xyz` after import. Don't rely on ID stability across sessions.
- **Session persistence-disabled mode.** Presets evaporate on reload unless you export them. The preset panel's "Export" button is your friend.
- **Large preset collections.** `exportToJSON()` stringifies the entire list; a hundred presets with complex filters can run to kilobytes. That's fine for sharing; it's just worth knowing for quota-conscious IDB storage.

## Related

- Filters: [Filters guide](./filters.md) for the seven filter types each preset contains
- Multi-table: [Multi-table dashboards](./multi-table.md) for shared preset patterns
- Session persistence: [Session persistence guide](./session-persistence.md) for how presets survive reloads
- API reference: [`FilterPresetManager`](../api-reference.md#filterpresetmanager)
- Source: `src/filters/FilterPresets.ts:1-243`
