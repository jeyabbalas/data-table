/**
 * How a failed IndexedDB write is reported.
 *
 * `AutoSave` maps whatever a save rejects with to a `PersistenceError`, its
 * code from {@link classifyPersistenceFailure}.
 */

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
