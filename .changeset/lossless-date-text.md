---
'@jeyabbalas/data-table': patch
---

### Fixed

- Converting text columns of ISO dates, timestamps, or times no longer loses values. The loader sampled 100 distinct values and converted the column if 95% of them matched, and any other value became `null` without warning. It now checks every value, and a column with one value that would not convert (`N/A`, `2024-02-30`) stays text.
- Text timestamps with a UTC offset (`2024-03-15T14:30:00+05:30`) now load as `TIMESTAMP WITH TIME ZONE`, displayed in UTC. They used to load as plain timestamps with the offset dropped, which shifted each value by its offset.
- A Parquet file with text columns of dates no longer needs memory for a second copy of the table. The dates convert as the file is read, and the memory check counts them at their final size. A 200,000 rows × 1,000 columns file with 10 date columns now loads in about 12 seconds in Chrome; it used to run out of memory. CSV and JSON loads convert each date column in place instead of rebuilding the table.
