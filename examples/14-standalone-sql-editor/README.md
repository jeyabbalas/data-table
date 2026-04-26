# 14 — Standalone SQL editor

Embed a CodeMirror SQL editor _outside_ the data table — for example, in a
filter-preset composer or a derived-column wizard that is part of your own
UI shell — while still getting the library's SQL grammar, schema-aware
column autocomplete, and DuckDB function autocomplete (with category +
description).

## Run

```bash
npm run dev
# open http://localhost:5173/data-table/examples/14-standalone-sql-editor/
```

## API surface

- `createSqlExtensions(context, options?)` — returns a CodeMirror
  `Extension[]` carrying the PostgreSQL grammar, the schema/function
  autocomplete source, and (optionally) the library's theme. Drop it into
  any `EditorState.create({ extensions })` alongside your own keymap,
  placeholder, gutters, and sizing.
- `buildCompletionContext(columns, options?)` — converts any column-like
  array (`ColumnSchema[]` from the library, or an ad-hoc `[{name, type},
…]`) into the `CompletionContext` shape `createSqlExtensions` expects.
- `DUCKDB_FUNCTION_DETAILS` — curated array of `{ name, category,
description }` used by default for function autocomplete. Pass a subset
  via `options.functions` to restrict the list, or supply a `string[]` for
  names-only completions.
- `dataTableTheme`, `dataTableHighlighting` — the same CodeMirror theme +
  syntax highlighting the bundled `CodeMirrorExpressionEditor` uses.
  Re-exported so a host that opts out of `includeTheme` can still apply
  them surgically.
- `CodeMirrorExpressionEditor` — turnkey class for hosts that don't need
  the assembly-level control this example demonstrates.

## What to observe

1. **Live schema in autocomplete.** Click into either editor and press
   <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Space</kbd> (or just type a partial
   identifier). The dropdown lists the loaded columns (`trip_distance`,
   `fare_amount`, `tip_amount`, `payment_type`, `tpep_pickup_datetime`,
   …) with their DuckDB types in the `detail` column.
2. **Function metadata.** Type a partial function name (e.g. `avg`,
   `regexp`, `date_t`). DuckDB functions show their **category**
   (aggregate, string, date/time, …) in the `detail` chip and a one-line
   **description** in the side panel that opens when you focus an option.
3. **Validate against DuckDB.**
   - **Filter SQL composer** → `actions.validateSQLFilter(sql)` runs the
     WHERE clause and reports the match count or the parse/runtime error.
   - **Derived expression composer** → `actions.validateExpression(expr)`
     reports the detected DuckDB type or the error.
4. **Apply round-trip.**
   - **Apply** on the filter pane calls `actions.addRawSQLFilter`. The
     resulting chip appears above the table and the row count drops.
   - **Add column** on the expression pane calls
     `actions.addDerivedColumn({ kind: 'expression', name, expression })`.
     The new column appears in the grid and in both editors' autocomplete
     immediately afterward — proving the live-schema refresh works.
5. **Schema sync without a re-mount.** Both editors subscribe to
   `loadComplete` and `derivedChange` and call
   `editor.refreshContext()` — internally a single
   `Compartment.reconfigure()` swap — so the existing CodeMirror view and
   undo history are preserved.

## Two ways to use the API

### Live-schema path (this example)

```ts
import { createSqlExtensions } from '@jeyabbalas/data-table/advanced';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

const sqlCompartment = new Compartment();
const view = new EditorView({
  state: EditorState.create({
    extensions: [
      sqlCompartment.of(createSqlExtensions(table.actions.getCompletionContext())),
      // …host-controlled extensions: keymap, placeholder, theme, gutters
    ],
  }),
  parent: hostEl,
});

// On schema change:
table.on('derivedChange', () => {
  view.dispatch({
    effects: sqlCompartment.reconfigure(createSqlExtensions(table.actions.getCompletionContext())),
  });
});
```

### Literal-schema path (no `DataTable`)

```ts
import { buildCompletionContext, createSqlExtensions } from '@jeyabbalas/data-table/advanced';

const ctx = buildCompletionContext([
  { name: 'price', type: 'DOUBLE' },
  { name: 'qty', type: 'BIGINT' },
  { name: 'sku', type: 'VARCHAR' },
]);
const view = new EditorView({
  state: EditorState.create({ extensions: createSqlExtensions(ctx) }),
  parent: hostEl,
});
```

Use this when the schema comes from somewhere other than a loaded table —
e.g., a saved query template, a configuration form, or a remote API.

## Theming

`createSqlExtensions` includes the library's theme by default
(`includeTheme: true`). The example sets `includeTheme: false` and supplies
its own `EditorView.theme(...)` so the editor matches the surrounding
sidebar chrome. Either pattern is valid:

- **Use the library's theme** — easiest match with the bundled
  `CodeMirrorExpressionEditor`. Just call `createSqlExtensions(ctx)` and
  rely on the `--dt-*` CSS variables that the loaded `styles.css` defines
  on `:root` to adapt to light/dark mode.
- **Roll your own** — pass `includeTheme: false` and add an
  `EditorView.theme(...)` extension yourself. The `--dt-*` variables are
  still available on `:root`, so referencing them from your own theme
  keeps light/dark coherence with the table.

## Customizing the function list

```ts
import { DUCKDB_FUNCTION_DETAILS, createSqlExtensions } from '@jeyabbalas/data-table/advanced';

// Only allow aggregate + numeric functions in autocomplete
const subset = DUCKDB_FUNCTION_DETAILS.filter(
  (f) => f.category === 'aggregate' || f.category === 'numeric',
);
const ext = createSqlExtensions(ctx, { functions: subset });
```

Or pass plain names (no description / category in the dropdown):

```ts
createSqlExtensions(ctx, { functions: ['avg', 'sum', 'count'] });
```

Pass `[]` to disable function autocomplete entirely.

## Data

A 100,000-row × 19-column NYC Taxi & Limousine Commission trip-record
fixture (TLC, January 2024), loaded from
[`nyc_taxi.parquet`](../../tests/fixtures/datasets/parquet/nyc_taxi.parquet)
via `sourceFormat: 'parquet'`. The same trip-record dataset is used by
examples 02, 03, 04, 09, 10, 11, and 12 in their CSV form — example 14
exercises the parquet loader instead. Representative columns include
`trip_distance` (DOUBLE), `fare_amount` (DOUBLE), `tip_amount` (DOUBLE),
`payment_type` (BIGINT — `1` = credit card, `2` = cash), and
`tpep_pickup_datetime` (TIMESTAMP).

The pre-filled composer expressions exercise this schema:

- **Filter** — `trip_distance > 5 AND payment_type = 1` (long credit-card
  trips).
- **Derived column** — `100 * tip_amount / NULLIF(fare_amount, 0)`
  computes tip percentage; `NULLIF` guards against zero-fare divides. The
  same expression is added programmatically in example 04.
