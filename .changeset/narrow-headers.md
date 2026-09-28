---
'@jeyabbalas/data-table': patch
---

### Fixed

- The action buttons of a column narrower than them no longer spill over the next header. A header's five buttons need about 135 px, and a column can be 50 px wide. Past the header's edge, they sat under the next header, which covered them and took their clicks. A narrow pinned column was worse: its buttons lay over the first unpinned header and took the clicks meant for it. The action bar now clips its buttons at the header's edge. While the pointer is on the bar, or keyboard focus is in it (`F2`), it shows every button, running on over the next header's bar, so every action stays reachable by mouse and keyboard.
