# Migration: v0.9 → v0.10

> `0.10` reworks annotations to hold a million: lookups and rendering no
> longer pass over every annotation, and saves write them only when they
> change. It takes the user from one annotation to the next with `F8`, and
> adds a filter that shows only the annotated rows.
> Most integrations upgrade with a version bump. Code that switches over
> filter types, reads `getByCell` for more than one cell, asserts on
> annotation events, or reads its session from IndexedDB itself needs a look.

**Released:** with `0.10.0` — see the [CHANGELOG](../../CHANGELOG.md) for the date.
**Affected versions:** from `v0.9.*`
**Migration difficulty:** mechanical for most projects; manual review where
code reads `getByCell` for a row or a column, compares annotation event
payloads, or runs `0.9` and `0.10` against the same saved sessions.

## Summary

`0.9` kept annotations in arrays it scanned on every lookup, re-rendered
every visible cell on every change, and copied every annotation into the
session record at every save. At 100,000 annotations a scroll step took
1.3 s on a 1,000-column table, and `clear()` threw a `RangeError` from about
125,000. `0.10` indexes the store, renders from O(1) summaries, saves the
annotations apart when they change, and adds navigation and an annotated
filter on top.

These changes can break an integration:

1. `Filter` gains `AnnotatedFilter`: a TypeScript `switch` exhaustive over
   `filter.type` needs an `'annotated'` case.
2. `getByCell` returns the exact intersection at one cell, no longer every
   cell annotation in its row and column.
3. `loadJSON(file, 'replace')` fires `cleared`, then `added`, and change
   payloads gain `annotations` and `previous`.
4. `loadJSON` refuses a file that repeats an `id`.
5. `update` keeps `severity` and `message` given as `undefined`.
6. The popover lists five annotations per section and leaves out the
   severities the severity filter hides.
7. Annotations persist in a second IndexedDB database: `0.9` restores a
   `0.10` session without its annotations.
8. `SessionStoreOptions.onLoadIssue` receives a second kind of issue.

