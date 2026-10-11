/**
 * How a failed IndexedDB write is reported.
 *
 * `AutoSave` maps whatever a save rejects with to a `PersistenceError`, and
 * `SessionStore` wraps a failed write of a table's annotations record in one
 * itself, so that `AutoSave` can tell it from a failed write of the session
 * record and stop saving the annotations alone.
 */

import { PersistenceError } from '../core/errors';

/**
 * The most specific `PersistenceError.code` for an arbitrary thrown or
 * rejected value: quota exhaustion has its own code, everything else is the
 * generic `SAVE_FAILED`.
 *
 * @internal
 */
export function classifyPersistenceFailure(
  cause: unknown,
): 'PERSISTENCE_QUOTA_EXCEEDED' | 'SAVE_FAILED' {
  // DOMException doesn't exist in every JS runtime (Node tests ship a polyfill);
  // duck-type on `name` to cover both real DOMException and fake-indexeddb shims.
  if (
    cause &&
    typeof cause === 'object' &&
    'name' in cause &&
    (cause as { name: unknown }).name === 'QuotaExceededError'
  ) {
    return 'PERSISTENCE_QUOTA_EXCEEDED';
  }
  return 'SAVE_FAILED';
}

/**
 * The error a save reports when the table's annotations record was not
 * written; the session record was, naming the annotations it named before.
 * Its `details.record` is `'annotations'`, which
 * {@link isAnnotationsWriteFailure} reads.
 *
 * @internal
 */
export function annotationsWriteFailure(cause: unknown, tableName: string): PersistenceError {
  const reason = cause instanceof Error ? cause.message : String(cause);
  return new PersistenceError(
    `The annotations of "${tableName}" were not saved (${reason}); the rest of the session was, with the annotations saved before.`,
    {
      code: classifyPersistenceFailure(cause),
      cause,
      details: { record: 'annotations', tableName },
    },
  );
}

/**
 * Whether `error` reports a failed write of an annotations record alone,
 * the session record having been written.
 *
 * @internal
 */
export function isAnnotationsWriteFailure(error: unknown): error is PersistenceError {
  return error instanceof PersistenceError && error.details?.['record'] === 'annotations';
}
