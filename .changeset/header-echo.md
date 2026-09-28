---
'@jeyabbalas/data-table': patch
---

### Fixed

- A smooth sideways scroll of the table body, such as a host's `scrollTo({ left, behavior: 'smooth' })`, no longer stops a pixel or two in. At a device pixel ratio of 2, Chrome can deliver the header's scroll event for a sync a frame late, after the body has moved on, and the table then wrote the header's older position back into the body, which cancelled the animation. The table now drops a scroll event that finds a scroller where the table itself last put it, to within a pixel, so the header follows the body without pulling it back. An animated scroll of the header, such as a fling over it or a host's `scrollTo` on it, is no longer pulled back by the body in the same way.
- The scroll to a derived column just added no longer stops short of it on a busy machine. It used to turn off the header's sync until the body seemed to stop, and stalled frames made it look stopped mid-way.
