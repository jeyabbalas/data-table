import '@jeyabbalas/data-table/styles';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import { createSqlExtensions } from '@jeyabbalas/data-table/advanced';
// `buildCompletionContext` (also exported from /advanced) is the helper for
// the *literal-schema* path (no DataTable). This example uses the live-
// schema path via `table.actions.getCompletionContext()` — see the README
// for a snippet showing the literal-schema variant.
import type { CompletionContext } from '@jeyabbalas/data-table';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { autocompletion } from '@codemirror/autocomplete';

const DATA_URL =
  'https://raw.githubusercontent.com/jeyabbalas/data-table/main/tests/fixtures/datasets/parquet/nyc_taxi.parquet';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/**
 * A host-built CodeMirror SQL editor. The example explicitly assembles
 * `EditorState` from primitives instead of using the bundled
 * `CodeMirrorExpressionEditor` class, so that the API surface needed for a
 * downstream app is visible end-to-end.
 *
 * The editor's schema/function awareness comes from
 * `createSqlExtensions(context)` — wrapped in a `Compartment` so we can
 * swap in a fresh extension array (with the new schema) on every
 * `derivedChange` without rebuilding the view.
 */
class HostSqlEditor {
  readonly view: EditorView;
  private readonly sqlCompartment = new Compartment();
  private readonly getContext: () => CompletionContext;

  constructor(
    parent: HTMLElement,
    opts: {
      placeholder: string;
      getContext: () => CompletionContext;
      onChange?: () => void;
    },
  ) {
    this.getContext = opts.getContext;

    const state = EditorState.create({
      doc: '',
      extensions: [
        // ---- The library's contribution: SQL grammar + schema/function autocomplete ----
        // includeTheme: false — the host owns the visual presentation here
        // (see EditorView.theme below). Hosts that want the library's look
        // can drop the override and let createSqlExtensions add the theme.
        this.sqlCompartment.of(createSqlExtensions(this.getContext(), { includeTheme: false })),

        // ---- Standard CodeMirror plumbing the host wires up itself ----
        autocompletion({ tooltipClass: () => 'host-sql-autocomplete' }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        history(),
        placeholder(opts.placeholder),

        // Host-controlled visual theme. Uses the library's --dt-* CSS
        // variables so it tracks the table's light/dark mode for free.
        EditorView.theme({
          '&': { fontSize: '13px' },
          '.cm-editor': {
            border: '1px solid var(--dt-border)',
            borderRadius: 'var(--dt-radius-sm, 4px)',
            background: 'var(--dt-bg)',
          },
          '.cm-editor.cm-focused': {
            borderColor: 'var(--dt-primary)',
            outline: 'none',
            boxShadow: '0 0 0 2px color-mix(in srgb, var(--dt-primary) 20%, transparent)',
          },
          '.cm-content': {
            fontFamily: "'SF Mono', 'Fira Code', Consolas, monospace",
            padding: '0.45rem 0.55rem',
            caretColor: 'var(--dt-text)',
            minHeight: '70px',
            maxHeight: '160px',
          },
          '.cm-gutters': { display: 'none' },
          '.cm-scroller': { overflow: 'auto' },
        }),

        EditorView.contentAttributes.of({ 'aria-label': opts.placeholder }),

        EditorView.updateListener.of((update) => {
          if (update.docChanged) opts.onChange?.();
        }),
      ],
    });

    this.view = new EditorView({ state, parent });
  }

  /**
   * Re-pull the latest CompletionContext from the host and reconfigure the
   * SQL/autocomplete extensions in place. Called on every schema-changing
   * event from the table (loadComplete, derivedChange).
   */
  refreshContext(): void {
    this.view.dispatch({
      effects: this.sqlCompartment.reconfigure(
        createSqlExtensions(this.getContext(), { includeTheme: false }),
      ),
    });
  }

  getValue(): string {
    return this.view.state.doc.toString();
  }

  setValue(value: string): void {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: value },
    });
  }

  destroy(): void {
    this.view.destroy();
  }
}

let table: DataTable | undefined;
let filterEditor: HostSqlEditor | undefined;
let exprEditor: HostSqlEditor | undefined;
let appliedFilterId: string | null = null;

