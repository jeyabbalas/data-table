---
'@jeyabbalas/data-table': patch
---

A table holding `infinity` timestamps no longer fails to show its rows, and its cells show `infinity`.

DuckDB stores a `TIMESTAMP`'s `infinity` and `-infinity` as the largest 64-bit integer and its negation; a CSV file of PostgreSQL's infinite dates loads that way. The worker read every value through Arrow's getter, which throws `9223372036854775 is not safe to convert to a number` on them, so a block of rows holding one failed whole: the grid kept its placeholder rows and logged `Error fetching rows`, and `getCellValue`, `getColumnValues`, exports and the clipboard failed too. A year near 294247 or 290309 BC failed the same way, a `DATE`'s `infinity` showed as `185542587100800000`, and a `TIMESTAMP_NS`'s as `2262-04-11 23:47:16.854`.

- The worker reads date and timestamp columns, and lists of them, from Arrow's storage. Every other value is the number it was, to the last digit; `infinity` and `-infinity` are `Infinity` and `-Infinity`; a timestamp past ±2^53 ms, after year 287396 or before 283458 BC, is the nearest number, as a `BIGINT` is past 2^53.
- A cell shows `infinity` and `-infinity`, as DuckDB writes them, and a date a JavaScript `Date` cannot hold, past year 275760, as the ISO text a `Date` would give, `+294247-01-10 04:00:54.776` and `+5881580-07-10`, where it showed the raw number.
- `getCellValue` and `getColumnValues` return `Infinity` and `-Infinity` for them.
- Inside a STRUCT, MAP or UNION, Arrow still reads a date or timestamp itself, so a raw `bridge.query` of one gets `infinity` wrong; `CAST(to_json(c) AS VARCHAR)` reads it as `"infinity"`.
