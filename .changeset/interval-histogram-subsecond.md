---
'@jeyabbalas/data-table': patch
---

An `INTERVAL` column's histogram counts the values with fractions of a second, and its stats line shows a median.

Binning read each value's seconds with `EXTRACT(second …)`, a whole number, while the chart's range kept the fraction, so a value fell below its bar and was dropped: 100 values from `1 millisecond` to `991 milliseconds` drew 15 empty bars. Binning now keeps the fraction, and the minimum, median and maximum come from the same seconds, so the stats line reads `min 0.001s · med 0.496s · max 0.991s`. It never showed a median, since DuckDB's `APPROX_QUANTILE` takes no `INTERVAL`. A column mixing months and days, `1 month` beside `30 days 06:00:00`, no longer draws its bars from a minimum above its maximum.

`fetchIntervalStats` runs the chart's stats query, so it gains the median too, and it reports a duration of 100 hours or more, `100:00:00.5`, as 100 hours, not half a second; a range filter given that text now brushes the right bars. A brush on bars a millisecond wide or narrower stays on them when the chart refetches.
