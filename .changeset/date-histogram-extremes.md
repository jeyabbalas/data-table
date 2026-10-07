---
'@jeyabbalas/data-table': minor
---

A date or timestamp column whose values reach before year 1, past year 9999 or to `infinity` gets its histogram: the bars and the range leave `infinity` out, and the stats line counts it, `· 2 non-finite`.

The chart read its minimum and maximum as DuckDB's text, and `new Date()` reads none of `0044-03-15 (BC)`, `12000-01-01 00:00:00` and `infinity`, so such a column drew nothing. It read a `DATE` from year 1 to 99 as one from 1950 to 2049 (`0050-06-15` as 1950), and a `TIMESTAMP WITH TIME ZONE` before year 100 the same way (`0044-03-15 (BC)` as 2044), so the bars started in the wrong place and left rows out. The chart now takes each value's position from DuckDB as a number of milliseconds.

- `infinity` and `-infinity` stay out of the bars and of the range, and line 2 ends with how many there are (`messages.statistics.nonFiniteCount`), as it counts dates more than about 270,000 years from 1970, which a JavaScript `Date` cannot hold (a `DATE` reaches the year 5881580). Line 1 and the percentages still count them. A column with none the chart can draw shows "No data", or its null bar.
- A brush past year 9999 filters `'12000-01-01T00:00:00.000Z'`. It wrote `'+012000-01-01T00:00:00.000Z'`, which DuckDB rejects (`invalid date field format`), so every query failed until the filter went, as with a range filter given a `Date` past 9999: `formatSQLValue` writes such a `Date` the same way now.
- A brush over the last of the equal-width bars of a `TIMESTAMP` with digits past the millisecond keeps the column's maximum, which it left out.
- Line 2 writes a year before 1 or past 9999 as the grid does, `-000043-03-15 – +012000-01-01`, and the labels write it in full, `Mar 15 -43`, where they read `'43`.
- `TemporalColumnStats` and `DateHistogramData` gain an optional `nonFiniteCount`.

A chart binned by calendar unit, over 15 years or less, also queries in about half the time: its bars are grouped before each one's start is read, where every row's bar was written out as text.
