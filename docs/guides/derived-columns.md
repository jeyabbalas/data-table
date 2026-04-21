# Derived columns

A *derived column* is a virtual column layered over the loaded table. It
looks like any other column to filters, sorts, and visualizations, but its
values come from one of two sources:

- **Expression columns** — a DuckDB SQL expression evaluated against the
  source rows (`CASE WHEN age < 18 THEN 'minor' ELSE 'adult' END`).
- **Vector columns** — a pre-computed array you supply, one value per row
  (useful for model predictions, cluster IDs, JS-computed annotations that
  don't translate to SQL).

Under the hood, the library creates a DuckDB `VIEW` that combines the base
table with derived columns; all queries transparently route through the VIEW.

## You'll learn how to

- Add, update, rename, and remove derived columns programmatically
- Choose between expression and vector columns
- Handle type detection and validation errors
- Understand VIEW reconciliation during undo/redo

## Prerequisites

- Read: [API reference — Derived columns](../api-reference.md#derived-columns)
- Runnable example: [`examples/04-derived-columns`](../../examples/04-derived-columns/)
- Helpful: basic SQL familiarity (for expression columns)

## Minimal example

```ts
const { success, error } = await table.actions.addDerivedColumn({
  kind: 'expression',
  name: 'age_group',
  expression: `CASE WHEN age < 18 THEN 'minor'
                    WHEN age < 65 THEN 'adult'
                    ELSE 'senior' END`,
});

if (!success) {
  console.warn('Could not add column:', error);
}
```

After this call, `age_group` appears in `state.schema`, `state.visibleColumns`,
and `state.columnOrder`. A `derivedChange` event fires with the updated list.

## Expression columns

```ts
await table.actions.addDerivedColumn({
  kind: 'expression',
  name: 'revenue_per_user',
  expression: 'revenue / NULLIF(users, 0)',
});
```

DuckDB evaluates the expression against the base table; the library uses
`DESCRIBE` on the generated VIEW to detect the result type. Any valid DuckDB
expression works, including:

- Arithmetic and string operations (`price * 1.1`, `UPPER(name)`)
- `CASE WHEN ... THEN ... ELSE ... END`
- Built-in functions (`DATE_TRUNC('month', signed_up)`, `LENGTH(description)`)
- References to other derived columns (order of addition matters — see gotchas)

### Validation

- **Name uniqueness.** Duplicating an existing column name returns
  `{ success: false, error: 'Column name "X" already exists' }`.
- **Empty name.** Returns `{ success: false, error: 'Column name cannot be empty' }`.
- **Syntax errors.** The library runs the VIEW creation and surfaces DuckDB's
  parse or type-inference error in the `error` string.

## Vector columns

Use vectors when the derivation happens outside SQL — e.g., model inference,
JS-side computation, data you fetched from elsewhere.

```ts
// Suppose you have predictions aligned with each row of the base table.
const predictions = await runModel(table);   // number[] with length === totalRows

await table.actions.addDerivedColumn({
  kind: 'vector',
  name: 'churn_probability',
  vectorType: 'float',
  values: predictions,
});
```

`vectorType` must match one of the supported DuckDB types:
`integer | float | decimal | string | boolean | uuid | date | timestamp | time | interval`.

`values` must be an `ArrayLike<number>`, `ArrayLike<string>`, or
`ArrayLike<boolean>` whose length equals the row count of the base table. A
shorter or longer array is a validation error.

Vector values are stored in a DuckDB helper table (`__dt_helper_<id>__`) and
persist across page reloads when session persistence is enabled.

## Updating a derived column

```ts
// Expression: change the formula
await table.actions.updateDerivedColumn('revenue_per_user', {
  kind: 'expression',
  name: 'revenue_per_user',
  expression: 'revenue / NULLIF(users + 1, 0)',   // defensive divide
});

// Rename: change the name
await table.actions.updateDerivedColumn('age_group', {
  kind: 'expression',
  name: 'cohort',            // new name
  expression: `CASE WHEN age < 18 THEN 'minor' ELSE 'adult' END`,
});
```

A rename propagates to:

- `state.schema` (entry renamed)
- `state.visibleColumns`, `columnOrder`, `pinnedColumns`, `columnWidths`
- Any filters or sorts referencing the old name are retained under the new name

If the updated type differs from the old type (e.g., expression was
`INTEGER`, now `VARCHAR`), filters on the column are dropped — they no longer
make sense against the new type.

## Removing a derived column

```ts
await table.actions.removeDerivedColumn('age_group');
```

The VIEW is recreated without the column; `derivedChange` fires with the
updated list.

## How the VIEW works

When the first derived column is added, the library creates a DuckDB VIEW
named `__dt_view_<baseTableName>__` combining the base table columns with the
derived columns. `state.tableName` is switched from the base table to the
VIEW, so all queries (filters, visualizations, exports) transparently route
through the derived-column definitions.

On any derived column change (add/update/remove), the VIEW is dropped and
recreated. This is cheap — DuckDB VIEWs are metadata only — and happens
asynchronously; subscribe to `derivedChange` to know when it's done.

If all derived columns are removed, the VIEW is dropped and `state.tableName`
switches back to the base table.

## Reading derived state

```ts
const derived = table.state.derivedColumns.get();
// DerivedColumnDef[] — same shape you passed to addDerivedColumn

table.on('derivedChange', ({ derivedColumns }) => {
  console.log('Derived columns changed:', derivedColumns.map(d => d.name));
});
```

## Undo / redo

Derived column changes participate in the undo/redo stack. One important
detail: the VIEW must be reconciled with DuckDB *before* the view-state
signals apply. The library handles this for you — `actions.undo()` and
`actions.redo()` are `async` precisely because they wait for VIEW
reconciliation.

```ts
const undone = await table.actions.undo();   // true if there was something to undo
const redone = await table.actions.redo();
```

See [State model → Undo/redo snapshots](../concepts/state-model.md) for the
snapshot shape.

## Expression editor (raw-SQL + derived-column modal)

The default CodeMirror-based expression editor provides column-name and
function autocompletion via the `CompletionContext` type. If you disable
CodeMirror (or replace it), supply a custom editor factory:

```ts
await createDataTable({
  container,
  source,
  editorFactory: (mount, ctx) => {
    // Your implementation of ExpressionEditorFactory
  },
});
```

See [`src/derived/ExpressionEditorTypes.ts`](../../src/derived/ExpressionEditorTypes.ts)
for the contract.

## Recipes

### Cluster column from a JS computation

```ts
const clusterLabels = await kmeans(rows, 4);   // string[] like ['A', 'B', 'A', ...]

await table.actions.addDerivedColumn({
  kind: 'vector',
  name: 'cluster',
  vectorType: 'string',
  values: clusterLabels,
});
```

### Derived percentile column (pure SQL)

```ts
await table.actions.addDerivedColumn({
  kind: 'expression',
  name: 'price_percentile',
  expression: `NTILE(100) OVER (ORDER BY price)`,
});
```

### Check-then-add

```ts
const existing = table.state.schema.get().map(c => c.name);
if (!existing.includes('revenue_per_user')) {
  await table.actions.addDerivedColumn({
    kind: 'expression',
    name: 'revenue_per_user',
    expression: 'revenue / NULLIF(users, 0)',
  });
}
```

## Gotchas

- **`addDerivedColumn` returns `{ success, error }` instead of throwing.** This is deliberate — invalid expressions are a normal user-input error, not a crash. Check `success` before assuming the column exists.
- **Vector length must equal total row count.** Not filtered row count. If you re-derive after a filter, pass a full-length array.
- **Expression columns can reference earlier derived columns.** `col_b = col_a * 2` works *if* `col_a` was added first. Circular references are rejected.
- **Renaming a derived column also retains its filters.** Filters referencing the old name get updated. Filters on base columns are untouched.
- **Type changes drop filters on that column.** If a derived column's detected type changes (e.g., a rewrite turns `INTEGER` into `VARCHAR`), the old filter doesn't survive.
- **Undo/redo for derived changes is async.** `await` the result if you need to observe post-reconciliation state.
- **Vector columns stay in memory (and IDB snapshots).** Large vectors — hundreds of thousands of entries — cost memory and enlarge session snapshots. Prefer expression columns whenever the derivation can be expressed as SQL.
- **Removing a non-derived column via `removeDerivedColumn` is a no-op.** It only touches columns marked `isDerived`. To hide a base column, use `hideColumn()`.

## Related

- State model: [Concepts → State model](../concepts/state-model.md) for snapshot shape and reconciliation timing
- Events: [Events guide — `derivedChange`](./events.md)
- API reference: [Derived columns](../api-reference.md#derived-columns)
- Source: `src/derived/types.ts:1-59`, `src/derived/DerivedColumnManager.ts`, `src/core/Actions.ts:998-1300`
