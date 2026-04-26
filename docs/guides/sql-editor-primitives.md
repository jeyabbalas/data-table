# SQL editor primitives

Build a CodeMirror SQL editor _outside_ the data table — for a filter-preset
composer, a derived-column wizard, or a query-template form mounted in your
own UI shell — using the same DuckDB-aware grammar, schema/function
autocomplete, and theme the bundled `CodeMirrorExpressionEditor` uses
internally. The extension points are two helpers exported from
`@jeyabbalas/data-table/advanced`: `createSqlExtensions(context, options?)`
returns a CodeMirror `Extension[]` you drop into any `EditorState.create`,
and `buildCompletionContext(columns, options?)` normalizes any column-like
array into the `CompletionContext` shape `createSqlExtensions` expects.

The pattern parallels [custom visualizations](./visualizations.md) and
[stats panels](./stats-panels.md): the library ships a turnkey class
(`CodeMirrorExpressionEditor`, also on `/advanced`) for the in-table case —
the SQL filter modal, the derived-column expression input — and it ships
the underlying primitives for everywhere else. The two extensibility points
share the same `CompletionContext` shape and the same function-autocomplete
list, so a host editor mounted in a sidebar feels identical to the bundled
one mounted inside the table's modals.

When the editor lives next to a real `DataTable`, feed live schema in via
`table.actions.getCompletionContext()` and refresh on every
`derivedChange` / `loadComplete` using a CodeMirror `Compartment`. When the
editor lives somewhere a `DataTable` doesn't (a settings form, a saved
template UI, a remote-schema preview), call `buildCompletionContext` with
an ad-hoc `[{name, type}, …]` once and you're done.

## You'll learn how to

- Assemble a host-built CodeMirror editor with DuckDB SQL grammar,
  schema-aware column autocomplete, and DuckDB function autocomplete (with
  category chips and one-line description tooltips)
- Feed live schema in via `actions.getCompletionContext()` and refresh on
  `loadComplete` / `derivedChange` using `Compartment.reconfigure()`
- Operate in literal-schema mode without a `DataTable` — pass an ad-hoc
  `[{name, type}, …]` for query templates, configuration forms, etc.
- Customize the function autocomplete list (subset, names-only, disable)
- Choose between the library's bundled theme and your own — both can use
  the `--dt-*` CSS variables
- Add the `autocompletion()` UI extension yourself (the helpers ship the
  autocomplete _source_, not the dropdown UI)

## Prerequisites

