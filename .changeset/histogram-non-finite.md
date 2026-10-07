---
'@jeyabbalas/data-table': minor
---

A numeric column holding `NaN`, `Infinity` or `-Infinity` gets its histogram: the bars and the stats leave those values out, and the stats line counts them, `· 30 non-finite`.

The histogram wrote a maximum of `NaN` or `Infinity` into its SQL, so the chart showed **Failed to load** (`Binder Error: Referenced column "NaN" not found in FROM clause!`). A column with five distinct values or fewer drew bars for `-Infinity`, `Infinity` and `NaN` instead, and clicking one filtered `"v" = NULL`, which matched no rows.

Now the bars, `min`, `med`, `max` and the distinct count are of the finite values. Line 1 and the percentages still count every row, and line 2 ends with how many values the chart left out of the rows passing the filters (`messages.statistics.nonFiniteCount`, new). A column with no finite values draws "No data", or its null bar if it has nulls. `NumericColumnStats` and `HistogramData` gain an optional `nonFiniteCount`, and their `distinctCount` counts the distinct finite values.
