# 07 — i18n (French)

**Thesis**: chrome-only translation is half an i18n story. This example pairs a French `messages` override with a French-native wine fixture (`Vins de France`), so every label *and* every cell reads in the user's language — the way a real French-market deployment would look.

## Run

```bash
npm run example
# open http://localhost:5173/07-i18n-french/
```

## API surface

- [`messages: DeepPartial<Strings>` option](../../docs/api-reference.md#i18n-strings)
- [`defaultStrings` / `mergeStrings` helpers](../../docs/api-reference.md#tier-1-exports)

## Data

40 rows × 8 columns — [`tests/fixtures/datasets/csv/vins_de_france.csv`](../../tests/fixtures/datasets/csv/vins_de_france.csv).

Columns: `region`, `appellation`, `cepage`, `couleur`, `millesime`, `prix_eur`, `production_hl`, `bio`. Values include `Bourgogne`, `Chardonnay`, `Pinot Noir`, `rouge`, `blanc`, `rosé`, etc.

## What to observe

1. The column headers read as French nouns the user already knows (`region`, `cepage`, …). The data cells are in French too.
2. Open the filter panel on a column — title *"Filtres"*, button *"Appliquer"*, chip label *"Effacer"*.
3. Open the export dialog — *"Exporter"* / *"Télécharger"* / *"Copier"*.
4. Any key not overridden falls back to `defaultStrings` (English). That's the intended failure mode: a missing translation degrades to the source language, never to nothing.
5. `messages` is consumed at construction time. To swap locales, destroy and recreate the table.

## Why this dataset

A French UI on English data demonstrates only half the i18n story — the chrome translates but the user still reads English cells. Pairing French chrome with French-native data makes the demo representative of a real deployment (a French wine merchant, for example) and shows the library handling UTF-8 accents (`rosé`, `Mâcon-Villages`, `Châteauneuf-du-Pape`) end-to-end.

## Reusing the pattern

Swap `vins_de_france.csv` for your own locale-native data and edit the `messages` object. Every key in `defaultStrings` (see [`src/core/Strings.ts`](../../src/core/Strings.ts)) is overridable.
