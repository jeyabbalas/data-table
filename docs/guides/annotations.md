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
cells and column headers, lists them in a popover where the user points,
and takes the user from one to the next with `F8`.

The full data layer is programmatic — there is no built-in UI for
authoring annotations, only a typed CRUD API on `table.annotations.*`.
JSON round-trip is part of the contract so apps can persist
annotations off-device or sync them with a backend service. A million
annotations add under 2 ms to a scroll step (see
[Annotations at scale](#annotations-at-scale)).

## You'll learn how to

- Create, update, and remove annotations programmatically
- Look up annotations by row, column, or cell, and what each lookup costs
- Filter the rendered set by severity without touching the data
- Subscribe to a single change channel
- Round-trip annotations through JSON
- Go from one annotation to the next, from the keyboard or from code
- Show only the rows that have annotations
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
hovering the cell opens the annotation popover. `F8` takes the cursor to it,
and the live region reads it out.

## What annotations are (and aren't)

| Annotations     | Are                                                                                 | Are NOT                                     |
| --------------- | ----------------------------------------------------------------------------------- | ------------------------------------------- |
| Storage         | A separate store on `table.annotations` (overlay metadata)                          | A field on `TableState`                     |
| Undo/redo       | Excluded — does not inflate the undo stack                                          | Snapshotted by `UndoManager`                |
| Persistence     | Saved with the session, in an IndexedDB database of their own, when they change     | Round-tripped through `StateSnapshot`       |
| Authoring UX    | Programmatic CRUD; you build the authoring UI                                       | Editable from a built-in dialog             |
| Visual coupling | Rendered as DOM classes + a popover; reached with `F8` and `actions.nextAnnotation` | A modification of the underlying cell value |

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
  { scope: 'cell', rowId: 0, column: 'age', severity: 'error', message: '…' },
  { scope: 'column', column: 'tip_amount', severity: 'error', message: '…' },
  { scope: 'row', rowId: 7, severity: 'info', message: '…' },
]);
```

If you supply an explicit `id`, the library preserves it. `addMany`
checks every entry before it stores any, so a failure leaves the store as it
was:

- A malformed entry (an unknown `scope` or `severity`, an empty `message`, a
  `rowId` that is not a finite number, an empty `column`) throws an
  `AnnotationError` coded `ANNOTATION_INVALID_SHAPE`, with `details.index`,
  the entry's position, and `details.field`.
- An `id` already in the store, or one the batch repeats, throws
  `ANNOTATION_DUPLICATE_ID`, with `details: { id, index }`.

`add` throws the same codes; its `details.index` is `-1`, and a duplicate's
`details` is `{ id }`. Entries without `createdAt` take the time of the
call, one timestamp for a whole batch.

`rowId` is the row's `__rowid__`, as a `number`: a `bigint` is refused as
`ANNOTATION_INVALID_SHAPE` (see [`rowId` ergonomics](#rowid-ergonomics)).
Any finite number is accepted, but only the non-negative integers the
`__rowid__` column holds name a row: an annotation on `-1` or `2.5` is
stored and listed, and never rendered, navigated to or kept by the
[annotated filter](#showing-only-the-annotated-rows).

### `update`

```ts
table.annotations.update(stored.id, {
  message: 'Row violates dependency on (lastName, firstName, dob, sex)',
  severity: 'error',
});
```

`id`, `scope`, `rowId`, and `column` are immutable: a patch that gives one a
different value throws (`ANNOTATION_ID_IMMUTABLE`,
`ANNOTATION_SCOPE_IMMUTABLE`, `ANNOTATION_ROWID_IMMUTABLE`,
`ANNOTATION_COLUMN_IMMUTABLE`), and an unknown id throws
`ANNOTATION_NOT_FOUND`. To change the scope, remove and re-add. A `severity`
or `message` given as `undefined` is ignored; other fields given as
`undefined` are cleared. The library sets `updatedAt` on every successful
update.

`update` returns a new object, which `get(id)` returns from then on; the
annotation keeps its place in insertion order. The objects `get`, the
lookups and the change payloads return are the stored ones, unfrozen.
Mutating one directly is unsupported: the store's indexes and the grid do
not see the change. Use `update`.

### `remove`, `removeMany`, `clear`

```ts
table.annotations.remove(stored.id); // returns true / false
table.annotations.removeMany([id1, id2, id3]); // returns count actually removed
table.annotations.clear('cell'); // remove only cell-scope; default is 'all'
```

`clear` fires one `change` event with the removed ids, and none when it
removed nothing; `clear('all')` also forgets the file-level fields an
earlier `loadJSON` kept. Each of these is O(1) per annotation removed:
removing 100 annotations from a million takes under half a millisecond,
and `clear('all')` on a million takes 0.1 ms (32–34 ms when a listener
receives the million removed annotations).

## Lookups

```ts
const all = table.annotations.getAll(); // insertion order
const ofRow5 = table.annotations.getByRow(5); // row 5's row- and cell-scope annotations
const ofTotal = table.annotations.getByColumn('total_amount'); // its column- and cell-scope annotations
const here = table.annotations.getByCell(7, 'fare_amount'); // what applies to one cell
```

| Lookup                     | Returns                                                                                                                                                      | Order                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `get(id)`                  | The annotation, or `null`                                                                                                                                    | —                                                                         |
| `getAll()`                 | Every annotation                                                                                                                                             | Insertion                                                                 |
| `getByRow(rowId)`          | The row-scope annotations at `rowId`, and the cell-scope annotations in that row, in any column                                                              | Insertion                                                                 |
| `getByColumn(column)`      | The column-scope annotations at `column`, and the cell-scope annotations in that column, in any row                                                          | Insertion                                                                 |
| `getByCell(rowId, column)` | What applies to that one cell: the row-scope annotations at `rowId`, the column-scope ones at `column`, and the cell-scope ones at exactly `(rowId, column)` | Severity (`error` first), then `createdAt` (missing last), then insertion |
| `count()`                  | How many annotations the store holds                                                                                                                         | —                                                                         |

`getByCell` is the list the cell's popover shows, before the severity filter
and the popover's cap. A cell annotation elsewhere in the row or the
column is not part of it: `getByRow` and `getByColumn` collect those. (Up to
0.9, `getByCell` returned every cell annotation in the row and the column
too.)

None of the lookups scans the store. For a store of N annotations and a
result of k, `get` and `count` are O(1); `getByRow`, `getByColumn` and
`getByCell` are O(k log k); `getAll` is O(N). The first `getByRow` that
meets cell annotations builds a by-row index of them, O(cells) and 24 bytes
an annotation, which is kept current from then on. At a million annotations
(90% cell, 9% row, 1% column over 200,000 rows × 1,000 columns; Node 22 on an
Apple M1 Pro), the median `getByCell` took 2–2.6 µs, `getByRow` about 2 µs
once its index was built (0.2 s), and `getByColumn`, which returns some 900
annotations there, 131–155 µs.

## Severity filter (view layer)

```ts
table.annotations.setSeverityFilter({ info: false }); // hide info-level visually
const flags = table.annotations.getSeverityFilter();
// → { error: true, warning: true, info: false }
```

The severity filter is purely a view concern. The store's data is
unchanged — `getAll`, `getByCell`, etc. still return the full set. What it
changes:

- **Tints.** A cell, row or header paints the highest severity the filter
  shows there, so hiding `error` lets a `warning` underneath show through.
  Its marker class and its count stay (see [Rendering surface](#rendering-surface)).
- **The popover.** Annotations of a hidden severity are left out and counted,
  and an anchor whose every annotation is hidden opens no popover.
- **Navigation.** `F8` and `actions.nextAnnotation` visit the severities the
  filter shows, unless told which.

It does not change which rows the [annotated filter](#showing-only-the-annotated-rows)
keeps. Re-enabling a flag re-applies the visuals immediately, and the flags
are saved with the session.

A `change` event with `kind: 'filterChanged'` fires when a flag flips,
so app code (e.g. a count badge in your sidebar) can update.

## The change event

```ts
const off = table.annotations.on('change', ({ kind, ids, annotations, previous }) => {
  if (kind === 'filterChanged') {
    // setSeverityFilter() was called.
  } else if (kind === 'updated') {
    // annotations[i] is ids[i] as it is now, previous[i] as it was.
    console.log(previous?.[0]?.severity, '→', annotations?.[0]?.severity);
  } else {
    // ids[] is the set of annotation IDs affected by this mutation.
    console.log(`${kind}: ${ids.length}`);
  }
});

