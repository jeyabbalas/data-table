---
'@jeyabbalas/data-table': patch
---

### Fixed

- Hiding the column the keyboard cursor is on moves the cursor to the column that takes its place (the next one still shown, or the one before when it was the last), not to the first column. Hiding a column far to the right, from its header's hide button for example, used to send the cursor back to the start of the table while the view stayed put, so the next arrow key jumped there.
