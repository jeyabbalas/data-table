# Phase 6 — Visualization `fetchData` errors now reach `error` events

**Status:** behavior change, additive observability, no public-API rename or
type shape change.

## What changed

Before Phase 6, the bundled `BaseVisualization` subclasses (`Histogram`,
`DateHistogram`, `TimeHistogram`, `IntervalHistogram`, `ValueCounts`)
caught failures from their `fetchData()` SQL queries and surfaced them
only via `console.error` in the developer console. The JSDoc contract on
`VisualizationOptions.onError`
(`src/visualizations/BaseVisualization.ts:116-126`) explicitly promises
these errors route to `options.onError`, which the facade re-emits as
`error` events with `source: 'visualization'`. The implementation did not
honor that promise.

After Phase 6, every subclass calls
`this.options.onError?.(typed, { columnName, stage: 'fetch' })` in its
catch block before painting the empty-canvas state. The facade then
emits:

```ts
table.on('error', ({ error, source }) => {
  if (source === 'visualization') {
    // error.code: 'QUERY_RUNTIME' (or any code from a typed DataTableError
    // thrown upstream — e.g. 'QUERY_TIMEOUT', 'QUERY_CANCELLED').
    // error.message: the original error's message.
    // error.cause: the original Error (or original value coerced to Error).
  }
});
```

## Why

The `console.error` path was opaque: downstream apps using telemetry
(Sentry, Datadog, in-app toasts) had no way to detect that a column
visualization failed to load. Routing through the existing `error` event
gives them parity with `loadError` / `derivedChange` failure paths
already plumbed through the facade.

The empty-canvas painting on error is unchanged — the visual UX of "the
column header shows an empty bar" is preserved. Only the observability
contract is new.

## Affected behaviour for consumers

**Before:**

```ts
table.on('error', ({ error, source }) => {
  if (source === 'visualization') {
    // Never fired for fetchData failures.
  }
});
```

**After:**

```ts
table.on('error', ({ error, source }) => {
  if (source === 'visualization') {
    // Fires once per fetchData rejection, per affected column.
    // Stage discriminator on the original onError context tells you
    // 'fetch' vs 'render' vs 'filter'; the facade does not currently
    // re-emit the stage on the event payload — branch on `error.code`
    // if you need finer granularity.
  }
});
```

If you already had an `error` handler that does
`reportToSentry(error)` on every visualization-source error, you will
start receiving a new class of events. To filter them out:

```ts
table.on('error', ({ error, source }) => {
  if (source === 'visualization' && error.code === 'QUERY_RUNTIME') {
    // Optional: attach to a dedicated low-priority telemetry channel.
    return;
  }
  reportToSentry(error);
});
```

If you had no `error` handler before, you do not need to add one — the
facade's `EventEmitter` is non-throwing on unlistened events
(`src/core/EventEmitter.ts:82-100`).

## Affected files

- `src/visualizations/histogram/Histogram.ts`
- `src/visualizations/histogram/DateHistogram.ts`
- `src/visualizations/histogram/TimeHistogram.ts`
- `src/visualizations/histogram/IntervalHistogram.ts`
- `src/visualizations/valuecounts/ValueCounts.ts`

Each file now imports `DataTableError` and `QueryError` and runs the
following catch block (with the subclass's own data-field reset
preserved):

```ts
} catch (error) {
  if (seq !== this.fetchSequence || this.destroyed) return;
  const typed =
    error instanceof DataTableError
      ? error
      : new QueryError(error instanceof Error ? error.message : String(error), {
          code: 'QUERY_RUNTIME',
          cause: error,
        });
  this.options.onError?.(typed, {
    columnName: this.column.name,
    stage: 'fetch',
  });
  this.data = null;
  this.backgroundData = null;       // viz-specific reset
  this.render();
}
```

The `|| this.destroyed` guard closes a small race: a consumer's
`onError` handler that synchronously calls `table.destroy()` would
previously have triggered a render on a torn-down canvas.

## Custom subclasses

If you implemented your own `BaseVisualization` subclass and currently
swallow errors with `console.error`, switch to the same routing pattern.
The contract in `BaseVisualization.options.onError` is now consistent
across the bundled subclasses; custom subclasses that adopt it
participate in the same `error` event channel automatically.

If you re-throw from your `fetchData` instead, the base
`BaseVisualization.updateFilters()` outer catch will see it and route
with `stage: 'filter'` instead of `stage: 'fetch'`. Both stages reach the
facade's `error` event with `source: 'visualization'`.

## Related: stale-state leak under destroy (documented, not fixed)

`ValueCounts.fetchData()` and the histogram subclasses assign
`this.data = await fetchValueCountsData(...)` _before_ checking the
post-await stale-fetch / destroy guard. If a destroy races an in-flight
fetch, `this.data` is left with the stale value. The visible behavior is
correct (no `render()` is called after destroy), but the field value is
observable to test code or debuggers. Locked in
`tests/visualizations/valuecounts/ValueCounts.staleGuard.test.ts` with a
note pointing at this guide; a follow-up to assign the local first and
publish only after the guard passes is candidate for Phase 9 polish.
