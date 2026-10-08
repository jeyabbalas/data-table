[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / mergeStrings

# Function: mergeStrings()

> **mergeStrings**(`base`, `overrides?`): [`Strings`](../interfaces/Strings.md)

Defined in: [core/Strings.ts:1153](https://github.com/jeyabbalas/data-table/blob/08c82220cdd9d07ff4b79f9d23faa8b1188aac71/src/core/Strings.ts#L1153)

Deep-merge `overrides` into a copy of `base`. Missing keys inherit from
`base`; functions in `overrides` replace `base` functions wholesale; nested
objects recurse.

Consumers typically pass `DeepPartial<Strings>` as overrides, but this
helper is type-erased internally because the recursion mirrors runtime
shape rather than the compile-time type.

## Parameters

### base

[`Strings`](../interfaces/Strings.md)

### overrides?

#### a11y?

\{ `ascending?`: `string`; `cannotHideLastColumn?`: `string`; `columnLayoutCancelled?`: (`column`) => `string`; `columnLayoutCommitted?`: (`column`) => `string`; `columnLayoutModeEntered?`: (`column`) => `string`; `columnMoveBlockedPinned?`: (`column`) => `string`; `columnMovedAnnouncement?`: (`column`, `position`, `total`) => `string`; `columnWidthAnnouncement?`: (`column`, `px`) => `string`; `columnWidthAtMaximum?`: (`column`, `px`) => `string`; `columnWidthAtMinimum?`: (`column`, `px`) => `string`; `descending?`: `string`; `dragHandleLabel?`: (`column`) => `string`; `dragHandleTitle?`: `string`; `editDerivedColumnLabel?`: `string`; `editDerivedColumnTitle?`: `string`; `filterButtonLabel?`: (`column`) => `string`; `filterColumnTitle?`: `string`; `filteredSuffix?`: `string`; `filtersActive?`: (`n`, `shown`, `total`) => `string`; `gridLabel?`: `string`; `hiddenColumnsLabel?`: `string`; `hideButtonLabel?`: (`column`) => `string`; `hideColumnTitle?`: `string`; `loadingRowLabel?`: (`rowNumber`) => `string`; `multiFilteredSuffix?`: (`count`) => `string`; `noFilters?`: (`total`) => `string`; `pinButtonLabel?`: (`column`) => `string`; `pinColumnTitle?`: `string`; `resizeHandleLabel?`: `string`; `showColumn?`: (`column`) => `string`; `sortAscendingTitle?`: `string`; `sortButtonLabel?`: (`column`) => `string`; `sortDescendingTitle?`: `string`; `sortedBy?`: (`descriptions`) => `string`; `sortedMultiSuffix?`: (`direction`, `priority`) => `string`; `sortedSuffix?`: (`direction`) => `string`; `sortRemoveTitle?`: `string`; `unpinButtonLabel?`: (`column`) => `string`; `unpinColumnTitle?`: `string`; \}

#### a11y.ascending?

`string`

Word used inside `sortedBy` descriptions and header labels.

#### a11y.cannotHideLastColumn?

`string`

#### a11y.columnLayoutCancelled?

(`column`) => `string`

Live-region: Escape restored the entry width and position.

#### a11y.columnLayoutCommitted?

(`column`) => `string`

Live-region: Enter (or leaving the grid) committed the gesture.

#### a11y.columnLayoutModeEntered?

(`column`) => `string`

Column layout mode (`Shift+F2` on a column header) — the keyboard
gesture for resize and reorder. The entry announcement is the only
place the key map is spoken aloud, so it doubles as the mode's
discoverability affordance; keep the key names in a translation.

#### a11y.columnMoveBlockedPinned?

(`column`) => `string`

Live-region: a move was refused because the column is pinned.

#### a11y.columnMovedAnnouncement?

(`column`, `position`, `total`) => `string`

Live-region: the column's new 1-based position after a move.

#### a11y.columnWidthAnnouncement?

(`column`, `px`) => `string`

Live-region: the column's new width after a resize step.

#### a11y.columnWidthAtMaximum?

(`column`, `px`) => `string`

Live-region: resize step landed on the maximum width.

#### a11y.columnWidthAtMinimum?

(`column`, `px`) => `string`

Live-region: resize step landed on the minimum width.

#### a11y.descending?

`string`

#### a11y.dragHandleLabel?

(`column`) => `string`

Header drag handle.

#### a11y.dragHandleTitle?

`string`

#### a11y.editDerivedColumnLabel?

`string`

Derived-column edit icon.

#### a11y.editDerivedColumnTitle?

`string`

#### a11y.filterButtonLabel?

(`column`) => `string`

Header filter button.

#### a11y.filterColumnTitle?

`string`

#### a11y.filteredSuffix?

`string`

#### a11y.filtersActive?

(`n`, `shown`, `total`) => `string`

Live-region: "3 filters active, showing 1,234 of 5,678 rows".

#### a11y.gridLabel?

`string`

Accessible name of the grid itself (`aria-label` on `.dt-grid`).

#### a11y.hiddenColumnsLabel?

`string`

Hidden-columns gutter.

#### a11y.hideButtonLabel?

(`column`) => `string`

Header hide button.

#### a11y.hideColumnTitle?

`string`

#### a11y.loadingRowLabel?

(`rowNumber`) => `string`

Placeholder text shown for not-yet-fetched rows during fast scroll.

#### a11y.multiFilteredSuffix?

(`count`) => `string`

#### a11y.noFilters?

(`total`) => `string`

Live-region: "Showing all 5,678 rows".

#### a11y.pinButtonLabel?

(`column`) => `string`

Header pin button.

#### a11y.pinColumnTitle?

`string`

#### a11y.resizeHandleLabel?

`string`

Aria-label on the column-resize handle (`.dt-col-resize-handle`).

#### a11y.showColumn?

(`column`) => `string`

#### a11y.sortAscendingTitle?

`string`

#### a11y.sortButtonLabel?

(`column`) => `string`

Header sort button.

#### a11y.sortDescendingTitle?

`string`

#### a11y.sortedBy?

(`descriptions`) => `string`

Live-region: "sorted by Price ascending, then Name descending".

#### a11y.sortedMultiSuffix?

(`direction`, `priority`) => `string`

#### a11y.sortedSuffix?

(`direction`) => `string`

Column-header aria-label fragments.

#### a11y.sortRemoveTitle?

`string`

#### a11y.unpinButtonLabel?

(`column`) => `string`

#### a11y.unpinColumnTitle?

`string`

#### common?

\{ `apply?`: `string`; `cancel?`: `string`; `close?`: `string`; `confirm?`: `string`; `create?`: `string`; `creating?`: `string`; `deleteConfirm?`: `string`; `no?`: `string`; `showAll?`: `string`; `update?`: `string`; `updating?`: `string`; `validate?`: `string`; `validating?`: `string`; `yes?`: `string`; \}

#### common.apply?

`string`

#### common.cancel?

`string`

#### common.close?

`string`

#### common.confirm?

`string`

#### common.create?

`string`

#### common.creating?

`string`

#### common.deleteConfirm?

`string`

#### common.no?

`string`

#### common.showAll?

`string`

#### common.update?

`string`

#### common.updating?

`string`

#### common.validate?

`string`

#### common.validating?

`string`

#### common.yes?

`string`

#### derived?

\{ `addButtonLabel?`: `string`; `availableColumnsLabel?`: `string`; `closeEditLabel?`: `string`; `closeLabel?`: `string`; `createButton?`: `string`; `createFailed?`: `string`; `deleteButton?`: `string`; `deleteFailed?`: (`message`) => `string`; `editTitle?`: `string`; `editTitleForColumn?`: (`column`) => `string`; `expressionLabel?`: `string`; `expressionModeLabel?`: `string`; `expressionPlaceholder?`: `string`; `expressionRequired?`: `string`; `infoLabel?`: `string`; `nameDuplicate?`: (`name`) => `string`; `nameLabel?`: `string`; `namePlaceholder?`: `string`; `nameRequired?`: `string`; `nameReserved?`: (`name`) => `string`; `newColumnTitle?`: `string`; `typeLabel?`: `string`; `typePreview?`: (`type`, `originalType`) => `string`; `updateButton?`: `string`; `updateFailed?`: `string`; `validationFailed?`: `string`; `vectorCountMismatch?`: (`expected`, `got`) => `string`; `vectorInfo?`: (`count`, `total`) => `string`; `vectorInfoText?`: (`vectorType`, `count`) => `string`; `vectorInvalidBoolean?`: (`lineNum`, `value`) => `string`; `vectorInvalidDate?`: (`lineNum`, `value`) => `string`; `vectorInvalidDecimal?`: (`lineNum`, `value`) => `string`; `vectorInvalidFloat?`: (`lineNum`, `value`) => `string`; `vectorInvalidInteger?`: (`lineNum`, `value`) => `string`; `vectorInvalidInterval?`: (`lineNum`) => `string`; `vectorInvalidTime?`: (`lineNum`, `value`) => `string`; `vectorInvalidTimestamp?`: (`lineNum`, `value`) => `string`; `vectorInvalidUUID?`: (`lineNum`, `value`) => `string`; `vectorModeLabel?`: `string`; `vectorPlaceholder?`: `string`; `vectorTypeLabel?`: `string`; `vectorValuesLabel?`: `string`; \}

#### derived.addButtonLabel?

`string`

#### derived.availableColumnsLabel?

`string`

Prefix shown before the comma-separated column-hint list (DefaultExpressionEditor).

#### derived.closeEditLabel?

`string`

#### derived.closeLabel?

`string`

#### derived.createButton?

`string`

#### derived.createFailed?

`string`

#### derived.deleteButton?

`string`

#### derived.deleteFailed?

(`message`) => `string`

#### derived.editTitle?

`string`

Default panel header before a column is selected.

#### derived.editTitleForColumn?

(`column`) => `string`

Panel header with column name — "Edit: my_col".

#### derived.expressionLabel?

`string`

Label above the SQL editor in the add-column dialog and the column
edit panel, and the editor's accessible name.

#### derived.expressionModeLabel?

`string`

#### derived.expressionPlaceholder?

`string`

Placeholder of the SQL editor in the add-column dialog and the column
edit panel, and of `DefaultExpressionEditor`'s textarea.

#### derived.expressionRequired?

`string`

#### derived.infoLabel?

`string`

"Column info" label shown on the edit panel for vector columns.

#### derived.nameDuplicate?

(`name`) => `string`

#### derived.nameLabel?

`string`

#### derived.namePlaceholder?

`string`

#### derived.nameRequired?

`string`

#### derived.nameReserved?

(`name`) => `string`

A new column name that spells `__rowid__` in any letter case: the
synthetic row id's name, which no other column may take.

#### derived.newColumnTitle?

`string`

Modal: "New Derived Column".

#### derived.typeLabel?

`string`

#### derived.typePreview?

(`type`, `originalType`) => `string`

#### derived.updateButton?

`string`

#### derived.updateFailed?

`string`

#### derived.validationFailed?

`string`

#### derived.vectorCountMismatch?

(`expected`, `got`) => `string`

#### derived.vectorInfo?

(`count`, `total`) => `string`

#### derived.vectorInfoText?

(`vectorType`, `count`) => `string`

"Vector column (integer), 123 values"

#### derived.vectorInvalidBoolean?

(`lineNum`, `value`) => `string`

#### derived.vectorInvalidDate?

(`lineNum`, `value`) => `string`

#### derived.vectorInvalidDecimal?

(`lineNum`, `value`) => `string`

#### derived.vectorInvalidFloat?

(`lineNum`, `value`) => `string`

#### derived.vectorInvalidInteger?

(`lineNum`, `value`) => `string`

#### derived.vectorInvalidInterval?

(`lineNum`) => `string`

#### derived.vectorInvalidTime?

(`lineNum`, `value`) => `string`

#### derived.vectorInvalidTimestamp?

(`lineNum`, `value`) => `string`

#### derived.vectorInvalidUUID?

(`lineNum`, `value`) => `string`

#### derived.vectorModeLabel?

`string`

#### derived.vectorPlaceholder?

`string`

#### derived.vectorTypeLabel?

`string`

#### derived.vectorValuesLabel?

`string`

#### errors?

\{ `stylesheetMissing?`: `string`; \}

#### errors.stylesheetMissing?

`string`

#### export?

\{ `cancelButton?`: `string`; `closeLabel?`: `string`; `copiedFeedback?`: `string`; `copyButton?`: `string`; `copyFailedFallback?`: `string`; `csv?`: \{ `delimiterLabel?`: `string`; `delimiters?`: \{ `comma?`: `string`; `pipe?`: `string`; `semicolon?`: `string`; `tab?`: `string`; \}; `headersLabel?`: `string`; `nullValueLabel?`: `string`; `nullValuePlaceholder?`: `string`; \}; `downloadButton?`: `string`; `exportFailedFallback?`: `string`; `formatLabel?`: `string`; `formats?`: \{ `csv?`: `string`; `json?`: `string`; `parquet?`: `string`; \}; `includeSystemColumnsLabel?`: `string`; `json?`: \{ `formatLabel?`: `string`; `formats?`: \{ `array?`: `string`; `ndjson?`: `string`; \}; `prettyLabel?`: `string`; \}; `scopeLabel?`: `string`; `scopes?`: \{ `all?`: `string`; `filtered?`: `string`; `selected?`: `string`; \}; `title?`: `string`; \}

#### export.cancelButton?

`string`

#### export.closeLabel?

`string`

#### export.copiedFeedback?

`string`

#### export.copyButton?

`string`

#### export.copyFailedFallback?

`string`

#### export.csv?

\{ `delimiterLabel?`: `string`; `delimiters?`: \{ `comma?`: `string`; `pipe?`: `string`; `semicolon?`: `string`; `tab?`: `string`; \}; `headersLabel?`: `string`; `nullValueLabel?`: `string`; `nullValuePlaceholder?`: `string`; \}

#### export.csv.delimiterLabel?

`string`

#### export.csv.delimiters?

\{ `comma?`: `string`; `pipe?`: `string`; `semicolon?`: `string`; `tab?`: `string`; \}

#### export.csv.delimiters.comma?

`string`

#### export.csv.delimiters.pipe?

`string`

#### export.csv.delimiters.semicolon?

`string`

#### export.csv.delimiters.tab?

`string`

#### export.csv.headersLabel?

`string`

#### export.csv.nullValueLabel?

`string`

#### export.csv.nullValuePlaceholder?

`string`

#### export.downloadButton?

`string`

#### export.exportFailedFallback?

`string`

#### export.formatLabel?

`string`

#### export.formats?

\{ `csv?`: `string`; `json?`: `string`; `parquet?`: `string`; \}

#### export.formats.csv?

`string`

#### export.formats.json?

`string`

#### export.formats.parquet?

`string`

#### export.includeSystemColumnsLabel?

`string`

Label on the "include system columns (e.g. __rowid__)" checkbox.

#### export.json?

\{ `formatLabel?`: `string`; `formats?`: \{ `array?`: `string`; `ndjson?`: `string`; \}; `prettyLabel?`: `string`; \}

#### export.json.formatLabel?

`string`

#### export.json.formats?

\{ `array?`: `string`; `ndjson?`: `string`; \}

#### export.json.formats.array?

`string`

#### export.json.formats.ndjson?

`string`

#### export.json.prettyLabel?

`string`

#### export.scopeLabel?

`string`

#### export.scopes?

\{ `all?`: `string`; `filtered?`: `string`; `selected?`: `string`; \}

#### export.scopes.all?

`string`

#### export.scopes.filtered?

`string`

#### export.scopes.selected?

`string`

#### export.title?

`string`

#### filters?

\{ `activeFiltersLabel?`: `string`; `applyButton?`: `string`; `ariaLabels?`: \{ `dateFilterMode?`: (`column`) => `string`; `endDate?`: (`column`) => `string`; `filterMode?`: (`column`) => `string`; `filterValue?`: (`column`) => `string`; `fromTime?`: (`column`) => `string`; `intervalFilter?`: (`column`) => `string`; `maxValue?`: (`column`) => `string`; `minValue?`: (`column`) => `string`; `nullFilter?`: (`column`) => `string`; `removeFilter?`: (`column`) => `string`; `startDate?`: (`column`) => `string`; `toTime?`: (`column`) => `string`; `uuidFilterMode?`: (`column`) => `string`; `uuidValue?`: (`column`) => `string`; \}; `booleanOptions?`: \{ `false?`: `string`; `null?`: `string`; `true?`: `string`; \}; `chipDescriptions?`: \{ `anyValue?`: `string`; `inSet?`: (`list`, `includeNull`) => `string`; `isNotNull?`: `string`; `isNull?`: `string`; `notInSet?`: (`list`, `includeNull`) => `string`; `patternModes?`: \{ `contains?`: `string`; `endsWith?`: `string`; `regex?`: `string`; `startsWith?`: `string`; \}; `pointPrefix?`: `string`; `rangeSeparator?`: `string`; `sqlColumn?`: `string`; `valueListMore?`: (`rest`) => `string`; \}; `clearAllButton?`: `string`; `clearButton?`: `string`; `closePanelLabel?`: `string`; `dateOperators?`: \{ `after?`: `string`; `before?`: `string`; `between?`: `string`; `equals?`: `string`; `onOrAfter?`: `string`; `onOrBefore?`: `string`; \}; `expressionFilterLabel?`: `string`; `expressionFilterTooltip?`: `string`; `labels?`: \{ `from?`: `string`; `to?`: `string`; \}; `nullToggle?`: \{ `any?`: `string`; `isNotNull?`: `string`; `isNull?`: `string`; \}; `numericOperators?`: \{ `between?`: `string`; `equals?`: `string`; `greaterThan?`: `string`; `greaterThanOrEqual?`: `string`; `lessThan?`: `string`; `lessThanOrEqual?`: `string`; `notEquals?`: `string`; \}; `panelTitle?`: `string`; `panelTitleForColumn?`: (`column`) => `string`; `placeholders?`: \{ `intervalFilter?`: `string`; `max?`: `string`; `min?`: `string`; `stringFilter?`: `string`; `uuidFilter?`: `string`; `value?`: `string`; \}; `presetsButtonLabel?`: `string`; `presetsButtonTooltip?`: `string`; `sqlFilter?`: \{ `applyButton?`: `string`; `closeLabel?`: `string`; `conditionLabel?`: `string`; `createTitle?`: `string`; `editorPlaceholder?`: `string`; `editTitle?`: `string`; `labelFieldLabel?`: `string`; `labelHint?`: `string`; `labelPlaceholder?`: `string`; `removeButton?`: `string`; `removeConfirmText?`: `string`; `updateButton?`: `string`; `validationResult?`: (`matchCount`) => `string`; \}; `stringModes?`: \{ `contains?`: `string`; `endsWith?`: `string`; `exact?`: `string`; `regex?`: `string`; `startsWith?`: `string`; \}; `uuidModes?`: \{ `contains?`: `string`; `exact?`: `string`; \}; `validation?`: \{ `regexInvalid?`: `string`; `regexTooLong?`: `string`; `regexUnsupported?`: `string`; `uuidInvalid?`: `string`; \}; \}

#### filters.activeFiltersLabel?

`string`

Toolbar label on the filter bar itself.

#### filters.applyButton?

`string`

#### filters.ariaLabels?

\{ `dateFilterMode?`: (`column`) => `string`; `endDate?`: (`column`) => `string`; `filterMode?`: (`column`) => `string`; `filterValue?`: (`column`) => `string`; `fromTime?`: (`column`) => `string`; `intervalFilter?`: (`column`) => `string`; `maxValue?`: (`column`) => `string`; `minValue?`: (`column`) => `string`; `nullFilter?`: (`column`) => `string`; `removeFilter?`: (`column`) => `string`; `startDate?`: (`column`) => `string`; `toTime?`: (`column`) => `string`; `uuidFilterMode?`: (`column`) => `string`; `uuidValue?`: (`column`) => `string`; \}

aria-labels on the filter field controls.

#### filters.ariaLabels.dateFilterMode?

(`column`) => `string`

#### filters.ariaLabels.endDate?

(`column`) => `string`

#### filters.ariaLabels.filterMode?

(`column`) => `string`

#### filters.ariaLabels.filterValue?

(`column`) => `string`

#### filters.ariaLabels.fromTime?

(`column`) => `string`

#### filters.ariaLabels.intervalFilter?

(`column`) => `string`

#### filters.ariaLabels.maxValue?

(`column`) => `string`

#### filters.ariaLabels.minValue?

(`column`) => `string`

#### filters.ariaLabels.nullFilter?

(`column`) => `string`

#### filters.ariaLabels.removeFilter?

(`column`) => `string`

#### filters.ariaLabels.startDate?

(`column`) => `string`

#### filters.ariaLabels.toTime?

(`column`) => `string`

#### filters.ariaLabels.uuidFilterMode?

(`column`) => `string`

#### filters.ariaLabels.uuidValue?

(`column`) => `string`

#### filters.booleanOptions?

\{ `false?`: `string`; `null?`: `string`; `true?`: `string`; \}

#### filters.booleanOptions.false?

`string`

#### filters.booleanOptions.null?

`string`

#### filters.booleanOptions.true?

`string`

#### filters.chipDescriptions?

\{ `anyValue?`: `string`; `inSet?`: (`list`, `includeNull`) => `string`; `isNotNull?`: `string`; `isNull?`: `string`; `notInSet?`: (`list`, `includeNull`) => `string`; `patternModes?`: \{ `contains?`: `string`; `endsWith?`: `string`; `regex?`: `string`; `startsWith?`: `string`; \}; `pointPrefix?`: `string`; `rangeSeparator?`: `string`; `sqlColumn?`: `string`; `valueListMore?`: (`rest`) => `string`; \}

Strings used by `formatFilter()` for chip descriptions.

#### filters.chipDescriptions.anyValue?

`string`

#### filters.chipDescriptions.inSet?

(`list`, `includeNull`) => `string`

#### filters.chipDescriptions.isNotNull?

`string`

#### filters.chipDescriptions.isNull?

`string`

#### filters.chipDescriptions.notInSet?

(`list`, `includeNull`) => `string`

#### filters.chipDescriptions.patternModes?

\{ `contains?`: `string`; `endsWith?`: `string`; `regex?`: `string`; `startsWith?`: `string`; \}

#### filters.chipDescriptions.patternModes.contains?

`string`

#### filters.chipDescriptions.patternModes.endsWith?

`string`

#### filters.chipDescriptions.patternModes.regex?

`string`

#### filters.chipDescriptions.patternModes.startsWith?

`string`

#### filters.chipDescriptions.pointPrefix?

`string`

#### filters.chipDescriptions.rangeSeparator?

`string`

#### filters.chipDescriptions.sqlColumn?

`string`

Column label shown on raw-sql chips.

#### filters.chipDescriptions.valueListMore?

(`rest`) => `string`

#### filters.clearAllButton?

`string`

#### filters.clearButton?

`string`

#### filters.closePanelLabel?

`string`

aria-label for the "×" close on the filter panel.

#### filters.dateOperators?

\{ `after?`: `string`; `before?`: `string`; `between?`: `string`; `equals?`: `string`; `onOrAfter?`: `string`; `onOrBefore?`: `string`; \}

#### filters.dateOperators.after?

`string`

#### filters.dateOperators.before?

`string`

#### filters.dateOperators.between?

`string`

#### filters.dateOperators.equals?

`string`

#### filters.dateOperators.onOrAfter?

`string`

#### filters.dateOperators.onOrBefore?

`string`

#### filters.expressionFilterLabel?

`string`

"Expression" button label in the filter bar.

#### filters.expressionFilterTooltip?

`string`

Tooltip/title on the expression button.

#### filters.labels?

\{ `from?`: `string`; `to?`: `string`; \}

#### filters.labels.from?

`string`

#### filters.labels.to?

`string`

#### filters.nullToggle?

\{ `any?`: `string`; `isNotNull?`: `string`; `isNull?`: `string`; \}

#### filters.nullToggle.any?

`string`

#### filters.nullToggle.isNotNull?

`string`

#### filters.nullToggle.isNull?

`string`

#### filters.numericOperators?

\{ `between?`: `string`; `equals?`: `string`; `greaterThan?`: `string`; `greaterThanOrEqual?`: `string`; `lessThan?`: `string`; `lessThanOrEqual?`: `string`; `notEquals?`: `string`; \}

Dropdown text for numeric/date filter modes.

#### filters.numericOperators.between?

`string`

#### filters.numericOperators.equals?

`string`

#### filters.numericOperators.greaterThan?

`string`

#### filters.numericOperators.greaterThanOrEqual?

`string`

#### filters.numericOperators.lessThan?

`string`

#### filters.numericOperators.lessThanOrEqual?

`string`

#### filters.numericOperators.notEquals?

`string`

#### filters.panelTitle?

`string`

#### filters.panelTitleForColumn?

(`column`) => `string`

Header text once a column has been selected: e.g. "Filter: price".

#### filters.placeholders?

\{ `intervalFilter?`: `string`; `max?`: `string`; `min?`: `string`; `stringFilter?`: `string`; `uuidFilter?`: `string`; `value?`: `string`; \}

#### filters.placeholders.intervalFilter?

`string`

#### filters.placeholders.max?

`string`

#### filters.placeholders.min?

`string`

#### filters.placeholders.stringFilter?

`string`

#### filters.placeholders.uuidFilter?

`string`

#### filters.placeholders.value?

`string`

#### filters.presetsButtonLabel?

`string`

"Presets" button label in the filter bar.

#### filters.presetsButtonTooltip?

`string`

Tooltip/title on the presets button.

#### filters.sqlFilter?

\{ `applyButton?`: `string`; `closeLabel?`: `string`; `conditionLabel?`: `string`; `createTitle?`: `string`; `editorPlaceholder?`: `string`; `editTitle?`: `string`; `labelFieldLabel?`: `string`; `labelHint?`: `string`; `labelPlaceholder?`: `string`; `removeButton?`: `string`; `removeConfirmText?`: `string`; `updateButton?`: `string`; `validationResult?`: (`matchCount`) => `string`; \}

SQL (raw WHERE) filter modal.

#### filters.sqlFilter.applyButton?

`string`

#### filters.sqlFilter.closeLabel?

`string`

#### filters.sqlFilter.conditionLabel?

`string`

Label above the expression filter's SQL editor, and the editor's accessible name.

#### filters.sqlFilter.createTitle?

`string`

#### filters.sqlFilter.editorPlaceholder?

`string`

Placeholder of the expression filter's SQL editor.

#### filters.sqlFilter.editTitle?

`string`

#### filters.sqlFilter.labelFieldLabel?

`string`

#### filters.sqlFilter.labelHint?

`string`

#### filters.sqlFilter.labelPlaceholder?

`string`

#### filters.sqlFilter.removeButton?

`string`

#### filters.sqlFilter.removeConfirmText?

`string`

#### filters.sqlFilter.updateButton?

`string`

#### filters.sqlFilter.validationResult?

(`matchCount`) => `string`

#### filters.stringModes?

\{ `contains?`: `string`; `endsWith?`: `string`; `exact?`: `string`; `regex?`: `string`; `startsWith?`: `string`; \}

#### filters.stringModes.contains?

`string`

#### filters.stringModes.endsWith?

`string`

#### filters.stringModes.exact?

`string`

#### filters.stringModes.regex?

`string`

#### filters.stringModes.startsWith?

`string`

#### filters.uuidModes?

\{ `contains?`: `string`; `exact?`: `string`; \}

#### filters.uuidModes.contains?

`string`

#### filters.uuidModes.exact?

`string`

#### filters.validation?

\{ `regexInvalid?`: `string`; `regexTooLong?`: `string`; `regexUnsupported?`: `string`; `uuidInvalid?`: `string`; \}

Inline regex/UUID validation messages.

#### filters.validation.regexInvalid?

`string`

#### filters.validation.regexTooLong?

`string`

#### filters.validation.regexUnsupported?

`string`

#### filters.validation.uuidInvalid?

`string`

#### presets?

\{ `closeLabel?`: `string`; `deleteButton?`: `string`; `deleteConfirmText?`: `string`; `descriptionPlaceholder?`: `string`; `emptyState?`: `string`; `exportButton?`: `string`; `importButton?`: `string`; `importEmpty?`: `string`; `importFailed?`: `string`; `importPartial?`: (`imported`, `errors`) => `string`; `importSuccess?`: (`count`) => `string`; `loadButton?`: `string`; `meta?`: (`filterCount`, `dateStr`) => `string`; `namePlaceholder?`: `string`; `saveButton?`: `string`; `title?`: `string`; \}

#### presets.closeLabel?

`string`

#### presets.deleteButton?

`string`

#### presets.deleteConfirmText?

`string`

#### presets.descriptionPlaceholder?

`string`

#### presets.emptyState?

`string`

#### presets.exportButton?

`string`

#### presets.importButton?

`string`

#### presets.importEmpty?

`string`

#### presets.importFailed?

`string`

#### presets.importPartial?

(`imported`, `errors`) => `string`

#### presets.importSuccess?

(`count`) => `string`

#### presets.loadButton?

`string`

#### presets.meta?

(`filterCount`, `dateStr`) => `string`

#### presets.namePlaceholder?

`string`

#### presets.saveButton?

`string`

#### presets.title?

`string`

#### statistics?

\{ `allNull?`: `string`; `allUnique?`: `string`; `allUniqueCategory?`: (`count`) => `string`; `allValues?`: (`value`) => `string`; `binLabel?`: `string`; `categoryLabel?`: `string`; `chartFailed?`: `string`; `filteredRowCount?`: (`filtered`, `total`) => `string`; `matchCount?`: (`count`) => `string`; `max?`: (`value`) => `string`; `median?`: (`value`) => `string`; `min?`: (`value`) => `string`; `noData?`: `string`; `nonFiniteCount?`: (`count`) => `string`; `nonNullCategory?`: `string`; `nullBinLabel?`: `string`; `nullCount?`: (`count`) => `string`; `otherCategory?`: (`count`) => `string`; `otherSegmentLabel?`: `string`; `percentTrue?`: (`pct`) => `string`; `rowCount?`: (`count`) => `string`; `rowWord?`: (`count`) => `string`; `selectedLabel?`: `string`; `selectionRowCount?`: (`count`, `pct`) => `string`; `separator?`: `string`; `uniqueCount?`: (`count`) => `string`; `uniquePercent?`: (`count`, `pct`) => `string`; `valueListSuffix?`: (`total`) => `string`; \}

#### statistics.allNull?

`string`

#### statistics.allUnique?

`string`

#### statistics.allUniqueCategory?

(`count`) => `string`

Display value for the all-unique segment (count = distinct values).

#### statistics.allValues?

(`value`) => `string`

#### statistics.binLabel?

`string`

Bold label prefix for a histogram bin/brush selection detail line.

#### statistics.categoryLabel?

`string`

Bold label prefix for a single selected category detail line.

#### statistics.chartFailed?

`string`

Stats-slot line for a column whose chart's data failed to load.

#### statistics.filteredRowCount?

(`filtered`, `total`) => `string`

#### statistics.matchCount?

(`count`) => `string`

Rows of a hovered bin/segment passing all active filters, e.g. "300 match".

#### statistics.max?

(`value`) => `string`

#### statistics.median?

(`value`) => `string`

#### statistics.min?

(`value`) => `string`

#### statistics.noData?

`string`

What a column-header chart draws for a column with no values and no
nulls, as an empty table has: "No data".

#### statistics.nonFiniteCount?

(`count`) => `string`

The end of line 2 for a column holding values its chart leaves out,
having no place on its axis: a numeric column's `NaN`, `Infinity` and
`-Infinity`, and a date column's `infinity`, `-infinity` and dates a
JavaScript `Date` cannot hold. "30 non-finite".

#### statistics.nonNullCategory?

`string`

Display value for the non-null segment of a nested column's summary
bar in a hover detail line, the counterpart of `nullBinLabel`.

#### statistics.nullBinLabel?

`string`

Display value for the null bin/segment in a selection detail line.

#### statistics.nullCount?

(`count`) => `string`

#### statistics.otherCategory?

(`count`) => `string`

Display value for the folded "Other" segment (count = folded distinct values).

#### statistics.otherSegmentLabel?

`string`

The label drawn inside the folded "Other" segment of a value-count
bar, where it fits; `otherCategory` is its hover text.

#### statistics.percentTrue?

(`pct`) => `string`

#### statistics.rowCount?

(`count`) => `string`

#### statistics.rowWord?

(`count`) => `string`

#### statistics.selectedLabel?

`string`

Bold label prefix for a multi-category selection detail line.

#### statistics.selectionRowCount?

(`count`, `pct`) => `string`

Selection/hover size, e.g. "4,000 rows (40.0%)" — pct arrives pre-formatted.

#### statistics.separator?

`string`

" · " separator used between stats segments.

#### statistics.uniqueCount?

(`count`) => `string`

#### statistics.uniquePercent?

(`count`, `pct`) => `string`

#### statistics.valueListSuffix?

(`total`) => `string`

Truncation suffix for a long multi-select value list (total = selected values).

#### values?

\{ `addAsColumn?`: `string`; `addColumn?`: `string`; `adding?`: `string`; `addLengthAsColumn?`: `string`; `addSizeAsColumn?`: `string`; `addTagAsColumn?`: `string`; `bucketLabel?`: (`first`, `last`) => `string`; `closeLabel?`: `string`; `columnAdded?`: (`column`) => `string`; `columnNameLabel?`: `string`; `copied?`: `string`; `copyFailed?`: `string`; `copyJson?`: `string`; `elementNode?`: `string`; `entryCount?`: (`count`) => `string`; `expressionLabel?`: `string`; `extractButtonLabel?`: (`column`) => `string`; `extractButtonTitle?`: `string`; `extractCloseLabel?`: `string`; `extractFailed?`: (`error`) => `string`; `extractTitle?`: (`column`) => `string`; `extractTreeLabel?`: (`column`) => `string`; `fieldCount?`: (`count`) => `string`; `inspectorTitle?`: (`column`, `rowLabel`) => `string`; `itemCount?`: (`count`) => `string`; `jsonPathHint?`: `string`; `jsonPathInvalid?`: (`character`) => `string`; `jsonPathLabel?`: `string`; `keyCount?`: (`count`) => `string`; `keyLabel?`: (`container`) => `string`; `keyRequired?`: `string`; `lengthNode?`: `string`; `loadFailed?`: `string`; `loading?`: `string`; `mapValueNode?`: `string`; `moreCharacters?`: (`count`) => `string`; `nothingToExtract?`: `string`; `panelLoadFailed?`: `string`; `positionInvalid?`: `string`; `positionLabel?`: (`container`) => `string`; `readAs?`: \{ `boolean?`: `string`; `json?`: `string`; `length?`: `string`; `number?`: `string`; `string?`: `string`; \}; `readAsLabel?`: `string`; `retry?`: `string`; `rowLabel?`: (`row`) => `string`; `sizeNode?`: `string`; `tagNode?`: `string`; `tooLargeToCopy?`: `string`; `treeLabel?`: (`column`) => `string`; `truncatedNotice?`: (`shownChars`, `totalChars`) => `string`; `typeArray?`: (`element`, `size`) => `string`; `typeJson?`: `string`; `typeList?`: (`element`) => `string`; `typeMap?`: (`key`, `value`) => `string`; `typeStruct?`: (`fieldCount`) => `string`; `typeUnion?`: (`memberCount`) => `string`; `typeVariant?`: `string`; \}

#### values.addAsColumn?

`string`

Value inspector button that adds the active node's value as a column
("extract field → column"); also the `title` of the "+" a row shows
under the pointer.

#### values.addColumn?

`string`

The extract panel's submit button.

#### values.adding?

`string`

Status while a column is being added (the value inspector, the extract panel's button).

#### values.addLengthAsColumn?

`string`

Value inspector button that adds a list's, an array's or a JSON array's length as a column.

#### values.addSizeAsColumn?

`string`

Value inspector button that adds a map's number of entries as a column.

#### values.addTagAsColumn?

`string`

Value inspector button that adds which member a union holds as a column.

#### values.bucketLabel?

(`first`, `last`) => `string`

One bucket of a container too big to list at once, by the numbers of
its first and last child (1-based for DuckDB values, 0-based inside
JSON, the same number twice for a bucket of one): "[1 … 100]",
"[10001 … 10001]".

#### values.closeLabel?

`string`

`aria-label` of the value inspector's × button.

#### values.columnAdded?

(`column`) => `string`

Live-region text once a column has been added: "Column point_x added".

#### values.columnNameLabel?

`string`

Label of the extract panel's input for the new column's name.

#### values.copied?

`string`

Value inspector status after a copy (Copy JSON, or Ctrl/Cmd+C on a node).

#### values.copyFailed?

`string`

Value inspector status when the clipboard refused the copy.

#### values.copyJson?

`string`

Value inspector button that copies the whole value as JSON.

#### values.elementNode?

`string`

The tree's node for a list's or an array's elements, read at a position.

#### values.entryCount?

(`count`) => `string`

Entries of a map, in the tree: "600 entries".

#### values.expressionLabel?

`string`

Label of the extract panel's preview of the SQL expression the column reads.

#### values.extractButtonLabel?

(`column`) => `string`

`aria-label` of a nested or JSON column header's extract button: "Extract from point".

#### values.extractButtonTitle?

`string`

`title` of the header's extract button.

#### values.extractCloseLabel?

`string`

`aria-label` of the extract panel's × button.

#### values.extractFailed?

(`error`) => `string`

A column could not be added, with the reason (in English, from the action): "Could not add the column: …".

#### values.extractTitle?

(`column`) => `string`

Title of the extract panel, which names it for assistive technology: "Extract from point".

#### values.extractTreeLabel?

(`column`) => `string`

Accessible name of the extract panel's tree of the column's type: "Parts of point".

#### values.fieldCount?

(`count`) => `string`

Fields of a struct, in the tree: "3 fields".

#### values.inspectorTitle?

(`column`, `rowLabel`) => `string`

Title of the value inspector, the panel that shows one nested or JSON
cell's whole value (F2, a double click, or the cell's inspect icon):
the column and `rowLabel`'s text, "tags · Row 1,235". It also
names the panel for assistive technology.

#### values.itemCount?

(`count`) => `string`

Elements of a list, an array or a JSON array, in the tree: "3 items".

#### values.jsonPathHint?

`string`

How to write a JSON path, under the input.

#### values.jsonPathInvalid?

(`character`) => `string`

The JSON path does not parse, by the 1-based character where it goes wrong.

#### values.jsonPathLabel?

`string`

Label of the extract panel's JSON path input, for a part that is JSON or VARIANT.

#### values.keyCount?

(`count`) => `string`

Keys of a JSON object, in the tree: "2 keys".

#### values.keyLabel?

(`container`) => `string`

Label of the input for a map value's key, by the map: "Key in attrs".

#### values.keyRequired?

`string`

The key input is empty.

#### values.lengthNode?

`string`

The tree's leaf for a list's or an array's number of elements.

#### values.loadFailed?

`string`

Value inspector status when the value could not be read.

#### values.loading?

`string`

Value inspector status while the value loads, shown after 150 ms.

#### values.mapValueNode?

`string`

The tree's node for a map's values, read by key.

#### values.moreCharacters?

(`count`) => `string`

After text the tree cut short, by the characters left out: "18,000 more characters".

#### values.nothingToExtract?

`string`

The extract panel's text when the column's type could not be read, so has no parts.

#### values.panelLoadFailed?

`string`

Live-region text when the value inspector or the extract panel, which
load on first use, could not be downloaded.

#### values.positionInvalid?

`string`

The position input holds something other than a whole number from 1 up.

#### values.positionLabel?

(`container`) => `string`

Label of the input for an element's 1-based position, by the list or
array it is in: "Position in people". A list inside a list is named
after the outer one's element: "Position in matrix › element".

#### values.readAs?

\{ `boolean?`: `string`; `json?`: `string`; `length?`: `string`; `number?`: `string`; `string?`: `string`; \}

The "Read as" choices: a value inside JSON or VARIANT as text, a
number, a boolean or JSON, or the length of the array there.

#### values.readAs.boolean?

`string`

#### values.readAs.json?

`string`

#### values.readAs.length?

`string`

#### values.readAs.number?

`string`

#### values.readAs.string?

`string`

#### values.readAsLabel?

`string`

Label of the extract panel's "Read as" select, for a part that is JSON or VARIANT.

#### values.retry?

`string`

Button that reads the value again after it failed to load.

#### values.rowLabel?

(`row`) => `string`

The row a value inspector shows, by its 1-based position in the table
as sorted and filtered (the number a loading row shows): "Row 1,235".

#### values.sizeNode?

`string`

The tree's leaf for a map's number of entries.

#### values.tagNode?

`string`

The tree's leaf for which member a union holds.

#### values.tooLargeToCopy?

`string`

Value inspector status when the value is too long to copy: over 8 MiB of JSON.

#### values.treeLabel?

(`column`) => `string`

Accessible name of the value inspector's tree: "Value of tags".

#### values.truncatedNotice?

(`shownChars`, `totalChars`) => `string`

Value inspector status for a value too long to show whole, by the
characters shown and the value's length:
"Showing the first 2,097,152 of 3,000,000 characters".

#### values.typeArray?

(`element`, `size`) => `string`

Spoken type of a fixed-size ARRAY: "array of 768 float".

#### values.typeJson?

`string`

Spoken name of the JSON type.

#### values.typeList?

(`element`) => `string`

Spoken type of a LIST, given its element's spoken type: "list of
integer". A column header's accessible name ends with it ("tags, list
of integer"); the visible label stays DuckDB's notation (`[integer]`).

#### values.typeMap?

(`key`, `value`) => `string`

Spoken type of a MAP, given its key's and value's: "map from varchar to integer".

#### values.typeStruct?

(`fieldCount`) => `string`

Spoken type of a STRUCT, by its number of fields: "struct with 3 fields".

#### values.typeUnion?

(`memberCount`) => `string`

Spoken type of a UNION, by its number of members: "union of 2 types".

#### values.typeVariant?

`string`

Spoken name of the VARIANT type.

## Returns

[`Strings`](../interfaces/Strings.md)
