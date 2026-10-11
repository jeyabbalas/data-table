/**
 * Severity helpers shared by the annotation store, the annotation popover and
 * the table body.
 *
 * These were originally exported from `src/table/AnnotationPopover.ts` and
 * imported by `src/table/TableBody.ts`, which created an unwanted file-level
 * coupling between two otherwise-independent modules. They live here so any
 * renderer can consume them without reaching across module boundaries.
 *
 * This module is not part of the public API at `src/index.ts` or
 * `src/advanced.ts`.
 */

import type { Annotation, AnnotationSeverity, SeverityFilter } from './types';

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

/**
 * One bit per severity, so a set of severities is a small integer mask.
 * The bits rise as the severity falls, so of two bits the lower one is the
 * higher severity.
 *
 * @internal
 */
export const SEVERITY_BIT: Readonly<Record<AnnotationSeverity, number>> = Object.freeze({
  error: 1,
  warning: 2,
  info: 4,
});

/**
 * The mask holding every severity.
 *
 * @internal
 */
export const ALL_SEVERITIES_MASK = 7;

/**
 * The mask of the severities a severity filter shows.
 *
 * @internal
 */
export function severityMaskOf(filter: SeverityFilter): number {
  return (
    (filter.error ? SEVERITY_BIT.error : 0) |
    (filter.warning ? SEVERITY_BIT.warning : 0) |
    (filter.info ? SEVERITY_BIT.info : 0)
  );
}

/**
 * The severities in `mask`, highest first: `error`, `warning`, `info`.
 *
 * @internal
 */
export function severitiesOfMask(mask: number): AnnotationSeverity[] {
  const out: AnnotationSeverity[] = [];
  if (mask & SEVERITY_BIT.error) out.push('error');
  if (mask & SEVERITY_BIT.warning) out.push('warning');
  if (mask & SEVERITY_BIT.info) out.push('info');
  return out;
}

/**
 * What one scope holds at one key (a row, a column or a cell), as the
 * `summarize*Scope` methods of `AnnotationStore` report it.
 *
 * @internal
 */
export interface ScopeSummary {
  /** Annotations of that scope at that key, whatever the severity filter shows. */
  count: number;
  /** The highest severity among them that the severity filter shows, or `null`. */
  severity: AnnotationSeverity | null;
}

/**
 * A fresh, empty {@link ScopeSummary}, for a caller to reuse across
 * `summarize*Scope` calls.
 *
 * @internal
 */
export function createScopeSummary(): ScopeSummary {
  return { count: 0, severity: null };
}
