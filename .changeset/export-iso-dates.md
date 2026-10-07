---
'@jeyabbalas/data-table': minor
---

CSV, JSON and clipboard exports write dates and times as ISO 8601 text instead of epoch numbers.

### Changed (breaking)

- `DATE`, `TIME`, `TIMESTAMP` (`TIMESTAMP_S`, `TIMESTAMP_MS`, `TIMESTAMP_NS`) and `TIMESTAMP WITH TIME ZONE` columns are exported as text, every digit kept and trailing zeros dropped.
  - **Before:** a `DATE` or `TIMESTAMP` was epoch milliseconds (`1704164645123.456`), a `TIMESTAMP_NS` rounded to them, and a `TIME` microseconds since midnight (`11045500000`). A `TIMESTAMP`, `TIMESTAMP_S`, `TIMESTAMP_MS` or `TIMESTAMP WITH TIME ZONE` holding `infinity` or `-infinity` failed the whole export, and a `DATE` or `TIMESTAMP_NS` `infinity` was a meaningless number (`185542587100800000`, `9223372036854.775`).
  - **Now:** JSON writes `"2024-01-02"`, `"03:04:05.5"` and `"2024-01-02T03:04:05.123456"`. CSV and the clipboard write a space between the date and the time, `2024-01-02 03:04:05.123456`, which spreadsheets read as a date and time. A `TIMESTAMP WITH TIME ZONE` is written in UTC with `Z`, `2024-01-02T03:04:05.5Z`, whatever time zone the table was loaded in; a `TIMESTAMP` has no zone and is written without one. `infinity`, `-infinity` and dates before year 1 (`0044-03-15 (BC)`) are written as DuckDB writes them. Dates inside a nested value stay DuckDB's text, and Parquet export, `getColumnValues`, `getCellValue` and `bridge.query` are unchanged.

### Migration

- Code or pipelines that read exported dates as numbers: see [Exports write dates and times as ISO 8601 text](./docs/migration-guides/from-0.8-to-0.9.md#4-exports-write-dates-and-times-as-iso-8601-text).
- JavaScript reads a date and time without a zone as local time: read an exported `TIMESTAMP` as UTC, the instant 0.8's number held, with `` new Date(`${value}Z`) ``.
