# Derived columns

A _derived column_ is a virtual column layered over the loaded table. It
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

DuckDB evaluates the expression against the base table. The library types it
with `DESCRIBE SELECT (expression) …`, which binds the query without reading
a row, so an expression on an empty table gets its own type rather than
`VARCHAR` (`src/derived/DerivedColumnManager.ts`, `detectType`). An
expression may return a nested value, a list or a struct, which makes a
`'nested'` column. Any DuckDB expression with one value for each row works,
including:

- Arithmetic and string operations (`price * 1.1`, `UPPER(name)`)
- `CASE WHEN ... THEN ... ELSE ... END`
- Built-in functions (`DATE_TRUNC('month', signed_up)`, `LENGTH(description)`)
- Window functions (`sum(price) OVER ()`) and list functions with lambdas
  (`list_transform(tags, lambda x: upper(x))`)
- References to other derived columns (order of addition matters — see gotchas)

Two kinds of expression have no one value for each row, and are refused with
`EXPRESSION_INVALID` and a message that says what to write instead:

- **Several rows for a row.** `unnest(tags)` gives a row for each element of
  the list and none for an empty one, and so do `generate_subscripts` and
  `regexp_split_to_table`, which unnest inside: as a column, it would give
  the VIEW more rows than the table, or fewer. Use a list function such as
  `list_transform`, or a subquery, which is one value:
  `(SELECT max(u) FROM unnest(tags) AS x(u))`. The type's `DESCRIBE` carries
  a `QUALIFY`, where DuckDB refuses an unnest, so one inside a `CASE` or an
  operator is caught too; one over a star expression,
  `unnest(COLUMNS('tags'))`, is not.
- **An aggregate.** `sum(price)` makes one row of the whole table. A window,
  `sum(price) OVER ()`, puts the total beside each row.

### Validation

