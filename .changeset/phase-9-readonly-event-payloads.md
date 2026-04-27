---
'@jeyabbalas/data-table': minor
---

Type tightening: `TableEvents` payload fields carrying mutable collections (`filterChange.filters`, `sortChange.sortColumns`, `selectionChange.selectedRows`, `columnChange.{visibleColumns, pinnedColumns, columnOrder}`, `derivedChange.derivedColumns`, `loadComplete.schema`) are now typed `readonly` / `ReadonlySet`. Phase 8 already cloned these at runtime; this completes the contract at the type level so handler-side mutation surfaces as `TS2540` instead of compiling silently. JavaScript consumers unaffected; TypeScript consumers that mutated the payload should clone via `.slice()` / `new Set(...)` at the destructuring point. See `docs/migration-guides/phase-9-readonly-event-payloads.md` for examples.
