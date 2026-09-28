---
'@jeyabbalas/data-table': patch
---

### Fixed

- Derived-column changes no longer interfere when one starts before another has landed. Adds, edits, replacements and removals, `undo`, `redo`, `resetToInitial` and `loadData` now run one at a time, in call order, and each validates against the columns the one before it left. Previously a removal landing while a vector add was still inserting could leave `state.tableName` naming a VIEW not yet created, an edit could drop a column added while it ran from `state.schema`, and an undo pressed during an add undid the entry below it.
- An undo pressed while an add runs now waits for the add and undoes it. An edit made while a derived-column change runs, such as a filter added during a slow vector add, keeps its own undo entry.
- A derived-column change, undo, redo or reset that is still waiting or running when `loadData` is called no longer applies to the new data. An add or update resolves `{ success: false }`, a replacement resolves a `NOT_FOUND` error, a removal rejects with one, and an undo, redo or reset resolves `false`. `loadData` also waits for the previous data's derived-column tables to be dropped before it resolves.

### Changed

- A second add of a name that an earlier add is still adding now waits for that add and gets `Column name "X" already exists`, instead of `is already being added` at once. The same applies to a rename to that name.