- **Name uniqueness.** Duplicating an existing column name returns
  `{ success: false, error: 'Column name "X" already exists' }`. That
  includes a name an earlier call is still adding: changes
  [run one at a time](#changes-run-one-at-a-time), and the second add is
  validated once the first has landed.
- **Names ignore letter case.** DuckDB binds `"LABEL"` to a column named
  `label`, so a `LABEL` beside `label` is refused, with an `error` that
  ends `already exists as "label" (column names ignore letter case)`. Only
  ASCII letters fold: `é` and `É` are two names. A rename that changes only the
  case of a column's own name (`total` to `Total`) is allowed, and
  `__rowid__` is reserved in any case. Before 0.9 such a column was added,
  and its values were `label`'s. The add-column dialog and the edit panel
  check the name the same way as you type, naming the column it collides
  with: `PRICE` shows "A column named "price" already exists". A session
  restore, an undo and a redo apply the rule too: a derived column whose
  name is taken, `Total` saved with one file and restored beside another
  file's `total`, is not brought back. A `console.warn` carries a
  `DerivedColumnError` coded `DUPLICATE_NAME`, the snapshot's filters, sort
  and layout for that column are dropped, and a base column of the same name
  keeps its place.
- **Empty name.** Returns `{ success: false, error: 'Column name cannot be empty' }`.
- **Syntax errors.** The library binds the expression as the column of the
  VIEW it would be, `SELECT *, (expression) AS "name"` over the table
  (`layerSelect`), in a query that reads no row and returns none of the
  expression's values, only a NULL column (`SELECT NULL FROM (…) LIMIT 0`,
  `bindOnly`, both in `src/derived/DerivedColumnManager.ts`), so a VARIANT
  expression validates too. DuckDB's parse or binder error comes back in the
  `error` string, except for the two refusals above, whose messages say what
  to write instead.
  Binding checks no value: an expression that fails on some rows only, such
  as a `CAST` of text that is not a number, is added, and its failure shows
  when those rows are fetched (see
  [Troubleshooting §30](../troubleshooting.md#30-error-fetching-rows-in-the-console-and-rows-that-stay-placeholders)).

## Vector columns

Use vectors when the derivation happens outside SQL — e.g., model inference,
JS-side computation, data you fetched from elsewhere.

```ts
// Suppose you have predictions aligned with each row of the base table.
const predictions = await runModel(table); // number[] with length === totalRows

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

Vector values are stored in a DuckDB helper table,
`__dt_vec_<m>_<name>_<n>__`, whose two numbers keep apart the helper tables
of every table on one bridge, and persist across page reloads when session
persistence is enabled.

## Nested columns

A derived column can read one part of a
[nested column](./loading-data.md#nested-and-json-columns) (a list, struct,
map, union or JSON value), and the column it makes is an ordinary one: a
number column gets a histogram, stats and range filters, which the nested
column's own summary chart does not offer.

`actions.addNestedFieldColumn(column, path, options?)` writes the expression
for you, names the column, and puts it right after its source:

```ts
// point: STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)
await table.actions.addNestedFieldColumn('point', ['x']); // { success: true, name: 'point_x' }
// people: STRUCT(name VARCHAR, langs VARCHAR[])[]: the first person's second language
await table.actions.addNestedFieldColumn('people', [1, 'langs', 2]); // people_1_langs_2
// attrs: MAP(VARCHAR, INTEGER): its number of entries
await table.actions.addNestedFieldColumn('attrs', [], { extract: 'length' }); // attrs_size
// doc: JSON such as {"score": 0.92}, read as a number
await table.actions.addNestedFieldColumn('doc', ['score'], { jsonLeaf: 'number' }); // doc_score
```

Each step of `path` is read against the column's DuckDB type: a struct
field's name or 1-based position, a list or array element's 1-based
position, a map key, a union member's tag, and inside JSON or a VARIANT,
object keys and 0-based array indexes. Field names and union tags match
ignoring the case of ASCII letters; map keys and JSON keys match exactly, and
a JSON key in the wrong case reads NULL in every row. `extract` reads the value
(`'value'`, the default), the `'length'` of a list, array, map or JSON array,
or a union's `'tag'`; `jsonLeaf` says how a value inside JSON reads
(`'string'`, `'number'`, `'boolean'` or `'json'`; `'number'` and `'boolean'`
cast the value's text, so `"12.5"` reads as 12.5 and `1`, `0` and `"true"` as
booleans). The default name, such as
`point_x`, needs no quoting and gets `_2`, `_3` when taken; pass `name` to
choose one. Extracts of one column stay together in the order made
(`point, point_x, point_y`), a pinned source's go right after the pinned
columns, and each add is one undo entry. A path that does not fit, or a name
that is taken, resolves `{ success: false, error }` with a message naming
the step. See
[API reference → Extracting a nested field](../api-reference.md#extracting-a-nested-field).

### From the column header

A nested or JSON column's header has an extract button, after its filter
button, which opens the extract panel under it. The panel shows the column's
type as a keyboard tree: a struct's fields at any depth, an unnamed one by its
1-based position; a union's tag, then its members; a list's or an array's
length, then its element; a map's size, then its value. The elements and map
values at the top level start expanded, so a list of structs shows its fields
at once. A JSON or VARIANT column has no tree: the panel starts with the JSON
path. Pick a part, and the panel asks for what it still needs:

- a 1-based position for each list or array element on the way, labelled
  after its container ("Position in people", "Position in matrix › element"),
  at most an array's size;
- a key for each map value ("Key in attrs");
- for a part that is JSON or VARIANT, a JSON path and how to read what it
  leads to. The path is written as `$.a.b[0]`: the `$` is optional, keys
  follow dots, array indexes start at 0, and a key with a dot, a bracket or a
  quote goes in brackets with JSON escapes, `$["a.b"]` or `$['it\'s']`.
  Wildcards, slices and `..` are refused. "Read as" is Text, Number, Boolean,
  JSON or Array length, which reads the length of the array there.

The column's name follows the part picked until you type one; emptied, it
follows again, and the placeholder shows the name it would get. A name that
another column has in any letter case, or `__rowid__`, is refused. The SQL the
column will read is shown beneath, and an error, such as a position past an
array's end, shows under the fields as you type. Add column, `Enter` in a
text or number field (not the "Read as" select) or `Ctrl/Cmd+Enter` adds it.

The value inspector does the same for the node it is on: its footer's "Add as
column", "Add length as column", "Add size as column" and "Add tag as column",
a row's "+" on hover, or `Ctrl/Cmd+Enter`. From either, the column goes right
after its source as one undo entry, the cursor moves to it, on its header
from the panel or on the inspected row from the inspector, the view scrolls
to it and the live region says "Column point_x added". A failure stays in
the panel that asked. An add still running is not sent again: a panel
opened again on its column says "Adding…" until it lands. Once the panel
that asked is closed, by Cancel, `Escape`, a press outside, another panel or
the cursor moving on, the column is still added, once, and announced, but
the cursor, the view and focus stay where they are. Both are part of the
`derivedColumns` UI: `derivedColumns: false` removes the extract button and
the inspector's add buttons, and `addNestedFieldColumn` works either way.
`table.container.extractColumn({ column, path, ...options, row })` is the
same add from code, with the cursor move and the announcement; the same
request while one is still running gets that one's promise.

### Written by hand

The expressions it writes, which `addDerivedColumn` takes as well:

| To read                     | Expression                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A struct's field            | `"point"['x']`; an unnamed one by position, `struct_extract("pair", 1)`; one named `''`, `struct_extract_at("s", 2)`   |
| A list's or array's element | `"tags"[1]`: positions start at 1, as in SQL                                                                           |
| A list's or array's length  | `len("tags")`, a `BIGINT`                                                                                              |
| A map's value               | `map_extract_value("attrs", 'size')`; the key is a literal of the key type                                             |
| A map's number of entries   | `cardinality("attrs")`, a `UBIGINT`                                                                                    |
| A union's member, its tag   | `union_extract("u", 'num')`; `union_tag("u")`, an `ENUM` of the tags                                                   |
| A key inside JSON           | `json_extract_string("doc", '$.k')` for text, `TRY_CAST(json_extract_string("doc", '$.score') AS DOUBLE)` for a number |

```ts
// point: STRUCT(x DOUBLE, y DOUBLE, tier VARCHAR)
await table.actions.addDerivedColumn({
  kind: 'expression',
  name: 'point_x',
  expression: `"point"['x']`,
});
```

Write a field with brackets, `"point"['x']`, rather than a dot: DuckDB reads
`"point"."x"` as column `x` of a table named `point` when the query has one
(the table you loaded, say), and as the field only otherwise. Brackets
always mean the field. Quote a field name with single quotes, doubling any
inside (`"odd"['it''s']`), and a column name with double quotes.

A derived column's own value may be nested too, a list or a struct built by
the expression; it is then a `'nested'` column like any other, shown,
filtered and exported as nested columns are.

## Updating a derived column

```ts
// Expression: change the formula
await table.actions.updateDerivedColumn('revenue_per_user', {
  kind: 'expression',
  name: 'revenue_per_user',
  expression: 'revenue / NULLIF(users + 1, 0)', // defensive divide
});

// Rename: change the name
await table.actions.updateDerivedColumn('age_group', {
  kind: 'expression',
  name: 'cohort', // new name
  expression: `CASE WHEN age < 18 THEN 'minor' ELSE 'adult' END`,
});
```

A rename propagates to:

- `state.schema` (entry renamed)
- `state.visibleColumns`, `columnOrder`, `pinnedColumns`, `columnWidths`
- Any filters or sorts referencing the old name are retained under the new name

If the update changes the column's DuckDB type (`ColumnSchema.originalType`),
filters on the column are dropped. DuckDB casts a filter's values to the
column's type, so they no longer fit: a `VARCHAR` made `JSON` would read a
value-count filter's `'active'` as malformed JSON and fail every query, and a
`FLOAT` compares `0.30000001` equal to `0.3` where a `DOUBLE` does not. So
`INTEGER` made `VARCHAR`, `DOUBLE` made `FLOAT`, `TIMESTAMP` made
`TIMESTAMPTZ`, a STRUCT made a LIST and `INTEGER[]` made `BIGINT[]` all drop
the filters. Integers and DECIMALs are the exception: DuckDB compares a
number with an integer of any width, or a DECIMAL of any precision and
scale, by value, so `INTEGER` made `BIGINT`, or `DECIMAL(12,3)` made
`DECIMAL(13,4)`, keeps them. `replaceDerivedColumn` drops them the same way.

## Replacing a derived column (same-name + dependent re-validation)

When an end-user _edits_ an existing expression, you usually want a
same-name swap with three guarantees:

1. The new expression is validated.
2. Every column that depends on this one is re-validated against the
   new definition.
3. If anything fails, nothing is committed and you get a structured
   list of the affected dependents.

That's `replaceDerivedColumn` — sibling to `updateDerivedColumn`, with
no rename and a discriminated return:

```ts
const result = await table.actions.replaceDerivedColumn('tip_pct', {
  kind: 'expression',
  name: 'tip_pct', // must equal the old name
  expression: 'tip_amount / NULLIF(fare_amount, 0) * 100',
});

if (result.success) {
  console.log('replaced', result.info);
} else {
  if (result.error.code === 'DEPENDENTS_INCOMPATIBLE') {
    // result.error.details.dependentsAffected: string[]
    // result.error.details.reasons: Record<string, string>
    console.warn('cannot replace tip_pct — would break:', result.error.details?.dependentsAffected);
  } else {
    console.warn(result.error);
  }
}
```

Pre-flight order — every step must pass before any DuckDB state
changes:

1. Confirm the column exists (`NOT_FOUND` if not).
2. Validate the new expression (`EXPRESSION_INVALID` on syntax errors,
   and for an aggregate).
3. Detect the new result type (`EXPRESSION_INVALID` for an unnest).
4. Re-run cycle detection (`CIRCULAR_DEPENDENCY` if a cycle would
   form).
5. Re-validate every dependent against the proposed substitution
   (`DEPENDENTS_INCOMPATIBLE` if any fail).
6. Commit — rebuild the VIEW. If DuckDB still rejects it (rare edge
   case), the VIEW and the column are left as they were.

For vector columns, the new vector's length must match the base table
row count (`VECTOR_LENGTH_MISMATCH` otherwise). Vector columns are
terminal in the dependency graph, so the dependent re-validation pass
is a no-op for vector replaces.

The `derivedChange` event fires on success with `kind: 'replaced'` and
`columnName` set, so app code can react without diffing the previous
list.

### When to use which

| Need                                                                        | API                                            |
| --------------------------------------------------------------------------- | ---------------------------------------------- |
| Edit an existing expression at the same name; want dependent re-validation. | `replaceDerivedColumn(name, newDef)`           |
| Rename a column.                                                            | `updateDerivedColumn(oldName, defWithNewName)` |
| Add a brand-new column.                                                     | `addDerivedColumn(def)`                        |
| Remove a column.                                                            | `removeDerivedColumn(name)`                    |

`updateDerivedColumn` continues to handle the rename path. Calling
`replaceDerivedColumn` with `newDef.name !== name` is rejected — the
two APIs are intentionally split.

## Removing a derived column

```ts
await table.actions.removeDerivedColumn('age_group');
```

The VIEW is recreated without the column; `derivedChange` fires with
`kind: 'removed'` and `columnName: 'age_group'`.

## Changes run one at a time

Derived-column changes, `undo`, `redo`, `resetToInitial`, `loadData` and
`clearSession` run one at a time, in the order they were called. Each starts
once the one before it has landed, and reads and validates the state that one
left, so calls need not wait for each other:

```ts
// Both land, in this order: `b` is validated once `a` exists.
const a = table.actions.addDerivedColumn({ kind: 'expression', name: 'a', expression: 'x * 2' });
const b = table.actions.addDerivedColumn({ kind: 'expression', name: 'b', expression: 'a + 1' });
await Promise.all([a, b]);
```

An `undo` called while an add runs waits for the add and undoes it; another
`undo` or `redo` called while one waits or runs resolves `false`, and so do
`undo`, `redo` and `resetToInitial` called while a load is under way, which
would act on the session the load restores. A change still waiting or running
when `loadData` or `clearSession` is called was meant for the old data and
does not apply: an add or update resolves `{ success: false }`, a replacement
resolves a `NOT_FOUND` error, a removal rejects with one, and an undo, redo or
reset resolves `false`.

## How the VIEW works

When the first derived column is added, the library creates a DuckDB VIEW
named `__dt_view_<baseTableName>__` combining the base table columns with the
derived columns. `state.tableName` is switched from the base table to the
VIEW, so all queries (filters, visualizations, exports) transparently route
through the derived-column definitions.

On any derived column change (add/update/remove), the VIEW is rebuilt with
one `CREATE OR REPLACE VIEW`. This is cheap — DuckDB VIEWs are metadata
only — and happens asynchronously; subscribe to `derivedChange` to know when
it's done. Every change is all or nothing: when the VIEW cannot be built for
it, the one there was stays, and so do the derived columns. A vector
column's update or replacement fills its new helper table beside the old
one, and the table no column reads any more is dropped once the VIEW is
built.

If all derived columns are removed, the VIEW is dropped and `state.tableName`
switches back to the base table.

## Reading derived state

```ts
const derived = table.state.derivedColumns.get();
// DerivedColumnDef[] — same shape you passed to addDerivedColumn

table.on('derivedChange', ({ derivedColumns }) => {
  console.log(
    'Derived columns changed:',
    derivedColumns.map((d) => d.name),
  );
});
```

## Undo / redo

Derived column changes participate in the undo/redo stack. One important
detail: the VIEW must be reconciled with DuckDB _before_ the view-state
signals apply. The library handles this for you — `actions.undo()` and
`actions.redo()` are `async` precisely because they wait for VIEW
reconciliation.

```ts
const undone = await table.actions.undo(); // true if there was something to undo
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
const clusterLabels = await kmeans(rows, 4); // string[] like ['A', 'B', 'A', ...]

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
const existing = table.state.schema.get().map((c) => c.name);
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
- **Expression columns can reference earlier derived columns.** `col_b = col_a * 2` works _if_ `col_a` was added first. Circular references are rejected.
- **Renaming a derived column also retains its filters.** Filters referencing the old name get updated. Filters on base columns are untouched.
- **Type changes drop filters on that column.** If a derived column's DuckDB type changes (e.g., a rewrite turns `INTEGER` into `VARCHAR`, `VARCHAR` into `JSON`, or `STRUCT(…)` into `INTEGER[]`), the old filter doesn't survive. Only a change within the integers (`INTEGER` to `BIGINT`) or within the DECIMALs keeps it.
- **Undo/redo for derived changes is async.** `await` the result if you need to observe post-reconciliation state.
- **Vector columns stay in memory (and IDB snapshots).** Large vectors — hundreds of thousands of entries — cost memory and enlarge session snapshots. Prefer expression columns whenever the derivation can be expressed as SQL.
- **`removeDerivedColumn` on a non-derived column rejects with `NOT_FOUND`.** It only removes columns marked `isDerived`, and leaves the table as it was. To hide a base column, use `hideColumn()`.

## Related

- State model: [Concepts → State model](../concepts/state-model.md) for snapshot shape and reconciliation timing
- Events: [Events guide — `derivedChange`](./events.md)
- API reference: [Derived columns](../api-reference.md#derived-columns)
- Source: `src/derived/types.ts:1-58`, `src/derived/DerivedColumnManager.ts`, `src/core/Actions.ts` (`addDerivedColumn` … `removeDerivedColumn`)
