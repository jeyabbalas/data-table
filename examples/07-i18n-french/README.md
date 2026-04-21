# 07 — Table en français

## What this shows

Every label, button, tooltip, and status line the table renders is in French. You get there by passing a `messages` object to `createDataTable()` — the library reads its text from there instead of using its built-in English defaults.

Open the page and try it: column-header menus, the filter panel, the export dialog, the presets panel, the stats line under each column, and the screen-reader labels all read French.

## When you'd use this

- **Non-English users.** You're embedding the table in an app whose users read French, Japanese, German, etc. The example translates to French; the pattern is the same for any language.
- **Custom vocabulary.** Same API, different use case — use `messages` to rebrand labels for a specialized audience. A clinical-research UI might relabel "Filter" as "Cohort filter" and "Column" as "Variable"; a CRM might prefer "Record" over "Row". You don't have to change the language to change the words.

## How it works

```
examples/07-i18n-french/
├── fr.ts       ← the translations (one object)
├── main.ts     ← three lines of glue: import fr.ts, pass it as `messages`
└── index.html
```

`fr.ts` exports a `frenchMessages: DeepPartial<Strings>` object that mirrors the [`Strings`](../../src/core/Strings.ts) shape. `main.ts` imports it and passes it through:

```ts
await createDataTable({ container, tableName: 'vins', messages: frenchMessages });
```

Keys you don't include fall back to the English defaults in [`defaultStrings`](../../src/core/Strings.ts), so a partial translation still works — you can ship coverage incrementally.

## What gets translated

- Filter panel — titles, operator names, buttons, placeholders, validation messages, chip descriptions
- Column-header menu — sort, pin, hide, filter labels and tooltips
- Filter expression (SQL) modal
- Filter presets panel
- Export dialog — formats, scopes, CSV/JSON options, button text
- Derived-column editor
- Per-column statistics line — row counts, min/median/max, unique counts
- Screen-reader labels and live-region announcements (the `a11y` group)

## What doesn't — plain-language scope notes

- **Numbers and dates.** Formatting like `1 234,56` on a French browser vs. `1,234.56` on a US browser is controlled by the browser's locale, not by `messages`. The library calls `.toLocaleString()` and lets the browser decide — this usually does the right thing automatically.
- **Cell data.** Your data is your own. This example pairs French labels with a French dataset (`vins_de_france.csv`) so nothing feels mismatched, but there's no "auto-translate my values" feature.
- **Right-to-left scripts.** The library's layout isn't RTL-aware today, so Arabic and Hebrew will read correctly but may not lay out the way RTL users expect.

## Adding your own locale

1. Copy `fr.ts` to, say, `ja.ts`.
2. Translate each string. The full key list lives in [`src/core/Strings.ts`](../../src/core/Strings.ts).
3. Import it from `main.ts` and pass it as `messages`.

Switching languages at runtime: `messages` is resolved once at `createDataTable()` time. To change locales after the table is mounted, call `table.destroy()` and create a new one with the new messages. A `mergeStrings(defaultStrings, overrides)` helper is exported if you want to inspect the fully resolved strings before handing them over.

## Data

40 rows × 8 columns — [`tests/fixtures/datasets/csv/vins_de_france.csv`](../../tests/fixtures/datasets/csv/vins_de_france.csv). Columns: `region`, `appellation`, `cepage`, `couleur`, `millesime`, `prix_eur`, `production_hl`, `bio`. Includes UTF-8 accents (`rosé`, `Mâcon-Villages`, `Châteauneuf-du-Pape`) so you can verify the table handles them end-to-end.

## Run

```bash
npm run dev
# open http://localhost:5173/data-table/examples/07-i18n-french/
```
