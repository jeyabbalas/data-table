---
'@jeyabbalas/data-table': patch
---

### Fixed

- The rows in view now follow the table body's height, not only its scroll position.
  - **Before:** a container that grew taller showed blank space below the rows rendered for its old height until the next scroll, one that shrank went on rendering rows out of view, and a table mounted hidden, in a closed tab or a collapsed panel, showed no rows once it was shown.
  - **Now:** the rows in view are worked out again whenever the body resizes, whatever resized it: the container, the window, or a filter bar that wraps onto another line.
