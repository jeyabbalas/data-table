# Migration: v0.5 → v0.6

> `0.6` fixes a WCAG 2.1.2 keyboard trap (issue #84) by rebuilding the table's
> ARIA layer around the WAI-ARIA grid pattern. No TypeScript signature changes,
> no renamed options, no changed event payloads — but the rendered DOM and its
> ARIA roles moved, so anything that reaches into the table by role or by
> structure needs a look.

**Released:** with `0.6.0` — see the [CHANGELOG](../../CHANGELOG.md) for the date.
**Affected versions:** from `v0.5.*`
**Migration difficulty:** mechanical — a selector replace-all for most projects;
manual review only if you assert on `aria-rowindex` values or count Tab presses.

## Summary

The ARIA grid used to live on `.dt-root`, the element `getElement()` returns.
That was the root cause of the keyboard trap: `.dt-root` also hosts the filter
bar, the live region and the hidden-columns gutter, none of which a `table` or
`grid` role may own, so the role could not be strengthened where it was. `0.6`
inserts a new `.dt-grid[role="grid"]` element that wraps only the header area
and the body scroller, strips `.dt-root` back to a plain `div`, promotes body
cells from `role="cell"` to `role="gridcell"`, and moves the filter bar above
the column headers.

The public API is untouched: `createDataTable()`, `table.state`,
`table.actions`, `table.on(...)` and `table.getElement()` all behave exactly as
before, and `getElement()` still returns `.dt-root`. What changes is what you
find when you query the DOM. If your integration never does that, upgrading is
a version bump and nothing else.

## Breaking changes

### 1. `role="table"` is gone; `role="grid"` moved to a new `.dt-grid` element

**What changed.** `.dt-root` no longer carries `role="table"`, `tabindex="0"`,
`aria-label`, `aria-rowcount`, `aria-colcount` or any other `aria-*`. A new
`.dt-grid` element sits inside it and carries `role="grid"`, `tabindex="0"`,
`aria-label`, `aria-rowcount`, `aria-colcount` and `aria-activedescendant`.

So `container.querySelector('[role="table"]')` now returns `null`, and
`container.querySelector('[role="grid"]')` — which used to return `null` —
resolves to `.dt-grid`.

Two follow-on details are easy to trip over:

- **The accessible name moved with the role.** `messages.a11y.gridLabel` labels
  `.dt-grid` now. `.dt-root` is a bare `generic` element, which may not carry
  `aria-label` at all (`aria-prohibited-attr`), so there is nowhere else to put
  it. A screen-reader script that looked for the table by its accessible name
  still finds it; a script that looked for `.dt-root[aria-label]` does not.
- **Grid semantics are attached lazily.** Before a schema and a table name
  exist, `.dt-grid` has no role, no `tabindex` and no `aria-*` — an unloaded
  shell owns no rows, and `role="grid"` without a `row` / `rowgroup` child is an
  `aria-required-children` violation. Query for `[role="grid"]` only after
  `createDataTable()` resolves or after `loadComplete`.

**Why.** `role="grid"` may only own `row` and `rowgroup` children. `.dt-root`
hosts the grid _and_ its siblings — the `role="toolbar"` filter bar, the
`role="status"` live region, the `role="toolbar"` hidden-columns gutter — so
every one of them was an `aria-required-children` violation waiting to happen,
which is why `0.5` settled for the weaker `role="table"`. `role="table"` in turn
does not allow `aria-activedescendant`, so the cursor could not be published
without moving real DOM focus — and moving real DOM focus into a pooled,
recycled row is what the virtualized body cannot support. Splitting the grid
out of the root is what unblocks all of it.

**Before**

```ts
const el = container.querySelector('[role="table"]') as HTMLElement;
el.focus();
```

**After**

```ts
// The grid is the cursor's tab stop; `.dt-root` is not focusable any more.
const el = container.querySelector('[role="grid"]') as HTMLElement | null;
el?.focus();
```

`table.getElement()` still returns `.dt-root`, so keep using it for
mount-point-level work (measuring, class toggles, scoping your own selectors).

**Automated migration.** `None — mechanical replace-all: '[role="table"]'` →
`'[role="grid"]'`, plus a null-check if you query before the first load.

### 2. Body cells are `role="gridcell"`, not `role="cell"`

**What changed.** Every rendered data cell — including the placeholder cell in
the empty-body row — now carries `role="gridcell"`. Header cells are unchanged
(`role="columnheader"`), as are rows (`role="row"`) and the two scroll
containers (`role="rowgroup"`).

**Why.** `role="cell"` is only valid inside `role="table"`. Under `role="grid"`
the required child role is `gridcell`; leaving `cell` in place would fail
`aria-required-children` from the other direction.

**Before**

```ts
const cells = root.querySelectorAll('[role="cell"]');
```

**After**

```ts
const cells = root.querySelectorAll('[role="gridcell"]');
```

**Automated migration.** `None — mechanical replace-all on the role name.`

### 3. Row indices shift by one — the header row is row 1

**What changed.** Under `role="grid"` the column-header row is a real row, so it
takes `aria-rowindex="1"` and the body starts at 2:

| Attribute                       | v0.5           | v0.6                                         |
| ------------------------------- | -------------- | -------------------------------------------- |
| `aria-rowcount` (on the grid)   | `totalRows`    | rendered rows `+ 1` (see below)              |
| `aria-rowindex` (on a body row) | `rowIndex + 1` | `rowIndex + 2`                               |
| `aria-rowindex` (header row)    | _not set_      | `1`                                          |
| `aria-activedescendant`         | _never set_    | on `.dt-grid`, naming the cursor cell's `id` |

"Rendered rows" is deliberate: `aria-rowcount` counts `filteredRows` while any
filter is active and `totalRows` otherwise, so a five-row result no longer
announces "row 3 of 5,001".

**Why.** The keyboard cursor now spans the header row as well as the body
(`state.focusedCell.row === -1` is the header sentinel), which is what makes
`↑` from body row 0 reach the column headers and `F2` reach their buttons. A
header row that a screen reader can land on has to be counted.

**Automated migration.** `N/A — manual review required because the correct
offset depends on what your assertion means.` If you were checking "the third
data row", add 1. If you were checking "the third row of the grid", it now
includes the header.

### 4. The filter bar renders above the column headers

**What changed.** `.dt-filter-bar` used to sit between the header area and the
body scroller. It is now the first child of `.dt-root`, above `.dt-grid`.

The full tree, for reference:

```
.dt-root                                    ← getElement(); no role, no tabindex
├── .dt-filter-bar     [role="toolbar"]     ← moved up from between header and body
├── .dt-grid           [role="grid"]        ← new element
│   ├── .dt-header-area
│   │   ├── .dt-header-scroll  [role="rowgroup"][tabindex="0"]
│   │   │   └── .dt-header  →  .dt-header-row [role="row"][aria-rowindex="1"]
│   │   └── .dt-scrollbar-gutter
│   └── .dt-body-scroll        [role="rowgroup"][tabindex="0"]
│       └── .dt-body  →  rows [role="row"] → cells [role="gridcell"]
├── .dt-sr-only        [role="status"]
└── .dt-hidden-gutter  [role="toolbar"]
```

**Why.** The filter bar is a `role="toolbar"`. A toolbar cannot be a child of
`role="grid"`, so once the grid became a real element the bar had to move out of
it — and above rather than below, because that is where it reads in the tab
order relative to the grid it filters.

**Before / After.** Descendant selectors (`.dt-root .dt-body-scroll`) are
unaffected. Direct-child selectors and positional selectors break:

```css
/* v0.5 — no longer matches: .dt-body-scroll is now a child of .dt-grid */
.dt-root > .dt-body-scroll {
  scroll-behavior: smooth;
}

/* v0.6 */
.dt-root .dt-body-scroll {
  scroll-behavior: smooth;
}
```

**Automated migration.** `N/A — manual review required because only you know
which of your selectors were positional.` Grep your stylesheets and DOM code for
`.dt-root >`, `:first-child` / `:nth-child` under `.dt-root`, and
`nextElementSibling` / `previousElementSibling` walks off the header or body.

### 5. The table is a constant five tab stops

**What changed.** In `0.5` the table's tab stops grew with use — six at rest,
thirteen after hiding six of eight columns, ten with three filters applied — and
forward `Tab` never escaped the table at all. In `0.6` a loaded table is exactly
five stops, in DOM order: `.dt-filter-bar`, `.dt-grid`, `.dt-header-scroll`,
`.dt-body-scroll`, `.dt-hidden-gutter`. The count does not move with the column
count, the number of hidden columns, or the number of active filters, and `Tab`
crosses the table in both directions.

The two toolbars get there through the APG roving-tabindex model — one
`tabindex="0"` inside each, arrows and Home/End to move it — so a filter chip's
remove button and a hidden-column restore chip are reachable but are not
page-level tab stops. Per-column header buttons are reached with `F2` from the
header row, as before.

**Why.** WCAG 2.1.2 (No Keyboard Trap) and 2.1.1 (Keyboard). See the
[accessibility guide](../guides/accessibility.md#focus-model-single-cursor--aria-activedescendant)
for the full model.

**Automated migration.** `N/A — manual review required because the fix is to
re-record the expected count.` If an end-to-end test presses `Tab` a fixed
number of times to step from the control before the table to the one after it,
that number is now 6 — five stops inside, one more to leave. Prefer asserting on
the element that ends up focused rather than on a press count.

## Non-breaking but recommended

- **Stop relying on `.dt-root` being focusable.** It carried `tabindex="0"`
  under a `.dt-root:focus { outline: none }` rule in `0.5`, which is what made
  focus disappear into it. `root.focus()` is now a no-op; focus `.dt-grid`
  instead.
- **Translate `messages.a11y.gridLabel`.** It existed in `0.5` but labelled a
  `role="table"`; it is now the accessible name of the grid, which is the first
  thing a screen reader reads when focus enters the table.
- **Re-run your own axe / Lighthouse baselines.** `aria-required-children` is no
  longer suppressed in this library's own axe suite, and the light theme's
  `--dt-text-secondary` / `--dt-text-tertiary` and several other colour tokens
  darkened to clear WCAG AA. If you snapshot computed colours, those snapshots
  will move — see the [theming guide](../guides/theming.md) for the current
  values.

## Verification checklist

- [ ] `npm install @jeyabbalas/data-table@0.6` in the target project.
- [ ] Grep for `[role="table"]` and `[role="cell"]`; replace with `[role="grid"]`
      and `[role="gridcell"]`.
- [ ] Grep stylesheets and DOM code for `.dt-root >` and positional selectors
      under `.dt-root`.
- [ ] Any `aria-rowindex` / `aria-rowcount` assertion re-checked against the
      `+1` header row.
- [ ] Any end-to-end test that counts `Tab` presses across the table updated
      to 5.
- [ ] `npm run build` passes.
- [ ] Manual smoke test: Tab from the control before the table through to the
      control after it, then Shift+Tab back; arrow through cells; `↑` onto the
      header row; `F2` into a header's buttons; `Escape` back to the grid.

## See also

- [Accessibility guide](../guides/accessibility.md) — the keyboard map, the ARIA
  surface, and the focus model this release implements.
- [Theming guide](../guides/theming.md) — the colour tokens that moved in the
  same release.
- [CHANGELOG entry for v0.6](../../CHANGELOG.md)
- [Migration guides index](./README.md)
