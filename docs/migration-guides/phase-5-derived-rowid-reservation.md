# Migration: Phase 5 — explicit `__rowid__` reservation at derived-column-add time

> Phase 5 of the pre-1.0 review tightens the derived-column lifecycle.
> `actions.addDerivedColumn`, `.updateDerivedColumn` (rename path), and
> `.replaceDerivedColumn` now reject `__rowid__` with a typed-message
> error before any other validation. The synthetic row id can never be
> shadowed by a user-added column.

**Released:** 2026-04-26 (`@jeyabbalas/data-table` next patch)
**Affected versions:** consumers programmatically calling
`addDerivedColumn` / `updateDerivedColumn` with the literal name
`__rowid__`. (Practically nobody — `__rowid__` is the library-reserved
synthetic key.)
**Migration difficulty:** trivial — error message changed; the rejection
now happens regardless of the live schema state.

## Summary

Before Phase 5, the duplicate-name guard at
`StateActions.addDerivedColumn` rejected
`addDerivedColumn({ name: '__rowid__' })` only when `__rowid__` was
already in `state.schema` (which is the normal post-load state, since
loaders synthesize the column). If the schema was empty at the time of
the call (theoretically, before `loadData` resolves), the guard would not
fire and the user could add a derived column shadowing the synthetic id.
The error message also conflated "duplicate" with "reserved".

After Phase 5:

- `actions.addDerivedColumn({ name: '__rowid__', … })` resolves
  `{ success: false, error: 'Column name "__rowid__" is reserved for the synthetic row id' }`
  regardless of whether `__rowid__` is currently in the schema.
- `actions.updateDerivedColumn(oldName, { name: '__rowid__', … })`
  (rename path) rejects with the same message before any DuckDB call.
- `actions.replaceDerivedColumn` is unaffected because it does not
  support renaming (Phase 3 already enforced this with
  `'EXPRESSION_INVALID'`).

The rejection still uses the existing
`Promise<{ success: boolean; error?: string }>` return shape — no new
typed error class, no api-surface change. Callers that already
inspected `result.success` and surfaced `result.error` continue to work.

## Behaviour comparison

| Scenario                                                          | Before Phase 5                                 | After Phase 5                                |
| ----------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| `addDerivedColumn({ name: '__rowid__' })` after a load            | `{ success: false, error: '…already exists' }` | `{ success: false, error: '…is reserved…' }` |
| `addDerivedColumn({ name: '__rowid__' })` before any load         | accepted (incorrect)                           | `{ success: false, error: '…is reserved…' }` |
| `updateDerivedColumn('total', { name: '__rowid__', … })` (rename) | `{ success: false, error: '…already exists' }` | `{ success: false, error: '…is reserved…' }` |
| `replaceDerivedColumn('total', { name: 'total', … })` (no rename) | unchanged — rename is rejected separately      | unchanged                                    |

## Migration

If your code branches on the literal error message
`Column name "__rowid__" already exists`, switch to:

```ts
const result = await table.actions.addDerivedColumn({
  kind: 'expression',
  name: candidateName,
  expression,
});

if (!result.success) {
  if (result.error?.includes('reserved')) {
    showInlineError('That name is reserved by the library.');
  } else if (result.error?.includes('already exists')) {
    showInlineError('A column with that name already exists.');
  } else {
    showInlineError(result.error ?? 'Failed to add derived column.');
  }
}
```

If you want to pre-check, the reserved name is exposed as a runtime
constant:

```ts
import { ROWID_COLUMN } from '@jeyabbalas/data-table';

if (candidateName === ROWID_COLUMN) {
  showInlineError(`"${ROWID_COLUMN}" is reserved.`);
  return;
}
```

## Verification checklist

- [ ] Any UI that surfaces `result.error` from `addDerivedColumn` /
      `updateDerivedColumn` continues to render correctly under the new
      message.
- [ ] Pre-load races (calling `addDerivedColumn` before `loadComplete`)
      now reject deterministically; verify your bootstrap order assumes
      this.
- [ ] Tests covering the reservation live in
      `tests/derived/DerivedColumns.test.ts` (Phase 5 block).

## See also

- [`docs/troubleshooting.md`](../troubleshooting.md) — `LOAD_RESERVED_COLUMN_NAME`
  row (the loader-side counterpart).
- [Migration guides index](./README.md)
