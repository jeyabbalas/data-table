# Accessibility

`@jeyabbalas/data-table` implements an ARIA grid pattern with roving
tabindex navigation, full keyboard support, and a live region for screen
readers. This guide maps the keyboard shortcuts, enumerates the ARIA
surface, and explains the focus-trap behavior for modals.

## You'll learn how to

- Navigate the table entirely from the keyboard
- Understand the ARIA roles and live-region announcements
- Override the ARIA labels for localization or rewording
- Test the table with a screen reader

## Prerequisites

- Read: [API reference — `Strings.a11y`](../api-reference.md#i18n)
- No dedicated example; accessibility is cross-cutting. Every example inherits the same keyboard map and ARIA structure.

## Keyboard map

Focus the table (Tab into it from elsewhere on the page) and then:

| Key                                            | Action                                                     |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `↑` / `↓` / `←` / `→`                          | Move cell focus                                            |
| `Home`                                         | First column in the current row                            |
| `Ctrl` + `Home`                                | First cell of the table                                    |
| `End`                                          | Last column in the current row                             |
| `Ctrl` + `End`                                 | Last cell of the table                                     |
| `PageUp` / `PageDown`                          | Scroll visible range up / down (jumps by a "page" of rows) |
| `Tab` / `Shift+Tab`                            | Move to next / previous cell (wraps at row ends)           |
| `Escape`                                       | Clear cell focus (focus returns to the grid)               |
| `Enter`                                        | Toggle selection on the focused row                        |
| `Ctrl` + `Z` / `Cmd` + `Z`                     | Undo                                                       |
| `Ctrl` + `Shift` + `Z` / `Cmd` + `Shift` + `Z` | Redo                                                       |
| `Ctrl` + `C` / `Cmd` + `C`                     | Copy selected rows (defers to native copy behavior)        |

When any modal is open (export dialog, SQL filter editor, derived-column
editor, preset panel), the grid keyboard shortcuts are disabled — the
modal owns input until dismissed.

### Focus model (roving tabindex)

Only one cell at a time carries `tabindex="0"`. Every other cell has
`tabindex="-1"`. Moving focus via arrow keys updates which cell is the
"active" one; Tab out of the grid and back, and focus returns to the
active cell.

This follows the [WAI-ARIA grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/).

## ARIA surface

### Roles

| Element                                               | Role                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Outer table wrapper                                   | `role="table"` (switches to `role="grid"` contextually for grid-pattern widgets) |
| Header row                                            | `role="row"`                                                                     |
| Column header cell                                    | `role="columnheader"`                                                            |
| Row group (body)                                      | `role="rowgroup"`                                                                |
| Data row                                              | `role="row"`                                                                     |
| Data cell                                             | `role="cell"`                                                                    |
| Filter panel                                          | `role="dialog"` (floating popover)                                               |
| SQL filter modal, export dialog, derived-column modal | `role="dialog"`                                                                  |
| Null filter toggle group                              | `role="radiogroup"`                                                              |
| Filter bar                                            | `role="toolbar"`                                                                 |
| Hidden-columns gutter                                 | `role="toolbar"`                                                                 |
| Column resizer handle                                 | `role="separator"`                                                               |
| Live-region announcer                                 | `role="status"` with `aria-live="polite"`, `aria-atomic="true"`                  |

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
  receives `tabindex="0"` only when an override is set via
  `actions.setColumnHeaderTooltip`, so the keyboard tab order stays
  uncluttered for tables that don't use the feature. Same lifecycle
  primitives as the annotation popover (pointer / focus open, Escape
  dismisses).

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
// Programmatically focus the first cell:
(container.querySelector('[role="grid"], [role="table"]') as HTMLElement | null)?.focus();
```

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
- **Tab wraps at row ends.** That's per the WAI-ARIA grid-navigation convention. Users unfamiliar with grid widgets may expect Tab to exit the grid; point them to Escape.
- **Live-region announcements are `polite`, not `assertive`.** Long-running operations queue without interrupting the user's current read. For ops that need interruption (errors), raise your own `role="alert"` region.
- **Hide button preserves the last-visible column.** Pressing hide on the only visible column does nothing — the table must have at least one visible column.
- **Row selection via Enter is explicit.** Keyboard users can't accidentally select the whole row with a stray arrow; they must Enter.
- **High-DPI + custom focus ring.** If you override `--dt-primary`, check that the focus outline contrast ratio stays ≥ 3:1 against the cell background.

## Manual screen-reader test plan

The automated `tests/a11y/axe.test.ts` suite catches structural ARIA
issues in jsdom (12 scenarios as of Phase 8 — empty grid, filters open,
sort active, every modal, every popover, dark mode, multi-table, RTL).
The matrix below covers the dynamic announcement and focus-flow
behaviour that needs a real screen reader.

Run before each release on at least one combination of OS + screen
reader from each row. The test rig is the demo (`npm run dev`).

| Scenario                                                                        | VoiceOver (macOS, Safari)                                                                                  | NVDA (Windows, Firefox) | JAWS (Windows, Chrome) |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------- |
| **Grid focus + arrow nav** — focus the grid, ArrowDown / ArrowRight a few cells | row N, column NAME, value V                                                                                | same                    | same                   |
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

## Color-contrast verification

Axe-core does not run color-contrast in jsdom (no layout). Verify
contrast manually before each release:

1. `npm run build:demo && npm run preview` (or run the live demo).
2. Run a Lighthouse a11y audit on the demo page in light mode.
3. Toggle the theme switcher to dark mode; re-run the audit.
4. The Lighthouse a11y score should be ≥ 95; any contrast issue
   against `--dt-text-primary` / `--dt-surface-1` / `--dt-primary` is a
   release blocker.

For CI, consider a Playwright-based axe-with-real-layout job (deferred
to Phase 9 / post-1.0).

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

## Related

- i18n: [i18n guide](./i18n.md) for translating `a11y` strings and ARIA labels
- Theming: [Theming guide](./theming.md) for focus-outline and contrast customization
- Source: `src/table/KeyboardNavigator.ts`, `src/table/TableContainer.ts:240-250` (live region), `src/core/Strings.ts` (`a11y` and `filters.ariaLabels` categories)
