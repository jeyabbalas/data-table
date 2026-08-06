# Phase 2 — Worker serial queue, real cancellation, bridge query options

> Part of [implementation-plan/README.md](./README.md) — read that first. You are
> on branch `fix-virtual-scroll-large-datasets`.

## Goal

Make the worker layer truthful and cancellation real, so Phase 3 can safely
abort superseded row fetches:

- The worker executes messages **serially** through an explicit two-priority
  FIFO (today it claims serial dispatch but isn't — root cause M4).
- `cancel` can never affect the wrong query: a **queued** target is dequeued for
  free; the **running** target is genuinely interrupted (today `cancelSent()` is
  inert for every query the library issues — root cause M3b).
- `WorkerBridge.query()` gains `{cache?: boolean; priority?: 'high' | 'normal'}`
  so Phase 3 can bypass the SQL cache (M7) and prioritize viewport fetches.

## Prerequisites

Phase 1 complete (check `implementation-plan/README.md` status table). Phase 1
touched only table-layer files, so no code interaction — but the tree must be
green when you start (`npm run test:coverage`).

## Targeted code review (do this before editing)

1. `src/worker/worker.ts` — all 22 lines. Note `self.onmessage = async (event)
=> { await handleMessage(event.data, respond); }`: the event loop does not
   await this, so messages interleave at every `await` inside `handleMessage`.
2. `src/worker/dispatcher.ts` — whole file. Key points: the false "dispatches
   messages serially" comment and single `inFlight` slot (`:33-40`); the
   per-case `finally` blocks that clear `inFlight` (`if (inFlight?.id === id)
inFlight = null;`); the `cancel` case (`:280-292`) matching
   `inFlight.id === targetId` then calling `getConnection().cancelSent()`; the
   `isCancelRejection` → `QUERY_CANCELLED` error mapping; test hooks
   `__resetInFlightForTests` / `__getInFlightForTests` and who imports them.
3. `src/worker/duckdb.ts` — singleton `db`/`conn` (`:7-8`);
   `executeQuery` (`conn.query(sql)` then
   `result.toArray().map(r => convertBigInts(r.toJSON()))`, ~`:161-172`);
   `convertBigInts` (`:132+`); `getConnection()`.
4. `src/worker/types.ts` — `WorkerMessage`, `QueryPayload`, message/response
   type unions.
5. `src/data/WorkerBridge.ts` — `query()` (`:278-300`: cache check via
   `isCacheable` = SELECT-prefix, `queryCache.get`/`.set`); `sendMessage`
   (`:418-463`: id generation, abort handler that posts a `cancel` message with
   `targetId` and rejects locally with `QueryError{code:'QUERY_ABORTED'}`);
   `handleMessage` (`:488-500`: id-keyed resolution; unknown ids silently
   dropped — this is what makes late `QUERY_CANCELLED` responses harmless).
6. `src/data/QueryCache.ts` — LRU+TTL semantics; `attachCacheInvalidation`.
7. **Verify the M3b claim yourself** in
   `node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser.mjs` (or `.js`):
   `AsyncDuckDBConnection.query()` → `bindings.runQuery` (blocking in the inner
   worker; **not** interruptible by `cancelPendingQuery`);
   `AsyncDuckDBConnection.send()` → `startPendingQuery` + repeated
   `pollPendingQuery` (each poll a separate round-trip); `cancelSent()` →
   `bindings.cancelPendingQuery`. Conclusion to confirm: only `send()`-path
   queries are interruptible.
8. Tests to understand before migrating them: `tests/worker/worker.test.ts`,
   `tests/worker/cancel.test.ts` (the `vi.mock('@/worker/duckdb')` idiom),
   `tests/data/WorkerBridge.parallel.test.ts` (proves id-keyed out-of-order
   response handling — must stay green untouched),
   `tests/data/WorkerBridge.cancel.test.ts` if present, and
   `tests/helpers/mockWorker.ts`.

## Design specification

### `src/worker/dispatcher.ts` — explicit serial queue

Replace the single `inFlight` slot with:

```ts
interface QueueEntry {
  message: WorkerMessage;
  respond: Respond;
  done: () => void; // resolves the promise handleMessage returned for THIS message
}
let highQueue: QueueEntry[] = [];
let normalQueue: QueueEntry[] = [];
let running: { id: string; type: 'init' | 'query' | 'load' | 'export' } | null = null;
```

- `handleMessage(message, respond)` keeps its exact signature. Behavior:
  - `type === 'cancel'` → handled **immediately**, never queued (see
    `handleCancel` below); the returned promise resolves when the cancel is
    answered.
  - Everything else → wrapped in a `QueueEntry` and pushed to `highQueue` when
    `message.type === 'query'` and its payload's `priority === 'high'`,
    otherwise `normalQueue`; then `pump()`. The promise `handleMessage` returns
    resolves via `entry.done()` when **that message's** processing completes —
    this preserves the awaited semantics existing worker tests rely on
    (`await handleMessage(...)` finishing means the work finished).
  - Invalid/unknown types keep today's immediate error response (not queued).
- `pump()`: if `running` is null, shift from `highQueue` else `normalQueue`;
  set `running = {id, type}`; `runTask(entry).finally(() => { running = null;
entry.done(); pump(); })`.
- `runTask(entry)`: the current `switch` body for `init`/`query`/`load`/`export`
  (unchanged response shapes, progress callbacks, error mapping). The `query`
  case switches from `executeQuery(sql)` to `executeQueryCancellable(sql)`.
  Keep the existing `isCancelRejection` → `QUERY_CANCELLED` mapping.
- `handleCancel(message, respond)`:
  1. If `targetId` matches a **queued** entry: remove it from its queue; respond
     to the _target_ id with the standard error payload
     (`code: 'QUERY_CANCELLED'`); call its `done()`; respond to the _cancel_ id
     with `{cancelled: true, reason: 'dequeued'}`.
  2. Else if `running?.id === targetId`: `const cancelled = await
getConnection().cancelSent();` respond `{cancelled}` (keep today's
     try/catch → `Cancel failed` error mapping). Because execution is genuinely
     serial, `cancelSent()` can only ever address the one running query — the
     wrong-target hazard is eliminated **structurally**.
  3. Else respond `{cancelled: false, reason: 'no-matching-inflight'}` (existing
     shape).
- `load`/`export` keep `conn.query`-based execution; for them, cancellation
  remains delivery-suppression exactly as today — say so honestly in the
  comment.
- Rewrite the `:33-40` comment: "Messages are serialized by an explicit
  two-priority FIFO (`high` for viewport row fetches, `normal` for everything
  else). `cancel` bypasses the queue: queued targets are removed without
  touching DuckDB; the running target is interrupted via the connection's
  pending-query cancel. `running` is the single executing task."
- Test hooks: replace `__resetInFlightForTests`/`__getInFlightForTests` with
  `__resetDispatcherForTests()` (clears queues + running),
  `__getRunningForTests()`, `__getQueueDepthsForTests()` →
  `{high: number, normal: number}`. Update all imports.
- Why serialization does not hurt (put in the comment): SQL execution already
  serializes inside duckdb-wasm's own single-threaded WASM worker; today's
  "concurrency" only overlaps Arrow→JS materialization with the next query's
  start. We trade that sliver for truthful cancel targeting, free
  dequeue-cancellation, and priority (row fetches jump the ~9-column
  stats/histogram fan-out that fires on load).

### `src/worker/duckdb.ts` — genuinely cancellable execution

```ts
/**
 * Execute a SQL query via DuckDB's pending-query (streaming) path so an
 * inbound `cancel` message can interrupt it between polls. `conn.query()`
 * runs as one blocking call in duckdb-wasm's inner worker and CANNOT be
 * interrupted by `cancelSent()`; `conn.send()` polls in slices, and
 * `cancelPendingQuery` rejects the next poll with an interrupt error.
 */
export async function executeQueryCancellable<T = Record<string, unknown>>(
  sql: string,
): Promise<T[]> {
  // same BRIDGE_NOT_READY guard as executeQuery
  const reader = await conn.send(sql);
  const rows: T[] = [];
  for await (const batch of reader) {
    for (const row of batch.toArray()) {
      rows.push(convertBigInts(row.toJSON()) as T);
    }
  }
  return rows;
}
```

Notes: `batch.toArray()` avoids constructing an Arrow `Table`; result rows must
be **identical** to `executeQuery`'s (`convertBigInts(row.toJSON())` — same
BigInt→Number and INTERVAL handling; `castDecimalToDouble` is connection-level
and unaffected). Keep `executeQuery` for internal statements (loaders, DDL).
A cancellation surfaces as a rejection whose message matches the existing
`isCancelRejection` patterns — verify the actual message duckdb-wasm produces
("query was canceled" or similar) and extend `isCancelRejection` if its pattern
list misses it.

