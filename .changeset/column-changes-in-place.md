---
'@jeyabbalas/data-table': minor
---

### Changed

- Hiding, showing, moving or pinning a column updates the header and the body in place instead of rebuilding them.
  - **Headers:** every other column keeps its `ColumnHeader`, and DOM focus on one of its buttons stays put. A column's header is rebuilt only when its schema entry changes, as when a derived column is edited or new data is loaded. Header ids and `aria-colindex` follow the columns to their new places.
  - **Body:** the rows stay. A hide or a move fetches nothing, and a column shown is read by itself, by row id, for the rows already fetched.
  - **At 1,000 columns:**
    - Hiding a column takes 24 ms instead of 182 ms, and the next frame follows 59 ms after it instead of 830 ms.
    - Moving a column takes 28 ms instead of 175 ms.
    - Measured in Chrome on a 50K × 1,000 Parquet file.
  - **Charts and custom stats panels** are still rebuilt on every column change.
  - **Pinning** animates only the headers near the view.
