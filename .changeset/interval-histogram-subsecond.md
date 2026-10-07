---
'@jeyabbalas/data-table': patch
---

An `INTERVAL` column's histogram counts the values with fractions of a second, and its stats line shows a median.

Binning read each value's seconds with `EXTRACT(second …)`, a whole number, while the chart's range kept the fraction, so a value fell below its bar and was dropped: 100 values from `1 millisecond` to `991 milliseconds` drew 15 empty bars. Binning now keeps the fraction, and the minimum, median and maximum come from the same seconds, so the stats line reads `min 0.001s · med 0.496s · max 0.991s`. It never showed a median, since DuckDB's `APPROX_QUANTILE` takes no `INTERVAL`. A column mixing months and days, `1 month` beside `30 days 06:00:00`, no longer draws its bars from a minimum above its maximum.

Under a second, the stats line, the axis and the hover text keep the microseconds (`0.000001s`, which read `0s`), and rounding carries into the next unit: `2m`, not `1m 60s`.

A brush writes its bounds in whole microseconds, as DuckDB holds an `INTERVAL`, so its filter matches exactly the rows its bars count. It wrote the nearest microsecond to each edge, which could take a row of the bar beside them; it wrote 1 µs as `00:00:00`, and an edge at 5.999999999999999 s as `00:00:05.1`. A brush on bars a millisecond wide or narrower stays on them when the chart refetches, as does a click on a chart of one value.

`fetchIntervalStats` runs the chart's stats query, so it gains the median too, and reads `100:00:00.5` as 100 hours, not half a second. A range filter added in code shows on the chart's bars in any unit DuckDB reads (`2 hours`, `90 minutes`, `500ms`, `1.5 days`), which the chart read as 0, and at 100 hours or more.