**Fallback (documented in code comment + PR):** if `send()` shows result-parity
or stability problems for some query shape, revert the dispatcher's `query`
case to `executeQuery` — the queue still delivers dequeue-cancellation,
priority, and truthful bookkeeping, which is most of the win.

### `src/worker/types.ts`

```ts
export interface QueryPayload {
  sql: string;
  /** Queue priority inside the worker. 'high' = viewport row fetches. */
  priority?: 'high' | 'normal';
}
```

(If `QueryPayload` doesn't exist as a named interface yet, introduce it where
the query payload shape is currently declared inline.) Unknown extra fields are
ignored by older custom-`workerUrl` workers — backward compatible.

### `src/data/WorkerBridge.ts`

```ts
export interface QueryOptions {
  /** Set false to bypass the SQL result cache (both read and write). */
  cache?: boolean;
  /** Worker queue priority; 'high' jumps stats/visualization queries. */
  priority?: 'high' | 'normal';
}

async query<T = Record<string, unknown>>(
  sql: string,
  signal?: AbortSignal,
  options?: QueryOptions,
): Promise<T[]>
```

- `options?.cache === false` skips **both** `this.queryCache.get(sql)` and
  `this.queryCache.set(sql, rows)` (the `isCacheable` SELECT check remains for
  the default path).
