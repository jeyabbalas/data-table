---
'@jeyabbalas/data-table': patch
---

Timestamp cells drop every trailing zero from the milliseconds.

- Timestamp cells now drop every trailing zero from the milliseconds. A whole-second value such as `2020-01-01 00:00:16.000` used to render as `2020-01-01 00:00:16.00`, and `.100` as `.10`; they now render as `2020-01-01 00:00:16` and `.1`, matching the documented format.
