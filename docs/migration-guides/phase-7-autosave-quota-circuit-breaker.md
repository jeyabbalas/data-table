# Phase 7 — `AutoSave` one-shot quota circuit-breaker

**Status:** behavior change, observable error semantics, no public-API
rename or type-shape change.

## What changed

Before Phase 7, when a debounced `AutoSave.save()` rejected with a
`QuotaExceededError` (`PERSISTENCE_QUOTA_EXCEEDED`), the consumer's
`onError` callback fired once for that tick — and then **fired again on
every subsequent debounce tick** as long as the user kept mutating
state. On a tab whose IndexedDB quota was exhausted (Safari ITP, private
browsing, a long-running session that filled the snapshot store), this
generated one error event per save attempt for the lifetime of the
session.

After Phase 7, `AutoSave` latches a private `quotaExceeded` flag on the
first quota error. While the flag is set:

- `save()` and `saveSync()` are no-ops (no IDB transaction is started,
  no `onError` is invoked).
- The visibility-change / `beforeunload` lifecycle hooks call
  `flushPendingSave()`, which routes through `saveSync()` — also a
  no-op while latched.

The flag is cleared by the next `enable()` call. The canonical reset
path is `actions.clearSession()`, which runs `disable()` →
`SessionStore.delete()` → `enable()` (so calling `clearSession()` after
freeing IDB space — by, e.g., manually pruning other tables in the
shared store — re-arms saves on the next debounce tick). Building a
fresh `AutoSave` (via `destroy()` + `new AutoSave()`) also starts with
a clean breaker.

## Why

The pre-Phase-7 behavior amounted to an unbounded error stream from
`navigator.storage` failures: every keystroke that altered a filter
emitted another `PersistenceError`, flooding telemetry pipelines and
producing thrash in error-toast UIs. The library had no internal way
to recognize the latched-quota state, so the consumer was the only line
of defense — and most consumers don't add their own debouncing on top
of `error` events.

The one-shot semantic matches what consumers already do informally
("ignore quota errors after the first one in this session"), but
moves the responsibility into the library where it can be locked by
tests. Non-quota errors (`SAVE_FAILED` / generic `PersistenceError`)
are **not latched** — they re-emit on every tick, as before, since
they may be transient (e.g., a temporarily aborted transaction).

## Affected behavior for consumers

**Before:**

```ts
const store = new SessionStore();
const save = new AutoSave(state, store, {
  onError: (err) => {
    if (err.code === 'PERSISTENCE_QUOTA_EXCEEDED') {
      // Fired once per debounce tick after the first quota error.
      // Telemetry receives N events for one quota episode.
      reportToSentry(err);
    }
  },
});
save.enable();
```

**After:**

```ts
const save = new AutoSave(state, store, {
  onError: (err) => {
    if (err.code === 'PERSISTENCE_QUOTA_EXCEEDED') {
      // Fires exactly once per quota episode. Subsequent state mutations
      // are silent until the consumer calls actions.clearSession() or
      // builds a fresh AutoSave.
      reportToSentry(err);
      showBanner('Storage is full — recent edits will not persist until cleared.');
    }
  },
});
save.enable();
```

Consumers that **count** quota events for telemetry (e.g., aggregate
daily quota-exhaustion counts) will see fewer events. Recompute your
metric from "events" to "first events per session" if comparability
matters.

Consumers that **react** to each quota event (e.g., show a toast on
every failure) will see the toast exactly once per session — usually
the desired UX.

## What you should do

- If your `onError` handler was already idempotent (e.g., `if (!banner)
show(banner)`), no change.
- If your handler aggregated events per-period for telemetry, decide
  whether the new "one event per quota episode" semantic still feeds
  your downstream metric correctly. Adjust if not.
- Document for your team: clearing the table snapshot via
  `actions.clearSession()` re-arms saves. Without that call (or a full
  table re-mount), saves stay disabled even if the user manually frees
  IDB space (e.g., by dropping other tabs' data).

## Locked by

`tests/persistence/AutoSave.quota.test.ts` (8 cases) — covers async-save
quota latching, sync-save quota latching, `flushPendingSave` no-op when
latched, `disable()` + `enable()` reset, non-quota errors do NOT latch,
fresh-AutoSave-after-destroyed-instance starts clean, and the
no-`onError` silent-latch path.