- `options?.priority` is forwarded into the `QueryPayload`.
- Purely additive third parameter — no existing caller changes. `sendMessage`
  is untouched (out-of-order id matching already proven by
  `tests/data/WorkerBridge.parallel.test.ts`).
- Export `QueryOptions` from wherever `WorkerBridge`'s types are re-exported
  (check `src/index.ts`/`src/advanced.ts` conventions; JSDoc required if it
  lands on a public surface).

## Ordered tasks

1. Verify M3b in `node_modules` (review item 7) — record findings in the commit
   message body if they differ from this doc.
2. Implement `types.ts` + `duckdb.ts` (`executeQueryCancellable`).
3. Rewrite `dispatcher.ts` (queue, `handleCancel`, hooks, comment).
4. Extend `WorkerBridge.query` with `QueryOptions`.
5. Migrate existing worker tests to the new hooks; add the new suites.
6. Run verification; commit; update the README status table.

## Tests

### New

1. `tests/worker/dispatcher.queue.test.ts`
   - Serial execution: with `executeQueryCancellable` mocked as two deferreds,
     dispatch two `query` messages; the second mock must not be invoked until
     the first responds; `__getRunningForTests()` is truthful throughout;
     `__getQueueDepthsForTests()` shows the second queued.
   - Priority ordering: start normal q1 (deferred); enqueue normal q2, then
     high q3 → completion order q1, q3, q2.
2. `tests/worker/dispatcher.cancelQueued.test.ts`
   - Cancel of a **queued** id: entry removed without execution; target id
     receives a `QUERY_CANCELLED` error response; cancel id receives
     `{cancelled: true, reason: 'dequeued'}`; the mock for the dequeued query is
     never invoked.
   - Cancel of the **running** id: `cancelSent` called exactly once (spy on the
     mocked connection).
   - Cancel of an unknown/completed id: `{cancelled: false,
reason: 'no-matching-inflight'}`.
   - **Wrong-cancel regression:** q1 running, q2 queued → `cancel(targetId: q2)`
     must NOT call `cancelSent`, and q1 completes normally.
3. `tests/worker/executeQueryCancellable.test.ts`
   - Stub a connection whose `send()` returns an async-iterable of batches
     (each with `toArray()` of rows containing BigInt + plain values): rows
     materialize identically to `executeQuery`'s output.
   - A rejection mid-iteration with a cancel-shaped message maps through the
     dispatcher's `isCancelRejection` to a `QUERY_CANCELLED` error payload.
4. `tests/data/WorkerBridge.queryOptions.test.ts` (mockWorker idiom)
   - `cache: false`: same SELECT issued twice posts two worker messages and
     never appears in the cache (`getQueryCacheSize`-style probe or spy).
   - Default path still cache-hits (one post for two identical SELECTs).
   - `priority: 'high'` appears in the posted `QueryPayload`.
   - With two queries pending, aborting q1's signal posts a `cancel` whose
     `targetId` is q1's id, and q2 still resolves.

### Migrations

- `tests/worker/worker.test.ts`, `tests/worker/cancel.test.ts`: swap
  `__resetInFlightForTests`/`__getInFlightForTests` for the new hooks;
  never-resolving `executeQuery` stubs become never-resolving
  `executeQueryCancellable` where the `query` case is exercised. Semantics of
  each existing assertion must survive (they encode the response contract).
- `tests/data/WorkerBridge.parallel.test.ts`: must pass **unchanged**.

## Verification criteria

```bash
npx vitest run tests/worker tests/data
npm run test:coverage
npm run typecheck && npm run lint && npm run format:check
npm run test:browser        # no user-visible change expected; guards regressions
```

All green. Also do a 2-minute manual sanity: `npm run dev`, open
`http://localhost:5173/data-table/`, load
`tests/fixtures/datasets/parquet/nyc_taxi.parquet` via the file input, confirm
the table renders and header stats populate (exercises init/load/query through
the new queue), no console errors.

## Commit guidance

Two commits:

1. `Serialize worker dispatch with a priority queue and truthful cancel targeting`
2. `Execute worker queries through DuckDB's cancellable pending-query path`
   (isolated on purpose — this is the commit to revert if `conn.send()`
   misbehaves; say so in the body)

Plus the `WorkerBridge` options change folded into commit 1 or its own
`Add cache and priority options to WorkerBridge queries`. Flip Phase 2's row in
`implementation-plan/README.md` in the final commit.

## Seams & out of scope

- Do **not** touch `TableBody` — Phase 3 wires `{cache:false, priority:'high'}`
  - signals into row fetches. After this phase, no production caller passes the
    new options yet; that is expected.
- Do not change `QueryCache` internals or `attachCacheInvalidation` consumers.
- Do not alter `load`/`export` execution paths beyond queueing them.
