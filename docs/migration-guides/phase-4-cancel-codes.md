# Migration: Phase 4 — `QUERY_CANCELLED` / `QUERY_ABORTED` distinction

> Phase 4 of the pre-1.0 review fixes the long-standing `cancel` TODO in the
> worker. Cancel messages now actually interrupt DuckDB via
> `connection.cancelSent()`. Two distinct error codes describe the two
> places where a cancel can settle.

**Released:** 2026-04-26 (`@jeyabbalas/data-table` next patch)
**Affected versions:** consumers branching on `error.code` for cancel detection
**Migration difficulty:** trivial — purely additive, no rename

## Summary

Before Phase 4, the bridge's abort path rejected with
`QueryError({ code: 'QUERY_ABORTED' })` and the worker silently ignored the
`cancel` IPC message. The user-visible signal was always
`QUERY_ABORTED`; the underlying DuckDB query kept running.

After Phase 4:

- The bridge still rejects the local promise with `QUERY_ABORTED` when the
  consumer's `AbortSignal` fires (no behavioral change for that consumer
  branch).
- The worker now routes the `cancel` message to the active connection's
  `cancelSent()`. If DuckDB interrupts the in-flight query/load/export
  mid-execution, the worker reports back with the new code
  `QUERY_CANCELLED`. This reply is visible only on direct
  `bridge.query()` callers that did not pass an `AbortSignal` but observed
  the rejection out-of-band — the typical `AbortSignal`-driven path
  resolves locally with `QUERY_ABORTED` before the worker reply lands, and
  the worker reply is dropped by `cleanupRequest`.

If you only branch on `'QUERY_ABORTED'` today, you do **not** need to
change anything. The new `'QUERY_CANCELLED'` code is purely additive.

## Non-breaking but recommended

Consumers who want to distinguish "cancel reached DuckDB" (e.g. for
telemetry or for a "Cancel succeeded — DuckDB stopped" UI state) can now
match on either:

```ts
table.on('error', ({ error }) => {
  if (error.code === 'QUERY_ABORTED') {
    // Bridge-side rejection — your AbortSignal fired, or destroy raced.
    return;
  }
  if (error.code === 'QUERY_CANCELLED') {
    // Worker-side cancellation — DuckDB actually interrupted mid-query.
    return;
  }
});
```

## Implementation note (for tests / advanced consumers)

The worker's cancel→`QUERY_CANCELLED` mapping is heuristic — DuckDB does
not ship a typed `CancelledError`. The worker matches on canonical
interrupt-shaped phrases (`INTERRUPT`, `interrupted`, `cancelled`) in the
rejection message. Future DuckDB-WASM versions could add a typed cancel
class; if so, the worker mapping should switch to `instanceof` and the
heuristic dropped.

## Verification checklist

- [ ] No code changes required for consumers who branch only on
      `QUERY_ABORTED`.
- [ ] If you branch on `QUERY_CANCELLED` (newly introduced), confirm a
      recent enough `@jeyabbalas/data-table` install.
- [ ] Tests under `tests/data/WorkerBridge.cancel.test.ts` and
      `tests/worker/cancel.test.ts` cover both rejection paths.

## See also

- [`docs/troubleshooting.md`](../troubleshooting.md) — `QUERY_ABORTED` vs
  `QUERY_CANCELLED` rows.
- [Migration guides index](./README.md)
