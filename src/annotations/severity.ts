/**
 * Severity helpers shared by the annotation popover and the table body.
 *
 * These were originally exported from `src/table/AnnotationPopover.ts` and
 * imported by `src/table/TableBody.ts`, which created an unwanted file-level
 * coupling between two otherwise-independent modules. They live here so any
 * renderer can consume them without reaching across module boundaries.
 *
 * `severity.ts` is internal — it is **not** part of the public API at
 * `src/index.ts` or `src/advanced.ts`.
 */

import type { Annotation, AnnotationSeverity } from './types';

/** Rank severities so the "highest" can be surfaced in a CSS class. */
export function severityRank(sev: AnnotationSeverity): number {
  return sev === 'error' ? 0 : sev === 'warning' ? 1 : 2;
}

/** Return the highest-severity value among `anns`, or `null` if empty. */
export function maxSeverity(anns: readonly Annotation[]): AnnotationSeverity | null {
  let best: AnnotationSeverity | null = null;
  for (const a of anns) {
    if (!best || severityRank(a.severity) < severityRank(best)) {
      best = a.severity;
    }
  }
  return best;
}
