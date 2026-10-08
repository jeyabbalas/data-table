---
'@jeyabbalas/data-table': patch
---

Derived-column changes, `undo`, `redo`, `resetToInitial` and `loadData` run one at a time, in call order, so one started before another has landed no longer interferes with it.

**Fixed**

- Derived-column changes no longer interfere when one starts before another has landed. Adds, edits, replacements and removals, `undo`, `redo`, `resetToInitial` and `loadData` now run one at a time, in call order, and each validates against the columns the one before it left. Previously a removal landing while a vector add was still inserting could leave `state.tableName` naming a VIEW not yet created, an edit could drop a column added while it ran from `state.schema`, and an undo pressed during an add undid the entry below it.
- An undo pressed while an add runs now waits for the add and undoes it. An edit made while a derived-column change runs, such as a filter added during a slow vector add, keeps its own undo entry.
- A derived-column change, undo, redo or reset that is still waiting or running when `loadData` or `clearSession` is called no longer applies to the new or emptied table. An add or update resolves `{ success: false }`, a replacement resolves a `NOT_FOUND` error, a removal rejects with one, and an undo, redo or reset resolves `false`. `loadData` also waits for the previous data's derived-column tables to be dropped before it resolves, and `clearSession` now drops them too.
- An `undo`, `redo` or `resetToInitial` called while a load is under way now resolves `false` instead of acting on the session the load restores.

**Changed**

- A second add of a name that an earlier add is still adding now waits for that add and gets `Column name "X" already exists`. The same applies to a rename to that name.
