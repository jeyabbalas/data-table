---
'@jeyabbalas/data-table': patch
---

### Fixed

- CSV and JSON exports and the clipboard write a `TIME WITH TIME ZONE` value as DuckDB's text, offset kept (`12:34:56+05:30`), and a `TIME_NS` value as its text, every digit kept (`03:04:05.123456789`). They wrote a `TIME WITH TIME ZONE` as microseconds since midnight, the offset dropped: `12:34:56+05:30`, `12:34:56+00` and `12:34:56-08` were all `45296000000`. A `TIME_NS` they wrote as nanoseconds.
- They write a `DECIMAL` as the double nearest its value: `0.35`, not `0.35000000000000003`, and `19.99`, not `19.990000000000002`. A DECIMAL was multiplied by 10^-scale on its way out of DuckDB, which missed the nearest double for 13% of the `DECIMAL(10,2)` values from 0 to 200. The rows are still filtered and sorted by the values themselves.
