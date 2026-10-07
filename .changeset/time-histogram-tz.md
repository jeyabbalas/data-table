---
'@jeyabbalas/data-table': minor
---

A `TIME WITH TIME ZONE` column gets its histogram and the time range in its stats line, and a `TIME` column holding `24:00:00` gets its histogram.

The chart read the minimum and maximum from DuckDB's text, which it could not parse with an offset (`23:00:00+05:30`) or at `24:00:00`, so it drew no bars: a column with nulls showed only its null bar, and the stats line showed no range. It now takes them from DuckDB as numbers, `EXTRACT(EPOCH …)`, as its bars always did. A `TIME WITH TIME ZONE` value is charted at its time of day as written, the offset ignored: `01:30:00+05:30` is in the 1am bar, and a column of such values reads `01:30:00 – 24:00:00`. Its brush and its filter-panel range compare the same way, through the new `valueType: 'time'` on `RangeFilter`, which compares `CAST("t" AS TIME)`. Compared as `TIME WITH TIME ZONE`, `'01:30:00'` takes the offset of DuckDB's session time zone and rows compare by instant, so a brush over three bars could match one of their rows. A range filter on such a column restored from a session or loaded from a preset gets `valueType: 'time'` when it has none; give one you add with `addFilter` `valueType: 'time'` yourself.

`24:00:00` is counted in the day's last bar, and a brush over that bar takes it in (`"t" <= '24:00:00'`). The last hour's bar reads `11pm - 12am`, not `11pm - 12pm`. A `TIME_NS` column's earliest value is no longer left out of its bars when it has digits past the microsecond (`00:00:00.000000001`), and a column of one value with a fraction of a second (`12:30:00.5`) keeps its bar once a filter is on.
