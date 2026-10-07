---
'@jeyabbalas/data-table': patch
---

An `INTERVAL` column's histogram counts the values with fractions of a second, and its stats line shows a median.

Binning read each value's seconds with `EXTRACT(second …)`, a whole number, while the chart's range kept the fraction, so a value fell below its bar and was dropped: 100 values from `1 millisecond` to `991 milliseconds` drew 15 empty bars. Binning now keeps the fraction, and the minimum, median and maximum come from the same seconds, so the stats line reads `min 0.001s · med 0.496s · max 0.991s`. It never showed a median, since DuckDB's `APPROX_QUANTILE` takes no `INTERVAL`. A column mixing months and days, `1 month` beside `30 days 06:00:00`, no longer draws its bars from a minimum above its maximum. No bar is narrower than a microsecond, the finest step an `INTERVAL` holds: `1 µs` and `3 µs` make two bars, not fifteen.

A brush filters from the smallest value in its first bar to the largest in its last, written as DuckDB writes them, so it matches exactly the rows its bars count. It filtered between the bars' edges, written in years and months on the chart's scale, which DuckDB reads as 360 and 30 days: a brush from 400 to 500 days passed the rows from 395 to 492 days, and an edge between two microseconds could take a row of the bar beside it. A brush over bars holding no value removes the column's filter rather than writing one that matches nothing, and a filter saved by an older version restores onto the bars holding the values it passes. In a column whose values mix months with days or time, or days and time of opposite signs, DuckDB still compares part by part, so a value near a bound can fall on the other side of it from its bar.

Under a second, the stats line, the axis and the hover text keep the microseconds (`0.000001s`, which read `0s`), and rounding carries into the next unit: `2m`, not `1m 60s`. A grid cell shows an interval's parts as DuckDB stores them: `100h 0.5s` for `100:00:00.5`, which read `0.5s`, and `-1d 1h` for `-1 day -01:00:00`, which read `1d 1h`.

`fetchIntervalStats` runs the chart's stats query, so it gains the median too, and reads `100:00:00.5` as 100 hours, not half a second. A range filter added in code shows on the chart's bars in any unit DuckDB reads (`2 hours`, `90 minutes`, `500ms`, `1.5 days`), which the chart read as 0, and at 100 hours or more. Text finer than a microsecond is cut, as DuckDB cuts it.
