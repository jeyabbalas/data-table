---
'@jeyabbalas/data-table': minor
---

### Changed

- Row fetches select only the columns near the view. Around the columns rows render, a fetch selects as many again on either side, rounded out to steps of 16 columns, so a short sideways scroll reuses rows already fetched. At 1,000 columns in a 1,200 px view, a fetch selects 32 to about 100 columns instead of 1,000. In Chrome, a 128-row block takes a median of 7.8 ms with 96 of 1,000 columns selected against 76 ms with all of them, most of which went into converting the block to JavaScript objects.
- Scrolling sideways past what the rows were fetched with fetches them again. Until the new rows arrive, cells of the columns they lack stay empty, with the class `dt-cell--pending`, and the row carries `aria-busy="true"`.
