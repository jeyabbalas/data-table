# Column-header tooltips

Attach a structured popover to a column-name span — title, description,
and an arbitrary list of label/value items including enum-style chips.
The tooltip is library-rendered (not a native `title` attribute), so
it inherits the table's theme and supports rich layout. By
construction, only typed strings are rendered — the API has no HTML
surface.

The downstream use case: surface JSON-Schema-style metadata
(variable name, description, units, allowed values) over each column
in a data-harmonization or data-quality app.

## You'll learn how to

- Set, update, and clear column-header tooltips programmatically
- Pass a string for description-only tooltips
- Render label/value items, including enum chips
- Understand the XSS-safety guarantee
- Choose whether tooltips persist across reloads

## Prerequisites

- Read: [API reference — `actions.setColumnHeaderTooltip`](../api-reference.md#column-header-tooltips) and [Column-header tooltip content](../api-reference.md#column-header-tooltip-content)
- Runnable example: [`examples/12-column-header-tooltips`](../../examples/12-column-header-tooltips/)

## Minimal example

```ts
table.actions.setColumnHeaderTooltip('total_amount', {
  title: 'Total amount',
  description: 'Final fare paid by the passenger.\nIncludes tip when paid by card.',
  items: [
    { label: 'Units',      value: 'USD' },
    { label: 'Components', value: ['fare', 'tip', 'tolls', 'mta_tax'] },
  ],
});
```

Hover (or focus) the `total_amount` column-name span — the popover
appears within ~120 ms with the title bold, the description preserved
verbatim (including newlines), the inline `Units: USD`, and `fare`,
`tip`, `tolls`, `mta_tax` rendered as wrapping enum chips.

## API surface

```ts
setColumnHeaderTooltip(
  columnName: string,
  content: string | ColumnHeaderTooltipContent | null,
): void;

getColumnHeaderTooltip(columnName: string): ColumnHeaderTooltipContent | null;

interface ColumnHeaderTooltipContent {
  title?: string;
  description?: string;                                  // whitespace preserved
  items?: ColumnHeaderTooltipItem[];
}

interface ColumnHeaderTooltipItem {
  label: string;
  value: string | string[];                              // string[] → wrapping chips
}
```

The state lives on `state.columnHeaderTooltips: Signal<Map<string, ColumnHeaderTooltipContent>>`.
You can subscribe directly or rely on the popover to read it.

## Input shorthand

| Input | Effect |
|---|---|
| `string` | Normalised to `{ description: <input> }`. |
| `ColumnHeaderTooltipContent` | Validated field-by-field; malformed `items` are dropped silently. |
| `null` | Removes the override. |
| Empty after normalisation (e.g. `{}`, `''`, `{ items: [] }` with all malformed entries) | Removes the override. |

```ts
table.actions.setColumnHeaderTooltip('fare_amount', 'Base fare in USD.');     // string shorthand
table.actions.setColumnHeaderTooltip('total_amount', null);                   // clear
```

## XSS safety contract

Every text field — `title`, `description`, `items[].label`, and
`items[].value` (string or each chip in `string[]`) — is rendered via
`.textContent`. The setter does not accept HTML strings, DOM nodes, or
render functions. This eliminates the XSS surface by construction and
is suitable for enterprise client-side embeds.

```ts
// Literal angle brackets render as text — no HTML is parsed, no script runs.
table.actions.setColumnHeaderTooltip('fare_amount',
  `<img src=x onerror=alert(1)> raw text only`);
```

Verifying it: open DevTools, inspect the popover element
(`.dt-col-tooltip`) — there is no child `<img>`, `<script>`, `<svg>`,
or `<iframe>` node, just a text node. See
[`examples/12-column-header-tooltips/`](../../examples/12-column-header-tooltips/)
for a live "inject HTML" button that demonstrates this.

Malformed `items` entries (wrong field type, missing required field,
empty values) are dropped silently during
`normalizeColumnHeaderTooltip` rather than thrown — this keeps the
write path tolerant when the embedding app reads its catalogue from a
spreadsheet or a partial JSON Schema.

## Persistence

Tooltips are persisted into `SessionSnapshot.columnHeaderTooltips` and
restored on subsequent loads. Legacy string entries from in-flight
sessions are normalised to `{ description }` on restore. To opt out of
persistence, pass `persistence: false` to `createDataTable` and
re-apply tooltips on every mount:

```ts
const table = await createDataTable({
  container,
  source: '/data.csv',
  persistence: false,
});

const catalogue: Record<string, ColumnHeaderTooltipContent | string> = {
  total_amount:        { title: 'Total amount', description: '…', items: [/* … */] },
  fare_amount:         'Base fare in USD.',
  passenger_count:     { title: 'Passenger count', description: '…' },
  payment_type:        { items: [{ label: 'Allowed', value: ['cash', 'card', 'no_charge'] }] },
};

for (const [col, content] of Object.entries(catalogue)) {
  table.actions.setColumnHeaderTooltip(col, content);
}
```

This is the **recommended pattern** when the embedding app already
owns its column registry — typically a JSON Schema, a column
catalogue service, or a static config file. Persisting tooltips
inside the data-table session would risk drift between the table's
snapshot and the app's source of truth.

If you do want tooltips to ride along with filters / sort / column
widths in IndexedDB, simply omit `persistence: false`. The bundled
[`examples/11-annotations/`](../../examples/11-annotations/) example
demonstrates this; [`examples/12-column-header-tooltips/`](../../examples/12-column-header-tooltips/)
demonstrates the stateless pattern.

## Keyboard accessibility

The column-name span receives `tabindex="0"` **only** when an override
is set, so the keyboard tab order stays uncluttered for tables that
don't use the feature. When an override is present:

- Tab into the span — popover opens.
- Press `Escape` — popover dismisses.
- Move focus elsewhere — popover dismisses on `focusout`.
- Pointer hover / leave — popover opens / dismisses (with a 120 ms
  grace so users can move into the popover content).

When the override is cleared, the `tabindex` is removed and the span
returns to its non-focusable state.

## Coexistence with annotations

The annotation popover and the column-header tooltip popover anchor
on **different DOM nodes**:

- Annotation popover — anchored on the row, cell, or column-header
  container element.
- Column-header tooltip popover — anchored on the `.dt-col-name` span
  inside the column header.

Both can be visible simultaneously when the user hovers a column that
has both an annotation overlay (e.g. an `error` on the column) and an
override. They use distinct z-indexes — annotation popover at
`--dt-z-annotation-popover: 55`, tooltip popover at
`--dt-z-col-tooltip: 56` — so the tooltip renders in front when both
are open.

## Recipes

### Apply a JSON-Schema column catalogue at startup

```ts
import schema from './column-schema.json';

for (const [col, def] of Object.entries(schema.properties)) {
  table.actions.setColumnHeaderTooltip(col, {
    title: def.title,
    description: def.description,
    items: [
      def.units      && { label: 'Units',   value: String(def.units) },
      def.minimum    !== undefined && { label: 'Minimum', value: String(def.minimum) },
      def.maximum    !== undefined && { label: 'Maximum', value: String(def.maximum) },
      def.enum       && { label: 'Allowed', value: def.enum.map(String) },
    ].filter(Boolean) as ColumnHeaderTooltipItem[],
  });
}
```

### Update a tooltip in response to user action

```ts
function onUnitsToggle(col: string, units: 'USD' | 'EUR') {
  const current = table.actions.getColumnHeaderTooltip(col);
  table.actions.setColumnHeaderTooltip(col, {
    ...current,
    items: (current?.items ?? []).map((item) =>
      item.label === 'Units' ? { ...item, value: units } : item,
    ),
  });
}
```

### Clear all tooltips

```ts
for (const col of table.state.schema.get().map((s) => s.name)) {
  table.actions.setColumnHeaderTooltip(col, null);
}
```

## Gotchas

- **No HTML surface.** The setter takes typed strings only. If your
  metadata source produces HTML, sanitize and convert to plain text
  before calling `setColumnHeaderTooltip`.
- **Empty inputs clear the override.** Calling
  `setColumnHeaderTooltip(col, '')` or `{}` removes the entry, not
  "set an empty tooltip". Use `null` for clarity in app code.
- **Renames lose tooltips.** When `actions.updateDerivedColumn`
  renames a column, the override is migrated to the new name; when
  `actions.removeDerivedColumn` removes a column, the override is
  dropped.
- **Tabindex toggling on every set.** The library updates the span's
  `tabindex` on every `setColumnHeaderTooltip` call — fast, but if
  you set tooltips inside a tight loop watch the focus state if you
  also rely on the column header receiving `tab` events.

## Related

- [API reference — `actions.setColumnHeaderTooltip`](../api-reference.md#column-header-tooltips)
- [API reference — `ColumnHeaderTooltipContent`](../api-reference.md#column-header-tooltip-content)
- [Theming → Stacking ladder](./theming.md#stacking-ladder)
- [Glossary — Column Header Tooltip](../glossary.md#column-header-tooltip)
- [Example 12 — Column header tooltips](../../examples/12-column-header-tooltips/)
- Source: [`src/core/columnHeaderTooltip.ts`](../../src/core/columnHeaderTooltip.ts), [`src/table/ColumnHeaderTooltipPopover.ts`](../../src/table/ColumnHeaderTooltipPopover.ts)
