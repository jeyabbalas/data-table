/**
 * `performance.mark` / `measure` instrumentation for the load pipeline.
 *
 * Five marks name the seams a load crosses; four measures span from
 * `dt:load:start` to each later mark, so a consumer reading the User
 * Timing API sees where the wall clock actually went:
 *
 * | Measure         | Ends at              | Covers                         |
 * | --------------- | -------------------- | ------------------------------ |
 * | `dt:load:worker`| `dt:load:workerDone` | parse + table build in DuckDB  |
 * | `dt:load:paint` | `dt:load:firstPaint` | first viewport fetch + render  |
 * | `dt:load:viz`   | `dt:load:vizReady`   | per-column stats/visualizations|
 * | `dt:load:total` | `dt:load:complete`   | everything the promise awaits  |
 *
 * Names are stable across the scaling plan: Phase 2 changes *what gates
 * the load promise*, after which `dt:load:vizReady` simply starts landing
 * after `dt:load:complete` rather than before it. Nothing renames.
 *
 * Everything is best-effort. The whole API is feature-detected and
 * try/catch-wrapped, because User Timing is observable-but-optional: a
 * host page that has exhausted its performance buffer, or a runtime
 * without `performance.mark`, must not be able to fail a data load.
 */

/** Marks emitted by a load, in the order they occur. */
export type LoadStage = 'start' | 'workerDone' | 'firstPaint' | 'vizReady' | 'complete';

const PREFIX = 'dt:load:';

/**
 * The measure each stage closes. `start` opens every span and closes
 * none, so it is absent here and handled explicitly — that asymmetry is
 * also why this single table can drive marking *and* clearing.
 */
const MEASURE_AT: Record<string, string> = {
  workerDone: 'worker',
  firstPaint: 'paint',
  vizReady: 'viz',
  complete: 'total',
};

/**
 * Mark one load stage, and close the measure that ends there.
 *
 * Marking and measuring together is deliberate: both happen at the same
 * instant, and splitting them would let a caller mark a stage without
 * recording its span. The try/catch doubles as the feature detection —
 * a missing `performance.mark` throws and is swallowed here.
 */
export function markLoad(stage: LoadStage): void {
  try {
    performance.mark(PREFIX + stage);
    const measure = MEASURE_AT[stage];
    if (measure) performance.measure(PREFIX + measure, PREFIX + 'start', PREFIX + stage);
  } catch {
    // User Timing is observable-but-optional: an exhausted performance
    // buffer, or a runtime without the API, must not fail a data load.
  }
}

/**
 * Drop every `dt:load:*` mark and measure.
 *
 * Called at the top of each load so the entries always describe the load
 * in progress — otherwise a reload's `dt:load:total` would be computed
 * against the *previous* load's `dt:load:start`. Clears by name, never
 * with the argument-less form, which would also wipe the host app's own
 * marks.
 */
export function clearLoadMarks(): void {
  try {
    performance.clearMarks(PREFIX + 'start');
    for (const stage of Object.keys(MEASURE_AT)) {
      performance.clearMarks(PREFIX + stage);
      performance.clearMeasures(PREFIX + MEASURE_AT[stage]);
    }
  } catch {
    // Same rationale as above.
  }
}
