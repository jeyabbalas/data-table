[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / CreateDataTableOptions

# Interface: CreateDataTableOptions

Defined in: [DataTable.ts:141](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L141)

Options accepted by [createDataTable](../functions/createDataTable.md). All feature toggles default
to `true`; pass `false` (or a configuration object) to customize.

## Properties

### bridge?

> `optional` **bridge?**: [`WorkerBridge`](../classes/WorkerBridge.md)

Defined in: [DataTable.ts:269](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L269)

Share a WorkerBridge across tables. If omitted, one is created and owned by this table.

***

### bridgeOptions?

> `optional` **bridgeOptions?**: [`WorkerBridgeOptions`](WorkerBridgeOptions.md)

Defined in: [DataTable.ts:271](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L271)

Options for the owned WorkerBridge (ignored if `bridge` is supplied).

***

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [DataTable.ts:276](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L276)

CSS class prefix. Default: `'dt'`.

***

### colorScheme?

> `optional` **colorScheme?**: [`ColorScheme`](../type-aliases/ColorScheme.md)

Defined in: [DataTable.ts:350](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L350)

Initial light/dark theme selector. Defaults to `'auto'` (follows
`prefers-color-scheme`). Pass `'light'` or `'dark'` to force a theme per
instance, or call [DataTable.setColorScheme](DataTable.md#setcolorscheme) later to switch at
runtime.

***

### container

> **container**: `HTMLElement`

Defined in: [DataTable.ts:162](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L162)

Element that will host the table. The library takes full ownership of its
contents.

Must have a bounded height before mounting: the table virtualizes against
this element, measuring it to render only `⌈height / rowHeight⌉ + 10` rows.
Give it an explicit height, or `flex: 1; min-height: 0` as a flex/grid
child — `min-height: 0` is mandatory, as flex and grid items otherwise
refuse to shrink below their content, which here is every row.

Without one nothing errors: the root (`height: 100%`) becomes
content-sized, so the measured viewport is the whole dataset and the table
queries and builds DOM for every row. A zero-height container renders no
rows and logs a console warning. See "Sizing the container" in the README.

#### Example

```html
<div id="my-table" style="height: 600px"></div>
```

***

### derivedColumns?

> `optional` **derivedColumns?**: `boolean`

Defined in: [DataTable.ts:227](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L227)

Show the derived-column UI: the "+" button at the table's right edge,
the f(x) edit icon on every derived-column header, and "extract field →
column": the extract button on every nested and JSON column header and
the value inspector's "add as column" buttons. The programmatic API
(`actions.addDerivedColumn`, `actions.removeDerivedColumn`,
`actions.updateDerivedColumn`, `actions.addNestedFieldColumn`) is
unaffected by this flag — only the user-visible affordances are removed.

Set this to `false` together with `expressionFilter: false` to skip
loading CodeMirror entirely. Consumers in that mode can omit the
`@codemirror/*` and `@lezer/highlight` peer dependencies (already marked
`optional` in `peerDependenciesMeta`).

Default: `true`.

***

### editorFactory?

> `optional` **editorFactory?**: [`ExpressionEditorFactory`](../type-aliases/ExpressionEditorFactory.md)

Defined in: [DataTable.ts:291](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L291)

Custom expression editor factory (replaces the CodeMirror-based default).

***

### exportDialog?

> `optional` **exportDialog?**: `boolean`

Defined in: [DataTable.ts:262](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L262)

Enable the built-in export dialog (CSV/JSON/Parquet). Default: `true`.

***

### expressionFilter?

> `optional` **expressionFilter?**: `boolean`

Defined in: [DataTable.ts:209](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L209)

Enable the "Expression" (raw SQL) filter button in the filter bar. Default: `true`.

***

### fetchBlockSize?

> `optional` **fetchBlockSize?**: `number`

Defined in: [DataTable.ts:321](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L321)

Rows fetched per scroll block. Default: 128. Clamped to [16, 1024].

Row fetches are quantized to block-aligned windows, so overlapping
scroll positions dedupe onto the same query and a block already in
flight is never re-requested. The default is roughly 3–4× a realistic
viewport (~30–48 rows): the viewport spans 1–2 blocks, fetch cost is
dominated by scroll depth rather than block length, and power-of-two
alignment keeps the dedupe keys stable. Raise it for very tall
viewports; lower it only if your rows are extremely wide and you want
smaller transfers.

***

### headerHeight?

> `optional` **headerHeight?**: `number`

Defined in: [DataTable.ts:308](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L308)

Header height in pixels. Default: 120. Applied as the header row's
`min-height` and published as the `--dt-header-height` custom property.
Keep it at 96 or above when visualizations are enabled, or the header
plots have nowhere to draw.

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [DataTable.ts:289](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L289)

Identifier mixed into element IDs so multiple tables on the same page
don't collide on `aria-labelledby` / `aria-activedescendant` targets.
Auto-generated if omitted.

A short random suffix is appended even to a value you supply, because
nothing stops an app from handing the same one to two tables and a
duplicate there is silent — the grids would mint identical cell ids and
publish ambiguous IDREFs. Read [DataTable.instanceId](DataTable.md#instanceid) for the value
actually used in the DOM; this option only seeds it, so it cannot be used
to predict element IDs.

***

### messages?

> `optional` **messages?**: `object`

Defined in: [DataTable.ts:360](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L360)

Override user-facing strings (button labels, placeholders, aria-live
announcements, stats templates). Every key is optional; missing leaves
fall back to English defaults. See `Strings` for the full shape.

Messages are resolved once at construction and threaded to every
component — recreate the table to switch languages at runtime.

#### a11y?

> `optional` **a11y?**: `object`

##### a11y.ascending?

> `optional` **ascending?**: `string`

Word used inside `sortedBy` descriptions and header labels.

##### a11y.cannotHideLastColumn?

> `optional` **cannotHideLastColumn?**: `string`

##### a11y.columnLayoutCancelled?

> `optional` **columnLayoutCancelled?**: `object`

Live-region: Escape restored the entry width and position.

##### a11y.columnLayoutCommitted?

> `optional` **columnLayoutCommitted?**: `object`

Live-region: Enter (or leaving the grid) committed the gesture.

##### a11y.columnLayoutModeEntered?

> `optional` **columnLayoutModeEntered?**: `object`

Column layout mode (`Shift+F2` on a column header) — the keyboard
gesture for resize and reorder. The entry announcement is the only
place the key map is spoken aloud, so it doubles as the mode's
discoverability affordance; keep the key names in a translation.

##### a11y.columnMoveBlockedPinned?

> `optional` **columnMoveBlockedPinned?**: `object`

Live-region: a move was refused because the column is pinned.

##### a11y.columnMovedAnnouncement?

> `optional` **columnMovedAnnouncement?**: `object`

Live-region: the column's new 1-based position after a move.

##### a11y.columnWidthAnnouncement?

> `optional` **columnWidthAnnouncement?**: `object`

Live-region: the column's new width after a resize step.

##### a11y.columnWidthAtMaximum?

> `optional` **columnWidthAtMaximum?**: `object`

Live-region: resize step landed on the maximum width.

##### a11y.columnWidthAtMinimum?

> `optional` **columnWidthAtMinimum?**: `object`

Live-region: resize step landed on the minimum width.

##### a11y.descending?

> `optional` **descending?**: `string`

##### a11y.dragHandleLabel?

> `optional` **dragHandleLabel?**: `object`

Header drag handle.

##### a11y.dragHandleTitle?

> `optional` **dragHandleTitle?**: `string`

##### a11y.editDerivedColumnLabel?

> `optional` **editDerivedColumnLabel?**: `string`

Derived-column edit icon.

##### a11y.editDerivedColumnTitle?

> `optional` **editDerivedColumnTitle?**: `string`

##### a11y.filterButtonLabel?

> `optional` **filterButtonLabel?**: `object`

Header filter button.

##### a11y.filterColumnTitle?

> `optional` **filterColumnTitle?**: `string`

##### a11y.filteredSuffix?

> `optional` **filteredSuffix?**: `string`

##### a11y.filtersActive?

> `optional` **filtersActive?**: `object`

Live-region: "3 filters active, showing 1,234 of 5,678 rows".

##### a11y.gridLabel?

> `optional` **gridLabel?**: `string`

Accessible name of the grid itself (`aria-label` on `.dt-grid`).

##### a11y.hiddenColumnsLabel?

> `optional` **hiddenColumnsLabel?**: `string`

Hidden-columns gutter.

##### a11y.hideButtonLabel?

> `optional` **hideButtonLabel?**: `object`

Header hide button.

##### a11y.hideColumnTitle?

> `optional` **hideColumnTitle?**: `string`

##### a11y.loadingRowLabel?

> `optional` **loadingRowLabel?**: `object`

Placeholder text shown for not-yet-fetched rows during fast scroll.

##### a11y.multiFilteredSuffix?

> `optional` **multiFilteredSuffix?**: `object`

##### a11y.noFilters?

> `optional` **noFilters?**: `object`

Live-region: "Showing all 5,678 rows".

##### a11y.pinButtonLabel?

> `optional` **pinButtonLabel?**: `object`

Header pin button.

##### a11y.pinColumnTitle?

> `optional` **pinColumnTitle?**: `string`

##### a11y.resizeHandleLabel?

> `optional` **resizeHandleLabel?**: `string`

Aria-label on the column-resize handle (`.dt-col-resize-handle`).

##### a11y.showColumn?

> `optional` **showColumn?**: `object`

##### a11y.sortAscendingTitle?

> `optional` **sortAscendingTitle?**: `string`

##### a11y.sortButtonLabel?

> `optional` **sortButtonLabel?**: `object`

Header sort button.

##### a11y.sortDescendingTitle?

> `optional` **sortDescendingTitle?**: `string`

##### a11y.sortedBy?

> `optional` **sortedBy?**: `object`

Live-region: "sorted by Price ascending, then Name descending".

##### a11y.sortedMultiSuffix?

> `optional` **sortedMultiSuffix?**: `object`

##### a11y.sortedSuffix?

> `optional` **sortedSuffix?**: `object`

Column-header aria-label fragments.

##### a11y.sortRemoveTitle?

> `optional` **sortRemoveTitle?**: `string`

##### a11y.unpinButtonLabel?

> `optional` **unpinButtonLabel?**: `object`

##### a11y.unpinColumnTitle?

> `optional` **unpinColumnTitle?**: `string`

#### common?

> `optional` **common?**: `object`

##### common.apply?

> `optional` **apply?**: `string`

##### common.cancel?

> `optional` **cancel?**: `string`

##### common.close?

> `optional` **close?**: `string`

##### common.confirm?

> `optional` **confirm?**: `string`

##### common.create?

> `optional` **create?**: `string`

##### common.creating?

> `optional` **creating?**: `string`

##### common.deleteConfirm?

> `optional` **deleteConfirm?**: `string`

##### common.no?

> `optional` **no?**: `string`

##### common.showAll?

> `optional` **showAll?**: `string`

##### common.update?

> `optional` **update?**: `string`

##### common.updating?

> `optional` **updating?**: `string`

##### common.validate?

> `optional` **validate?**: `string`

##### common.validating?

> `optional` **validating?**: `string`

##### common.yes?

> `optional` **yes?**: `string`

#### derived?

> `optional` **derived?**: `object`

##### derived.addButtonLabel?

> `optional` **addButtonLabel?**: `string`

##### derived.availableColumnsLabel?

> `optional` **availableColumnsLabel?**: `string`

Prefix shown before the comma-separated column-hint list (DefaultExpressionEditor).

##### derived.closeEditLabel?

> `optional` **closeEditLabel?**: `string`

##### derived.closeLabel?

> `optional` **closeLabel?**: `string`

##### derived.createButton?

> `optional` **createButton?**: `string`

##### derived.createFailed?

> `optional` **createFailed?**: `string`

##### derived.deleteButton?

> `optional` **deleteButton?**: `string`

##### derived.deleteFailed?

> `optional` **deleteFailed?**: `object`

##### derived.editTitle?

> `optional` **editTitle?**: `string`

Default panel header before a column is selected.

##### derived.editTitleForColumn?

> `optional` **editTitleForColumn?**: `object`

Panel header with column name — "Edit: my_col".

##### derived.expressionLabel?

> `optional` **expressionLabel?**: `string`

##### derived.expressionModeLabel?

> `optional` **expressionModeLabel?**: `string`

##### derived.expressionPlaceholder?

> `optional` **expressionPlaceholder?**: `string`

Placeholder text inside the SQL-expression textarea (DefaultExpressionEditor).

##### derived.expressionRequired?

> `optional` **expressionRequired?**: `string`

##### derived.infoLabel?

> `optional` **infoLabel?**: `string`

"Column info" label shown on the edit panel for vector columns.

##### derived.nameDuplicate?

> `optional` **nameDuplicate?**: `object`

##### derived.nameLabel?

> `optional` **nameLabel?**: `string`

##### derived.namePlaceholder?

> `optional` **namePlaceholder?**: `string`

##### derived.nameRequired?

> `optional` **nameRequired?**: `string`

##### derived.nameReserved?

> `optional` **nameReserved?**: `object`

A new column name that spells `__rowid__` in any letter case: the
synthetic row id's name, which no other column may take.

##### derived.newColumnTitle?

> `optional` **newColumnTitle?**: `string`

Modal: "New Derived Column".

##### derived.typeLabel?

> `optional` **typeLabel?**: `string`

##### derived.typePreview?

> `optional` **typePreview?**: `object`

##### derived.updateButton?

> `optional` **updateButton?**: `string`

##### derived.updateFailed?

> `optional` **updateFailed?**: `string`

##### derived.validationFailed?

> `optional` **validationFailed?**: `string`

##### derived.vectorCountMismatch?

> `optional` **vectorCountMismatch?**: `object`

##### derived.vectorInfo?

> `optional` **vectorInfo?**: `object`

##### derived.vectorInfoText?

> `optional` **vectorInfoText?**: `object`

"Vector column (integer), 123 values"

##### derived.vectorInvalidBoolean?

> `optional` **vectorInvalidBoolean?**: `object`

##### derived.vectorInvalidDate?

> `optional` **vectorInvalidDate?**: `object`

##### derived.vectorInvalidDecimal?

> `optional` **vectorInvalidDecimal?**: `object`

##### derived.vectorInvalidFloat?

> `optional` **vectorInvalidFloat?**: `object`

##### derived.vectorInvalidInteger?

> `optional` **vectorInvalidInteger?**: `object`

##### derived.vectorInvalidInterval?

> `optional` **vectorInvalidInterval?**: `object`

##### derived.vectorInvalidTime?

> `optional` **vectorInvalidTime?**: `object`

##### derived.vectorInvalidTimestamp?

> `optional` **vectorInvalidTimestamp?**: `object`

##### derived.vectorInvalidUUID?

> `optional` **vectorInvalidUUID?**: `object`

##### derived.vectorModeLabel?

> `optional` **vectorModeLabel?**: `string`

##### derived.vectorPlaceholder?

> `optional` **vectorPlaceholder?**: `string`

##### derived.vectorTypeLabel?

> `optional` **vectorTypeLabel?**: `string`

##### derived.vectorValuesLabel?

> `optional` **vectorValuesLabel?**: `string`

#### errors?

> `optional` **errors?**: `object`

##### errors.stylesheetMissing?

> `optional` **stylesheetMissing?**: `string`

#### export?

> `optional` **export?**: `object`

##### export.cancelButton?

> `optional` **cancelButton?**: `string`

##### export.closeLabel?

> `optional` **closeLabel?**: `string`

##### export.copiedFeedback?

> `optional` **copiedFeedback?**: `string`

##### export.copyButton?

> `optional` **copyButton?**: `string`

##### export.copyFailedFallback?

> `optional` **copyFailedFallback?**: `string`

##### export.csv?

> `optional` **csv?**: `object`

##### export.csv.delimiterLabel?

> `optional` **delimiterLabel?**: `string`

##### export.csv.delimiters?

> `optional` **delimiters?**: `object`

##### export.csv.delimiters.comma?

> `optional` **comma?**: `string`

##### export.csv.delimiters.pipe?

> `optional` **pipe?**: `string`

##### export.csv.delimiters.semicolon?

> `optional` **semicolon?**: `string`

##### export.csv.delimiters.tab?

> `optional` **tab?**: `string`

##### export.csv.headersLabel?

> `optional` **headersLabel?**: `string`

##### export.csv.nullValueLabel?

> `optional` **nullValueLabel?**: `string`

##### export.csv.nullValuePlaceholder?

> `optional` **nullValuePlaceholder?**: `string`

##### export.downloadButton?

> `optional` **downloadButton?**: `string`

##### export.exportFailedFallback?

> `optional` **exportFailedFallback?**: `string`

##### export.formatLabel?

> `optional` **formatLabel?**: `string`

##### export.formats?

> `optional` **formats?**: `object`

##### export.formats.csv?

> `optional` **csv?**: `string`

##### export.formats.json?

> `optional` **json?**: `string`

##### export.formats.parquet?

> `optional` **parquet?**: `string`

##### export.includeSystemColumnsLabel?

> `optional` **includeSystemColumnsLabel?**: `string`

Label on the "include system columns (e.g. __rowid__)" checkbox.

##### export.json?

> `optional` **json?**: `object`

##### export.json.formatLabel?

> `optional` **formatLabel?**: `string`

##### export.json.formats?

> `optional` **formats?**: `object`

##### export.json.formats.array?

> `optional` **array?**: `string`

##### export.json.formats.ndjson?

> `optional` **ndjson?**: `string`

##### export.json.prettyLabel?

> `optional` **prettyLabel?**: `string`

##### export.scopeLabel?

> `optional` **scopeLabel?**: `string`

##### export.scopes?

> `optional` **scopes?**: `object`

##### export.scopes.all?

> `optional` **all?**: `string`

##### export.scopes.filtered?

> `optional` **filtered?**: `string`

##### export.scopes.selected?

> `optional` **selected?**: `string`

##### export.title?

> `optional` **title?**: `string`

#### filters?

> `optional` **filters?**: `object`

##### filters.activeFiltersLabel?

> `optional` **activeFiltersLabel?**: `string`

Toolbar label on the filter bar itself.

##### filters.applyButton?

> `optional` **applyButton?**: `string`

##### filters.ariaLabels?

> `optional` **ariaLabels?**: `object`

aria-labels on the filter field controls.

##### filters.ariaLabels.dateFilterMode?

> `optional` **dateFilterMode?**: `object`

##### filters.ariaLabels.endDate?

> `optional` **endDate?**: `object`

##### filters.ariaLabels.filterMode?

> `optional` **filterMode?**: `object`

##### filters.ariaLabels.filterValue?

> `optional` **filterValue?**: `object`

##### filters.ariaLabels.fromTime?

> `optional` **fromTime?**: `object`

##### filters.ariaLabels.intervalFilter?

> `optional` **intervalFilter?**: `object`

##### filters.ariaLabels.maxValue?

> `optional` **maxValue?**: `object`

##### filters.ariaLabels.minValue?

> `optional` **minValue?**: `object`

##### filters.ariaLabels.nullFilter?

> `optional` **nullFilter?**: `object`

##### filters.ariaLabels.removeFilter?

> `optional` **removeFilter?**: `object`

##### filters.ariaLabels.startDate?

> `optional` **startDate?**: `object`

##### filters.ariaLabels.toTime?

> `optional` **toTime?**: `object`

##### filters.ariaLabels.uuidFilterMode?

> `optional` **uuidFilterMode?**: `object`

##### filters.ariaLabels.uuidValue?

> `optional` **uuidValue?**: `object`

##### filters.booleanOptions?

> `optional` **booleanOptions?**: `object`

##### filters.booleanOptions.false?

> `optional` **false?**: `string`

##### filters.booleanOptions.null?

> `optional` **null?**: `string`

##### filters.booleanOptions.true?

> `optional` **true?**: `string`

##### filters.chipDescriptions?

> `optional` **chipDescriptions?**: `object`

Strings used by `formatFilter()` for chip descriptions.

##### filters.chipDescriptions.anyValue?

> `optional` **anyValue?**: `string`

##### filters.chipDescriptions.inSet?

> `optional` **inSet?**: `object`

##### filters.chipDescriptions.isNotNull?

> `optional` **isNotNull?**: `string`

##### filters.chipDescriptions.isNull?

> `optional` **isNull?**: `string`

##### filters.chipDescriptions.notInSet?

> `optional` **notInSet?**: `object`

##### filters.chipDescriptions.patternModes?

> `optional` **patternModes?**: `object`

##### filters.chipDescriptions.patternModes.contains?

> `optional` **contains?**: `string`

##### filters.chipDescriptions.patternModes.endsWith?

> `optional` **endsWith?**: `string`

##### filters.chipDescriptions.patternModes.regex?

> `optional` **regex?**: `string`

##### filters.chipDescriptions.patternModes.startsWith?

> `optional` **startsWith?**: `string`

##### filters.chipDescriptions.pointPrefix?

> `optional` **pointPrefix?**: `string`

##### filters.chipDescriptions.rangeSeparator?

> `optional` **rangeSeparator?**: `string`

##### filters.chipDescriptions.sqlColumn?

> `optional` **sqlColumn?**: `string`

Column label shown on raw-sql chips.

##### filters.chipDescriptions.valueListMore?

> `optional` **valueListMore?**: `object`

##### filters.clearAllButton?

> `optional` **clearAllButton?**: `string`

##### filters.clearButton?

> `optional` **clearButton?**: `string`

##### filters.closePanelLabel?

> `optional` **closePanelLabel?**: `string`

aria-label for the "×" close on the filter panel.

##### filters.dateOperators?

> `optional` **dateOperators?**: `object`

##### filters.dateOperators.after?

> `optional` **after?**: `string`

##### filters.dateOperators.before?

> `optional` **before?**: `string`

##### filters.dateOperators.between?

> `optional` **between?**: `string`

##### filters.dateOperators.equals?

> `optional` **equals?**: `string`

##### filters.dateOperators.onOrAfter?

> `optional` **onOrAfter?**: `string`

##### filters.dateOperators.onOrBefore?

> `optional` **onOrBefore?**: `string`

##### filters.expressionFilterLabel?

> `optional` **expressionFilterLabel?**: `string`

"Expression" button label in the filter bar.

##### filters.expressionFilterTooltip?

> `optional` **expressionFilterTooltip?**: `string`

Tooltip/title on the expression button.

##### filters.labels?

> `optional` **labels?**: `object`

##### filters.labels.from?

> `optional` **from?**: `string`

##### filters.labels.to?

> `optional` **to?**: `string`

##### filters.nullToggle?

> `optional` **nullToggle?**: `object`

##### filters.nullToggle.any?

> `optional` **any?**: `string`

##### filters.nullToggle.isNotNull?

> `optional` **isNotNull?**: `string`

##### filters.nullToggle.isNull?

> `optional` **isNull?**: `string`

##### filters.numericOperators?

> `optional` **numericOperators?**: `object`

Dropdown text for numeric/date filter modes.

##### filters.numericOperators.between?

> `optional` **between?**: `string`

##### filters.numericOperators.equals?

> `optional` **equals?**: `string`

##### filters.numericOperators.greaterThan?

> `optional` **greaterThan?**: `string`

##### filters.numericOperators.greaterThanOrEqual?

> `optional` **greaterThanOrEqual?**: `string`

##### filters.numericOperators.lessThan?

> `optional` **lessThan?**: `string`

##### filters.numericOperators.lessThanOrEqual?

> `optional` **lessThanOrEqual?**: `string`

##### filters.numericOperators.notEquals?

> `optional` **notEquals?**: `string`

##### filters.panelTitle?

> `optional` **panelTitle?**: `string`

##### filters.panelTitleForColumn?

> `optional` **panelTitleForColumn?**: `object`

Header text once a column has been selected: e.g. "Filter: price".

##### filters.placeholders?

> `optional` **placeholders?**: `object`

##### filters.placeholders.intervalFilter?

> `optional` **intervalFilter?**: `string`

##### filters.placeholders.max?

> `optional` **max?**: `string`

##### filters.placeholders.min?

> `optional` **min?**: `string`

##### filters.placeholders.stringFilter?

> `optional` **stringFilter?**: `string`

##### filters.placeholders.uuidFilter?

> `optional` **uuidFilter?**: `string`

##### filters.placeholders.value?

> `optional` **value?**: `string`

##### filters.presetsButtonLabel?

> `optional` **presetsButtonLabel?**: `string`

"Presets" button label in the filter bar.

##### filters.presetsButtonTooltip?

> `optional` **presetsButtonTooltip?**: `string`

Tooltip/title on the presets button.

##### filters.sqlFilter?

> `optional` **sqlFilter?**: `object`

SQL (raw WHERE) filter modal.

##### filters.sqlFilter.applyButton?

> `optional` **applyButton?**: `string`

##### filters.sqlFilter.closeLabel?

> `optional` **closeLabel?**: `string`

##### filters.sqlFilter.conditionLabel?

> `optional` **conditionLabel?**: `string`

##### filters.sqlFilter.createTitle?

> `optional` **createTitle?**: `string`

##### filters.sqlFilter.editorPlaceholder?

> `optional` **editorPlaceholder?**: `string`

##### filters.sqlFilter.editTitle?

> `optional` **editTitle?**: `string`

##### filters.sqlFilter.labelFieldLabel?

> `optional` **labelFieldLabel?**: `string`

##### filters.sqlFilter.labelHint?

> `optional` **labelHint?**: `string`

##### filters.sqlFilter.labelPlaceholder?

> `optional` **labelPlaceholder?**: `string`

##### filters.sqlFilter.removeButton?

> `optional` **removeButton?**: `string`

##### filters.sqlFilter.removeConfirmText?

> `optional` **removeConfirmText?**: `string`

##### filters.sqlFilter.updateButton?

> `optional` **updateButton?**: `string`

##### filters.sqlFilter.validationResult?

> `optional` **validationResult?**: `object`

##### filters.stringModes?

> `optional` **stringModes?**: `object`

##### filters.stringModes.contains?

> `optional` **contains?**: `string`

##### filters.stringModes.endsWith?

> `optional` **endsWith?**: `string`

##### filters.stringModes.exact?

> `optional` **exact?**: `string`

##### filters.stringModes.regex?

> `optional` **regex?**: `string`

##### filters.stringModes.startsWith?

> `optional` **startsWith?**: `string`

##### filters.uuidModes?

> `optional` **uuidModes?**: `object`

##### filters.uuidModes.contains?

> `optional` **contains?**: `string`

##### filters.uuidModes.exact?

> `optional` **exact?**: `string`

##### filters.validation?

> `optional` **validation?**: `object`

Inline regex/UUID validation messages.

##### filters.validation.regexInvalid?

> `optional` **regexInvalid?**: `string`

##### filters.validation.regexTooLong?

> `optional` **regexTooLong?**: `string`

##### filters.validation.regexUnsupported?

> `optional` **regexUnsupported?**: `string`

##### filters.validation.uuidInvalid?

> `optional` **uuidInvalid?**: `string`

#### presets?

> `optional` **presets?**: `object`

##### presets.closeLabel?

> `optional` **closeLabel?**: `string`

##### presets.deleteButton?

> `optional` **deleteButton?**: `string`

##### presets.deleteConfirmText?

> `optional` **deleteConfirmText?**: `string`

##### presets.descriptionPlaceholder?

> `optional` **descriptionPlaceholder?**: `string`

##### presets.emptyState?

> `optional` **emptyState?**: `string`

##### presets.exportButton?

> `optional` **exportButton?**: `string`

##### presets.importButton?

> `optional` **importButton?**: `string`

##### presets.importEmpty?

> `optional` **importEmpty?**: `string`

##### presets.importFailed?

> `optional` **importFailed?**: `string`

##### presets.importPartial?

> `optional` **importPartial?**: `object`

##### presets.importSuccess?

> `optional` **importSuccess?**: `object`

##### presets.loadButton?

> `optional` **loadButton?**: `string`

##### presets.meta?

> `optional` **meta?**: `object`

##### presets.namePlaceholder?

> `optional` **namePlaceholder?**: `string`

##### presets.saveButton?

> `optional` **saveButton?**: `string`

##### presets.title?

> `optional` **title?**: `string`

#### statistics?

> `optional` **statistics?**: `object`

##### statistics.allNull?

> `optional` **allNull?**: `string`

##### statistics.allUnique?

> `optional` **allUnique?**: `string`

##### statistics.allUniqueCategory?

> `optional` **allUniqueCategory?**: `object`

Display value for the all-unique segment (count = distinct values).

##### statistics.allValues?

> `optional` **allValues?**: `object`

##### statistics.binLabel?

> `optional` **binLabel?**: `string`

Bold label prefix for a histogram bin/brush selection detail line.

##### statistics.categoryLabel?

> `optional` **categoryLabel?**: `string`

Bold label prefix for a single selected category detail line.

##### statistics.chartFailed?

> `optional` **chartFailed?**: `string`

Stats-slot line for a column whose chart's data failed to load.

##### statistics.filteredRowCount?

> `optional` **filteredRowCount?**: `object`

##### statistics.matchCount?

> `optional` **matchCount?**: `object`

Rows of a hovered bin/segment passing all active filters, e.g. "300 match".

##### statistics.max?

> `optional` **max?**: `object`

##### statistics.median?

> `optional` **median?**: `object`

##### statistics.min?

> `optional` **min?**: `object`

##### statistics.noData?

> `optional` **noData?**: `string`

What a column-header chart draws for a column with no values and no
nulls, as an empty table has: "No data".

##### statistics.nonNullCategory?

> `optional` **nonNullCategory?**: `string`

Display value for the non-null segment of a nested column's summary
bar in a hover detail line, the counterpart of `nullBinLabel`.

##### statistics.nullBinLabel?

> `optional` **nullBinLabel?**: `string`

Display value for the null bin/segment in a selection detail line.

##### statistics.nullCount?

> `optional` **nullCount?**: `object`

##### statistics.otherCategory?

> `optional` **otherCategory?**: `object`

Display value for the folded "Other" segment (count = folded distinct values).

##### statistics.otherSegmentLabel?

> `optional` **otherSegmentLabel?**: `string`

The label drawn inside the folded "Other" segment of a value-count
bar, where it fits; [otherCategory](#messages) is its hover text.

##### statistics.percentTrue?

> `optional` **percentTrue?**: `object`

##### statistics.rowCount?

> `optional` **rowCount?**: `object`

##### statistics.rowWord?

> `optional` **rowWord?**: `object`

##### statistics.selectedLabel?

> `optional` **selectedLabel?**: `string`

Bold label prefix for a multi-category selection detail line.

##### statistics.selectionRowCount?

> `optional` **selectionRowCount?**: `object`

Selection/hover size, e.g. "4,000 rows (40.0%)" — pct arrives pre-formatted.

##### statistics.separator?

> `optional` **separator?**: `string`

" · " separator used between stats segments.

##### statistics.uniqueCount?

> `optional` **uniqueCount?**: `object`

##### statistics.uniquePercent?

> `optional` **uniquePercent?**: `object`

##### statistics.valueListSuffix?

> `optional` **valueListSuffix?**: `object`

Truncation suffix for a long multi-select value list (total = selected values).

#### values?

> `optional` **values?**: `object`

##### values.addAsColumn?

> `optional` **addAsColumn?**: `string`

Value inspector button that adds the active node's value as a column
("extract field → column"); also the `title` of the "+" a row shows
under the pointer.

##### values.addColumn?

> `optional` **addColumn?**: `string`

The extract panel's submit button.

##### values.adding?

> `optional` **adding?**: `string`

Status while a column is being added (the value inspector, the extract panel's button).

##### values.addLengthAsColumn?

> `optional` **addLengthAsColumn?**: `string`

Value inspector button that adds a list's, an array's or a JSON array's length as a column.

##### values.addSizeAsColumn?

> `optional` **addSizeAsColumn?**: `string`

Value inspector button that adds a map's number of entries as a column.

##### values.addTagAsColumn?

> `optional` **addTagAsColumn?**: `string`

Value inspector button that adds which member a union holds as a column.

##### values.bucketLabel?

> `optional` **bucketLabel?**: `object`

One bucket of a container too big to list at once, by the numbers of
its first and last child (1-based for DuckDB values, 0-based inside
JSON, the same number twice for a bucket of one): "[1 … 100]",
"[10001 … 10001]".

##### values.closeLabel?

> `optional` **closeLabel?**: `string`

`aria-label` of the value inspector's × button.

##### values.columnAdded?

> `optional` **columnAdded?**: `object`

Live-region text once a column has been added: "Column point_x added".

##### values.columnNameLabel?

> `optional` **columnNameLabel?**: `string`

Label of the extract panel's input for the new column's name.

##### values.copied?

> `optional` **copied?**: `string`

Value inspector status after a copy (Copy JSON, or Ctrl/Cmd+C on a node).

##### values.copyFailed?

> `optional` **copyFailed?**: `string`

Value inspector status when the clipboard refused the copy.

##### values.copyJson?

> `optional` **copyJson?**: `string`

Value inspector button that copies the whole value as JSON.

##### values.elementNode?

> `optional` **elementNode?**: `string`

The tree's node for a list's or an array's elements, read at a position.

##### values.entryCount?

> `optional` **entryCount?**: `object`

Entries of a map, in the tree: "600 entries".

##### values.expressionLabel?

> `optional` **expressionLabel?**: `string`

Label of the extract panel's preview of the SQL expression the column reads.

##### values.extractButtonLabel?

> `optional` **extractButtonLabel?**: `object`

`aria-label` of a nested or JSON column header's extract button: "Extract from point".

##### values.extractButtonTitle?

> `optional` **extractButtonTitle?**: `string`

`title` of the header's extract button.

##### values.extractCloseLabel?

> `optional` **extractCloseLabel?**: `string`

`aria-label` of the extract panel's × button.

##### values.extractFailed?

> `optional` **extractFailed?**: `object`

A column could not be added, with the reason (in English, from the action): "Could not add the column: …".

##### values.extractTitle?

> `optional` **extractTitle?**: `object`

Title of the extract panel, which names it for assistive technology: "Extract from point".

##### values.extractTreeLabel?

> `optional` **extractTreeLabel?**: `object`

Accessible name of the extract panel's tree of the column's type: "Parts of point".

##### values.fieldCount?

> `optional` **fieldCount?**: `object`

Fields of a struct, in the tree: "3 fields".

##### values.inspectorTitle?

> `optional` **inspectorTitle?**: `object`

Title of the value inspector, the panel that shows one nested or JSON
cell's whole value (F2, a double click, or the cell's inspect icon):
the column and `rowLabel`'s text, "tags · Row 1,235". It also
names the panel for assistive technology.

##### values.itemCount?

> `optional` **itemCount?**: `object`

Elements of a list, an array or a JSON array, in the tree: "3 items".

##### values.jsonPathHint?

> `optional` **jsonPathHint?**: `string`

How to write a JSON path, under the input.

##### values.jsonPathInvalid?

> `optional` **jsonPathInvalid?**: `object`

The JSON path does not parse, by the 1-based character where it goes wrong.

##### values.jsonPathLabel?

> `optional` **jsonPathLabel?**: `string`

Label of the extract panel's JSON path input, for a part that is JSON or VARIANT.

##### values.keyCount?

> `optional` **keyCount?**: `object`

Keys of a JSON object, in the tree: "2 keys".

##### values.keyLabel?

> `optional` **keyLabel?**: `object`

Label of the input for a map value's key, by the map: "Key in attrs".

##### values.keyRequired?

> `optional` **keyRequired?**: `string`

The key input is empty.

##### values.lengthNode?

> `optional` **lengthNode?**: `string`

The tree's leaf for a list's or an array's number of elements.

##### values.loadFailed?

> `optional` **loadFailed?**: `string`

Value inspector status when the value could not be read.

##### values.loading?

> `optional` **loading?**: `string`

Value inspector status while the value loads, shown after 150 ms.

##### values.mapValueNode?

> `optional` **mapValueNode?**: `string`

The tree's node for a map's values, read by key.

##### values.moreCharacters?

> `optional` **moreCharacters?**: `object`

After text the tree cut short, by the characters left out: "18,000 more characters".

##### values.nothingToExtract?

> `optional` **nothingToExtract?**: `string`

The extract panel's text when the column's type could not be read, so has no parts.

##### values.panelLoadFailed?

> `optional` **panelLoadFailed?**: `string`

Live-region text when the value inspector or the extract panel, which
load on first use, could not be downloaded.

##### values.positionInvalid?

> `optional` **positionInvalid?**: `string`

The position input holds something other than a whole number from 1 up.

##### values.positionLabel?

> `optional` **positionLabel?**: `object`

Label of the input for an element's 1-based position, by the list or
array it is in: "Position in people". A list inside a list is named
after the outer one's element: "Position in matrix › element".

##### values.readAs?

> `optional` **readAs?**: `object`

The "Read as" choices: a value inside JSON or VARIANT as text, a
number, a boolean or JSON, or the length of the array there.

##### values.readAs.boolean?

> `optional` **boolean?**: `string`

##### values.readAs.json?

> `optional` **json?**: `string`

##### values.readAs.length?

> `optional` **length?**: `string`

##### values.readAs.number?

> `optional` **number?**: `string`

##### values.readAs.string?

> `optional` **string?**: `string`

##### values.readAsLabel?

> `optional` **readAsLabel?**: `string`

Label of the extract panel's "Read as" select, for a part that is JSON or VARIANT.

##### values.retry?

> `optional` **retry?**: `string`

Button that reads the value again after it failed to load.

##### values.rowLabel?

> `optional` **rowLabel?**: `object`

The row a value inspector shows, by its 1-based position in the table
as sorted and filtered (the number a loading row shows): "Row 1,235".

##### values.sizeNode?

> `optional` **sizeNode?**: `string`

The tree's leaf for a map's number of entries.

##### values.tagNode?

> `optional` **tagNode?**: `string`

The tree's leaf for which member a union holds.

##### values.tooLargeToCopy?

> `optional` **tooLargeToCopy?**: `string`

Value inspector status when the value is too long to copy: over 8 MiB of JSON.

##### values.treeLabel?

> `optional` **treeLabel?**: `object`

Accessible name of the value inspector's tree: "Value of tags".

##### values.truncatedNotice?

> `optional` **truncatedNotice?**: `object`

Value inspector status for a value too long to show whole, by the
characters shown and the value's length:
"Showing the first 2,097,152 of 3,000,000 characters".

##### values.typeArray?

> `optional` **typeArray?**: `object`

Spoken type of a fixed-size ARRAY: "array of 768 float".

##### values.typeJson?

> `optional` **typeJson?**: `string`

Spoken name of the JSON type.

##### values.typeList?

> `optional` **typeList?**: `object`

Spoken type of a LIST, given its element's spoken type: "list of
integer". A column header's accessible name ends with it ("tags, list
of integer"); the visible label stays DuckDB's notation (`[integer]`).

##### values.typeMap?

> `optional` **typeMap?**: `object`

Spoken type of a MAP, given its key's and value's: "map from varchar to integer".

##### values.typeStruct?

> `optional` **typeStruct?**: `object`

Spoken type of a STRUCT, by its number of fields: "struct with 3 fields".

##### values.typeUnion?

> `optional` **typeUnion?**: `object`

Spoken type of a UNION, by its number of members: "union of 2 types".

##### values.typeVariant?

> `optional` **typeVariant?**: `string`

Spoken name of the VARIANT type.

***

### persistence?

> `optional` **persistence?**: `boolean` \| \{ `sessionStore?`: [`SessionStore`](../classes/SessionStore.md); \}

Defined in: [DataTable.ts:197](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L197)

Persist UI state (filters, sort, columns, derived columns) to IndexedDB
and auto-restore on next mount. Pass `{ sessionStore }` to reuse an
existing store across tables. Default: `true`.

***

### portalTarget?

> `optional` **portalTarget?**: `HTMLElement`

Defined in: [DataTable.ts:267](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L267)

Where fixed-position modals mount. Default: `document.body`.

***

### prefetch?

> `optional` **prefetch?**: `boolean`

Defined in: [DataTable.ts:342](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L342)

Speculatively fetch one block beyond the viewport in the current
scroll direction while the fetch pipeline is idle. Default: `true`.

The prefetch runs at normal worker priority, so visible-row fetches
always jump ahead of it; a direction change abandons it. Disable it
to keep query volume to the strict minimum (e.g. when the table
shares its DuckDB worker with heavier analytical queries).

***

### presets?

> `optional` **presets?**: `boolean` \| \{ `manager?`: [`FilterPresetManager`](../classes/FilterPresetManager.md); \}

Defined in: [DataTable.ts:203](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L203)

Enable the "Presets" button for saving/loading named filter sets.
Pass `{ manager }` to reuse an existing preset manager. Default: `true`.

***

### rowCacheRows?

> `optional` **rowCacheRows?**: `number`

Defined in: [DataTable.ts:332](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L332)

Maximum rows held in the in-memory row cache. Default: 2048 (rounded
up to whole blocks, floor 4 blocks).

At the default block size that is 16 blocks — a few MB at typical row
widths — enough that scrolling back across ±900 rows repaints
instantly with zero queries. Raise it to make longer back-scrolls
query-free at the cost of memory; it never affects correctness, only
how often previously seen blocks are re-fetched.

***

### rowHeight?

> `optional` **rowHeight?**: `number`

Defined in: [DataTable.ts:301](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L301)

Row height in pixels. Default: 32.

Published as the `--dt-row-height` custom property on the table root, so
the stylesheet lays rows out at exactly the height the virtual scroller
computes with. Set it here rather than overriding that token in CSS: the
scroller's arithmetic runs in JS and cannot read a stylesheet, so a
CSS-only change would move the rows and not the scroller.

***

### source?

> `optional` **source?**: `string` \| `File` \| `Blob` \| `ArrayBuffer`

Defined in: [DataTable.ts:168](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L168)

Optional initial data source. If omitted, call
`table.loadData(source, { tableName, sourceFormat, sourceOptions })` later.

***

### sourceFormat?

> `optional` **sourceFormat?**: [`DataFormat`](../type-aliases/DataFormat.md)

Defined in: [DataTable.ts:174](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L174)

Override the format detected from `source` (e.g., if its URL has no
extension). Applies to `source` only; pass `sourceFormat` to
`table.loadData()` for a later load.

***

### sourceOptions?

> `optional` **sourceOptions?**: [`SourceOptions`](SourceOptions.md)

Defined in: [DataTable.ts:181](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L181)

How `source` is read, per format: a CSV delimiter, header or null
strings, the rows sampled to detect types, the Parquet columns to load,
DuckDB's time zone. See [SourceOptions](SourceOptions.md). Applies to `source`
only; pass `sourceOptions` to `table.loadData()` for a later load.

***

### statsPanelRegistry?

> `optional` **statsPanelRegistry?**: [`StatsPanelRegistry`](../classes/StatsPanelRegistry.md)

Defined in: [DataTable.ts:259](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L259)

Per-instance stats panel registry. Register a [BaseStatsPanel](../../advanced/classes/BaseStatsPanel.md)
subclass to replace the library's built-in two-line stats display in
a column header with your own rendering (custom DuckDB stats, badges,
progress bars, alternate locales). Same per-instance isolation
semantics as `visualizationRegistry`. When omitted, the shared
`defaultStatsPanelRegistry` is used (also empty by default — register
on it to share custom panels across every table without a per-instance
registry). When no registration matches a column's type, the library
falls back to its built-in HTML formatter, so behavior is unchanged
for tables that don't opt in.

***

### strictBrowserCheck?

> `optional` **strictBrowserCheck?**: `boolean`

Defined in: [DataTable.ts:370](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L370)

When `true`, probe for required browser APIs before attempting worker
init. Rejects with [WorkerInitError](../classes/WorkerInitError.md) (`code: 'WORKER_UNSUPPORTED'`,
`details.missing: string[]`) if any probe fails. Default `false`: the
library attempts to init and surfaces real failures later via the `error`
event — fine for most apps. Flip this on when you want to render a
dedicated "unsupported browser" screen instead of a half-mounted table.

***

### tableName?

> `optional` **tableName?**: `string`

Defined in: [DataTable.ts:188](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L188)

Table name used inside DuckDB for `source`, which is also the key its
saved session is stored under. Auto-generated if omitted. Applies to
`source` only: a later `table.loadData()` without its own `tableName`
loads under a generated name, so no saved session is restored.

***

### undoRedo?

> `optional` **undoRedo?**: `boolean`

Defined in: [DataTable.ts:206](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L206)

Enable undo/redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z). Default: `true`.

***

### visualizationRegistry?

> `optional` **visualizationRegistry?**: [`VisualizationRegistry`](../classes/VisualizationRegistry.md)

Defined in: [DataTable.ts:245](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L245)

Per-instance visualization registry. Use this to register custom
visualizations (or override built-ins) without affecting other tables
on the page. When omitted, the shared `defaultVisualizationRegistry`
is used.

***

### visualizations?

> `optional` **visualizations?**: `boolean`

Defined in: [DataTable.ts:237](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/DataTable.ts#L237)

Enable auto-attached column header visualizations (histograms, value counts). Default: `true`.

A column's chart is built when its header scrolls within 200 px of view
and removed once the header is 400 px away, so a wide table runs chart
queries only for the columns near the view. `loadData` waits for the
charts in view to draw.
