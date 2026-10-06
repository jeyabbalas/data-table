# Accessibility

`@jeyabbalas/data-table` implements the
[WAI-ARIA grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/): a
column-count-independent tab order, a cursor published via
`aria-activedescendant`, full keyboard support, and a live region for screen
readers. This guide maps
the keyboard shortcuts, enumerates the ARIA surface, and explains the
focus-trap behavior for modals.

## You'll learn how to

- Navigate the table entirely from the keyboard
- Open a list, struct, map or JSON value and walk it as a tree
- Understand the ARIA roles and live-region announcements
- Override the ARIA labels for localization or rewording
- Test the table with a screen reader

## Prerequisites

- Read: [API reference — `Strings.a11y`](../api-reference.md#i18n)
- No dedicated example; accessibility is cross-cutting. Every example inherits the same keyboard map and ARIA structure.

## Keyboard map

Tab into the table from elsewhere on the page until focus reaches `.dt-grid` —
one tab stop, no matter how many columns it has; see
[the focus model](#focus-model-single-cursor--aria-activedescendant) for the
four others the table contributes — and then:

| Key                                                    | Action                                                                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `Tab` / `Shift+Tab`                                    | Leave the grid, forwards / backwards. **Never intercepted.**                 |
| `↑` / `↓` / `←` / `→`                                  | Move the cursor                                                              |
| `↑` from the first body row                            | Move the cursor onto the column-header row                                   |
| `↓` from the header row                                | Move the cursor into the body, same column                                   |
| `Home`                                                 | First column in the current row                                              |
| `Ctrl` / `Cmd` + `Home`                                | First cell of the body                                                       |
| `End`                                                  | Last column in the current row                                               |
| `Ctrl` / `Cmd` + `End`                                 | Last cell of the body                                                        |
| `PageUp` / `PageDown`                                  | Move the cursor by one viewport of rows                                      |
| `Enter` (body)                                         | Toggle selection on the cursor's row                                         |
| `Enter` / `Space` (header row)                         | Toggle sort on the cursor's column                                           |
| `Shift`/`Ctrl`/`Cmd` + `Enter` or `Space` (header row) | Add the column to the multi-sort stack                                       |
| `F2` (header row)                                      | Enter controls mode — focus the header cell's first button                   |
| `F2` (a nested or JSON body cell)                      | Open the [value inspector](#value-inspector-f2-on-a-nested-cell) on the cell |
| `←` / `→` (controls mode)                              | Cycle that header cell's buttons (wraps)                                     |
| `↑` / `↓` (controls mode)                              | Leave controls mode and move the cursor one row                              |
| `Enter` / `Space` (controls mode)                      | Activate the focused button                                                  |
| `Escape` (controls mode)                               | Leave controls mode; focus returns to the grid                               |
| `Shift` + `F2` (header row)                            | Enter column layout mode — resize and reorder the column                     |
| `←` / `→` (layout mode)                                | Resize the column by 16px, clamped to 50–500                                 |
| `Shift` + `←` / `→` (layout mode)                      | Move the column one position                                                 |
| `Home` / `End` (layout mode)                           | Minimum / maximum width                                                      |
| `Shift` + `Home` / `End` (layout mode)                 | Move the column to the first / last position it may occupy                   |
| `Backspace` (layout mode)                              | Reset the width to the default                                               |
| `Enter` (layout mode)                                  | Commit and leave the mode                                                    |
| `Escape` (layout mode)                                 | Cancel — restore the entry width **and** position                            |
| `Escape` (value inspector)                             | Close the inspector; focus returns to the grid, cursor kept                  |
| `Escape`                                               | Clear the cursor                                                             |
| `Ctrl` + `Z` / `Cmd` + `Z`                             | Undo                                                                         |
| `Ctrl` + `Shift` + `Z` / `Cmd` + `Shift` + `Z`         | Redo                                                                         |
| `Ctrl` + `Y`                                           | Redo (Windows convention; `Cmd` + `Y` is not bound)                          |
| `Ctrl` + `C` / `Cmd` + `C`                             | Copy selected rows (defers to native copy behavior)                          |

The keys that move the cursor scroll its cell into view, and so do the keys
that act on it where it is — `Enter`, `Space`, `F2` and `Shift+F2` — so a
cursor the user has scrolled away from with the mouse comes back into sight.
In layout mode the view follows the column as its width changes, as it moves,
and back to its place on `Escape`. A column wider than the view is shown from
its start.

When any modal or panel holds focus (export dialog, SQL filter editor,
derived-column editor, preset panel, filter panel, value inspector, extract
panel), the grid keyboard shortcuts are disabled — the dialog owns input
until dismissed.

### Column layout mode (`Shift+F2`)

Column resize and column reorder are the two per-column operations with no
button of their own in the `F2` cycle, because neither has an affordance a
focus stop could usefully sit on: the resize handle is a `role="separator"`
and the drag handle only means something under a pointer. They live behind a
modal gesture on the header cursor instead.

Nothing becomes focusable. Real DOM focus stays on `.dt-grid` for the whole
gesture, so the tab-stop census does not move and the separator never becomes
a widget ARIA would then require `aria-valuenow` / `aria-valuemin` /
`aria-valuemax` on. The column being edited carries a dashed outline
(`.dt-col-header--layout`) and lights its resize handle; every step is spoken
through the live region.

The whole gesture is **one undo entry** — ten arrow presses and a move undo in
a single `Ctrl+Z`, and a gesture that changed nothing pushes no entry at all.
`Escape` restores the entry width and position and pushes nothing. Tab is never
intercepted; walking out of the grid commits the gesture on the way.

Pinned columns refuse to move, which is what the mouse does too — the drag
handle is `pointer-events: none` while a column is pinned. An unpinned column
also cannot be moved into the pinned block, in either direction: every sticky
`left` offset assumes the pinned columns lead.

Discoverability is the part that is easy to get wrong, so it is spelled out in
four places: `aria-keyshortcuts="Shift+F2"` on every `.dt-col-header`, the key
named in the drag handle's `title` and the resize handle's `aria-label`, and
the live-region announcement on entry, which reads the whole key map aloud.
All of those strings are translatable — see
[ARIA and screen-reader strings](./i18n.md#aria-and-screen-reader-strings).

### Value inspector (`F2` on a nested cell)

A cell of a nested column (a list, array, struct, map, union or VARIANT)
shows a bounded text of its value: 32 items and `… +N`, at most 1,000
graphemes. A JSON column's cell shows its whole text on one line, cut off at
the column's edge. The value inspector shows either value whole, as a tree. It
opens on such a cell when it holds a value, not a NULL:

- **`F2` on the grid cursor.** The cell is scrolled back into view first if
  the user has scrolled away from it. `F2` on any other body cell does
  nothing, as before.
- **A double click** anywhere in the cell.
- **A click on the cell's inspect icon**, which shows at the cell's inline end
  on hover and on the cursor's cell. The click moves the cursor there and
  leaves the selection alone; with a modifier key it selects, as any click on a
  row does. A touch screen has no hover, so there the icon shows on the
  cursor's cell only, and a tap opens the inspector on that cell only.

Inspectable cells carry `aria-haspopup="dialog"` and `aria-keyshortcuts="F2"`,
which is how a screen reader user learns that `F2` opens something. The icon is
drawn by the stylesheet in the cell's pseudo-elements: no element, no text, and
no tab stop, so the [five-stop census](#focus-model-single-cursor--aria-activedescendant)
does not change.

The panel is a `role="dialog"`, named by its title: the column and the row's
1-based position in the table as sorted and filtered, `tags · Row 3`. It opens
beside the cell, inside the table, with no backdrop; the table keeps scrolling
under it:

- Focus moves into the panel, and onto the tree's first item once the value
  has loaded. `Tab` and `Shift+Tab` cycle inside the panel: the tree, then
  its buttons.
- `Escape`, the × button and Close close it, and focus returns to `.dt-grid`
  with the cursor and `aria-activedescendant` where they were; a second
  `Escape` then clears the cursor, as usual. A press outside the panel, other
  than on its own cell, closes it too, and so does a filter, sort or data
  change, a change of the selection, the cursor moving to another cell, or
  another panel opening.
- A `role="status"` line in the panel says what it is doing: "Loading…"
  (only after 150 ms, so a fast read says nothing), "Showing the first
  2,097,152 of 3,000,000 characters" for a value too long to show whole,
  "Copied", "Copy failed" or "Too large to copy" (each cleared after 3 s), and
  "Could not load this value" with a Retry button, which takes focus.

The tree follows the
[APG tree view pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/)
with flat items (`src/table/TreeView.ts`). Every visible node is a
`role="treeitem"` child of the `role="tree"` and states its own place with
`aria-level`, `aria-setsize`, `aria-posinset` and, when it can expand,
`aria-expanded`. An item's accessible name is its own row only — `x: 1.25`,
`point: struct(3), 3 fields` — where items nested in `role="group"` elements
would fold an expanded struct's every field into its parent's name. The tree is
one tab stop: the active item carries `tabindex="0"` and `aria-selected="true"`.
The root opens expanded, and its children too when they fit in 50 rows.

| Key                      | Action                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `↓` / `↑`                | Next / previous visible item                                                                                |
| `→`                      | Expand a closed item; on an open one, move to its first child                                               |
| `←`                      | Collapse an open item; on a closed one or a leaf, move to its parent                                        |
| `Home` / `End`           | First / last visible item                                                                                   |
| `*`                      | Expand the active item and its siblings                                                                     |
| `Enter` / `Space`        | Expand or collapse the active item                                                                          |
| A printable character    | Type-ahead: move to the next item whose name starts with what was typed (any character but a space and `*`) |
| `Ctrl` / `Cmd` + `Enter` | Add the active item as a column, when the inspector offers it (see [Extract panel](#extract-panel))         |
| `Ctrl` / `Cmd` + `C`     | Copy the active item's value as JSON, unless text in the tree is selected                                   |
| `Tab` / `Shift+Tab`      | Move between the tree and the panel's buttons; never leaves the panel                                       |
| `Escape`                 | Close the inspector                                                                                         |

A container too big to list at once is split into buckets of 100 items —
`[1 … 100]`, `[101 … 200]`, … — each an ordinary item, so the tree never builds
more rows than it shows; `aria-setsize` and `aria-posinset` count the items
under one parent, buckets included. Positions in a list, array or map are
1-based, as in SQL; positions in a JSON array 0-based. Copy JSON copies the
whole value. With the `derivedColumns` UI on (the default), the footer also
offers "Add as column" for the active item, or its length, size or tag, and
reports "Adding…" and any failure in the status line; the "+" a row shows on
hover is `aria-hidden`, since the footer and `Ctrl/Cmd+Enter` do the same. The strings the panel and the tree speak are translatable — see
[Value inspector](./i18n.md#value-inspector).

### Extract panel

A nested or JSON column's header has one more control than other headers: an
extract button (`.dt-col-extract-btn`), after the filter button. It is
`tabindex="-1"` like the others and sits in the `F2` cycle — pin, hide, filter,
extract, sort — so it adds no tab stop. It is named "Extract from point", titled
"Extract a field as a column", and carries `aria-haspopup="dialog"`, with
`aria-expanded` saying whether its panel is open. The responsive rules keep it
with filter and sort: under 750 px of table width the pin button and the drag
handle hide, and under 550 px the hide button too. With `derivedColumns: false`
there is no extract button.

The button opens a panel under it, a non-modal `role="dialog"` titled "Extract
from point", which closes any other panel. `Tab` cycles inside it, `Escape`
closes it, and focus returns to the button.

- **A tree of the column's type**, the same [APG tree](#value-inspector-f2-on-a-nested-cell)
  as the inspector's, named "Parts of point": a struct's fields at any depth
  (an unnamed field by its 1-based position), a union's tag and then its
  members, a list's or an array's length and then its element, a map's size
  and then its value. Focus starts on its first item. A JSON or VARIANT column
  has no tree, and focus starts in the JSON path field.
- **A labelled field for each step to type**: a 1-based position for each
  list or array element on the way ("Position in people", "Position in matrix
  › element"), a key for each map value ("Key in attrs"), and for a part that
  is JSON or VARIANT, a JSON path, whose hint is tied to it with
  `aria-describedby`, and a "Read as" select.
- **The column's name and the expression** it will read, shown as text.
- **Errors** appear under the fields as you type, tied to them with
  `aria-describedby` rather than announced, since they change with every key;
  the field at fault carries `aria-invalid="true"` and Add column is disabled.
  A map key's field is `aria-required` and starts empty, which is not yet
  wrong: it is marked once typed in, or once `Enter` is pressed.
  A failed add is said in a `role="alert"` region in the footer, there from the
  start so that its text is announced.
- **Adding.** Add column, `Enter` in a text or number field (not the "Read as" select), `Enter` on a tree item that does not expand (a scalar field, a length, a size, a tag) or `Ctrl/Cmd+Enter` anywhere in the panel adds
  the column. Meanwhile the button reads "Adding…" and is `aria-disabled`, not
  `disabled`, so it keeps focus and `Escape` still works.

After an add, from the panel or the inspector, the cursor moves to the new
column, on its header from the panel or on the same row from the inspector, the
column scrolls into view, its header flashes, and the live region says "Column
point_x added". A failure with neither panel open is announced as "Could not
add the column: …".

### Focus model (single cursor + `aria-activedescendant`)

A loaded table contributes exactly **five** tab stops, in this DOM order, and
that number never changes with the data:

| Stop                                      | Why it exists                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `.dt-filter-bar`                          | `role="toolbar"` — one roving stop for the whole bar, however many chips it holds. |
| `.dt-grid`                                | The cursor — arrows, Home/End, PageUp/PageDown, Enter, F2, the keyboard map above. |
| `.dt-header-scroll` and `.dt-body-scroll` | WCAG 2.1.1: a scrollable region has to be keyboard-reachable.                      |
| `.dt-hidden-gutter`                       | `role="toolbar"` — one roving stop, however many columns are hidden.               |

Five at four columns, five at 266; five with every column hidden but one, five
with a dozen filters active. That is the property to hold onto, because it is
the one that used to break: the gutter emitted one plain focusable button per
hidden column and the filter bar one per chip, so the count grew with use.

The two toolbars follow the
[APG roving-tabindex model](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/):
exactly one control inside carries `tabindex="0"`, the rest carry `-1`, and `←`
/ `→` (plus `↑` / `↓` in the gutter, which wraps onto several rows) move that
stop between them, with `Home` / `End` jumping to the ends. Tab enters and
leaves the toolbar; it never walks through it.

Landing on a scroll region is not a mode. The first cursor key pressed there
hands focus to `.dt-grid` and moves the cursor as usual, so there is no state to
notice and no way to get stuck — the stops exist so the regions are reachable,
not so they behave differently.

Everything else inside the grid — every cell, every column header, every
per-column button — is `tabindex="-1"`. The three grid stops disappear entirely
before data is loaded, since an empty shell has nothing to navigate and nothing
that overflows. The two toolbars collapse to zero stops while they are empty,
which for the gutter effectively never happens: the internal
[`__rowid__`](../glossary.md#__rowid__-synthetic-row-id) column ships hidden, so
there is always at least one chip. The filter bar keeps its stop whenever it is
rendered — including on an unloaded table — which under the defaults is always,
because the Expression button holds it open. Pass `expressionFilter: false` with
no `presetManager` and the bar collapses until the first filter is added: four
stops at rest, five once a chip exists.

The cursor is therefore not DOM focus. `.dt-grid` keeps real focus and names the
active cell through `aria-activedescendant`, pointing at that cell's `id`.
Two things force this rather than a roving `tabindex="0"`:

- The body is virtualized with a pooled row recycler. A cell holding real focus
  would carry it into the pool when it scrolled out of view.
- With ~6 buttons per column header, a roving tab order would put ~1,600 tab
  stops in front of anything after a 266-column table.

The column-header row is part of the same cursor space, so exactly one active
descendant exists at a time. Internally that is `focusedCell.row === -1`
(`HEADER_ROW_INDEX`); body rows report `aria-rowindex = row + 2`, because under
`role="grid"` the header is row 1.

`aria-rowcount` counts the rows the grid actually renders, plus that header row:
`filteredRows + 1` while any filter is active, `totalRows + 1` otherwise
(`TableContainer.updateGridCounts`). Counting the total under a filter would
have a screen reader announce "row 3 of 5,001" on a five-row result.
`aria-colcount` is the full schema length, hidden columns included.

`F2` is the escape hatch into the header's buttons: it moves real DOM focus onto
the first one, `←` / `→` cycle them, `↑` / `↓` leave and move the cursor, and
`Escape` hands focus back to `.dt-grid`. On a body cell that holds a nested or
JSON value, `F2` opens the [value inspector](#value-inspector-f2-on-a-nested-cell)
instead, whose `Escape` hands focus back the same way.

A column narrower than its buttons (about 135 px at the default padding; a
column can be 50 px) shows the buttons that fit and clips the rest at its
edge, so none lies over the next header. The bar shows all of them, running on
over the next header's bar, once the pointer has rested on it for 200 ms, and
at once when keyboard focus is in it. The pointer reaches the others along the
bar; a pointer passing along the row of bars without pausing reveals nothing,
so a click lands on the button under it. A nested or JSON column's header has
six controls, so it is narrower than its buttons already at the default
150 px: six 22-px controls need 132 px where the bar clips at 128, so the
drag handle loses the last 4 px of its box, past its dots, until hover or
`F2` shows the bar whole, and its buttons touch, where a five-control
header's have about 4 px between them. While a bar is shown, it covers the next header's first
buttons, visibly, until the pointer leaves it. `F2` scrolls the table so the
button it focuses is always in view, and the last column's bar runs on
leftward instead, over its own header and the one before.

Clicking parks real focus on whatever it hit — a cell, a scroll region — which
would leave `aria-activedescendant` describing a cursor the focused element
knows nothing about. The grid takes focus back on the next cursor keystroke
rather than on the click itself, so pointer interactions, and the annotation and
tooltip popovers that open on `focusin`, are left alone.

## ARIA surface

### Roles

| Element                                               | Role                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Outer wrapper (`.dt-root`)                            | none — a plain `div`                                                                                   |
| Grid (`.dt-grid`)                                     | `role="grid"`, `tabindex="0"`, `aria-label`, `aria-rowcount`, `aria-colcount`, `aria-activedescendant` |
| Header scroller (`.dt-header-scroll`)                 | `role="rowgroup"`, `tabindex="0"`                                                                      |
| Header row                                            | `role="row"` with `aria-rowindex="1"`                                                                  |
| Column header cell                                    | `role="columnheader"`                                                                                  |
| Body scroller (`.dt-body-scroll`)                     | `role="rowgroup"`, `tabindex="0"`                                                                      |
| Data row                                              | `role="row"`                                                                                           |
| Data cell                                             | `role="gridcell"`                                                                                      |
| Data cell of a nested or JSON value                   | `role="gridcell"`, `aria-haspopup="dialog"`, `aria-keyshortcuts="F2"`                                  |
| Value inspector                                       | `role="dialog"` (a non-modal panel), `aria-labelledby` its title                                       |
| Value inspector status line                           | `role="status"`                                                                                        |
| Value tree                                            | `role="tree"`, `aria-label` ("Value of tags"); flat `role="treeitem"` items, one tab stop              |
| Extract button (a nested or JSON column header)       | a button, `aria-haspopup="dialog"`, `aria-expanded`; in the `F2` cycle, `tabindex="-1"`                |
| Extract panel                                         | `role="dialog"` (a non-modal panel), `aria-labelledby` its title; a `role="tree"` of the column's type |
| Extract panel failure line                            | `role="alert"`                                                                                         |
| Filter panel                                          | `role="dialog"` (floating popover)                                                                     |
| SQL filter modal, export dialog, derived-column modal | `role="dialog"`                                                                                        |
| Null filter toggle group                              | `role="radiogroup"`                                                                                    |
| Filter bar (`.dt-filter-bar`)                         | `role="toolbar"`, `aria-label`, roving tabindex (horizontal)                                           |
| Hidden-columns gutter (`.dt-hidden-gutter`)           | `role="toolbar"`, `aria-label`, roving tabindex (both axes)                                            |
| Column resizer handle                                 | `role="separator"`, `aria-orientation="vertical"`, never focusable                                     |
| Live-region announcers (two)                          | `role="status"` with `aria-live="polite"`, `aria-atomic="true"`                                        |

Three structural details are load-bearing rather than incidental:

- **`.dt-root` carries no role and no `aria-label`.** It hosts the grid _and_
  its siblings — the toolbar filter bar, the status live region, the toolbar
  hidden-columns gutter — none of which a `table` or `grid` role may own. A
  bare `generic` element may not carry `aria-label` either
  (`aria-prohibited-attr`), which is why the accessible name lives on
  `.dt-grid`. `getElement()` still returns `.dt-root`.
- **The rowgroups are the scroll containers, not the inner `.dt-header` /
  `.dt-body` wrappers.** Both scrollers carry `tabindex="0"`, because
  `scrollable-region-focusable` wants a region a keyboard user can reach and
  scroll — `-1` makes an element programmatically focusable but leaves it out
  of the tab order, which does not satisfy the rule. That in turn makes them
  _focusable_ roleless elements sitting directly under `role="grid"`, which is
  an `aria-required-children` violation. Giving them the rowgroup role they
  were wrapping anyway resolves both.
- **There are two `role="status"` regions, not one.** The first is rebuilt
  wholesale from filter, sort and row-count state on every flush; anything
  written into it is clobbered by the next frame. The second
  (`.dt-announce`) carries transient messages — a new column width, a
  column's new position, the entry and exit of column layout mode — through
  `TableContainer.announce()`. Repeating the same text there blanks the node
  for a frame first, because assistive tech ignores a live region whose text
  has not changed.

Grid semantics are attached lazily: before a schema and table name exist, the
shell renders a "Load data" placeholder, owns no rows, and carries no role,
no `tabindex`, and no `aria-*`.

### `aria-label` on interactive controls

Every sort button, filter button, pin button, hide button, and edit button
carries a contextual `aria-label` drawn from the `Strings` interface. For
example, the "Remove filter" button on column `age`:

```
aria-label="Remove filter on age"
```

Customizing these labels is an i18n task — override the relevant entries in
`messages.filters.ariaLabels` and `messages.a11y`. See the
[i18n guide](./i18n.md).

### Live-region announcements

A visually-hidden `role="status"` element at the top of the container
announces state changes to screen readers:

| Event                                   | Announcement template                             |
| --------------------------------------- | ------------------------------------------------- |
| Filter added / removed / cleared        | "N filters active, M of T rows match"             |
| Sort changed                            | "Sorted by column X ascending, then Y descending" |
| Sort cleared                            | "Sort cleared"                                    |
| Row count changed (after load or clear) | "Showing N rows"                                  |

The exact wording comes from `messages.a11y.*` — translate these carefully
for non-English locales.

## Modal focus trap

When a dialog opens (`role="dialog"`), focus moves to its designated field,
or else to the first control inside it that is shown: one a stylesheet hides,
such as the filter panel's Clear button before its column has a filter, is
skipped. `Tab` cycles within the dialog, stopping once on a radio group as the
browser does; `Escape` dismisses it and returns focus to the control that
opened it.

- **Focus trap.** Tab can't escape the dialog while it's open.
- **Keyboard deferral.** The grid's keyboard handlers check
  `document.activeElement.closest('[role="dialog"]')` and bail out if a
  dialog is focused. So Ctrl+Z inside the SQL filter editor undoes _in the
  editor_, not in the grid.
- **Close on Escape.** Every dialog listens for `Escape` and dismisses.

## Popovers (annotation + column-header tooltip)

Two non-modal popovers attach to header / cell elements. Both are
keyboard-reachable and `Escape`-dismissable:

- **Annotation popover** ([`AnnotationPopover`](../../src/table/AnnotationPopover.ts))
  — anchored on row / cell / header elements that carry annotations.
  `role="tooltip"` + `aria-live="polite"`. Opens on `pointerenter` /
  `focusin`; dismisses on `pointerleave` (with a 120ms grace so users
  can move into the popover content), `focusout`, `Escape`, scroll, or
  click outside. Severity-filtered annotations remain in the
  underlying store but are not painted or popped while their flag is
  off.
- **Column-header tooltip popover** ([`ColumnHeaderTooltipPopover`](../../src/table/ColumnHeaderTooltipPopover.ts))
  — anchored on the column-name span (`.dt-col-name`). The span
  receives `tabindex="-1"` only when an override is set via
  `actions.setColumnHeaderTooltip`, which makes it an extra stop in that
  header's `F2` controls-mode cycle rather than a page-level tab stop.
  Same lifecycle primitives as the annotation popover (pointer / focus
  open, Escape dismisses).

The two popovers anchor on different DOM nodes (header container vs.
name span) and can both be visible simultaneously. They use distinct
z-indexes (annotation popover at `--dt-z-annotation-popover: 55`;
column-header tooltip at `--dt-z-col-tooltip: 56`) so the tooltip
renders in front when both are open.

Every text field in the column-header tooltip is rendered via
`.textContent` — HTML strings are not parsed. This is the recommended
surface for JSON-Schema-style metadata (variable name, description,
units, enum) without an XSS surface.

## High-contrast mode

The library uses CSS custom properties for every colour (see the
[theming guide](./theming.md)). In Windows high-contrast mode, browsers
override these with the system colours, so the table picks up the user's
high-contrast palette automatically. No extra work needed on your side —
but if you override `--dt-*` tokens, make sure focus outlines remain
visible in your overrides.

On top of that automatic behaviour, `src/styles/12-high-contrast.css` — last
in the cascade, so it wins over the per-component styles — adds two targeted
blocks: `prefers-contrast: more` thickens filter-chip borders, and
`forced-colors: active` keeps the visualization canvases in colour, pins
filter chips to `CanvasText` and disabled buttons to `GrayText`, draws a
nested cell's inspect icon in `CanvasText` on `Canvas` (forced colours would
drop the gradients its glyph is drawn with), outlines the active item of the
value tree and of the extract panel's tree in `Highlight`, and marks an open
extract button and a field at fault with `Highlight` too. What those
blocks do _not_ cover is listed under
[What's not yet supported](#whats-not-yet-supported).

## Reduced motion

The library uses `prefers-reduced-motion: reduce` in CSS to suppress
non-essential transitions (panel slide-ins, chip fade-ins). If you override
`--dt-transition`, you'll need to add your own `@media` query if you want
to preserve that behavior.

## Testing recipes

### VoiceOver on macOS

1. Enable VoiceOver: `Cmd+F5`.
2. Focus the table (Tab from the address bar or a preceding control).
3. Arrow through cells — VoiceOver announces `<column name>: <value>, row N of M`.
4. Apply a filter — the live-region announcement reads aloud.
5. Open a filter panel — VoiceOver announces the dialog title and traps focus.

### NVDA on Windows + Firefox

1. Start NVDA.
2. Tab to the table.
3. Use arrows to navigate — NVDA announces cell content and header context.
4. Toggle a sort button with Space — sort announcement reads aloud.

### Axe DevTools

Install the [axe DevTools browser extension](https://www.deque.com/axe/devtools/),
run a scan on a page with a mounted table, and confirm zero violations in
the default configuration. A known issue to look for: if you mount the
table before CSS loads, `color-contrast` violations can flare until the
stylesheet arrives.

## Recipes

### Force focus into the table on mount

```ts
const table = await createDataTable({ container, source });
// Focus the grid — the cursor's tab stop. Arrow keys then move the
// cursor from wherever it last was, or from the top-left cell.
(container.querySelector('[role="grid"]') as HTMLElement | null)?.focus();
```

The selector only matches once data is loaded, since the empty shell carries no
role. `await createDataTable({ source })` already resolves after first paint,
so the ordering above is safe.

### Announce a custom message

The library doesn't expose the live region directly (it's an internal
element), but you can add your own:

```ts
const sr = document.createElement('div');
sr.setAttribute('aria-live', 'polite');
sr.className = 'sr-only'; // your own hidden-but-readable class
document.body.appendChild(sr);

table.on('loadComplete', ({ rowCount }) => {
  sr.textContent = `Loaded ${rowCount.toLocaleString()} rows`;
});
```

### Override a single ARIA label

```ts
messages: {
  filters: {
    ariaLabels: {
      removeFilter: (col) => `Remove the filter on the ${col} column`,
    },
  },
};
```

## Gotchas

- **Grid keyboard shortcuts are disabled when a dialog is focused.** That's intentional — each context "owns" its keystrokes. Confused users often assume the arrow keys should work inside the filter panel; gently remind them.
- **Tab always moves on.** It is never intercepted, in any state, including controls mode and the two toolbars. Moving _within_ the grid is the arrow keys' job. Five Tab presses cross the whole table: the filter bar, the cursor, the two scroll regions, the hidden-columns gutter.
- **The grid does not own keys pressed on the filter bar or the hidden-columns gutter.** They sit inside `.dt-root`, where the keydown listener lives, so the grid explicitly checks that focus is inside `.dt-grid` before acting — otherwise Space on "Clear all filters" would sort a column instead. Undo, redo and copy stay table-wide.
- **The per-column buttons are not in the tab order.** Sort, pin, hide, filter, a nested or JSON column's extract button and the derived-column `f(x)` icon are reachable through `F2` from the header row, not by tabbing. A 266-column table would otherwise put ~1,600 tab stops in front of the next control on the page.
- **Only the columns near the view have their buttons.** Every visible column has its `columnheader`, with its label, sort state and `aria-colindex`, but the pin, hide, filter and sort buttons and the drag and resize handles exist only for the columns body rows render cells for. The cursor's column is always one of them, so `F2` always has buttons to cycle, and so is a column whose filter panel, extract panel or derived-column editor is open, so closing it gives focus back to the button that opened it. A screen reader's browse mode, reading the page rather than the grid, finds buttons only in those headers.
- **The drag handle and the resize handle are not in the `F2` cycle either.** `ColumnHeader.getControls()` — the list `F2` walks — omits them on purpose, along with any control the responsive rules have hidden and any disabled one. A focus stop whose Enter key does nothing is worse than no stop at all, and a focusable `role="separator"` would need `aria-valuenow` / `aria-valuemin` / `aria-valuemax` to stay valid. They have their own gesture instead: [`Shift+F2`](#column-layout-mode-shiftf2), which costs no tab stop and no focus stop.
- **Live-region announcements are `polite`, not `assertive`.** Long-running operations queue without interrupting the user's current read. For ops that need interruption (errors), raise your own `role="alert"` region.
- **Hide button preserves the last-visible column.** Pressing hide on the only visible column does nothing — the table must have at least one visible column.
- **Row selection via Enter is explicit.** Keyboard users can't accidentally select the whole row with a stray arrow; they must Enter.
- **`F2` on a body cell only opens the value inspector.** On a cell of a nested or JSON column that holds a value, it opens the inspector; on a row still loading, as after `Ctrl+End` on a large table, it opens it once the row arrives with a value there, unless first the cursor moves, a filter, sort or selection changes, or focus leaves the table; on any other body cell, a scalar one or a NULL, it does nothing. Body cells have no controls mode.
- **High-DPI + custom focus ring.** If you override `--dt-primary`, check that the focus outline contrast ratio stays ≥ 3:1 against the cell background.

## Manual screen-reader test plan

The automated `tests/a11y/axe.test.ts` suite catches structural ARIA
issues in jsdom (19 scenarios — empty shell, light and dark, header cursor
set, column layout mode in light and dark, filters open, sort active, every
modal, the value inspector and the extract panel in light and dark, every
popover, multi-table, RTL). Every rule except `color-contrast` runs, including
`aria-required-children`; contrast is guarded separately by
`tests/styles/contrast.test.ts`, which computes ratios from the token
declarations. The matrix below covers the dynamic announcement and
focus-flow behaviour that needs a real screen reader.

Run before each release on at least one combination of OS + screen
reader from each row. The test rig is the demo (`npm run dev`).

| Scenario                                                                                                                                | VoiceOver (macOS, Safari)                                                                                                                                                 | NVDA (Windows, Firefox) | JAWS (Windows, Chrome) |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------- |
| **Grid focus + arrow nav** — focus the grid, ArrowDown / ArrowRight a few cells                                                         | row N, column NAME, value V                                                                                                                                               | same                    | same                   |
| **Tab through** — Tab from the control before the table to the one after it                                                             | six presses — five stops inside, one to step off — regardless of column count, hidden columns or active filters; Shift+Tab retraces                                       | same                    | same                   |
| **Header cursor** — ArrowUp from body row 0, then ArrowLeft / ArrowRight                                                                | column header name, type, sort and filter state                                                                                                                           | same                    | same                   |
| **Controls mode** — F2 on a header, ArrowRight a few times, Enter, Escape                                                               | button label announced on each step; Escape returns to the grid cursor                                                                                                    | same                    | same                   |
| **Layout mode** — Shift+F2 on a header, then ←, Shift+→, Backspace, Escape                                                              | key map read on entry; each step announces a width or a new position; Escape says the layout was cancelled                                                                | same                    | same                   |
| **Extract panel** — F2 on a list header to its extract button, Enter, ↓ to `element`, Tab to the position field, type a position, Enter | the button announces it opens a dialog; dialog title and tree announced; a wrong position is described on the field; "Column … added" on success; focus lands on the grid | same                    | same                   |
| **Value inspector** — F2 on a nested cell, then ↓, →, `*`, Ctrl/Cmd+C, Escape                                                           | the cell announces it opens a dialog; dialog title announced; each item read with its level and position; Escape returns to the grid cursor                               | same                    | same                   |
| **Filter add** — open Filter panel, apply a range filter, close                                                                         | live region: "1 filter active, showing X of Y rows"                                                                                                                       | same                    | same                   |
| **Sort change** — click a column header twice (toggle desc)                                                                             | live region: "sorted by NAME descending"                                                                                                                                  | same                    | same                   |
| **Modal open** — open Export, then SQL filter, then Derived column                                                                      | dialog title announced; focus moves into dialog; Tab cycles inside; Esc closes and returns focus to opener                                                                | same                    | same                   |
| **Annotation popover** — focus an annotated cell; trigger via pointer / focus                                                           | tooltip role; description announced                                                                                                                                       | same                    | same                   |
| **Column header tooltip** — focus a header with a tooltip set                                                                           | tooltip role; description announced                                                                                                                                       | same                    | same                   |
| **Undo / redo** — Cmd/Ctrl+Z then Cmd/Ctrl+Shift+Z                                                                                      | live region announces resulting state ("0 filters active, …")                                                                                                             | same (Ctrl+Z / Ctrl+Y)  | same                   |

Document any divergence in the relevant release / phase report. Known
quirks worth checking:

- **VoiceOver** does not always announce `aria-rowindex` updates when
  the grid virtualises a long scroll — fall back to "row N of M" via
  the polite live region.
- **JAWS** in browse mode treats `role="grid"` cells as read-only text
  by default; switch to forms mode (Insert+Z, then Insert+space) to
  enable arrow-key navigation per the grid contract.
- **`aria-activedescendant` support varies.** All three readers handle it,
  but announcement verbosity differs — some read the whole cell, some only
  the changed part. Check that moving the cursor announces _something_ on
  every step rather than diffing the wording against a fixed script.

## Color-contrast verification

Axe-core does not run color-contrast in jsdom (no layout), so CI guards it a
different way: `tests/styles/contrast.test.ts` parses `01-variables.css` and
asserts WCAG 2.x ratios for each text token against each surface token in both
themes, plus the light/dark lightness ordering and the sync between the file's
duplicated theme blocks. Every size the library renders is below the
"large text" threshold, so every pair must clear **4.5:1**.

That covers the tokens. Composite surfaces (`color-mix()` backgrounds) and
anything a consumer overrides still want a real browser before each release:

1. `npm run build:demo && npm run preview` (or run the live demo).
2. Run a Lighthouse a11y audit on the demo page in light mode.
3. Toggle the theme switcher to dark mode; re-run the audit.
4. The Lighthouse a11y score should be ≥ 95; any contrast issue is a
   release blocker.

If you override `--dt-text-secondary` / `--dt-text-tertiary`, re-check them
against `--dt-bg-tertiary` (a hovered column header) and
`--dt-primary-lighter` (a selected, hovered row) — those are the strictest
backgrounds in the library, and the ones the shipped defaults were tuned for.

For CI, consider a Playwright-based axe-with-real-layout job (deferred
to post-1.0).

## What's not yet supported

- **Contrast beyond AA under `prefers-contrast: more`.** The media query
  _is_ handled — `src/styles/12-high-contrast.css` ships a
  `@media (prefers-contrast: more)` block — but all it does is thicken the
  filter-chip border to 2px so chip boundaries stay distinct against the
  user's preferred palette. The colour tokens are left alone, on the grounds
  that the shipped defaults already clear WCAG AA 4.5:1 (see
  [Color-contrast verification](#color-contrast-verification)). If you want
  AAA, or a darker palette than the defaults, override `--dt-text` /
  `--dt-text-secondary` / `--dt-text-tertiary` / `--dt-primary` inside your
  own `prefers-contrast` query.
- **Full `forced-colors` coverage (Windows High Contrast Mode).** The same
  file ships a `@media (forced-colors: active)` block, but it is deliberately
  narrow: it opts the visualization canvases and SVGs out of colour
  flattening with `forced-color-adjust: none` (histogram bars and brush
  selections carry information, so flattening them loses data), pins
  `.dt-filter-chip` to `CanvasText`, maps disabled buttons to `GrayText`, and
  keeps the inspect icon, the trees' active items, an open extract button
  and a field at fault visible.
  Everything else — modals, popovers, filled buttons, non-filter chips — is
  left to whatever the user agent substitutes.
- **Touch drag for column resize / reorder** — the pointer path uses mouse
  events (`mousedown` / `mousemove` / `mouseup`). iOS Safari does not
  synthesise reliable mousemove between touchstart and touchend, so dragging
  a column on a touch device does not work. The keyboard gesture
  ([`Shift+F2`](#column-layout-mode-shiftf2)) covers both operations, so this
  is a pointer gap rather than a WCAG 2.1.1 one. Documented in the README and
  AGENTS.md as out-of-scope.

## Related

- i18n: [i18n guide](./i18n.md) for translating `a11y` strings and ARIA labels
- Theming: [Theming guide](./theming.md) for focus-outline and contrast customization
- Migration: [v0.5 → v0.6](../migration-guides/from-0.5-to-0.6.md) if you query the table's DOM by ARIA role
- Source: `src/table/KeyboardNavigator.ts` (keyboard map, cursor, controls mode), `src/table/TableContainer.ts` (`.dt-grid` assembly, ARIA grid semantics, live region, `openValueInspector`), `src/table/ValueInspector.ts`, `src/table/ExtractColumnPanel.ts` and `src/table/TreeView.ts` (the value inspector, the extract panel and their tree), `src/table/ColumnHeader.ts` (`getControls`, header ids), `src/table/TableBody.ts` (`role="gridcell"`, cell ids), `src/core/RovingTabindex.ts` (the toolbar keyboard model shared by `src/filters/FilterBar.ts` and `src/table/HiddenColumnsGutter.ts`), `src/styles/12-high-contrast.css` (`prefers-contrast` / `forced-colors`), `src/core/Strings.ts` (`a11y` and `filters.ariaLabels` categories)