An integration that does none of these upgrades with a version bump. The
rest of the release, navigation and the annotated rows among it, is new API;
see the [CHANGELOG](../../CHANGELOG.md) and the
[annotations guide](../guides/annotations.md). Other behaviour that changed
is listed under [Other behaviour changes](#other-behaviour-changes).

## Breaking changes

### 1. `Filter` gains `AnnotatedFilter`

**What changed.** The `Filter` union has an eighth member, `AnnotatedFilter`
(`type: 'annotated'`), which keeps the rows that have annotations.
`FilterType` gains `'annotated'`, and `SerializedFilter` gains
`AnnotatedFilter`. Its `column` is always the synthetic `'__annotated__'`,
as a raw-SQL filter's is `'__raw_sql_<id>__'`. `actions.showAnnotatedRows()`
adds one; `state.filters`, `filterChange` payloads, presets and saved
sessions can now hold one.

**Who is affected.** TypeScript code with a `switch` over `filter.type` (or a
`FilterType`, or a `SerializedFilter`) that ends in an exhaustive `never`
check: it does not compile until it has an `'annotated'` case. Code that maps
`filter.column` to a schema column, and expects every filter but a raw-SQL
one to name a real column.

**Why.** Showing only the annotated rows is a filter on the view, which the
row count, the charts, exports, presets, undo and sessions must all follow,
as they follow every other filter.

**Before**

```ts
import type { Filter } from '@jeyabbalas/data-table';

function describe(filter: Filter): string {
  switch (filter.type) {
    case 'range':
      return `${filter.column} in range`;
    // … the other six types …
    case 'raw-sql':
      return filter.label ?? filter.sql;
    default: {
      const unreachable: never = filter; // 0.10: error, AnnotatedFilter is not never
      return unreachable;
    }
  }
}
```

**After**

```ts
import type { Filter } from '@jeyabbalas/data-table';

function describe(filter: Filter): string {
  switch (filter.type) {
    case 'range':
      return `${filter.column} in range`;
    // … the other six types …
    case 'raw-sql':
      return filter.label ?? filter.sql;
    case 'annotated':
      return `annotated rows (${filter.severities?.join(', ') || 'any severity'})`;
    default: {
      const unreachable: never = filter;
      return unreachable;
    }
  }
}
```

**Automated migration.** `N/A — manual review required because each switch
decides what an annotated filter means to it.` `tsc` lists every exhaustive
one. Grep for `filter.type`, `FilterType` and `.column` near `state.filters`.

### 2. `getByCell` returns the exact intersection

**What changed.** `table.annotations.getByCell(rowId, column)` returns the
row-scope annotations at `rowId`, the column-scope annotations at `column`,
and the cell-scope annotations at exactly `(rowId, column)`, as its JSDoc and
the guide always said. `0.9` returned every cell-scope annotation in the row
and in the column as well. `getByRow` and `getByColumn` are unchanged: a
row's or a column's own annotations and its cells', in insertion order.

**Who is affected.** Code that used `getByCell` to collect the annotations of
a whole row and column, as a side panel might.

**Why.** The popover lists what applies to the cell under the pointer; a
cell annotation two columns away does not. The union also cost what the
whole row and column held: 856 µs a call at a million annotations, against
2 µs for the intersection.

**Before**

```ts
// 0.9: row 7's and fare_amount's annotations, cell ones anywhere in either.
const around = table.annotations.getByCell(7, 'fare_amount');
```

**After**

```ts
// The one cell's:
const here = table.annotations.getByCell(7, 'fare_amount');

// Everything in the row and the column, as 0.9 returned it (without repeats):
const around = new Set([
  ...table.annotations.getByRow(7),
  ...table.annotations.getByColumn('fare_amount'),
]);
```

`getByRow` and `getByColumn` sort by insertion; sort the union by severity
yourself if you need `getByCell`'s order.

**Automated migration.** `N/A — manual review required because only you know
whether a call meant the cell or its row and column.` Grep for `getByCell`.

### 3. Annotation events: `loadJSON('replace')` and the payload

**What changed.**

- `loadJSON(file, 'replace')` fires `cleared` for what the store held, then
  `added` for what the file holds, each only when there is anything to
  report. `0.9` fired one `added` with the file's ids, even for an empty file
  replacing a full store. During `cleared` the store already holds the file.
- Every payload except `filterChanged` gains `annotations`, the affected
  annotations in the order of `ids` (as they were, for `removed` and
  `cleared`), and `updated` gains `previous`, each annotation before the
  update.

**Who is affected.** A listener that counted on one event per `loadJSON`, or
that read the store's size from `added` alone. Tests that compare a payload
with `toEqual({ kind, ids })`: the payload has more fields now.

**Why.** A listener that keeps its own view of the store, as the grid does,
needs to know what was removed as well as what was added, and which keys an
update moved from. The fields cost nothing when no one listens: payloads are
built only for a subscribed listener.

**Before**

```ts
store.on('change', listener);
store.loadJSON(file, 'replace');
expect(listener).toHaveBeenCalledWith({ kind: 'added', ids: ['a', 'b'] });
```

**After**

```ts
store.on('change', listener);
store.loadJSON(file, 'replace');
expect(listener).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'cleared' }));
expect(listener).toHaveBeenNthCalledWith(
  2,
  expect.objectContaining({ kind: 'added', ids: ['a', 'b'] }),
);

// Or match the fields you care about:
expect(payload).toMatchObject({ kind: 'removed', ids: ['a'] });
```

**Automated migration.** `None — mechanical:` replace `toEqual` /
`toHaveBeenCalledWith` on annotation payloads with `toMatchObject` /
`expect.objectContaining`, and expect two events from `loadJSON('replace')`.

### 4. `loadJSON` refuses a file that repeats an id

**What changed.** A file whose `annotations` repeat an `id` throws an
`AnnotationError` coded `ANNOTATION_DUPLICATE_ID`, with
`details: { id, index }`, in either mode, and leaves the store as it was.
`0.9` loaded both entries, and the second could not be removed or updated
afterwards. A session that `0.9` saved with such a file still restores,
keeping the first of each id, and saves without the repeats.

**Who is affected.** Code that builds annotation files by concatenating
others, or that loads files from a source that can repeat ids.

**Why.** The second entry corrupted the store's indexes: `remove(id)` took
one, and the other stayed, unreachable.

**Before**

```ts
table.annotations.loadJSON({
  version: 1,
  annotations: [...fileA.annotations, ...fileB.annotations],
});
```

**After**

```ts
import type { Annotation } from '@jeyabbalas/data-table';

const byId = new Map<string, Annotation>();
for (const ann of [...fileA.annotations, ...fileB.annotations]) byId.set(ann.id, ann); // last wins
table.annotations.loadJSON({ version: 1, annotations: [...byId.values()] });
```

**Automated migration.** `N/A — manual review required because only you know
which of two annotations with one id to keep.`

### 5. `update` keeps `severity` and `message` given as `undefined`

**What changed.** `update(id, { severity: undefined })` and
`update(id, { message: undefined })` leave the annotation's severity and
message as they are. `0.9` set them to `undefined`, leaving an annotation the
renderer and the JSON format could not read. Other fields given as
`undefined` are still cleared: `update(id, { code: undefined })` removes the
code.

**Who is affected.** Code that passed a whole form's values to `update`,
blanks included, and relied on that to clear a severity or a message. Both
are required fields; there was nothing valid to clear them to.

**Why.** A patch built from optional values, `{ severity: form.severity }`,
should not delete what it leaves out.

**Automated migration.** `None — nothing to change` unless code depended on
the broken result.

### 6. The popover lists five per section and leaves out hidden severities

**What changed.** The annotation popover lists at most five annotations in
each of its sections (row, column, cell) and counts the rest ("+12 more").
Annotations whose severity the severity filter hides are left out and counted
("3 hidden by the severity filter"). A cell or header whose every annotation
is hidden opens no popover, and the cell keeps its native `title`. The
popover scrolls past `min(24rem, 100vh − 8px)`, is a tab stop
(`tabindex="0"`) while it overflows, and updates in place when its
annotations change, where `0.9` listed everything and hid on every change.
`AnnotationPopover.show(anchor, annotations)` keeps its signature and caps
its sections too; it leaves out hidden severities when given the new
`severityFilter` option, as `createDataTable` gives it.

**Who is affected.** Tests and screenshots that count the popover's entries,
or expect a hidden severity in it; code that relied on the popover listing
every annotation as the place users read them all.

**Why.** A cell can hold thousands of annotations, and the popover is a
tooltip: listing them all rendered thousands of elements on hover. A
severity the user has hidden should not come back on hover, as the severity
filter's documentation said.

**Automated migration.** `N/A — manual review required because what users
should read beyond five is the app's call.` List them in your own panel with
`getByCell`, and take users to them with `actions.revealRow` (see
[An issue list](../guides/annotations.md#an-issue-list)).

### 7. Annotations persist in a second database

**What changed.** The session record in IndexedDB's `dt-sessions` no longer
holds the annotations. They go to a second database, `dt-annotations`, under
the same table name, as a head and chunks, and are written only when they
change; the session record holds a marker in their place. `dt-sessions` keeps
its version, 1, and `SNAPSHOT_VERSION` stays 5, so `0.9` tabs keep opening it.

- `0.10` restores a `0.9` session's annotations, which sit inside its
  session record, and moves them to `dt-annotations` on the next save.
- `0.9` restores a session `0.10` saved without its annotations, which it
  does not look for, and without an annotated filter, which it drops with a
  console warning. Once `0.9` saves that session, it writes the record
  without the marker that names the annotations, and `0.10` then restores it
  without them too.
- When `0.10` cannot restore the annotations a session names, it restores
  the rest and emits a `warning` coded `PERSISTENCE_ANNOTATIONS_DROPPED`.

**Who is affected.** Apps that may run `0.9` and `0.10` against the same
origin, such as a staged rollout or a rollback. Tools that read
`dt-sessions` themselves and expect the annotations in the record.

**Why.** Every save after a filter, sort or width change serialized and
cloned every annotation again: about 1.2 s at a million. Saved apart and
only when they change, those saves take 0.2–0.3 ms.

Read a session through `SessionStore`, which attaches the annotations, rather
than from IndexedDB directly:

```ts
import { SessionStore } from '@jeyabbalas/data-table';

const store = new SessionStore();
await store.open();
const snapshot = await store.load('trips');
const annotations = snapshot?.annotations;
store.close();
```

**Automated migration.** `N/A — manual review required because a rollback
plan is the app's.` To keep annotations across a rollback, export them first
with `table.annotations.toJSON()`.

### 8. `onLoadIssue` receives a second kind of issue

**What changed.** `SessionStoreOptions.onLoadIssue` is called for
`PERSISTENCE_VERSION_REJECTED`, as before, and for
`PERSISTENCE_ANNOTATIONS_DROPPED`, whose `details` are
`{ reason: 'missing' | 'mismatch' | 'invalid' | 'unavailable'; count? }`.
Its parameter is a union of the two.

**Who is affected.** Code that passes its own `onLoadIssue` to a
`SessionStore` and reads `issue.details.version` without narrowing on
`issue.code`: it no longer compiles, and would read `undefined` for the new
issue.

**Before**

```ts
import { SessionStore } from '@jeyabbalas/data-table';

const store = new SessionStore({
  onLoadIssue: (issue) => console.warn(`session v${issue.details.version} rejected`),
});
```

**After**

```ts
const store = new SessionStore({
  onLoadIssue(issue) {
    if (issue.code === 'PERSISTENCE_VERSION_REJECTED') {
      console.warn(`session v${issue.details.version} rejected`);
    } else {
      console.warn(`annotations not restored: ${issue.details.reason}`);
    }
  },
});
```

**Automated migration.** `None — mechanical:` narrow on `issue.code`; `tsc`
finds each handler.

## Non-breaking but recommended

- **Leave `F8` and `Alt+↑` / `Alt+↓` to the table, or turn them off.** With
  focus in a table that has annotations, `F8` / `Shift+F8` and `Alt+↓` /
  `Alt+↑` go to the next and previous annotation and take the key. A page
  that binds them should pass `annotationNavigation: false`, and call
  `actions.nextAnnotation()` from its own controls. See
  [Annotations → Navigating annotations](../guides/annotations.md#navigating-annotations).
- **Translate the new strings.** `messages.annotations` is new: the
  severities' names, the popover's titles and counts, and the navigation
  announcements. `messages.filters.chipDescriptions` gains `annotatedColumn`,
  `anySeverity` and `severityList`. Left out, they are English; code that
  builds a complete `Strings` object must add them to compile. See
  [i18n → Annotations](../guides/i18n.md#annotations).
- **Skip the annotated filter where you map filters to columns.** Its
  `column`, `'__annotated__'`, names no column, like a raw-SQL filter's key;
  and a real column of that name collides with it.
- **Batch, and don't change annotations in place.** One `addMany` fires one
  event; a returned annotation is the stored object, and changing it directly
  is not seen by the indexes, the grid or the session: call `update`.
- **Listen for `PERSISTENCE_ANNOTATIONS_DROPPED`.** A reload can restore a
  session without its annotations, when a save was cut short or another tab
  saved the same table. Re-apply them from your own source on that warning.

## Other behaviour changes

These need no code change in most integrations, though tests, screenshots
and error handlers can see them.

### Annotations

- **`addMany` checks the whole batch first.** A malformed entry or a taken or
  repeated id throws before anything is stored, with `details.index` the
  entry's position, where `0.9` gave `-1`. Entries without `createdAt` share
  one timestamp, where `0.9` took the time for each.
- **A store holds about 16.7 million annotations,** the most a V8 `Map`
  holds; past that, `add`, `addMany` and `loadJSON` throw a `RangeError` and
  leave the store as it was. `0.9`'s `clear()` threw a `RangeError` from
  about 125,000, and so did `loadData()` and `clearSession()`, which clear
  the store.

### Rendering and the keyboard

- **An annotated cell gives up its native `title`** while it shows a
  severity, since the popover is its tooltip; a cell whose every annotation
  is hidden keeps it. Tests that read a cell's `title` see no attribute.
- **The grid hears the store through one listener.** A `TableBody` or
  `ColumnHeader` built on its own from `/advanced` still subscribes itself.
- **`Alt+↑` and `Alt+↓` no longer leave a header's controls mode**; they do
  nothing there.
- **The popover is a tab stop while it overflows,** so a long one can be
  scrolled from the keyboard. It sits outside the table, so the table's
  tab-stop census stays five.

### Filters, persistence and queries

- **`filterChange` fires when the annotated rows change** under an annotated
  filter, with the same `filters` and the new count.
- **`getColumnValues` with `scope: 'filtered'` or `'selected'`, and the export
  dialog, wait** for the table of annotated rows to catch up with the store
  under an annotated filter.
- **A failed save of the annotations alone is reported** as an `error` with
  `source: 'persistence'` and `details.record: 'annotations'`, and the session
  keeps saving; a quota error on them, or a second failure in a row, stops
  only their saves. See
  [Session persistence](../guides/session-persistence.md#annotations-in-a-database-of-their-own).
- **`WorkerBridge` stores no result of a query that a `clearQueryCache()`
  overtook.** The caller still gets its result; the next identical query runs
  again.

## Verification checklist

- [ ] `npm install @jeyabbalas/data-table@0.10` in the target project.
- [ ] `tsc` passes: every exhaustive switch over `filter.type`, `FilterType`
      or `SerializedFilter` has an `'annotated'` case, every `onLoadIssue`
      narrows on `issue.code`, and a complete `Strings` object has
      `annotations` and the three new `chipDescriptions` keys.
- [ ] Every `getByCell` call checked: one cell, or its row and column.
- [ ] Tests on annotation events match payloads with `toMatchObject` and
      expect `cleared` then `added` from `loadJSON('replace')`.
- [ ] Annotation files checked for repeated ids.
- [ ] A rollback plan to `0.9` exports annotations first.
- [ ] `npm run build` passes.
- [ ] Manual smoke test: add annotations with `addMany`; hover an annotated
      cell; hide a severity and hover again; press `F8` and `Shift+F8`; call
      `showAnnotatedRows()` and remove an annotation under it; reload and
      check the annotations come back.

## See also

- [Annotations guide](../guides/annotations.md) — lookups, the change event,
  the popover, persistence, navigation and the annotated rows.
- [Filters → `annotated`](../guides/filters.md#8-annotated--rows-with-annotations)
- [Session persistence → Annotations in a database of their own](../guides/session-persistence.md#annotations-in-a-database-of-their-own)
- [CHANGELOG entry for v0.10](../../CHANGELOG.md)
- [Migration guides index](./README.md)
