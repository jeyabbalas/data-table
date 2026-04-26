# Migration: Phase 5 — `FilterPresetManager` enforces unique preset names

> Phase 5 of the pre-1.0 review locks the management layer for filters and
> derived columns. One consumer-visible change: `FilterPresetManager.save`
> and `.rename` now reject duplicate preset names with a typed error. The
> `importFromJSON` channel keeps importing — duplicates within an import or
> against the existing collection are skipped and reported on the
> `errors[]` channel rather than throwing.

**Released:** 2026-04-26 (`@jeyabbalas/data-table` next patch)
**Affected versions:** consumers calling `FilterPresetManager.save` /
`.rename` with names they don't pre-check for collisions.
**Migration difficulty:** trivial — wrap the call in a `try/catch`, or
read `getPresets()` first and pick a unique name.

## Summary

Before Phase 5 the manager allowed two presets to coexist with the same
display name; the underlying ids stayed unique (UUID v4). The behavior
matched a `Map.set` on `id`, not on `name`. Browsing the preset list in
the UI, a user would see two identically-named entries and could not tell
them apart.

After Phase 5 the manager enforces name uniqueness within an instance:

- `save(name, filters, …)` throws
  `ConfigurationError({ code: 'PRESET_DUPLICATE_NAME', details: { name } })`
  when another preset already uses the trimmed name.
- `rename(id, newName)` throws the same error when the new name belongs
  to a different preset. Renaming a preset to its own current name is a
  no-op (no error, no signal write).
- `importFromJSON(json)` continues to return `{ imported, errors[] }`.
  Duplicates against the existing collection or duplicates within the
  imported file are skipped with an entry like
  `Preset 3: name "My filter" already exists; skipped`. The successful
  imports still land in the manager.

The trimmed-name comparison is case- and whitespace-sensitive. `"My filter"`
and `"  My filter  "` are treated as the same name once trimmed; `"My filter"`
and `"my filter"` are distinct.

## Migration

If your code calls `save` / `rename` with user-supplied names, wrap the
call:

```ts
import { FilterPresetManager, ConfigurationError } from '@jeyabbalas/data-table';

const manager = new FilterPresetManager();

try {
  manager.save(userName, currentFilters);
} catch (err) {
  if (err instanceof ConfigurationError && err.code === 'PRESET_DUPLICATE_NAME') {
    showInlineError(`A preset named "${err.details!['name']}" already exists. Pick another name.`);
    return;
  }
  throw err;
}
```

Or pre-check the name yourself:

```ts
if (manager.getPresets().some((p) => p.name === userName.trim())) {
  showInlineError(`A preset named "${userName.trim()}" already exists.`);
  return;
}
manager.save(userName, currentFilters);
```

## Non-breaking import contract

`importFromJSON` does not throw on duplicates — bulk import was always
best-effort, and that contract is preserved. Inspect `result.errors`
when you need to surface skipped entries:

```ts
const result = manager.importFromJSON(jsonText);
if (result.errors.length > 0) {
  console.warn('Skipped entries:', result.errors);
}
showImportSummary(`${result.imported} preset(s) imported.`);
```

## Verification checklist

- [ ] `try/catch` wraps every direct `save` / `rename` call site that
      passes user input.
- [ ] Import paths surface `result.errors` (or at least log it) so users
      see why a preset was skipped.
- [ ] Tests covering `save` / `rename` collision behavior live in
      `tests/filters/FilterPresets.test.ts` (Phase 5 block).

## See also

- [`docs/troubleshooting.md`](../troubleshooting.md) — `PRESET_DUPLICATE_NAME` row.
- [Migration guides index](./README.md)
