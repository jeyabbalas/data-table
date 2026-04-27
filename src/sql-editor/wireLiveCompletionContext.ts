/**
 * Subscribe an open `ExpressionEditor` to the table's schema and
 * derived-column signals so its autocomplete reflects the live table.
 *
 * Use this from inside any modal / panel that lazily mounts an editor
 * via {@link ExpressionEditorFactory} (or constructs `CodeMirrorExpressionEditor`
 * directly). The current implementation forwards the latest
 * `actions.getCompletionContext()` snapshot to `editor.updateCompletionContext`
 * whenever `state.schema` or `state.derivedColumns` changes.
 *
 * Reconfigures are coalesced via `queueMicrotask` so a bulk reconcile
 * (undo / redo / session restore that touches every derived column)
 * collapses to a single editor dispatch per microtask tick instead of
 * one per affected column. The editor preserves cursor / focus / scroll
 * across `updateCompletionContext` (CodeMirror's `Compartment.reconfigure`
 * is the underlying primitive for the bundled editor).
 *
 * Returns an unsubscribe — call it from the modal's `close()` AND
 * `destroy()` paths so a destroyed editor never sees a reconfigure.
 */
import type { StateActions } from '../core/Actions';
import type { TableState } from '../core/State';
import type { ExpressionEditor } from '../derived/ExpressionEditorTypes';

export function wireLiveCompletionContext(
  editor: ExpressionEditor,
  state: TableState,
  actions: StateActions,
): () => void {
  let queued = false;
  let disposed = false;

  const dispatch = (): void => {
    if (queued || disposed) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (disposed) return;
      try {
        editor.updateCompletionContext(actions.getCompletionContext());
      } catch {
        // Editor may have been destroyed between the schedule and the
        // microtask drain (e.g., the modal closed and called the
        // returned unsubscribe synchronously). Swallow — the dispose
        // flag was set; nothing to do.
      }
    });
  };

  const unsubSchema = state.schema.subscribe(dispatch);
  const unsubDerived = state.derivedColumns.subscribe(dispatch);

  return () => {
    disposed = true;
    unsubSchema();
    unsubDerived();
  };
}
