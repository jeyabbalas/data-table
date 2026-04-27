# Phase 7 — Session-snapshot version policy

**Status:** behavior change, additive validation, no public-API rename or
type-shape change.

## What changed

Before Phase 7, `coerceLoadedSnapshot` in `src/persistence/SessionStore.ts`
validated that an IndexedDB-stored snapshot's `version` field was a
number, but never compared it to `SNAPSHOT_VERSION`. Any number-typed
version passed the gate, so:

- A snapshot written by a **future** library version (e.g. `version: 6`)
  loaded silently and was passed to `restoreStateFromSnapshot`. If the
  shape happened to satisfy the field-by-field shape check, restore
  proceeded — and could misinterpret newly-introduced fields, drop
  entire field categories, or wedge the table in an inconsistent state.
- A snapshot with a sentinel `version: 0`, `version: -1`, `version: NaN`,
  `version: Infinity`, or `version: 5.5` also passed the gate. None of
  these shapes is well-defined.

After Phase 7, the version field is range-checked:

```ts
if (!Number.isInteger(ver) || ver < 1 || ver > SNAPSHOT_VERSION) return null;
```

Snapshots with `version` outside `[1, SNAPSHOT_VERSION]` are treated as
malformed: `SessionStore.load(tableName)` resolves with `null`, and the
table boots fresh.

## Why

This is the **clean-break stance** for pre-1.0:

1. **No migration framework.** The library has no production install base
   yet, so investing in a `vN → vN+1` transformation registry is
   premature. Future-version snapshots are explicitly refused so a
   downgraded library cannot misinterpret them.
2. **Existing lenient pre-v5 behavior preserved.** Snapshots with
   `version: 1`–`SNAPSHOT_VERSION` continue through the same
   field-by-field shape check that already existed. Pre-v4 snapshots
   with inline vector values still load via `isPooledVectorRef`'s
   guard.
3. **Forward compatibility opt-in.** When the library bumps
   `SNAPSHOT_VERSION` to 6, an explicit decision is required at that
   time: write a v5→v6 migrator, or reset the snapshot. There is no
   silent "best-effort load" of unknown shapes.

## Affected behavior for consumers

**Before:**

```ts
// User had `dt-sessions` populated by a newer library version on tab A.
// Tab B opens with the older library — accidentally inherits future
// fields and may render an inconsistent state.
const snap = await store.load('trips'); // returns the future-shaped blob
```

**After:**

```ts
const snap = await store.load('trips'); // returns null (out-of-range)
// Table boots fresh; no inherited future fields.
```

For the **happy path** (consumer using one library version per origin):
**no change**. `version === SNAPSHOT_VERSION` continues to load
normally. Consumers who never downgrade or hand-mutate IndexedDB rows
see no difference.

## What you should do

- **No action required** for consumers using a single library version.
- If your app supports cross-version IDB sharing (e.g. a multi-tab
  scenario where some tabs run an older bundled version), audit your
  `tableName` strategy:
  - Scope `tableName` per-version (e.g. include the library version
    string), so a future-version snapshot doesn't shadow an older
    snapshot of the same table.
  - Or accept that downgrade scenarios produce a fresh-boot, and
    surface a UI hint to the user.
- Consumers wanting to inspect the rejected-snapshot case can subscribe
  to the `warning` event with `code: 'PERSISTENCE_UNAVAILABLE'` — note
  this fires when IDB itself is unavailable, not when a stored blob is
  rejected. A future release may add an explicit warning code for the
  blob-rejection case; until then, a `null` from `SessionStore.load`
  conflates "no snapshot" with "rejected snapshot".

## Locked by

`tests/persistence/snapshotVersionPolicy.test.ts` (12 cases) — covers
every accept and reject path including future versions, fractional /
NaN / Infinity / negative versions, missing version key, wrong-type
version, and the legacy v1–v5 lenient paths.
