---
'@jeyabbalas/data-table': patch
---

Persistence, annotations, and export hardening (review-plan Phase 7).

- `coerceLoadedSnapshot` in `src/persistence/SessionStore.ts` now rejects
  snapshots whose `version` is not an integer in `[1, SNAPSHOT_VERSION]`.
  Future-version blobs (e.g., `version: 6` from a newer library that wrote
  the IDB row before a downgrade) load as `null` so the table boots fresh
  rather than risk misinterpreting unknown fields. Pre-1.0 clean break:
  no migration framework. See
  `docs/migration-guides/phase-7-snapshot-version-policy.md`.
- `AutoSave` latches a one-shot quota circuit-breaker on the first
  `PERSISTENCE_QUOTA_EXCEEDED` error. Subsequent debounced saves become
  no-ops until `enable()` is re-entered (the canonical reset is
  `actions.clearSession()`'s built-in `disable()` → `enable()` cycle).
  Consumers see exactly one `onError` per quota episode instead of one
  per state mutation. Non-quota errors (`SAVE_FAILED`) are NOT latched.
  See `docs/migration-guides/phase-7-autosave-quota-circuit-breaker.md`.
- Vector value pool dedup is documented as **reference-identity, not
  content-hash**. New JSDoc on `PooledVectorColumnRef` /
  `VectorValuePoolEntry` makes the contract explicit, and a new
  regression test in `tests/persistence/serialization.test.ts` locks
  the semantic (two structurally-identical-but-distinct arrays produce
  two pool entries; same array reference across stack entries shares
  one entry).
- New tests: `~65 cases across 4 new files + 6 extensions` covering
  snapshot version policy (12), AutoSave quota circuit-breaker (8),
  vector pool reference-identity (2), DateWrapper timezone stability
  (6), AnnotationStore tableName Signal binding (6), CSV
  formula-injection prefixes (=, +, -, @, \t, \r — 11), Parquet
  round-trip via real DuckDB (5 cases, mixed types + scope variants),
  ExportDialog system-columns toggle (4), JSON BigInt + Date round-trip
  through `JSON.parse` (5), Clipboard format / size invariants (3), and
  CSV `__rowid__` end-to-end with BIGINT decimal-string formatting (3).
- Strict-TS slice cleanup for `src/persistence/` and `src/annotations/`
  (Phase 0 §11): `noPropertyAccessFromIndexSignature` and
  `noUncheckedIndexedAccess` are clean for these two slices. Both
  flags remain disabled globally; the remaining slices land in
  Phases 8 / 9.
- Documentation: cross-tab race (last-writer-wins, no
  `BroadcastChannel`), AutoSave quota circuit-breaker behaviour,
  snapshot version-policy contract added to
  `docs/guides/session-persistence.md`.
- JSDoc: clarified the BigInt safe-vs-unsafe coercion in `JSONExport`
  and the no-size-precheck contract on `Clipboard.copyToClipboard`.
