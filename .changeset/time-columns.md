---
'@jeyabbalas/data-table': minor
---

A `TIME WITH TIME ZONE` cell keeps its offset, and a `TIME_NS` column loads as `type: 'time'` with every digit shown.

**Fixed**

- A `TIME WITH TIME ZONE` cell shows DuckDB's text, offset kept: `14:05:06+05:30`, `14:05:06.5-08`. It showed the time alone, `14:05:06`. A `TIME` cell still shows to the millisecond.

**Changed (breaking)**

- A `TIME_NS` column loads as `type: 'time'`, not `'string'`, so it gets a time column's chart, stats and filter controls, and its cell shows DuckDB's text with every digit, `03:04:05.123456789`, where it showed the nanoseconds since midnight as a number, `11045123456789`. A custom visualization or stats panel whose `isApplicable` accepts `'string'` no longer receives it; accept `'time'` as well to keep it.

**Migration**

- A `'string'` registration, or code reading `ColumnSchema.type`, that handled `TIME_NS` columns: see [Nested and `TIME_NS` columns have types of their own](./docs/migration-guides/from-0.8-to-0.9.md#1-nested-and-time_ns-columns-have-types-of-their-own).
