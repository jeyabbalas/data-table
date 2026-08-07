---
'@jeyabbalas/data-table': minor
---

Column-header stats now measure every count against the full dataset total, fixing the confusing filter-dependent denominators on filter-participant columns.

**Display changes**

- Line 1 (the row-count line) is now identical on every column and never disappears: `F / N rows` — rows passing **all** active filters out of the dataset total. It shows whenever any filter is active, including when `F == N`.
- A column whose own filter has a chart representation shows a committed detail below line 1: its selection label (`Bin: 30 – 40`, `Category: US`, `Selected: a, b`) plus `X rows (p%)`, where `X` is what that filter **alone** matches in the unfiltered data and `p% = X/N`. The old `Count: fg / bg (ratio)` form — whose denominator was the selection's own post-filter count — is gone.
- The committed detail is stable when other columns' filters change (previously it went stale), and identical regardless of how the filter was created: chart gesture, funnel panel, `actions.addFilter`, preset load, session restore, or undo/redo (previously panel/API-created filters displayed differently until first hover).
- Hover swaps only the detail region: `800 rows (8.0%)` — the bin's share of the dataset — plus `· 300 match` for its rows passing all filters when filters are active.
- Filters with no countable chart representation produce no committed detail; line 1 and the funnel indicator still reflect them. This covers pattern and raw-SQL filters, and — on categorical columns — any filter naming a value folded into the `Other` segment: the chart knows Other's total but not its membership, so `IN`/`=` on a folded value would undercount and `NOT IN` would overcount by that value's rows. Filters produced by the chart's own gestures are always countable, including the `NOT IN` emitted by clicking Other.
- Non-visualization columns' stats are now filter-aware on first paint and localized (previously hardcoded English).

**API surface**

- `Strings.statistics` gains `binLabel`, `categoryLabel`, `selectedLabel`, `nullBinLabel`, `otherCategory`, `allUniqueCategory`, `selectionRowCount`, `matchCount`, `valueListSuffix`. Runtime-compatible for all consumers (deep-merge defaults); consumers hand-authoring a **complete** `Strings` literal must add the new keys to satisfy the type.
- `VisualizationOptions` gains optional `messages?: Strings` — custom visualizations can localize their stats text; omitted, English defaults apply.
- New named exports from `src/statistics/StatsFormatters`: `formatStatsLine1`, `formatStatsLine2` (internal module path; the public `formatDefaultStats` output is unchanged apart from the `F == N` rule).
- `BaseStatsPanel.setHoverStats` contract is unchanged, but the pre-formatted HTML strings it receives use the new format, and committed selections now also arrive through it (persisting until the filter clears).
