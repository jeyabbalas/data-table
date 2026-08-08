/**
 * Bounded-concurrency task runner shared by the filter-broadcast coordinators.
 *
 * DuckDB-WASM runs single-threaded in one worker, so fanning out one query per
 * column on a wide table just queues them behind each other and starves the
 * interactive ones. Column fan-out therefore goes through a small worker pool
 * instead of a bare `Promise.all` over the whole list.
 *
 * This lives in `src/core/` rather than next to a coordinator because two
 * independent subsystems need identical semantics: `CrossfilterCoordinator`
 * and `StatsPanelCoordinator` each carried a private copy of this loop before
 * it was hoisted here.
 */

/**
 * Run async tasks with a ceiling on the number in flight at once.
 *
 * Semantics mirror `Promise.all(tasks.map((t) => t()))`, with the single
 * difference that at most `concurrency` tasks are ever started at the same
 * time:
 *
 * - results preserve **input order**, not completion order;
 * - the first rejection rejects the returned promise, while sibling tasks
 *   already in flight keep running to completion in the background (their
 *   results are discarded);
 * - an empty task list resolves to `[]` without scheduling anything.
 *
 * Because the pool pulls work lazily, a rejection also means tasks still
 * queued behind a failed worker may never start at all. That is the intended
 * back-pressure for query fan-out, where a failed filter cycle is superseded
 * by the next one anyway.
 *
 * @param tasks - Thunks to invoke. Each one is called at most once.
 * @param concurrency - Maximum simultaneously in-flight tasks. Values below 1
 *   (and non-finite values) are clamped to 1.
 * @returns The tasks' resolved values, in the order the thunks were given.
 *
 * @example
 * ```ts
 * // Four column queries in flight at a time; `counts` is in column order.
 * const counts = await runLimited(
 *   columns.map((col) => () => bridge.query<{ n: number }>(countSqlFor(col))),
 *   4,
 * );
 * ```
 *
 * @internal Deliberately absent from `src/index.ts` and `src/advanced.ts` —
 * this is a shared implementation detail of the coordinators, not public API.
 */
export async function runLimited<T>(
  tasks: readonly (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  if (tasks.length === 0) return [];
  const limit = Number.isFinite(concurrency) ? Math.max(1, Math.floor(concurrency)) : 1;
  const results: T[] = new Array<T>(tasks.length);
  let cursor = 0;
  const workerCount = Math.min(limit, tasks.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]!();
    }
  });
  await Promise.all(workers);
  return results;
}
