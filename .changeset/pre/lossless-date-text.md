---
'@jeyabbalas/data-table': patch
---

Text columns of dates, timestamps and times convert only when every value converts unchanged, and text timestamps with a UTC offset load as `TIMESTAMP WITH TIME ZONE`.

- Converting text columns of ISO dates, timestamps, or times no longer loses values. The loader sampled 100 distinct values and converted the column if 95% of them matched, and any other value became `null` without warning. It now checks every value, and a column with one value that would not convert unchanged stays text: `N/A` or `2024-02-30`, which would become `null`, and `2024-03-15 (approx)`, `02:30:00 PM` or a seventh fractional digit, which DuckDB would cut. Blank values count as missing and become `null`, as before.
- Text timestamps with a UTC offset (`2024-03-15T14:30:00+05:30`) now load as `TIMESTAMP WITH TIME ZONE`, displayed in UTC. They used to load as plain timestamps with the offset dropped, which shifted each value by its offset.
- A Parquet file with text columns of dates no longer needs memory for a second copy of the table. The dates convert as the file is read, and the memory check counts them at their final size. A 200,000 rows × 1,000 columns file with 10 such columns now loads; it used to run out of memory. CSV and JSON loads convert each date column in place instead of rebuilding the table.
