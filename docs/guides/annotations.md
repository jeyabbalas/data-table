# Annotations

Annotations are app-authored overlay metadata you attach to rows,
columns, or individual cells of a loaded table. They are designed for
two downstream use cases:

- **Validation feedback.** Surface JSON-Schema or domain-specific
  validation errors against the rows that violate them.
- **Quality-control authoring.** Mark rows / cells flagged by
  rules during data exploration.

Each annotation carries a fixed three-level severity (`error` /
`warning` / `info`), a free-text `message`, and optional fields
(`code`, `source`, `metadata`). The library renders them as tinted
rows / cells / column headers and groups them in a single popover when
the user hovers an intersection.

The full data layer is programmatic — there is no built-in UI for
authoring annotations, only a typed CRUD API on `table.annotations.*`.
JSON round-trip is part of the contract so apps can persist
annotations off-device or sync them with a backend service.

## You'll learn how to

- Create, update, and remove annotations programmatically
- Look up annotations by row, column, or intersection
- Filter the rendered set by severity without touching the data
- Subscribe to a single change channel
- Round-trip annotations through JSON
- Coexist with sort, filter, and session persistence

## Prerequisites

- Read: [API reference — `table.annotations` namespace](../api-reference.md#tableannotations-namespace)
- Read (concept): [Architecture — Annotation overlay](../concepts/architecture.md#annotation-overlay-annotationstore)
- Runnable example: [`examples/11-annotations`](../../examples/11-annotations/)

## Minimal example

```ts
import { createDataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

const table = await createDataTable({
  container,
  source: '/data.csv',
});

table.annotations.add({
  scope: 'cell',
  rowId: 0,
  column: 'age',
  severity: 'error',
  message: 'Value 200 exceeds maximum allowed 150',
  code: 'JSON_SCHEMA_MAXIMUM',
});
```

After this call, row 0's `age` cell renders with the error tint, and
hovering the cell opens the annotation popover.

## What annotations are (and aren't)

| Annotations | Are | Are NOT |
|---|---|---|
| Storage | A separate store on `table.annotations` (overlay metadata) | A field on `TableState` |
| Undo/redo | Excluded — does not inflate the undo stack | Snapshotted by `UndoManager` |
| Persistence | Auto-saved into `SessionSnapshot.annotations` (v5+) | Round-tripped through `StateSnapshot` |
| Authoring UX | Programmatic CRUD; you build the authoring UI | Editable from a built-in dialog |
| Visual coupling | Rendered as DOM classes + intersection popover | A modification of the underlying cell value |

The split keeps app-authored validation results out of the user-driven
view-state pipeline. A 10 000-entry bulk-load of validation errors
should not produce 10 000 undo entries; the user pressing Cmd+Z should
not "undo" a validation result.

## CRUD

### `add` and `addMany`

```ts
// Single annotation. The library generates an `id` (ann_ + 26-char Crockford base32) if you omit one.
const stored = table.annotations.add({
  scope: 'row',
  rowId: 5,
  severity: 'warning',
  message: 'Row violates dependency on (lastName, firstName, dob)',
});

// Atomic batch — fires a single `change` event. If any entry fails, none are stored.
table.annotations.addMany([
  { scope: 'cell',   rowId: 0, column: 'age',        severity: 'error',   message: '…' },
  { scope: 'column', column: 'tip_amount',           severity: 'error',   message: '…' },
  { scope: 'row',    rowId: 7,                       severity: 'info',    message: '…' },
]);
```

If you supply an explicit `id`, the library preserves it; duplicate
ids reject with `AnnotationError('DUPLICATE_ID')`.

### `update`

```ts
table.annotations.update(stored.id, {
  message: 'Row violates dependency on (lastName, firstName, dob, sex)',
  severity: 'error',
});
```

`scope`, `rowId`, and `column` are immutable — passing them in `patch`
is a no-op. To change the scope, remove and re-add. The library
updates `updatedAt` on every successful update.

### `remove`, `removeMany`, `clear`

```ts
table.annotations.remove(stored.id);                       // returns true / false
table.annotations.removeMany([id1, id2, id3]);             // returns count actually removed
table.annotations.clear('cell');                           // remove only cell-scope; default is 'all'
```

`clear` fires one `change` event with the full id list, regardless of
how many annotations it removed.

## Lookups

```ts
const all       = table.annotations.getAll();                           // insertion order
const ofRow5    = table.annotations.getByRow(5);                        // row-scope only
const ofTotal   = table.annotations.getByColumn('total_amount');        // column-scope only
const here      = table.annotations.getByCell(7, 'fare_amount');        // intersection
```

`getByRow` / `getByColumn` return only annotations of that scope.
`getByCell(rowId, column)` returns the **union** of:

- row-scope annotations with `rowId === rowId`
- column-scope annotations with `column === column`
- cell-scope annotations at exactly `(rowId, column)`

…sorted by severity (`error` > `warning` > `info`), then `createdAt`
ascending, then insertion order. This is the list rendered in the
popover when the user hovers / focuses an annotated cell. The order
guarantees the most-relevant entry shows first.

All four lookups are O(1) thanks to secondary indexes (`byId`,
`byRow`, `byColumn`, `byCell`).

## Severity filter (view layer)

```ts
table.annotations.setSeverityFilter({ info: false });          // hide info-level visually
const flags = table.annotations.getSeverityFilter();
// → { error: true, warning: true, info: false }
```

The severity filter is purely a view concern. The store's data is
unchanged — `getAll`, `getByCell`, etc. still return the full set.
The rendering layer reads the flags and skips painting / popping
annotations whose severity is currently `false`. Re-enabling a flag
re-applies the visuals immediately.

A `change` event with `kind: 'filterChanged'` fires when a flag flips,
so app code (e.g. a count badge in your sidebar) can update.

## The change event

```ts
const off = table.annotations.on('change', ({ kind, ids }) => {
  if (kind === 'filterChanged') {
    // setSeverityFilter() was called.
  } else {
    // ids[] is the set of annotation IDs affected by this mutation.
    console.log(`${kind}: ${ids.length}`);
  }
});

// later:
off();
```

| `kind` | Fires when |
|---|---|
| `'added'` | `add` / `addMany` / `loadJSON('merge')` succeeded. `ids` lists the new annotations. |
| `'updated'` | `update` succeeded. `ids` is `[id]`. |
| `'removed'` | `remove` / `removeMany` removed at least one annotation. `ids` lists the removed ones. |
| `'cleared'` | `clear` removed any number (including zero). `ids` lists the removed ones. |
| `'filterChanged'` | `setSeverityFilter` flipped a flag. `ids` is `[]` (the data didn't change). |

Bulk operations fire **one** event with the full id list; the rendering
layer uses this to invalidate only the affected rows / cells / headers
in a single pass.

## JSON round-trip

```ts
const file = table.annotations.toJSON();
// AnnotationFile — see the on-disk shape below.

// Save
const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
download(blob, 'annotations.json');

// Restore
const incoming = JSON.parse(await fetch('/annotations.json').then((r) => r.text()));
const { added, skipped } = table.annotations.loadJSON(incoming, 'replace');
console.log(`loaded ${added} (skipped ${skipped})`);
```

Modes:

- **`'replace'`** (default) — wipes the store, then loads. One
  `'cleared'` + one `'added'` event sequence.
- **`'merge'`** — adds without clearing. Duplicate ids reject with
  `AnnotationError('DUPLICATE_ID')`.

Errors:

| Code | Trigger |
|---|---|
| `INVALID_SHAPE` | A specific entry is malformed (wrong scope, wrong field type, missing required field). |
| `VERSION_UNSUPPORTED` | `file.version > ANNOTATION_FILE_VERSION` (currently `1`). |
| `DUPLICATE_ID` | Merge-mode collision. |

Unknown top-level and per-annotation fields **round-trip verbatim**.
You can stash app-specific tracking data (e.g. reviewer ids, schema
keyword paths) on annotations without negotiating schema changes with
the library.

## Persistence

When `persistence: true` (the default), `AutoSave` debounces snapshot
writes and includes the annotation file as `SessionSnapshot.annotations`.
On the next mount with the same `tableName`, the store is restored
from the snapshot.

`SNAPSHOT_VERSION` was bumped to `5` for this addition. Older
snapshots load with an empty annotation store, no error or warning.
See [`docs/guides/session-persistence.md`](./session-persistence.md).

To reset the persisted state: `await table.clearSession()` clears all
session state (filters, sort, undo, presets, annotations,
column-header tooltips). To wipe only annotations while keeping
everything else, call `table.annotations.clear()` — `AutoSave` flushes
the empty store on its next debounce tick, and a subsequent reload
sees `annotations: []` while filters / sort / undo / presets are
preserved.

## Rendering surface

The rendering layer adds the following CSS classes at render time:

| Element | Class | Severity modifier |
|---|---|---|
| Row | `dt-row--annotated` | `dt-row--annotation-{error,warning,info}` |
| Cell | `dt-cell--annotated` | `dt-cell--annotation-{error,warning,info}` |
| Column header | `dt-header--annotated` | `dt-header--annotation-{error,warning,info}` |

Severity is **highest-wins**: a cell with both an info and an error
annotation paints with the error tint. The popover still lists every
applicable annotation grouped by scope.

Theme tokens (light + dark variants) live in
[`docs/guides/theming.md` §Annotations](./theming.md#annotations) —
`--dt-annotation-{error,warning,info}-{fg,bg,bdr}` plus derived
`-bg-hover` variants. The popover sits at `--dt-z-annotation-popover:
55` (between floating panels and the autocomplete tooltip).

The popover is keyboard-accessible:

- Opens on `pointerenter` / `focusin` of an annotated row, cell, or
  header.
- Dismisses on `pointerleave` (with a 120 ms grace so the user can
  move into the popover content), `focusout`, `Escape`, scroll, or
  click outside.
- Carries `role="tooltip"` and `aria-live="polite"`.

Filtered-out rows simply don't render, so their cell-scope
annotations don't display either. Re-enabling the row (clearing the
filter) reinstates the tint.

## Multi-table

`AnnotationFile.tableName` carries the source table identity; the
library writes it on `toJSON` from the owning table's `state.tableName`.
Two tables on the same page have independent annotation stores; they
neither collide nor cross-pollinate. See
[`docs/guides/multi-table.md`](./multi-table.md) for a primer on
sharing other components.

## `rowId` ergonomics

Annotations are keyed by `rowId: number`. The library's synthetic
`__rowid__` column is `BIGINT`, so
[`actions.getColumnValues('__rowid__')`](../api-reference.md#column-values-read-only-export)
returns a `BigInt64Array`. Convert before passing back as a `rowId`:

```ts
const ids = await table.actions.getColumnValues('__rowid__');
for (let i = 0; i < ids.length; i++) {
  table.annotations.add({
    scope: 'row',
    rowId: Number(ids[i]),                    // BigInt → number
    severity: 'info',
    message: 'visited row',
  });
}
```

`Number(bigint)` is exact up to `2^53 - 1`; practical row counts stay
well under that.

## Annotation JSON format

Top-level shape:

```ts
interface AnnotationFile {
  version: 1;                              // required; loadJSON refuses files with version > current
  tableName?: string;                      // set by toJSON
  createdAt?: string;                      // ISO 8601, set by toJSON
  updatedAt?: string;                      // ISO 8601, refreshed on every change
  annotations: Annotation[];               // required
  [unknownField: string]: unknown;         // unknown top-level fields preserved verbatim
}
```

Each annotation is discriminated by `scope`:

```ts
type Annotation =
  | (AnnotationBase & { scope: 'row';    rowId: number })
  | (AnnotationBase & { scope: 'column'; column: string })
  | (AnnotationBase & { scope: 'cell';   rowId: number; column: string });

interface AnnotationBase {
  id: string;                              // ann_ + 26-char Crockford base32 (auto-generated if missing)
  severity: 'error' | 'warning' | 'info';
  message: string;
  code?: string;                           // app-defined
  source?: string;                         // app-defined
  metadata?: Record<string, unknown>;      // app-defined extras
  createdAt?: string;                      // ISO 8601
  updatedAt?: string;                      // ISO 8601
  [unknownField: string]: unknown;         // per-annotation unknowns preserved verbatim
}
```

Sample file (one of each scope):

```json
{
  "version": 1,
  "tableName": "source",
  "createdAt": "2026-04-23T12:34:56.789Z",
  "updatedAt": "2026-04-23T12:35:10.123Z",
  "annotations": [
    {
      "id": "ann_01HXYZABCDEFGHJKMNPQRSTVWX",
      "scope": "cell", "rowId": 42, "column": "age",
      "severity": "error",
      "message": "Value 200 exceeds maximum allowed 150",
      "code": "JSON_SCHEMA_MAXIMUM",
      "metadata": { "keyword": "maximum", "expected": 150, "actual": 200 }
    },
    {
      "id": "ann_01HXYZABCDEFGHJKMNPQRSTVWY",
      "scope": "row", "rowId": 10,
      "severity": "warning",
      "message": "Row violates dependency on (lastName, firstName, dob)"
    },
    {
      "id": "ann_01HXYZABCDEFGHJKMNPQRSTVWZ",
      "scope": "column", "column": "id",
      "severity": "error",
      "message": "Column violates uniqueness constraint"
    }
  ]
}
```

The same shape is reproduced in
[API reference → Annotation JSON format](../api-reference.md#annotation-json-format)
for cross-reference.

## Recipes

### Surface JSON-Schema validation errors

```ts
import Ajv from 'ajv';

const validator = new Ajv().compile(schema);
const rows: unknown[] = await table.bridge.query(`SELECT * FROM ${state.tableName.get()}`);
const rowIds = await table.actions.getColumnValues('__rowid__');     // BigInt64Array

const additions = [];
for (let i = 0; i < rows.length; i++) {
  if (!validator(rows[i])) {
    for (const err of validator.errors ?? []) {
      additions.push({
        scope: 'cell' as const,
        rowId: Number(rowIds[i]),
        column: err.instancePath.slice(1) || err.params?.missingProperty || 'id',
        severity: 'error' as const,
        message: err.message ?? '(unknown error)',
        code: err.keyword?.toUpperCase(),
        metadata: { keyword: err.keyword, params: err.params },
      });
    }
  }
}
table.annotations.addMany(additions);                                // single 'added' event
```

### Show only errors during a triage pass

```ts
table.annotations.setSeverityFilter({ warning: false, info: false });
// later:
table.annotations.setSeverityFilter({ warning: true, info: true });
```

### Export, edit, re-import

```ts
const file = table.annotations.toJSON();
file.annotations[0].metadata = { ...file.annotations[0].metadata, reviewedBy: 'jeya' };
file.tableName = 'source-after-review';
table.annotations.loadJSON(file, 'replace');                         // clears + reloads
```

## Gotchas

- **`scope` / `rowId` / `column` are immutable.** Passing them in
  `update`'s `patch` is a no-op. To "move" an annotation, remove and
  re-add.
- **`bigint` rowIds.** Annotations key on `rowId: number`. Convert
  values from `getColumnValues('__rowid__')` (`BigInt64Array`) with
  `Number(...)` before adding.
- **Severity filter affects rendering only.** `getAll` /
  `getByRow` / `getByCell` always return the full set. Use the
  filter to dim, not delete.
- **Filtered-out rows hide their annotations.** That's by design —
  the cell isn't in the DOM. Restore the row (clear the filter) and
  the tint comes back.
- **No undo for annotations.** `actions.undo()` does not roll back
  annotation mutations. If your authoring UI needs undo, layer it on
  top of the store yourself (e.g. push the inverse mutation into a
  custom history stack).

## Related

- [API reference — `table.annotations` namespace](../api-reference.md#tableannotations-namespace)
- [Annotation JSON format](../api-reference.md#annotation-json-format)
- [Theming → Annotations CSS tokens](./theming.md#annotations)
- [Glossary — Annotation, AnnotationStore](../glossary.md#annotation)
- [Example 11 — Annotations](../../examples/11-annotations/)
- Source: [`src/annotations/AnnotationStore.ts`](../../src/annotations/AnnotationStore.ts), [`src/annotations/types.ts`](../../src/annotations/types.ts)
