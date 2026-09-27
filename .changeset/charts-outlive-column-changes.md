---
'@jeyabbalas/data-table': minor
---

### Changed

- Hiding, showing, moving or pinning a column keeps every other column's chart and custom stats panel. Only the column shown gets new ones.
  - **What it saves:** a change queries only for the charts and panels of the columns it brings near the view, such as the column shown. Before, every change rebuilt every chart and panel near the view, about 20 queries at 1,000 columns.
  - **Charts:** a brush or selection is never lost to another column's change.
- Custom stats panels live only while their column is near the view, the same columns body rows render.
  - **Lifecycle:** a panel is built as its column comes within about a viewport of the view, and destroyed once the column moves away. It used to exist for every column, and every column change rebuilt them all.
  - **`update()` on mount:** a panel built while its column's chart is live is passed the chart's latest stats, not `null`.
  - **A panel that throws** in its constructor is not tried again until new data arrives or its column's header is rebuilt.
