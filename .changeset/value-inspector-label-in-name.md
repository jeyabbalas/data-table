---
'@jeyabbalas/data-table': patch
---

The value inspector names each list, struct, map or JSON row with everything the row shows, preview included: `point: struct(3), 3 fields, {x: 1.5, y: -0.5, tier: "gold"}`, where it was `point: struct(3), 3 fields`.

Such a row shows its type, its count and a preview of what it holds, but its accessible name left the preview out, so a speech-input user saying the words on screen could miss the row, and screen readers did not read the preview. WCAG 2.5.3 (Label in Name) asks that the name contain the visible text; axe-core 4.14 checks it by default (`label-content-name-mismatch`) and found every such row. The row's text also has a space between its type, count and preview now, where only CSS spaced them, so it reads as the same words; on screen the gap is the same 0.75ch. Leaf, bucket and key rows are unchanged, and type-ahead still matches the start of the name.