- Read: [API reference — SQL editor primitives](../api-reference.md#sql-editor-primitives)
- Read (related): [Derived columns guide](./derived-columns.md) — covers
  the bundled `CodeMirrorExpressionEditor` for the in-table case
- Runnable example: [`examples/14-standalone-sql-editor`](../../examples/14-standalone-sql-editor/)
- Sibling extensibility points:
  [Visualizations guide](./visualizations.md),
  [Stats panels guide](./stats-panels.md)

## Minimal example (literal schema)

```ts
import { buildCompletionContext, createSqlExtensions } from '@jeyabbalas/data-table/advanced';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { autocompletion } from '@codemirror/autocomplete';

const ctx = buildCompletionContext([
  { name: 'price', type: 'DOUBLE' },
  { name: 'qty', type: 'BIGINT' },
  { name: 'sku', type: 'VARCHAR' },
]);

const view = new EditorView({
  state: EditorState.create({
    extensions: [
      createSqlExtensions(ctx), // SQL grammar + autocomplete source + library theme
      autocompletion(), // the dropdown UI — host owns this (see Gotchas)
    ],
  }),
  parent: document.querySelector('#editor')!,
});
```

That's the full surface for the literal-schema path. Press Ctrl/Cmd+Space
and the dropdown lists the three columns (with their DuckDB types as
`detail`) and 176 DuckDB functions (each with a category chip and a
one-line description in the side panel).

## Two paths at a glance

| Path               | When to use                                                        | Schema source                                           | How to refresh                                                                  |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Live-schema**    | The editor sits next to a real `DataTable`                         | `table.actions.getCompletionContext()`                  | `Compartment.reconfigure()` on every `loadComplete` / `derivedChange`           |
| **Literal-schema** | No `DataTable` (template UI, settings form, remote schema preview) | Ad-hoc `[{name, type}, …]` via `buildCompletionContext` | Manually rebuild the context and dispatch a `reconfigure` (or `reset` the view) |

Both paths use the same `createSqlExtensions(ctx, options?)` call — they
differ only in where `ctx` comes from and when you choose to refresh it.

## Live-schema path

When the editor lives next to a real `DataTable`, the schema is whatever
the table has loaded right now — including any derived columns the user
has just added. `actions.getCompletionContext()` is a pure read of live
state, so call it as a thunk on every refresh rather than capturing the
result up front.

Wrap the helper's return value in a CodeMirror `Compartment` so a schema
change can swap the extension array atomically without rebuilding the
view. Replacing the entire `EditorState` works too, but discards undo
history, focus, selection, and scroll position; `Compartment.reconfigure`
preserves all four. The bundled `CodeMirrorExpressionEditor` uses the
same pattern internally
([`src/sql-editor/CodeMirrorExpressionEditor.ts:142-148`](../../src/sql-editor/CodeMirrorExpressionEditor.ts)).

```ts
import {
  createSqlExtensions,
} from '@jeyabbalas/data-table/advanced';
import type { CompletionContext, DataTable } from '@jeyabbalas/data-table';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { autocompletion } from '@codemirror/autocomplete';

class HostSqlEditor {
  readonly view: EditorView;
  private readonly sqlCompartment = new Compartment();
  private readonly getContext: () => CompletionContext;

  constructor(parent: HTMLElement, opts: {
    placeholder: string;
    getContext: () => CompletionContext;
  }) {
    this.getContext = opts.getContext;
    const state = EditorState.create({
      doc: '',
      extensions: [
        // Library contribution: SQL grammar + schema/function autocomplete source.
        // Wrapped in a Compartment so we can reconfigure on schema change.
        this.sqlCompartment.of(
          createSqlExtensions(this.getContext()),
        ),
        // Host plumbing the library does NOT include — see Gotchas.
        autocompletion({ tooltipClass: () => 'my-app-sql-autocomplete' }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        history(),
        placeholder(opts.placeholder),
      ],
    });
    this.view = new EditorView({ state, parent });
  }

  /** Re-pull live schema and reconfigure in place. Preserves undo / focus / scroll. */
  refreshContext(): void {
    this.view.dispatch({
      effects: this.sqlCompartment.reconfigure(
        createSqlExtensions(this.getContext()),
      ),
    });
  }
}

// Wire it up against a live table
const table: DataTable = /* ... */;
const editor = new HostSqlEditor(document.querySelector('#editor')!, {
  placeholder: 'WHERE clause, e.g. order_total_usd > 100',
  getContext: () => table.actions.getCompletionContext(),
});

table.on('loadComplete', () => editor.refreshContext());
table.on('derivedChange', () => editor.refreshContext());
```

The full canonical implementation (with input validation, theming, and a
shared "refresh all editors" hook) lives in
[`examples/14-standalone-sql-editor/main.ts`](../../examples/14-standalone-sql-editor/main.ts)
(`HostSqlEditor` at lines 31-122; the `refreshAll` wiring at lines 298-305).

### Why a thunk, not a snapshot

Pass `() => table.actions.getCompletionContext()` rather than the snapshot
`table.actions.getCompletionContext()`. Capturing the snapshot at editor
construction freezes the schema for the editor's lifetime — `refreshContext`
would re-supply the same stale array on every call. The thunk re-reads
live state on every invocation, which is what makes
`derivedChange`-driven refresh work.

## Literal-schema path

When the editor lives somewhere a `DataTable` doesn't — a saved query
template, a configuration form, a remote-schema preview, a sandbox — the
schema comes from your own data, not from a worker query.
`buildCompletionContext` accepts very loose input: anything with a `name`
field works, and `type` / `originalType` / `isDerived` are all optional.
When both `originalType` and `type` are present `originalType` wins
(matches the data-table's internal behavior); unknown types fall back to
an empty string.

```ts
import { buildCompletionContext, createSqlExtensions } from '@jeyabbalas/data-table/advanced';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { autocompletion } from '@codemirror/autocomplete';

const ctx = buildCompletionContext([
  { name: 'price', type: 'DOUBLE' },
  { name: 'qty', type: 'BIGINT' },
  { name: 'sku' }, // type unknown — autocomplete still works
]);

const view = new EditorView({
  state: EditorState.create({
    extensions: [createSqlExtensions(ctx), autocompletion()],
  }),
  parent: hostEl,
});
```

To refresh literal-schema autocomplete (e.g. the user picks a different
template), wrap the `createSqlExtensions(ctx)` call in a `Compartment`
exactly like the live-schema path and dispatch a `reconfigure` when
your schema source changes.

### System columns in literal mode

`actions.getCompletionContext()` already filters the synthetic `__rowid__`
column. If you obtain columns from `actions.tableSchema` or some external
source (a saved schema JSON, a config import), filter
`name === '__rowid__'` before passing to `buildCompletionContext` —
otherwise the synthetic id will appear in the autocomplete dropdown.
([`src/sql-editor/extensions.ts:84-89`](../../src/sql-editor/extensions.ts).)

## Customizing the function list

By default `createSqlExtensions` populates function autocomplete from the
176-entry `DUCKDB_FUNCTION_DETAILS` array. The `options.functions` field
overrides that list with three distinct behaviors, in this precedence
order ([`src/sql-editor/extensions.ts:140-142`](../../src/sql-editor/extensions.ts)):

| `options.functions`    | Effect                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `undefined` (default)  | Falls through to `context.functions` (if set), then to `DUCKDB_FUNCTION_DETAILS`.                                                                                |
| `[]` (empty array)     | **Disables** function autocomplete entirely; only column completions are surfaced. Does **not** fall through — `??` only treats `null` / `undefined` as missing. |
| `DuckDBFunctionInfo[]` | Replaces the list. Each completion gets `detail` (the category chip) and `info` (the description shown in the side panel on focus).                              |
| `string[]`             | Replaces the list with names only. No category chip, no description side panel.                                                                                  |

```ts
import {
  DUCKDB_FUNCTION_DETAILS,
  createSqlExtensions,
  type DuckDBFunctionInfo,
} from '@jeyabbalas/data-table/advanced';

// (a) Filter by category — keep aggregate + numeric only.
const aggregateAndNumeric: readonly DuckDBFunctionInfo[] = DUCKDB_FUNCTION_DETAILS.filter(
  (f) => f.category === 'aggregate' || f.category === 'numeric',
);
const ext = createSqlExtensions(ctx, { functions: aggregateAndNumeric });

// (b) Names only — no category chip / description tooltip.
createSqlExtensions(ctx, { functions: ['avg', 'sum', 'count'] });

// (c) Disable function autocomplete entirely.
createSqlExtensions(ctx, { functions: [] });
```

`DuckDBFunctionCategory` is the union type for the `category` field:

```ts
type DuckDBFunctionCategory =
  | 'aggregate'
  | 'numeric'
  | 'string'
  | 'date/time'
  | 'casting'
  | 'conditional'
  | 'list'
  | 'struct'
  | 'window'
  | 'utility';
```

For a names-only-but-fixed surface that matches the existing
`DUCKDB_FUNCTIONS` constant, pass the constant itself — it's now derived
from `DUCKDB_FUNCTION_DETAILS` so the two cannot drift:

```ts
import { DUCKDB_FUNCTIONS, createSqlExtensions } from '@jeyabbalas/data-table/advanced';

createSqlExtensions(ctx, { functions: DUCKDB_FUNCTIONS });
```

## Theming

`createSqlExtensions` includes the library's CodeMirror theme by default
(`includeTheme: true`). Both the theme (`dataTableTheme`) and its companion
syntax-highlighting (`dataTableHighlighting`) reference the `--dt-*` CSS
variables defined on `:root` by the imported `styles.css`, so light/dark
mode changes propagate automatically — even when the host theme variables
flip mid-session.

Three patterns, in increasing host control:

```ts
// (a) Use the library theme. Easiest match with the bundled
//     CodeMirrorExpressionEditor. Just call createSqlExtensions(ctx).
createSqlExtensions(ctx);

// (b) Roll your own theme. The --dt-* variables are still on :root, so
//     referencing them from EditorView.theme(...) keeps light/dark coherence.
import { EditorView } from '@codemirror/view';
const myTheme = EditorView.theme({
  '&': { fontSize: '13px' },
  '.cm-editor': {
    border: '1px solid var(--dt-border)',
    background: 'var(--dt-bg)',
  },
  '.cm-editor.cm-focused': { borderColor: 'var(--dt-primary)' },
});
const exts = [createSqlExtensions(ctx, { includeTheme: false }), myTheme];

// (c) Apply the library theme, but outside the Compartment so it survives
//     schema reconfiguration without flicker. This is what the bundled
//     CodeMirrorExpressionEditor does (CodeMirrorExpressionEditor.ts:68-70).
import {
  createSqlExtensions,
  dataTableTheme,
  dataTableHighlighting,
} from '@jeyabbalas/data-table/advanced';
import { Compartment } from '@codemirror/state';

const sqlCompartment = new Compartment();
const exts = [
  sqlCompartment.of(createSqlExtensions(ctx, { includeTheme: false })),
  dataTableTheme,
  dataTableHighlighting,
];
```

For a worked example of pattern (b), see
[`examples/14-standalone-sql-editor/main.ts:62-83`](../../examples/14-standalone-sql-editor/main.ts) —
a host theme that uses `--dt-border`, `--dt-bg`, and `--dt-primary` so the
editor tracks the table's color scheme without copying any colors.

## Recipes

### Sharing a single context across multiple editors

When two editors live next to the same `DataTable` (a filter SQL composer
_and_ a derived-column composer, say), they should pull from the same
thunk and refresh together. Example 14 wires this up explicitly:

```ts
const getContext = () => table.actions.getCompletionContext();
const filterEditor = new HostSqlEditor(filterEl, { placeholder: 'WHERE …', getContext });
const exprEditor = new HostSqlEditor(exprEl, { placeholder: 'expr', getContext });

function refreshAll() {
  filterEditor.refreshContext();
  exprEditor.refreshContext();
}
table.on('loadComplete', refreshAll);
table.on('derivedChange', refreshAll);
```

(See [`examples/14-standalone-sql-editor/main.ts:298-305`](../../examples/14-standalone-sql-editor/main.ts).)

### Restricting autocomplete to one category

Use `DUCKDB_FUNCTION_DETAILS.filter` to scope the list down. Useful for a
"build a numeric expression" UI where window / list / struct functions
would just be noise:

```ts
const numericOnly = DUCKDB_FUNCTION_DETAILS.filter(
  (f) => f.category === 'numeric' || f.category === 'aggregate' || f.category === 'casting',
);
createSqlExtensions(ctx, { functions: numericOnly });
```

### Validating before applying

Pair the editor with `actions.validateSQLFilter(sql)` /
`actions.validateExpression(expr)` and gate your "Apply" button on
success:

```ts
applyButton.onclick = async () => {
  const sql = editor.getValue();
  const result = await table.actions.validateSQLFilter(sql);
  if (!result.valid) {
    showError(result.error);
    return;
  }
  table.actions.addRawSQLFilter(sql, 'My filter');
};
```

The error string comes from DuckDB; surface it directly. See the filter
SQL composer in
[`examples/14-standalone-sql-editor/main.ts:159-197`](../../examples/14-standalone-sql-editor/main.ts).

### Disabling function autocomplete entirely

If your editor is a "raw column reference picker" UI and you don't want
the dropdown cluttered with functions:

```ts
createSqlExtensions(ctx, { functions: [] });
```

### Lower-case keywords

The library's default is uppercase (`SELECT`, `WHERE`, `AND`) to match
DuckDB's preferred style. To match a host editor that uses lowercase:

```ts
createSqlExtensions(ctx, { upperCaseKeywords: false });
```

## Gotchas

- **You must add `autocompletion()` yourself.** `createSqlExtensions` ships
  the autocomplete _source_ (a `PostgreSQL.language.data.of({ autocomplete:
... })` extension), not the autocomplete UI extension. Without
  `autocompletion()` from `@codemirror/autocomplete` in your extension
  array, no dropdown ever appears — even though the source is wired
  correctly. The bundled `CodeMirrorExpressionEditor` adds it explicitly
  ([`src/sql-editor/CodeMirrorExpressionEditor.ts:60-62`](../../src/sql-editor/CodeMirrorExpressionEditor.ts));
  example 14 does the same
  ([`main.ts:55`](../../examples/14-standalone-sql-editor/main.ts)).

- **`options.functions: []` does not fall through.** Empty array disables
  function autocomplete entirely — only `undefined` falls through to
  `context.functions` and then to `DUCKDB_FUNCTION_DETAILS`. The helper
  uses `??`, which only treats `null` / `undefined` as missing
  ([`src/sql-editor/extensions.ts:140-142`](../../src/sql-editor/extensions.ts)).

- **System columns are not filtered in literal mode.** If your column
  array came from `actions.tableSchema` (or any raw source), filter
  `name === '__rowid__'` before passing to `buildCompletionContext` — the
  helper does not strip system columns automatically.
  `actions.getCompletionContext()` already filters the synthetic id;
  literal-schema sources don't.

- **The autocomplete tooltip portals to `document.body`.** CodeMirror
  mounts the dropdown outside your editor element, so any CSS scoped to
  the editor container won't reach the tooltip. Pass
  `tooltipClass: () => 'my-app-sql-autocomplete'` (or similar) to
  `autocompletion()` and target that class for any styling — the bundled
  editor uses the same trick to avoid colliding with other CodeMirror
  editors on the host page
  ([`src/sql-editor/CodeMirrorExpressionEditor.ts:60-62`](../../src/sql-editor/CodeMirrorExpressionEditor.ts)).

- **`Compartment.reconfigure` preserves view state; full state replacement
  does not.** If you refresh by dispatching a brand-new `EditorState`, you
  lose undo history, focus, selection, and scroll position. Use
  `Compartment.reconfigure` for schema swaps; reserve full state
  replacement for "reset the editor" operations the user explicitly
  triggered.

- **CodeMirror peer deps are optional in general, but required when you
  use these primitives.** Per the [README install
  block](../../README.md#install): `@codemirror/lang-sql`,
  `@codemirror/state`, `@codemirror/view`, `@codemirror/autocomplete`,
  `@codemirror/language`, `@codemirror/commands`, and `@lezer/highlight`
  are optional peers. Hosts that supply their own `editorFactory` or
  disable the SQL filter button can omit them — but
  `createSqlExtensions` / `buildCompletionContext` consumers cannot.

- **Mixed `DuckDBFunctionInfo[]` and `string[]` arrays are not
  supported.** The helper detects the shape from the first element and
  applies it to the whole array
  ([`src/sql-editor/extensions.ts:185-198`](../../src/sql-editor/extensions.ts)).
  Pass either rich objects or plain names, not both.

## Related

- [API reference — SQL editor primitives](../api-reference.md#sql-editor-primitives)
- [Derived columns](./derived-columns.md) — the bundled
  `CodeMirrorExpressionEditor` for the in-table case (turnkey class
  wrapping the same primitives)
- [Filters](./filters.md) — `RawSQLFilter` is one common host-built
  composer use case
- [Filter presets](./filter-presets.md) — sharable named filter sets,
  often paired with a host-built SQL composer
- Runnable: [`examples/14-standalone-sql-editor`](../../examples/14-standalone-sql-editor/)
- Source: `src/sql-editor/extensions.ts`,
  `src/sql-editor/duckdbFunctionDetails.ts`, `src/sql-editor/theme.ts`,
  `src/sql-editor/CodeMirrorExpressionEditor.ts`