// later:
off();
```

The payload is `{ kind, ids, annotations?, previous? }`:

- `ids` — the affected annotations' ids, in the order of `annotations`.
- `annotations` — the affected annotations: for `added` and `updated` as they
  are now, for `removed` and `cleared` as they were. Absent for
  `filterChanged`.
- `previous` — for `updated` only: each annotation as it was before the
  update.

The library builds a payload only when a listener is subscribed, so a store
nobody listens to pays nothing for it.

| `kind`            | Fires when                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'added'`         | `add`, `addMany` or `loadJSON` added at least one annotation. `ids` lists the new annotations.                                                            |
| `'updated'`       | `update` succeeded. `ids` is `[id]`.                                                                                                                      |
| `'removed'`       | `remove` / `removeMany` removed at least one annotation. `ids` lists the removed ones.                                                                    |
| `'cleared'`       | `clear` removed at least one annotation, or `loadJSON(file, 'replace')` replaced a store that held any. `ids` lists the removed ones, in insertion order. |
| `'filterChanged'` | `setSeverityFilter` flipped a flag. `ids` is `[]` (the data didn't change).                                                                               |

A call that changes nothing fires nothing: `remove` of an unknown id,
`clear` of an empty scope, `addMany([])`, `setSeverityFilter` with the flags
it already has. `loadJSON(file, 'replace')` fires two events: `cleared` for
what the store held, then `added` for what the file holds, each only when
there is anything to report. During the `cleared` event the store already
holds the file's contents.

Events fire synchronously, after the change: a handler that reads the store,
or the grid, sees it changed. The grid hears the store first, through one
subscription for the whole table, and updates only the rows, cells and
headers the change touched, so app listeners see the DOM already up to
date. A listener that throws is caught and logged; the others still run.
Bulk operations fire **one** event with the full id list.

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

- **`'replace'`** (default) — wipes the store, then loads, keeping the
  file's ids. One `'cleared'` + one `'added'` event sequence.
- **`'merge'`** — adds without clearing. An id the store already holds
  rejects the file.

`loadJSON` checks the whole file before it changes the store, so a rejected
file leaves the store as it was. Every entry needs an `id`; `loadJSON`
generates none. Pass `{ mode, validateTableName: true }` as the second
argument to refuse a file whose `tableName` is not the table's.

Errors (`AnnotationError`):

| Code                             | Trigger                                                                                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANNOTATION_INVALID_SHAPE`       | The file is not an object, its `version` is not an integer, its `annotations` is not an array, or an entry is malformed (`details.index`, `details.field`). |
| `ANNOTATION_VERSION_UNSUPPORTED` | `file.version > ANNOTATION_FILE_VERSION` (currently `1`).                                                                                                   |
| `ANNOTATION_DUPLICATE_ID`        | An id the file repeats, in either mode, or, in `'merge'`, an id the store holds. `details: { id, index }`.                                                  |
| `ANNOTATION_TABLENAME_MISMATCH`  | With `validateTableName: true`, the file's `tableName` and the table's differ. Without it, a mismatch only logs a `console.warn`.                           |

Unknown top-level and per-annotation fields **round-trip verbatim**.
You can stash app-specific tracking data (e.g. reviewer ids, schema
keyword paths) on annotations without negotiating schema changes with
the library.

At a million annotations (Node 22, M1 Pro), `toJSON` took 13–14 ms, and
`loadJSON(file, 'replace')` onto a store of a million 0.65–0.73 s, or
0.95 s with a listener receiving both events.

## Persistence

When `persistence: true` (the default), annotations are saved with the
session and restored on the next mount with the same `tableName`, with the
severity filter's flags. They are kept apart from the rest of the session:

- **In a database of their own.** The session record in `dt-sessions` holds
  the filters, sort, columns and the rest; the annotations go to the
  IndexedDB database `dt-annotations`, under the same table name, as a head
  and chunks of at most 10,000 annotations or about 8 MiB each. The session
  record carries a small marker in their place: how many, a token of the
  write it names, and of the write before it, its fallback.
- **Written when they change.** A save after a sort, filter, width or
  severity-filter change writes nothing to `dt-annotations`: 0.2–0.3 ms in
  Chromium at a million annotations, where every save used to serialize and
  clone them all again (about 1.2 s in Node). A reload writes nothing back
  until they change.
- **Annotations first.** A save that has annotations to write puts the new
  chunks and head in one transaction, so a reader finds a record whole or not
  at all, and only once that has committed writes the session record naming
  them, with the record it named before as its fallback, which the write kept
  until then. A reload at any point, or a write that fails, restores the last
  annotations that landed, at worst older than the rest of the session. A page
  hidden, or a table destroyed, while such a save is under way saves a session
  record naming that write rather than writing the annotations again, and a
  store that closes lets the saves asked for before it finish. Each chunk is
  put once the one before it is stored: at a million annotations in Chromium a
  write took 0.43–0.51 s in 100 chunks, with no task over 16 ms. The chunks
  also keep each value far below 127 MiB, the most Chromium stores in one
  IndexedDB value, which a million annotations in one value pass.
- **Restored apart.** A reload reads the head and the chunks in one
  transaction: in Chromium at a million, 0.37–0.8 s to read and 0.70–0.73 s
  to restore, the reload's longest step. When neither the annotations the
  session names nor their fallback can be restored, the rest of the session
  restores, and the table emits a `warning` coded
  `PERSISTENCE_ANNOTATIONS_DROPPED` with `details.reason` (`'missing'`,
  `'mismatch'`, `'invalid'` or `'unavailable'`). See
  [Troubleshooting → Warning events](../troubleshooting.md#warning-events).
- **Upgraded on the way.** A session saved by 0.9, its annotations inside the
  session record, restores them, and the next save moves them to
  `dt-annotations`. When `dt-annotations` cannot be opened, annotations stay
  in the session record, as 0.9 kept them.
- **Failing alone.** A save of the annotations that fails does not stop the
  session from saving: the session record goes on naming the annotations
  that landed before. A quota error on them stops their saves at once; any
  other failure is reported and tried again on the next save, and a second
  in a row stops them. Each is an `error` event with `source: 'persistence'`
  and `details.record: 'annotations'`. Once stopped, a reload restores the
  last annotations that landed; `clearSession()` or a reload starts their
  saves again.

Two tabs that save the same table: the last to write wins, annotations
included. A tab whose annotations the other has replaced since writes its
own again at its next save, even one that only changes the sort. Only two
tabs writing the same table's annotations at the same moment can lose them:
the reload then restores the session without them and warns `'mismatch'`.
See
[Session persistence](./session-persistence.md#annotations-in-a-database-of-their-own).

To reset the persisted state: `await table.clearSession()` clears all
session state (filters, sort, undo, presets, annotations,
column-header tooltips), in both databases. To wipe only annotations while
keeping everything else, call `table.annotations.clear()` — the next save
deletes their record, and a subsequent reload restores no annotations while
filters / sort / undo / presets are preserved.

## Rendering surface

The grid marks what each element shows with classes, written only when
they change:

| Element                          | Marker class               | Severity class                                   | Paints                  |
| -------------------------------- | -------------------------- | ------------------------------------------------ | ----------------------- |
| Row (`.dt-row`)                  | `dt-row--annotated`        | `dt-row--annotation-{error,warning,info}`        | Nothing; a hook for CSS |
| Cell, for its row's row scope    | `dt-cell--row-annotated`   | `dt-cell--row-annotation-{error,warning,info}`   | Tint and a left stripe  |
| Cell, for its column's scope     | `dt-cell--col-annotated`   | `dt-cell--col-annotation-{error,warning,info}`   | Tint and a left stripe  |
| Cell, for its own annotations    | `dt-cell--annotated`       | `dt-cell--annotation-{error,warning,info}`       | Tint and a left stripe  |
| Column header (`.dt-col-header`) | `dt-col-header--annotated` | `dt-col-header--annotation-{error,warning,info}` | Tint and an underline   |

A row's row-scope annotations tint every cell of the row, and a column's
column-scope annotations every cell of the column; where scopes meet, the
cell's own annotations win, then the column's, then the row's. Severity is
**highest-wins** within a scope: a cell with both an info and an error
annotation paints with the error tint.

The marker class stays whatever the severity filter shows, and the severity
class is the highest severity the filter shows there, or none. A cell also
carries `data-dt-annotation-count`, its row, column and cell annotations
together, and a header the count of its column's annotations, whatever the
filter shows. A cell that shows a severity gives up its native `title`
(its full value), since the popover is its tooltip; a cell whose every
annotation the filter hides keeps it.

Theme tokens (light + dark variants) live in
[`docs/guides/theming.md` §Annotations](./theming.md#annotations) —
`--dt-annotation-{error,warning,info}-{fg,bg,bdr}` plus derived
`-bg-hover` variants. The popover sits at `--dt-z-annotation-popover:
55` (between floating panels and the autocomplete tooltip).

### The popover

The popover opens when the pointer, or DOM focus, enters an annotated cell
or a header with column-scope annotations. It lists a section per scope —
Row, Column, Cell; a header lists its column's annotations alone — each
sorted by severity, then `createdAt`, then insertion:

- **Five per section.** A section lists five annotations at most, and counts
  the rest: "+12 more" (`messages.annotations.popover.moreEntries`). A cell
  can hold thousands; the popover is a tooltip.
- **Hidden severities left out.** Annotations of a severity the severity
  filter hides are not listed, and each section counts them: "3 hidden by the
  severity filter". An anchor whose every annotation is hidden opens no
  popover, and a cell of that kind keeps its native title.
- **It stays beside its cell.** It opens below its anchor when it fits
  there, else on the side with more room, its height capped to that room
  (96 px at least), so that it does not cover the cell it describes. Past its
  cap, and past `min(24rem, 100vh − 8px)`, it scrolls, and its own scroll
  does not close it. While it overflows it is a tab stop (`tabindex="0"`),
  so the keyboard can scroll it; otherwise `tabindex="-1"`.
- **It follows the store.** A change to the annotations it lists updates it
  in place, a microtask later, and rewrites it only when what it shows
  changed, so `aria-live` does not announce it again. It hides when nothing
  it would list is left, and when its row scrolls out and is reused.

It carries `role="tooltip"` and `aria-live="polite"`, and dismisses on
`pointerleave` (with a 120 ms grace so the user can move into it),
`focusout`, `Escape`, a scroll of anything but itself, a window resize, a
click outside, or a panel or dialog opening. Every text in it is written
with `.textContent`: messages, codes and sources are never parsed as HTML.

Moving the grid cursor with the keyboard does not move DOM focus onto the
cell, so the popover does not follow it; `F8` reads out the annotations
where it lands instead (see [Navigating annotations](#navigating-annotations)).

Filtered-out rows simply don't render, so their cell-scope
annotations don't display either. Re-enabling the row (clearing the
filter) reinstates the tint.

## Navigating annotations

`F8` takes the cursor to the next annotation, and `Shift+F8` to the
previous one; `Alt+↓` and `Alt+↑` do the same.

| Key                            | Goes to                 |
| ------------------------------ | ----------------------- |
| `F8`, or `Alt` + `↓`           | The next annotation     |
| `Shift` + `F8`, or `Alt` + `↑` | The previous annotation |

The keys work from anywhere in the table: the grid, the filter bar and the
hidden-columns gutter. Not in a header's controls mode (`F2`), where they do
nothing, nor in column layout mode (`Shift+F2`), nor while a dialog or panel
is open. The table takes the key only while data is loaded, the store holds
a row-scope or cell-scope annotation, and the severity filter shows at least
one severity; otherwise the key stays the page's, and nothing is announced.
On a Mac, `Alt` is the Option key, and `F8` may need `fn`.
`createDataTable({ annotationNavigation: false })` leaves the keys to the
page; the actions below work either way.

**Where "next" is.** The order is the view's, as filtered and sorted. From
the cursor, the next annotation is the next annotated visible cell in the
cursor's row, then the next row with a row-scope or cell-scope annotation,
on its first annotated visible cell, pinned columns first. Going back, it is
the previous one, on its last. A row whose annotations are its own, or are
in hidden columns, keeps the cursor's column. Column-scope annotations
single out no row, and are not visited. Without a cursor, `F8` goes to the
first annotation and `Shift+F8` to the last. Past the last annotation the
search goes round to the first, and past the first to the last. It visits
the severities the [severity filter](#severity-filter-view-layer) shows.

**Under the annotated filter.** With only the annotated rows shown (see
[below](#showing-only-the-annotated-rows)), the view follows the annotations
a moment behind. `F8` first brings it up to date and waits for it to refresh,
so right after a change it waits for that (0.4–0.7 s at a million annotated
rows) before it searches. Resolve the issue under the cursor, by removing
its annotation, and its row leaves the view: the cursor goes to the gap the
row left, on the first kept row after it, and `F8` and `Shift+F8` go on from
the row that left. `F8` goes to the first kept row after it, the next
annotated one, and `Shift+F8` to the last kept row before it. A view that
refreshes again while the search runs is searched again; after three, the
search gives up with `QUERY_ABORTED`.

**Landing.** The row scrolls to the middle of the view and the column into
it, the cursor moves there, the popover and the value inspector close, and
the live region says where the cursor is and what is there:

| Situation                                    | Announcement                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| Landed on a cell                             | "Row 1,204 of 9,880,000, age: error, value 200 exceeds maximum 150, and 2 more" |
| Landed on a row's own annotations            | "Row 1,204 of 9,880,000: warning, duplicate record"                             |
| The row's annotations are in a hidden column | "Row 1,204 of 9,880,000, age (hidden): error, value 200 exceeds maximum 150"    |
| Went round the end                           | "Wrapped to the first annotation. Row 3 of 9,880,000, …"                        |
| None to go to                                | "No annotations shown"                                                          |
| None further, with `wrap: false`             | "No more annotations below" / "No more annotations above"                       |

The row counts from 1 in the view; the first annotation there is read with
its severity, and the others counted. The column is named when that first
annotation is the cell's own; when it is the row's (a row annotation comes
first when it is more severe, or as severe and older), the announcement
reads as for the row. With no annotation of the severities sought in the
view, a navigation says "No annotations shown". The keys say nothing when
the store holds no row or cell annotation, or the severity filter hides
every severity: they are the page's then. The words come from
`messages.annotations.navigation` (see [i18n](./i18n.md#annotations)).

### From code

```ts
const landed = await table.actions.nextAnnotation(); // as F8
if (landed) {
  console.log(landed.rowId, landed.row, landed.column, landed.wrapped);
  console.log(landed.annotations[0]?.message);
}

// Errors only, and stop at the last one instead of going round.
await table.actions.nextAnnotation({ severities: ['error'], wrap: false });

// As Shift+F8.
await table.actions.previousAnnotation();
```

`nextAnnotation(options?)` and `previousAnnotation(options?)` resolve to
where the cursor went, or `null` when there was nowhere to go:

| Option       | Default                                  | Meaning                                                                                                   |
| ------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `severities` | The severities the severity filter shows | The severities to visit. `[]` visits none, and resolves `null`.                                           |
| `wrap`       | `true`                                   | Go round the end of the view. With `false`, past the last annotation it resolves `null`.                  |
| `signal`     | —                                        | An `AbortSignal`: aborting rejects with `QUERY_ABORTED` and cancels a query running in the DuckDB worker. |

| Result field  | Meaning                                                                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rowId`       | The row's `__rowid__`.                                                                                                                                                 |
| `row`         | The row's 0-based position in the view, as filtered and sorted.                                                                                                        |
| `column`      | The column the cursor is on: the annotated cell's, or for a row's own annotations, or ones in hidden columns, the column the cursor was on.                            |
| `wrapped`     | Whether the search went round the end of the view.                                                                                                                     |
| `annotations` | The annotations there, of the severities sought: the row's own and the cell's (the hidden cell's, when they are in a hidden column), sorted as `getByCell` sorts them. |

`revealRow(rowId, column?, options?)` scrolls the row whose `__rowid__` is
`rowId` into view, in the view as filtered and sorted, and puts the cursor
on it: in `column`, else the cursor's column, else the first visible column,
which comes into view too. It resolves `{ row, column }`, the row's
position and the column shown, or `null` when the filters hide the row.
`rowId` is a number or a `bigint`. Its options are `align` (`'start'`,
`'center'` or `'end'`; default `'center'`), `focus` (default `true`; with
`false` the cursor, the popover and the value inspector stay as they are)
and `signal`. A `column` the table has but hides leaves the cursor's column,
with no error.

All three run one at a time: a newer one, a move of the cursor, or a change
of the filters, the sort or the table aborts the one running; the table's
own move of the cursor, following its row through a refresh of the annotated
view, aborts nothing. They wait for a filter change that is still counting
its rows, for a derived-column change, and, under the annotated filter, for
the view to refresh, so they scroll in the view the filters make. A search
started by a key that fails for another reason is reported as the table's
`error` event, with `source: 'unknown'`: an error the library did not raise
comes wrapped, as a `QueryError` coded `QUERY_RUNTIME` whose `cause` it is.

Errors, as rejections:

| Error                | Code                | When                                                                                                                                                             |
| -------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QueryError`         | `QUERY_ABORTED`     | A newer navigation, a cursor move, a filter, sort or table change, or `options.signal` aborted it; or the annotated view refreshed three times under the search. |
| `QueryError`         | `INVALID_ROWID`     | `revealRow`: `rowId` is not a non-negative integer, or no row has it.                                                                                            |
| `QueryError`         | `COLUMN_NOT_FOUND`  | `revealRow`: `column` is not in the schema.                                                                                                                      |
| `QueryError`         | `NO_TABLE`          | No table is loaded, or the table has no UI.                                                                                                                      |
| `ConfigurationError` | `OPTIONS_INVALID`   | A severity that is not `'error'`, `'warning'` or `'info'`, a `wrap` or `focus` that is not a boolean, an `align` it does not take.                               |
| `ConfigurationError` | `CHUNK_LOAD_FAILED` | The navigator's chunk did not download (`details.panel: 'annotationNavigator'`). The next call asks for it again.                                                |
| `DestroyedError`     | `DESTROYED`         | The table was destroyed before the call.                                                                                                                         |

### An issue list

A side panel of issues that takes the user to each: `revealRow` with the
annotation's row, and its column for a cell annotation.

```ts
import { QueryError, type CellAnnotation, type RowAnnotation } from '@jeyabbalas/data-table';

const list = document.getElementById('issues')!;
const status = document.getElementById('issue-status')!;

async function goTo(ann: RowAnnotation | CellAnnotation): Promise<void> {
  try {
    const shown = await table.actions.revealRow(
      ann.rowId,
      ann.scope === 'cell' ? ann.column : undefined,
    );
    status.textContent = shown === null ? 'The filters hide that row.' : '';
  } catch (err) {
    // Another click, or a cursor move, took over.
    if (err instanceof QueryError && err.code === 'QUERY_ABORTED') return;
    throw err;
  }
}

function renderIssues(): void {
  // Column annotations single out no row. The first 200 errors are enough to list.
  const issues = table.annotations
    .getAll()
    .filter((a): a is RowAnnotation | CellAnnotation => a.scope !== 'column')
    .filter((a) => a.severity === 'error')
    .slice(0, 200);
  list.replaceChildren(
    ...issues.map((ann) => {
      const button = document.createElement('button');
      button.textContent = ann.message;
      button.addEventListener('click', () => void goTo(ann));
      const item = document.createElement('li');
      item.append(button);
      return item;
    }),
  );
}

renderIssues();
table.annotations.on('change', renderIssues);
```

`getAll()` is O(N): at a million annotations, rebuild such a list after a
burst of changes rather than on each one, or keep it from the change
events' `annotations`. [Example 11](../../examples/11-annotations/) runs
such a list.

### What a jump costs

Navigation answers from the cheapest place that knows: the cursor's own
row, the rows the grid holds around the cursor, and, with no filter and no
sort, where a row's position is its `__rowid__`, a binary search over the
store's annotated rows. Only then does it ask DuckDB, through a temporary
table of the annotated rows (see
[Showing only the annotated rows](#showing-only-the-annotated-rows)). In
Chrome on a 10,000,000-row Parquet file with 1,000,000 annotated rows, the
search alone took:

| Search                                               | Time       |
| ---------------------------------------------------- | ---------- |
| From the rows the grid holds, or by binary search    | under 2 ms |
| Filtered, unsorted                                   | 210 ms     |
| Filtered, unsorted, errors only                      | 107 ms     |
| Sorted on one column                                 | 450 ms     |
| Sorted on two columns (`city DESC, amount ASC`)      | 0.85–0.9 s |
| Filtered and sorted                                  | 0.83 s     |
| `revealRow` in a sorted view                         | 90–360 ms  |
| Building the table of annotated rows, the first time | 0.64–0.7 s |

An unsorted SQL search places the row it finds by counting the rows between
the cursor's row and it, not every row before it, so a jump deep in the
table stays cheap. A cursor on a row the grid no longer holds costs one
query more to find that row: 0.5 s filtered and 1.4 s sorted, at row
7,000,000. Under the annotated filter, the table runs that query itself, in
the background, when a sort leaves the cursor off-screen, so that the next
refresh can follow the row there; and the gap a resolved row leaves takes
one query to find once the view's count is in, which `F8` right after the
change waits for, and which runs again on each refresh while the cursor
stands at the gap. Unsorted, it counts from the nearest row the grid holds:
about 23 ms at any depth in Node's DuckDB-WASM with the gap among them, and
up to about 90 ms in Chrome deep in ten million rows with a million
annotated rows when it is far from them. Sorted on a column, it compares
every row with the one that left: a few hundred ms. The first navigation in
a store with cell annotations builds a by-row index of them, 0.2 s and 24
bytes an annotation at a million, which the reads of each held row's
annotations use from then on. In a sorted view the search compares rows as
the grid's `ORDER BY` does: NULL last in either direction, NaN after every
number, `__rowid__` last. The navigation code is a chunk of its own (4.80 kB
brotli), loaded the first time it runs, or the first time the annotated view
looks for the cursor's row beyond the rows the grid holds: to follow it
through a refresh, or to learn which row it is on after a sort.

### Showing only the annotated rows

```ts
table.actions.showAnnotatedRows(); // the rows with any annotation
table.actions.showAnnotatedRows({ severities: ['error', 'warning'] });
table.actions.hideAnnotatedRows();
```

`showAnnotatedRows` adds an `annotated` filter, which keeps the rows that
have a row-scope or cell-scope annotation of the severities given, or of any
severity; column-scope annotations single out no row. It is a filter like
any other: its chip reads "Annotated rows · any severity" or "Annotated rows
· error, warning", and the row count, the charts, exports, presets and the
saved session follow it. It replaces the annotated filter in force, as one
undo entry, and asking again for the same severities changes nothing.
`hideAnnotatedRows` removes it, as one undo entry. Both are synchronous; an
unknown severity throws `ConfigurationError` `OPTIONS_INVALID`. The filter
shape is in the [filters guide](./filters.md#8-annotated--rows-with-annotations).

The view follows the annotations. When a change to them changes which rows
the filter keeps, the view refreshes in place: the scroll position stays,
the rows show placeholders a moment while they are fetched again, the row
count and the charts follow, and `filterChange` fires with the same filters
and the new count. The cursor follows its row to its new position,
wherever that is: in view, off-screen, or past the view's old end, even
when the user has scrolled far from it. It moves as soon as the rows are
back when its row is among them; otherwise, once the count is in, one query
finds the row. Nothing scrolls. When its row leaves the view, as it does
when its annotation is removed, the cursor goes to the gap the row left: on
the first kept row after it, or on the last row when the gap is past the
end. With one change that is where the cursor was; when several rows join
or leave in one refresh, it can move. `F8` then goes to the first kept row
after the row that left, and `Shift+F8` to the last kept row before it. A
sort, or a change to a derived column that the filters or the sort name,
puts another row at the cursor's place, and the cursor follows that row
from then on; when the user has scrolled away from the cursor, the table
asks DuckDB which row it is, with one query. A derived column added,
edited or removed that nothing filters or sorts by moves no row, and the
cursor keeps its row, and the gap it stands at. An
open value inspector follows the row too, its title giving the new row
number; at a gap it keeps showing the value it shows, and an `F2` open
still waiting on the cell is dropped. A change that keeps the same rows,
such as an edited message or another severity on a row already kept,
refreshes nothing. The severity filter changes which tints show, not which
rows the filter keeps.

Behind it is a DuckDB temporary table of the annotated rows,
`__dt_annot_<table>__`, one row per annotated `__rowid__` with the bits of
its annotations' severities. It is built only when something reads it (the
filter, navigation, an export or `getColumnValues` of the filtered rows)
and rebuilt whole, in one statement, when the annotations have changed:
under the filter at most once every 150 ms, or every rebuild's own time when
that is longer. Until the first build lands, the grid, the count and the
charts wait, so a filter restored with a session or loaded from a preset
never queries a table that does not exist yet. A rebuild drops only the
cached query results that read the table, not those of other tables on a
shared bridge. A rebuild that fails is reported once, as an `error` event
with `source: 'query'`, and the view tries no other until the annotations,
the filters or the base table change. In headless Chromium on
10,000,000 rows:

| Annotated rows | `showAnnotatedRows` → `filterChange` | A change under it → `filterChange` | Switching severities |
| -------------: | ------------------------------------ | ---------------------------------- | -------------------- |
|        100,000 | 121 ms                               | 61 ms                              | 12 ms                |
|      1,000,000 | 0.67 s                               | 0.67 s                             | 75 ms                |

At a million annotated rows the longest main-thread task was about 120 ms,
the store listing its annotated rows once after a change, which every
rebuild after a change to row or cell annotations repeats; the statement is
built 100,000 rows at a time, with a yield between, and none of those took
over 11 ms. These figures predate two later changes: the cursor following
its row, and no refresh when the kept rows are the same.

## Annotations at scale

The store, the grid and the session were tested with a million annotations,
on a 10,000 × 1,000 table and a 10,000,000 × 9 one. What a million cost:

| At 1,000,000 annotations                | Time or size                                                                   | Measured in       |
| --------------------------------------- | ------------------------------------------------------------------------------ | ----------------- |
| `addMany`                               | 0.77–0.88 s                                                                    | Node 22           |
| Memory                                  | 258 bytes an annotation                                                        | Node 22's heap    |
| `getByCell`, median                     | 2–2.6 µs                                                                       | Node 22           |
| `remove`, median / `removeMany` of 100  | 5–6 µs / 0.38–0.45 ms                                                          | Node 22           |
| `toJSON` / `loadJSON(file, 'replace')`  | 13–14 ms / 0.65–0.73 s                                                         | Node 22           |
| `clear('all')`                          | 0.1 ms (32–34 ms with a listener)                                              | Node 22           |
| A scroll step                           | 6.4 ms on 10,000 × 1,000 (4.7 ms with none); 3.1 ms on 10,000,000 × 9 (2.2 ms) | headless Chromium |
| One `update()` of an annotation in view | 3.5–6.5 µs                                                                     | headless Chromium |
| A save after a sort change              | 0.2–0.3 ms                                                                     | Chromium          |
| A save after the annotations change     | 0.43–0.51 s, no task over 16 ms                                                | Chromium          |
| Restoring them on a reload              | 0.70–0.73 s                                                                    | Chromium          |

The store's figures are from Node 22 on an Apple M1 Pro, with 90% cell, 9%
row and 1% column annotations over 200,000 rows × 1,000 columns; the grid's
from headless Chromium on an M-series Mac, with persistence and charts off.
Each cell asks the store for an O(1) summary of what it shows, so a scroll
step costs what the rendered cells show, not what the store holds. In Chrome
itself, in a hidden window, where script, style and layout were timed but not
paint, the median scroll step on the 10,000 × 1,000 table was 7.6–7.9 ms at a
million annotations and 6.8–7.9 ms with none. The full before and after, at 0,
100,000 and 1,000,000 annotations, is in
[Performance → Annotations](../performance.md#annotations).

Limits:

- **About 16.7 million annotations.** Each annotation is one entry in a
  `Map`, and V8 (Chrome, Edge, Node) caps a `Map` at 2²⁴ entries: past that,
  `add`, `addMany` and `loadJSON` throw a `RangeError` and leave the store as
  it was.
- **Memory.** A million annotations take about 258 MB of JavaScript heap,
  more with long messages or `metadata`. The first `getByRow`, or the first
  navigation, adds 24 bytes an annotation for a by-row index. Persistence
  keeps no copy of them: a save takes their file only to write it.
- **Batches.** Add many annotations with one `addMany`, which fires one event,
  rather than one `add` each; a loop of `add` calls stays cheap for the grid,
  but each call fires its own event. Clear a scope with `clear(scope)`.
- **Saving.** The save after a change to the annotations writes them all
  again: 0.43–0.51 s at a million in Chromium, in tasks of at most 16 ms. A
  page hidden with such a save pending writes them in one task, 0.32 s at a
  million; one hidden while it is under way names its write instead, in a
  millisecond or less.

## Multi-table

`AnnotationFile.tableName` carries the source table identity; the
library writes it on `toJSON` from the owning table's base table name.
Two tables on the same page have independent annotation stores; they
neither collide nor cross-pollinate. Each keeps its own DuckDB table of
annotated rows, named from its own base table, so two tables on one shared
bridge never share it. See
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
    rowId: Number(ids[i]), // BigInt → number
    severity: 'info',
    message: 'visited row',
  });
}
```

`Number(bigint)` is exact up to `2^53 - 1`; practical row counts stay
well under that. `actions.revealRow` takes either a number or a `bigint`.

## Annotation JSON format

Top-level shape:

```ts
interface AnnotationFile {
  version: 1; // required; loadJSON refuses files with version > current
  tableName?: string; // set by toJSON
  createdAt?: string; // ISO 8601, set by toJSON
  updatedAt?: string; // ISO 8601, refreshed on every change
  annotations: Annotation[]; // required
  [unknownField: string]: unknown; // unknown top-level fields preserved verbatim
}
```

Each annotation is discriminated by `scope`:

```ts
type Annotation =
  | (AnnotationBase & { scope: 'row'; rowId: number })
  | (AnnotationBase & { scope: 'column'; column: string })
  | (AnnotationBase & { scope: 'cell'; rowId: number; column: string });

interface AnnotationBase {
  id: string; // ann_ + 26-char Crockford base32 (add generates one if missing; loadJSON requires it)
  severity: 'error' | 'warning' | 'info';
  message: string;
  code?: string; // app-defined
  source?: string; // app-defined
  metadata?: Record<string, unknown>; // app-defined extras
  createdAt?: string; // ISO 8601
  updatedAt?: string; // ISO 8601
  [unknownField: string]: unknown; // per-annotation unknowns preserved verbatim
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
      "scope": "cell",
      "rowId": 42,
      "column": "age",
      "severity": "error",
      "message": "Value 200 exceeds maximum allowed 150",
      "code": "JSON_SCHEMA_MAXIMUM",
      "metadata": { "keyword": "maximum", "expected": 150, "actual": 200 }
    },
    {
      "id": "ann_01HXYZABCDEFGHJKMNPQRSTVWY",
      "scope": "row",
      "rowId": 10,
      "severity": "warning",
      "message": "Row violates dependency on (lastName, firstName, dob)"
    },
    {
      "id": "ann_01HXYZABCDEFGHJKMNPQRSTVWZ",
      "scope": "column",
      "column": "id",
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
const rowIds = await table.actions.getColumnValues('__rowid__'); // BigInt64Array

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
table.annotations.addMany(additions); // single 'added' event
```

### Show only errors during a triage pass

```ts
table.annotations.setSeverityFilter({ warning: false, info: false });
table.actions.showAnnotatedRows({ severities: ['error'] }); // only the rows with errors
await table.actions.nextAnnotation(); // the first error
// later:
table.actions.hideAnnotatedRows();
table.annotations.setSeverityFilter({ warning: true, info: true });
```

### Export, edit, re-import

```ts
const file = table.annotations.toJSON();
file.annotations[0].metadata = { ...file.annotations[0].metadata, reviewedBy: 'jeya' };
file.tableName = 'source-after-review';
table.annotations.loadJSON(file, 'replace'); // clears + reloads
```

## Gotchas

- **`id` / `scope` / `rowId` / `column` are immutable.** Changing one in
  `update`'s `patch` throws an `ANNOTATION_*_IMMUTABLE` error. To "move" an
  annotation, remove and re-add.
- **Don't mutate a returned annotation.** `get`, the lookups and the change
  payloads hand out the stored objects. A change made to one directly is not
  indexed, rendered or saved; call `update`.
- **`bigint` rowIds.** Annotations key on `rowId: number`. Convert
  values from `getColumnValues('__rowid__')` (`BigInt64Array`) with
  `Number(...)` before adding: a `bigint` is refused.
- **Severity filter affects rendering and navigation only.** `getAll` /
  `getByRow` / `getByCell` always return the full set, and the annotated
  filter keeps the same rows. Use the filter to dim, not delete.
- **Filtered-out rows hide their annotations.** That's by design —
  the cell isn't in the DOM. Restore the row (clear the filter) and
  the tint comes back.
- **No undo for annotations.** `actions.undo()` does not roll back
  annotation mutations. If your authoring UI needs undo, layer it on
  top of the store yourself (e.g. push the inverse mutation into a
  custom history stack). Showing and hiding the annotated rows is a filter,
  and does undo.

## Related

- [API reference — `table.annotations` namespace](../api-reference.md#tableannotations-namespace)
- [API reference — Annotation navigation](../api-reference.md#annotation-navigation)
- [Annotation JSON format](../api-reference.md#annotation-json-format)
- [Filters — `annotated`](./filters.md#8-annotated--rows-with-annotations)
- [Accessibility — Annotation navigation](./accessibility.md#annotation-navigation-f8)
- [Theming → Annotations CSS tokens](./theming.md#annotations)
- [Glossary — Annotation, AnnotationStore](../glossary.md#annotation)
- [Example 11 — Annotations](../../examples/11-annotations/)
- Source: [`src/annotations/AnnotationStore.ts`](../../src/annotations/AnnotationStore.ts), [`src/annotations/types.ts`](../../src/annotations/types.ts), [`src/annotations/AnnotationNavigator.ts`](../../src/annotations/AnnotationNavigator.ts), [`src/annotations/AnnotatedRowsTable.ts`](../../src/annotations/AnnotatedRowsTable.ts), [`src/table/AnnotationPopover.ts`](../../src/table/AnnotationPopover.ts)
