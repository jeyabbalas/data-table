# 12 — Column header tooltips

Rich popover anchored on the column-name span. Title, free-text description,
and label/value items (units, ranges, allowed values). Stateless — no
IndexedDB persistence; reload wipes every override.

## Run

```bash
npm run dev
```

Then navigate to `examples/` and click **12 — Column header tooltips**.

## API surface

- `table.actions.setColumnHeaderTooltip(column, content | string | null)` —
  attach (or update) a tooltip on `column`.
- `content.title` — optional bold heading.
- `content.description` — optional free-text body. Whitespace preserved.
- `content.items[]` — optional `{ label, value }` rows.
  - `value: string` renders inline (e.g. `Units: USD`).
  - `value: string[]` renders as wrapping chips (a natural fit for enums).
- A plain `string` input is shorthand for `{ description: string }`.
- `null` (or any input that normalizes to empty) clears the override.

## Data

NYC taxi `nyc_taxi.parquet` fixture, loaded once at startup via `sourceFormat: 'parquet'`.
`tableName: 'nyc_taxi_tooltips'` — distinct from example 11's
`nyc_taxi_annotations` to avoid any DuckDB-side collision.

## What to observe

1. Click **Set all** — five columns receive realistic JSON-Schema-style
   metadata in one pass. This mirrors the real downstream usage: an
   embedding app loads its column registry once at startup and applies
   every tooltip.
2. Hover any annotated column-name span (`total_amount`, `fare_amount`,
   `passenger_count`, `payment_type`, `tpep_pickup_datetime`) — the
   popover appears within ~120 ms. The span (not the rest of the
   header) is the anchor.
3. Reach an annotated header from the keyboard — `↑` from the first body
   row puts the grid cursor on the header row, `←` / `→` walk to the
   column, `F2` moves focus into that header's controls, and `←` / `→`
   cycle to the column-name span. The span receives `tabindex="-1"` only
   while an override is set, which puts it in the `F2` cycle rather than
   in the page's tab order. The popover opens on focus; Escape dismisses
   it and hands focus back to the grid.
4. Click **Rich tooltip on `total_amount`**, **Enum tooltip on
   `payment_type`**, **String shorthand on `fare_amount`** — each
   demonstrates one shape of tooltip in isolation.
5. Click **Inject HTML in tooltip on `passenger_count`** — confirm
   no alert fires and the popover renders the angle-bracketed text
   literally. (See **XSS safety** below.)
6. **Reload the page.** Every tooltip is gone — there is no IndexedDB
   write because `persistence: false` is set. Compare with example 11,
   where annotation + tooltip state persists across reloads.

## Why no persistence?

Tooltips are app-authored metadata that the embedding app already owns
elsewhere — typically a JSON Schema, a column registry, or a backend
service. Persisting them inside the data-table session would risk drift
between the table's snapshot and the app's source of truth. The
recommended pattern, demoed here, is: the app applies tooltips at startup
(via the catalogue + a `for…of` loop, like the **Set all** button does),
and the table treats them as ephemeral display state.

If the embedding app does want tooltips to round-trip with filters /
sort / column widths in IndexedDB, just omit `persistence: false`
(see example 11).

## XSS safety

Every text field — `title`, `description`, `items[].label`, and
`items[].value` (string or each chip in `string[]`) — is rendered via
`.textContent`. The setter does not accept HTML strings, DOM nodes, or
render functions; only structured fields with typed strings. This
eliminates the XSS surface by construction and is suitable for
enterprise client-side embeds.

The **XSS-safety demo** button is the live proof. After clicking it,
inspect the popover in DevTools — there is no `<img>`, `<script>`,
`<svg>`, or `<iframe>` node inside `.dt-col-tooltip`; the literal
angle-bracketed strings appear as `.textContent`.

## Independent from annotations

The annotation popover (example 11) anchors on the entire column header;
the tooltip popover anchors on the column-name span. They have distinct
DOM nodes, distinct z-indices (annotation 55, tooltip 56), and can be
visible together when both surfaces are triggered. This example does
not exercise annotations — see example 11 for that.