(async () => {
  table = await createDataTable({
    container: $('table'),
    tableName: 'nyc_taxi',
    persistence: false,
  });

  // The single source of truth for "what columns and types exist right now".
  // The library's actions.getCompletionContext() reads live state and
  // includes any derived columns the user has just added. We pass this thunk
  // (not a snapshot) into each editor so refreshContext() always sees the
  // latest schema.
  const getContext = () => table!.actions.getCompletionContext();

  // ---------- Filter SQL composer ----------
  const filterFeedback = $('filter-feedback');
  const btnValidateFilter = $<HTMLButtonElement>('btn-validate-filter');
  const btnApplyFilter = $<HTMLButtonElement>('btn-apply-filter');

  filterEditor = new HostSqlEditor($('filter-editor'), {
    placeholder: 'WHERE clause, e.g. trip_distance > 5',
    getContext,
    onChange: () => {
      // Editing invalidates any prior validation result.
      btnApplyFilter.disabled = true;
      filterFeedback.textContent = '';
      filterFeedback.className = 'feedback';
    },
  });

  btnValidateFilter.onclick = async () => {
    const sql = filterEditor!.getValue().trim();
    if (!sql) {
      filterFeedback.textContent = 'Empty expression — type a WHERE clause first.';
      filterFeedback.className = 'feedback err';
      return;
    }
    btnValidateFilter.disabled = true;
    filterFeedback.textContent = 'Validating…';
    filterFeedback.className = 'feedback';
    try {
      const result = await table!.actions.validateSQLFilter(sql);
      if (result.valid) {
        filterFeedback.textContent = `✓ Valid — matches ${result.matchCount} row(s).`;
        filterFeedback.className = 'feedback ok';
        btnApplyFilter.disabled = false;
      } else {
        filterFeedback.textContent = `✗ ${result.error}`;
        filterFeedback.className = 'feedback err';
        btnApplyFilter.disabled = true;
      }
    } finally {
      btnValidateFilter.disabled = false;
    }
  };

  btnApplyFilter.onclick = () => {
    const sql = filterEditor!.getValue().trim();
    if (!sql) return;
    // Replace any previous host-applied filter so applying twice doesn't
    // stack up duplicate raw-SQL chips.
    if (appliedFilterId) {
      table!.actions.removeRawSQLFilter(appliedFilterId);
    }
    appliedFilterId = table!.actions.addRawSQLFilter(sql, 'Host SQL filter');
    filterFeedback.textContent = '✓ Filter applied — see chip above the table.';
    filterFeedback.className = 'feedback ok';
    btnApplyFilter.disabled = true;
  };

  // ---------- Derived expression composer ----------
  const exprFeedback = $('expr-feedback');
  const exprName = $<HTMLInputElement>('expr-name');
  const btnValidateExpr = $<HTMLButtonElement>('btn-validate-expr');
  const btnApplyExpr = $<HTMLButtonElement>('btn-apply-expr');

  exprEditor = new HostSqlEditor($('expr-editor'), {
    placeholder: 'Expression, e.g. 100 * tip_amount / NULLIF(fare_amount, 0)',
    getContext,
    onChange: () => {
      btnApplyExpr.disabled = true;
      exprFeedback.textContent = '';
      exprFeedback.className = 'feedback';
    },
  });

  btnValidateExpr.onclick = async () => {
    const expr = exprEditor!.getValue().trim();
    if (!expr) {
      exprFeedback.textContent = 'Empty expression — type something first.';
      exprFeedback.className = 'feedback err';
      return;
    }
    btnValidateExpr.disabled = true;
    exprFeedback.textContent = 'Validating…';
    exprFeedback.className = 'feedback';
    try {
      const result = await table!.actions.validateExpression(expr);
      if (result.valid) {
        exprFeedback.textContent = `✓ Valid — detected type: ${result.originalType ?? result.type ?? '?'}`;
        exprFeedback.className = 'feedback ok';
        btnApplyExpr.disabled = false;
      } else {
        exprFeedback.textContent = `✗ ${result.error}`;
        exprFeedback.className = 'feedback err';
        btnApplyExpr.disabled = true;
      }
    } finally {
      btnValidateExpr.disabled = false;
    }
  };

  btnApplyExpr.onclick = async () => {
    const expr = exprEditor!.getValue().trim();
    const name = exprName.value.trim();
    if (!expr) return;
    if (!name) {
      exprFeedback.textContent = '✗ Column name is required.';
      exprFeedback.className = 'feedback err';
      return;
    }
    btnApplyExpr.disabled = true;
    const result = await table!.actions.addDerivedColumn({
      kind: 'expression',
      name,
      expression: expr,
    });
    if (result.success) {
      exprFeedback.textContent = `✓ Added derived column "${name}".`;
      exprFeedback.className = 'feedback ok';
      // Suggest a fresh name so consecutive adds don't collide.
      exprName.value = name + '_2';
      exprEditor!.setValue('');
    } else {
      exprFeedback.textContent = `✗ ${result.error}`;
      exprFeedback.className = 'feedback err';
    }
  };

  // ---------- Schema panel + live refresh ----------
  function renderSchema() {
    const ctx = getContext();
    const list = $('schema-list');
    list.replaceChildren();
    if (ctx.columns.length === 0) {
      const li = document.createElement('li');
      li.style.color = 'var(--dt-text-secondary)';
      li.textContent = '(no schema yet)';
      list.appendChild(li);
      return;
    }
    for (const c of ctx.columns) {
      const li = document.createElement('li');
      const name = document.createElement('code');
      name.textContent = c.name;
      const type = document.createElement('span');
      type.className = 'type';
      type.textContent = c.type || '?';
      li.append(name, type);
      if (c.isDerived) {
        const flag = document.createElement('em');
        flag.className = 'derived';
        flag.textContent = 'derived';
        li.append(flag);
      }
      list.appendChild(li);
    }
  }

  function refreshAll() {
    filterEditor!.refreshContext();
    exprEditor!.refreshContext();
    renderSchema();
  }

  table.on('loadComplete', refreshAll);
  table.on('derivedChange', refreshAll);

  renderSchema();

  // Quick-start hints — pre-fill so the example does something useful
  // immediately on first interaction.
  filterEditor.setValue('trip_distance > 5 AND payment_type = 1');
  exprEditor.setValue('100 * tip_amount / NULLIF(fare_amount, 0)');

  await table.loadData(DATA_URL, { sourceFormat: 'parquet' });

  // (loadComplete just fired and called refreshAll → editors now know about
  // the 19 NYC Taxi columns: trip_distance, fare_amount, tip_amount,
  // payment_type, tpep_pickup_datetime, …)
})();

window.addEventListener('beforeunload', () => {
  filterEditor?.destroy();
  exprEditor?.destroy();
  void table?.destroy();
});
