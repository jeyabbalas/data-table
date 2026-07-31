---
'@jeyabbalas/data-table': minor
---

Column-header plots now map every x inside the plot to its nearest bar or segment, so the gaps between bars are no longer interaction dead zones.

`SharedHistogramBase` and `ValueCounts` hit-tested x against each bar's or segment's exact bounds, so the space between them — 15% of bar width on histograms with 5 or fewer bins, a 1px seam on value-counts — belonged to nothing. Scrubbing across a plot made the hover highlight flash off at every gap, a click that landed in one did nothing, a drag that *started* in one started no brush, and a press a pixel past a committed brush's edge cleared the filter and immediately re-created a one-bin one — two `filterChange` emissions for what reads as a slide.

Every x-hit-test in the library now shares one rule: every x inside a plot's horizontal extent belongs to exactly one slot, and the gap between two neighbouring slots splits at its midpoint. The histogram's null bar is a slot too, so `LAYOUT.nullBarGap` splits rather than falling wholly to the last bar, and a null bar crossfiltered to zero is hoverable but inert on click, exactly like a ghost bar. x *outside* the extent still belongs to nothing, so clicking the paddings, the label band, or any y outside the bar band still clears a selection. `slideBrush` now derives its snap step from the laid-out bar positions instead of `barPositions[0].width + LAYOUT.barGap`, which drifted a sliding brush off its bins whenever the few-bin gap ratio applied.

One behavior trade comes with the uniform rule: a single-value histogram draws one deliberately narrow bar centered in the chart area, and the rule hands that bar the whole chart area. There are no inter-bar gaps there, so nothing flickered either way — the change buys a much larger target for a small bar at the cost of the in-chart "click blank space to clear" escape, which stays available via the paddings, the y-bands, double-click, and Escape.

Symptom this fixes: scrubbing the mouse across a low-cardinality integer column's histogram made the highlighted bar flash on and off as the cursor crossed each gap, and clicks that landed a pixel or two off a bar were silently swallowed.
