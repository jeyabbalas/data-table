---
'@jeyabbalas/data-table': patch
---

Phase 1 security audit: harden SQL/DOM/IndexedDB/export trust boundaries.

**XSS fixes**
- `TableContainer` fallback header (used by `/advanced` consumers without `actions`) no longer interpolates `colSchema.name`/`colSchema.type` into `innerHTML`; uses safe DOM construction.
- `DataTable` stats placeholders now escape `messages.statistics.rowCount` / `filteredRowCount` outputs before splicing into `innerHTML`, so consumer-overridden i18n functions can't inject markup.

**SQL hardening**
- `quoteIdentifier` rejects empty strings and embedded NUL bytes with `SQLValidationError({ code: 'INVALID_IDENTIFIER' })`; tightened JSDoc on Unicode handling.
- `formatSQLValue` emits `bigint` values as bare numeric literals (was previously falling through to a single-quoted string fallback).
- Trust-boundary JSDoc added to `Actions.addRawSQLFilter`, `RawSQLFilter.sql`, the `case 'raw-sql':` site, and the `pattern` `regex` mode comment.
- `filtersToWhereClause` JSDoc now states explicitly that callers must wrap the result in `WHERE (…)`.

**CSV / export**
- **Behavior change.** `exportToCSV` / `exportFromState` / `exportToClipboard` (CSV path) now neutralise cells whose first character is `=`, `+`, `-`, `@`, `\t`, or `\r` by prepending a single quote. Defuses CSV injection in Excel / LibreOffice / Google Sheets per OWASP guidance. Header-row column names go through the same escape. Consumers that pipe library-generated CSV directly into a non-spreadsheet tool will see the leading quote on those cells; remove it at your sink if needed.
- New `sanitizeFilenameStem` strips path separators, NUL/control characters, and leading dots from `setSourceName` / `getExportFilename` inputs; caps stem length at 100.

**Worker / IndexedDB**
- `WorkerBridge.handleMessage` validates inbound `MessageEvent` shape; malformed messages are dropped with a console warning, and unknown `type` values reject the pending request with `WorkerInitError({ code: 'WORKER_PROTOCOL_VIOLATION' })`.
- `WorkerBridgeOptions.workerUrl` and `duckdbBundles` JSDoc now spells out the trust boundary: developer-controlled, no scheme/origin validation.
- `SessionStore.save` / `saveSync` surface IndexedDB transaction errors instead of swallowing them; `SessionStore.load` shape-checks the stored blob and returns `null` on missing required keys.
- `AutoSave` maps `QuotaExceededError` to `PersistenceError({ code: 'PERSISTENCE_QUOTA_EXCEEDED' })`; `reconstructError` recognises `PERSISTENCE_*` codes alongside the existing `PERSIST_*`.

**Tests**
- Added `tests/security/` with 6 new test files (78 cases) covering CSV formula injection, filename sanitisation, snapshot tampering, worker protocol guards, quota error classification, and XSS smoke for the rendering paths.
- Extended `tests/filters/FilterSQL.test.ts` with 13 new adversarial cases for `quoteIdentifier`, `formatSQLValue`, and string-injection-shaped patterns.
