---
'@jeyabbalas/data-table': minor
---

The "No data" a header chart draws can be translated with `messages.statistics.noData`, and labels cut to fit are cut between graphemes.

**Added**

- `messages.statistics.noData`, the "No data" a header chart draws for a column with no values and no nulls, as an empty table has. The histograms and the value counts drew it in English whatever `messages` said.

**Fixed**

- A header chart's labels, cut to fit, are cut between graphemes. The cut dropped one UTF-16 unit at a time, so it could stop inside a character: a value-count segment for `📍 Paris 🚀🚀` read `📍 Paris �…`, half an emoji drawn as the replacement character, and a flag or an emoji joined with ZWJ could be split, or a decomposed letter lose its accent.
