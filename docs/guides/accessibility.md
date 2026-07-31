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
- Understand the ARIA roles and live-region announcements
- Override the ARIA labels for localization or rewording
- Test the table with a screen reader

## Prerequisites

- Read: [API reference — `Strings.a11y`](../api-reference.md#i18n)
- No dedicated example; accessibility is cross-cutting. Every example inherits the same keyboard map and ARIA structure.

## Keyboard map

Tab into the table from elsewhere on the page — the grid is one tab stop, no
matter how many columns it has — and then:

| Key                                            | Action                                                       |
| ---------------------------------------------- | ------------------------------------------------------------ |
| `Tab` / `Shift+Tab`                            | Leave the grid, forwards / backwards. **Never intercepted.** |
| `↑` / `↓` / `←` / `→`                          | Move the cursor                                              |
| `↑` from the first body row                    | Move the cursor onto the column-header row                   |
| `↓` from the header row                        | Move the cursor into the body, same column                   |
| `Home`                                         | First column in the current row                              |
| `Ctrl` + `Home`                                | First cell of the body                                       |
| `End`                                          | Last column in the current row                               |
| `Ctrl` + `End`                                 | Last cell of the body                                        |
| `PageUp` / `PageDown`                          | Move the cursor by one viewport of rows                      |
| `Enter` (body)                                 | Toggle selection on the cursor's row                         |
| `Enter` / `Space` (header row)                 | Toggle sort on the cursor's column                           |
| `Shift`/`Ctrl`/`Cmd` + `Enter` (header row)    | Add the column to the multi-sort stack                       |
| `F2` (header row)                              | Enter controls mode — focus the header cell's first button   |
| `←` / `→` (controls mode)                      | Cycle that header cell's buttons (wraps)                     |
| `Enter` / `Space` (controls mode)              | Activate the focused button                                  |
| `Escape` (controls mode)                       | Leave controls mode; focus returns to the grid               |
| `Escape`                                       | Clear the cursor                                             |
| `Ctrl` + `Z` / `Cmd` + `Z`                     | Undo                                                         |
| `Ctrl` + `Shift` + `Z` / `Cmd` + `Shift` + `Z` | Redo                                                         |
| `Ctrl` + `C` / `Cmd` + `C`                     | Copy selected rows (defers to native copy behavior)          |

When any modal is open (export dialog, SQL filter editor, derived-column
editor, preset panel), the grid keyboard shortcuts are disabled — the
modal owns input until dismissed.

### Focus model (single cursor + `aria-activedescendant`)

The table contributes exactly **three** tab stops, and that number never changes
with the data:

| Stop                                      | Why it exists                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `.dt-grid`                                | The cursor — arrows, Home/End, PageUp/PageDown, Enter, F2, the keyboard map above. |
| `.dt-header-scroll` and `.dt-body-scroll` | WCAG 2.1.1: a scrollable region has to be keyboard-reachable.                      |

Landing on a scroll region is not a mode. The first cursor key pressed there
hands focus to `.dt-grid` and moves the cursor as usual, so there is no state to
notice and no way to get stuck — the stops exist so the regions are reachable,
not so they behave differently.

Everything else inside the grid — every cell, every column header, every
per-column button — is `tabindex="-1"`. The three stops disappear entirely
before data is loaded, since an empty shell has nothing to navigate and nothing
that overflows.

The cursor is therefore not DOM focus. `.dt-grid` keeps real focus and names the
active cell through `aria-activedescendant`, pointing at that cell's `id`.
Two things force this rather than a roving `tabindex="0"`:

- The body is virtualized with a pooled row recycler. A cell holding real focus
  would carry it into the pool when it scrolled out of view.
- With ~6 buttons per column header, a roving tab order would put ~1,600 tab
  stops in front of anything after a 266-column table.

The column-header row is part of the same cursor space, so exactly one active
descendant exists at a time. Internally that is `focusedCell.row === -1`
(`HEADER_ROW_INDEX`); `aria-rowcount` is `totalRows + 1` and body rows report
`aria-rowindex = row + 2`, because under `role="grid"` the header is row 1.

`F2` is the escape hatch into the header's buttons: it moves real DOM focus onto
the first one, `←` / `→` cycle them, `↑` / `↓` leave and move the cursor, and
`Escape` hands focus back to `.dt-grid`.

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
| Filter panel                                          | `role="dialog"` (floating popover)                                                                     |
| SQL filter modal, export dialog, derived-column modal | `role="dialog"`                                                                                        |
| Null filter toggle group                              | `role="radiogroup"`                                                                                    |
| Filter bar                                            | `role="toolbar"`                                                                                       |
| Hidden-columns gutter                                 | `role="toolbar"`                                                                                       |
| Column resizer handle                                 | `role="separator"`                                                                                     |
| Live-region announcer                                 | `role="status"` with `aria-live="polite"`, `aria-atomic="true"`                                        |

Two structural details are load-bearing rather than incidental:

- **`.dt-root` carries no role and no `aria-label`.** It hosts the grid _and_
  its siblings — the toolbar filter bar, the status live region, the toolbar
  hidden-columns gutter — none of which a `table` or `grid` role may own. A
  bare `generic` element may not carry `aria-label` either
  (`aria-prohibited-attr`), which is why the accessible name lives on
  `.dt-grid`. `getElement()` still returns `.dt-root`.
- **The rowgroups are the scroll containers, not the inner `.dt-header` /
  `.dt-body` wrappers.** Both scrollers need `tabindex="-1"` to satisfy
  `scrollable-region-focusable`, and a _focusable_ roleless element sitting
  directly under `role="grid"` is an `aria-required-children` violation. Giving
  them the rowgroup role they were wrapping anyway resolves both.

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

When a dialog opens (`role="dialog"`), focus moves to the first focusable
control inside it. `Tab` cycles within the dialog; `Escape` dismisses it
and returns focus to the control that opened it.

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
- **Tab always moves on.** It is never intercepted, in any state, including controls mode. Moving _within_ the grid is the arrow keys' job. Three Tab presses cross the whole table: the cursor, then the two scroll regions.
- **The grid does not own keys pressed on the filter bar or the hidden-columns gutter.** They sit inside `.dt-root`, where the keydown listener lives, so the grid explicitly checks that focus is inside `.dt-grid` before acting — otherwise Space on "Clear all filters" would sort a column instead. Undo, redo and copy stay table-wide.
- **The per-column buttons are not in the tab order.** Sort, pin, hide, filter, drag and the derived-column `f(x)` icon are reachable through `F2` from the header row, not by tabbing. A 266-column table would otherwise put ~1,600 tab stops in front of the next control on the page.
- **Live-region announcements are `polite`, not `assertive`.** Long-running operations queue without interrupting the user's current read. For ops that need interruption (errors), raise your own `role="alert"` region.
- **Hide button preserves the last-visible column.** Pressing hide on the only visible column does nothing — the table must have at least one visible column.
- **Row selection via Enter is explicit.** Keyboard users can't accidentally select the whole row with a stray arrow; they must Enter.
- **High-DPI + custom focus ring.** If you override `--dt-primary`, check that the focus outline contrast ratio stays ≥ 3:1 against the cell background.

## Manual screen-reader test plan

The automated `tests/a11y/axe.test.ts` suite catches structural ARIA
issues in jsdom (13 scenarios — empty shell, light and dark, header cursor
set, filters open, sort active, every modal, every popover, multi-table,
RTL). Every rule except `color-contrast` runs, including
`aria-required-children`; contrast is guarded separately by
`tests/styles/contrast.test.ts`, which computes ratios from the token
declarations. The matrix below covers the dynamic announcement and
focus-flow behaviour that needs a real screen reader.

Run before each release on at least one combination of OS + screen
reader from each row. The test rig is the demo (`npm run dev`).

| Scenario                                                                        | VoiceOver (macOS, Safari)                                                                                  | NVDA (Windows, Firefox) | JAWS (Windows, Chrome) |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------- |
| **Grid focus + arrow nav** — focus the grid, ArrowDown / ArrowRight a few cells | row N, column NAME, value V                                                                                | same                    | same                   |
| **Tab through** — Tab from the control before the table to the one after it     | two presses, regardless of column count; Shift+Tab retraces                                                | same                    | same                   |
| **Header cursor** — ArrowUp from body row 0, then ArrowLeft / ArrowRight        | column header name, type, sort and filter state                                                            | same                    | same                   |
| **Controls mode** — F2 on a header, ArrowRight a few times, Enter, Escape       | button label announced on each step; Escape returns to the grid cursor                                     | same                    | same                   |
| **Filter add** — open Filter panel, apply a range filter, close                 | live region: "1 filter active, showing X of Y rows"                                                        | same                    | same                   |
| **Sort change** — click a column header twice (toggle desc)                     | live region: "sorted by NAME descending"                                                                   | same                    | same                   |
| **Modal open** — open Export, then SQL filter, then Derived column              | dialog title announced; focus moves into dialog; Tab cycles inside; Esc closes and returns focus to opener | same                    | same                   |
| **Annotation popover** — focus an annotated cell; trigger via pointer / focus   | tooltip role; description announced                                                                        | same                    | same                   |
| **Column header tooltip** — focus a header with a tooltip set                   | tooltip role; description announced                                                                        | same                    | same                   |
| **Undo / redo** — Cmd/Ctrl+Z then Cmd/Ctrl+Shift+Z                              | live region announces resulting state ("0 filters active, …")                                              | same (Ctrl+Z / Ctrl+Y)  | same                   |

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

- **`prefers-contrast: more`** — the library does not bump contrast
  under the `more` media query. Consumers can override `--dt-primary` /
  `--dt-text-primary` themselves; an opt-in higher-contrast bundle is
  a Phase 9 follow-up.
- **`forced-colors` (Windows High Contrast Mode)** — modals and
  popovers retain their custom background. Borders use `currentColor`
  so the outline survives, but filled buttons / chips may invert
  unexpectedly. Phase 9 follow-up.
- **Touch + drag-and-drop** — column resize / reorder use mouse events
  (`mousedown` / `mousemove` / `mouseup`). iOS Safari does not
  synthesise reliable mousemove between touchstart and touchend, so
  resize / reorder are pointer-only. Documented in the README and
  AGENTS.md as out-of-scope.
- **Keyboard column resize / reorder** — the resize handle
  (`role="separator"`) and the header drag handle stay mouse-only and are
  deliberately excluded from the `F2` controls-mode cycle. Both need a
  designed keyboard gesture (`←` / `→` to resize, a pick-up-and-move mode
  to reorder), not just a focus stop that does nothing on Enter. Tracked
  as a follow-up.

## Related

- i18n: [i18n guide](./i18n.md) for translating `a11y` strings and ARIA labels
- Theming: [Theming guide](./theming.md) for focus-outline and contrast customization
- Source: `src/table/KeyboardNavigator.ts` (keyboard map, cursor, controls mode), `src/table/TableContainer.ts` (`.dt-grid` assembly, ARIA grid semantics, live region), `src/table/ColumnHeader.ts` (`getControls`, header ids), `src/table/TableBody.ts` (`role="gridcell"`, cell ids), `src/core/Strings.ts` (`a11y` and `filters.ariaLabels` categories)
