---
'@jeyabbalas/data-table': patch
---

A column narrower than its action buttons clips them at its edge, instead of spilling them over the next header, and shows them all on hover or `F2`.

- The action buttons of a column narrower than them no longer spill over the next header at rest. A header's five buttons need about 135 px, and a column can be 50 px wide. Past the header's edge, they sat under the next header, which covered them and took their clicks. A narrow pinned column was worse: its buttons lay over the first unpinned header and took the clicks meant for it. The action bar now clips its buttons at the header's edge.
  - **Every action stays reachable.** Once the pointer has rested on the bar for 200 ms, or at once when keyboard focus is in it (`F2`), the bar shows every button, running on over the next header's bar. `F2` scrolls the table so the button it focuses is in view. The last column's bar runs on leftward instead, over its own header and the one before, so it neither leaves the view nor widens the header's scroll range.
  - **While shown, a narrow column's bar sits on top of the next header's first buttons,** visibly, until the pointer leaves it. A pointer passing along the row of bars without pausing reveals nothing, so a click there lands on the button under it.
