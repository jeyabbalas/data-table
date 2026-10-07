[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / mergeStrings

# Function: mergeStrings()

> **mergeStrings**(`base`, `overrides?`): [`Strings`](../interfaces/Strings.md)

Defined in: [core/Strings.ts:1130](https://github.com/jeyabbalas/data-table/blob/4c11c459c61fe9e21644077f7627edd489657f59/src/core/Strings.ts#L1130)

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

\{ `ascending?`: `string`; `cannotHideLastColumn?`: `string`; `columnLayoutCancelled?`: \{ \}; `columnLayoutCommitted?`: \{ \}; `columnLayoutModeEntered?`: \{ \}; `columnMoveBlockedPinned?`: \{ \}; `columnMovedAnnouncement?`: \{ \}; `columnWidthAnnouncement?`: \{ \}; `columnWidthAtMaximum?`: \{ \}; `columnWidthAtMinimum?`: \{ \}; `descending?`: `string`; `dragHandleLabel?`: \{ \}; `dragHandleTitle?`: `string`; `editDerivedColumnLabel?`: `string`; `editDerivedColumnTitle?`: `string`; `filterButtonLabel?`: \{ \}; `filterColumnTitle?`: `string`; `filteredSuffix?`: `string`; `filtersActive?`: \{ \}; `gridLabel?`: `string`; `hiddenColumnsLabel?`: `string`; `hideButtonLabel?`: \{ \}; `hideColumnTitle?`: `string`; `loadingRowLabel?`: \{ \}; `multiFilteredSuffix?`: \{ \}; `noFilters?`: \{ \}; `pinButtonLabel?`: \{ \}; `pinColumnTitle?`: `string`; `resizeHandleLabel?`: `string`; `showColumn?`: \{ \}; `sortAscendingTitle?`: `string`; `sortButtonLabel?`: \{ \}; `sortDescendingTitle?`: `string`; `sortedBy?`: \{ \}; `sortedMultiSuffix?`: \{ \}; `sortedSuffix?`: \{ \}; `sortRemoveTitle?`: `string`; `unpinButtonLabel?`: \{ \}; `unpinColumnTitle?`: `string`; \}

#### a11y.ascending?

`string`

Word used inside `sortedBy` descriptions and header labels.

#### a11y.cannotHideLastColumn?

`string`

#### a11y.columnLayoutCancelled?

\{ \}

Live-region: Escape restored the entry width and position.

#### a11y.columnLayoutCommitted?

\{ \}

Live-region: Enter (or leaving the grid) committed the gesture.

#### a11y.columnLayoutModeEntered?

\{ \}

Column layout mode (`Shift+F2` on a column header) — the keyboard
gesture for resize and reorder. The entry announcement is the only
place the key map is spoken aloud, so it doubles as the mode's
discoverability affordance; keep the key names in a translation.

#### a11y.columnMoveBlockedPinned?

\{ \}

Live-region: a move was refused because the column is pinned.

#### a11y.columnMovedAnnouncement?

\{ \}

Live-region: the column's new 1-based position after a move.

#### a11y.columnWidthAnnouncement?

\{ \}

Live-region: the column's new width after a resize step.

#### a11y.columnWidthAtMaximum?

\{ \}

Live-region: resize step landed on the maximum width.

#### a11y.columnWidthAtMinimum?

\{ \}

Live-region: resize step landed on the minimum width.

#### a11y.descending?

`string`

#### a11y.dragHandleLabel?

\{ \}

Header drag handle.

#### a11y.dragHandleTitle?

`string`

#### a11y.editDerivedColumnLabel?

`string`

Derived-column edit icon.

#### a11y.editDerivedColumnTitle?

`string`

#### a11y.filterButtonLabel?

\{ \}

Header filter button.

#### a11y.filterColumnTitle?

`string`

#### a11y.filteredSuffix?

`string`

#### a11y.filtersActive?

\{ \}

Live-region: "3 filters active, showing 1,234 of 5,678 rows".

#### a11y.gridLabel?

`string`

Accessible name of the grid itself (`aria-label` on `.dt-grid`).

#### a11y.hiddenColumnsLabel?

`string`

Hidden-columns gutter.

#### a11y.hideButtonLabel?

\{ \}

Header hide button.

#### a11y.hideColumnTitle?

`string`

#### a11y.loadingRowLabel?

\{ \}

Placeholder text shown for not-yet-fetched rows during fast scroll.

#### a11y.multiFilteredSuffix?

\{ \}

#### a11y.noFilters?

\{ \}

Live-region: "Showing all 5,678 rows".

#### a11y.pinButtonLabel?

\{ \}

Header pin button.

#### a11y.pinColumnTitle?

`string`

#### a11y.resizeHandleLabel?

`string`

Aria-label on the column-resize handle (`.dt-col-resize-handle`).

#### a11y.showColumn?

\{ \}

#### a11y.sortAscendingTitle?

`string`

#### a11y.sortButtonLabel?

\{ \}

Header sort button.

#### a11y.sortDescendingTitle?

`string`

#### a11y.sortedBy?

\{ \}

Live-region: "sorted by Price ascending, then Name descending".

#### a11y.sortedMultiSuffix?

\{ \}

#### a11y.sortedSuffix?

\{ \}

Column-header aria-label fragments.

#### a11y.sortRemoveTitle?

`string`

#### a11y.unpinButtonLabel?

\{ \}

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

\{ `addButtonLabel?`: `string`; `availableColumnsLabel?`: `string`; `closeEditLabel?`: `string`; `closeLabel?`: `string`; `createButton?`: `string`; `createFailed?`: `string`; `deleteButton?`: `string`; `deleteFailed?`: \{ \}; `editTitle?`: `string`; `editTitleForColumn?`: \{ \}; `expressionLabel?`: `string`; `expressionModeLabel?`: `string`; `expressionPlaceholder?`: `string`; `expressionRequired?`: `string`; `infoLabel?`: `string`; `nameDuplicate?`: \{ \}; `nameLabel?`: `string`; `namePlaceholder?`: `string`; `nameRequired?`: `string`; `nameReserved?`: \{ \}; `newColumnTitle?`: `string`; `typeLabel?`: `string`; `typePreview?`: \{ \}; `updateButton?`: `string`; `updateFailed?`: `string`; `validationFailed?`: `string`; `vectorCountMismatch?`: \{ \}; `vectorInfo?`: \{ \}; `vectorInfoText?`: \{ \}; `vectorInvalidBoolean?`: \{ \}; `vectorInvalidDate?`: \{ \}; `vectorInvalidDecimal?`: \{ \}; `vectorInvalidFloat?`: \{ \}; `vectorInvalidInteger?`: \{ \}; `vectorInvalidInterval?`: \{ \}; `vectorInvalidTime?`: \{ \}; `vectorInvalidTimestamp?`: \{ \}; `vectorInvalidUUID?`: \{ \}; `vectorModeLabel?`: `string`; `vectorPlaceholder?`: `string`; `vectorTypeLabel?`: `string`; `vectorValuesLabel?`: `string`; \}

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

\{ \}

#### derived.editTitle?

`string`

Default panel header before a column is selected.

#### derived.editTitleForColumn?

\{ \}

Panel header with column name — "Edit: my_col".

#### derived.expressionLabel?

`string`

#### derived.expressionModeLabel?

`string`

#### derived.expressionPlaceholder?

`string`

Placeholder text inside the SQL-expression textarea (DefaultExpressionEditor).

#### derived.expressionRequired?

`string`

#### derived.infoLabel?

`string`

"Column info" label shown on the edit panel for vector columns.

#### derived.nameDuplicate?

\{ \}

#### derived.nameLabel?

`string`

#### derived.namePlaceholder?

`string`

#### derived.nameRequired?

`string`

#### derived.nameReserved?

\{ \}

A new column name that spells `__rowid__` in any letter case: the
synthetic row id's name, which no other column may take.

#### derived.newColumnTitle?

`string`

Modal: "New Derived Column".

#### derived.typeLabel?

`string`

#### derived.typePreview?

\{ \}

#### derived.updateButton?

`string`

#### derived.updateFailed?

`string`

#### derived.validationFailed?

`string`

#### derived.vectorCountMismatch?

\{ \}

#### derived.vectorInfo?

\{ \}

#### derived.vectorInfoText?

\{ \}

"Vector column (integer), 123 values"

#### derived.vectorInvalidBoolean?

\{ \}

#### derived.vectorInvalidDate?

\{ \}

#### derived.vectorInvalidDecimal?

\{ \}

#### derived.vectorInvalidFloat?

\{ \}

#### derived.vectorInvalidInteger?

\{ \}

#### derived.vectorInvalidInterval?

\{ \}

#### derived.vectorInvalidTime?

\{ \}

#### derived.vectorInvalidTimestamp?

\{ \}

#### derived.vectorInvalidUUID?

\{ \}

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

\{ `activeFiltersLabel?`: `string`; `applyButton?`: `string`; `ariaLabels?`: \{ `dateFilterMode?`: \{ \}; `endDate?`: \{ \}; `filterMode?`: \{ \}; `filterValue?`: \{ \}; `fromTime?`: \{ \}; `intervalFilter?`: \{ \}; `maxValue?`: \{ \}; `minValue?`: \{ \}; `nullFilter?`: \{ \}; `removeFilter?`: \{ \}; `startDate?`: \{ \}; `toTime?`: \{ \}; `uuidFilterMode?`: \{ \}; `uuidValue?`: \{ \}; \}; `booleanOptions?`: \{ `false?`: `string`; `null?`: `string`; `true?`: `string`; \}; `chipDescriptions?`: \{ `anyValue?`: `string`; `inSet?`: \{ \}; `isNotNull?`: `string`; `isNull?`: `string`; `notInSet?`: \{ \}; `patternModes?`: \{ `contains?`: `string`; `endsWith?`: `string`; `regex?`: `string`; `startsWith?`: `string`; \}; `pointPrefix?`: `string`; `rangeSeparator?`: `string`; `sqlColumn?`: `string`; `valueListMore?`: \{ \}; \}; `clearAllButton?`: `string`; `clearButton?`: `string`; `closePanelLabel?`: `string`; `dateOperators?`: \{ `after?`: `string`; `before?`: `string`; `between?`: `string`; `equals?`: `string`; `onOrAfter?`: `string`; `onOrBefore?`: `string`; \}; `expressionFilterLabel?`: `string`; `expressionFilterTooltip?`: `string`; `labels?`: \{ `from?`: `string`; `to?`: `string`; \}; `nullToggle?`: \{ `any?`: `string`; `isNotNull?`: `string`; `isNull?`: `string`; \}; `numericOperators?`: \{ `between?`: `string`; `equals?`: `string`; `greaterThan?`: `string`; `greaterThanOrEqual?`: `string`; `lessThan?`: `string`; `lessThanOrEqual?`: `string`; `notEquals?`: `string`; \}; `panelTitle?`: `string`; `panelTitleForColumn?`: \{ \}; `placeholders?`: \{ `intervalFilter?`: `string`; `max?`: `string`; `min?`: `string`; `stringFilter?`: `string`; `uuidFilter?`: `string`; `value?`: `string`; \}; `presetsButtonLabel?`: `string`; `presetsButtonTooltip?`: `string`; `sqlFilter?`: \{ `applyButton?`: `string`; `closeLabel?`: `string`; `conditionLabel?`: `string`; `createTitle?`: `string`; `editorPlaceholder?`: `string`; `editTitle?`: `string`; `labelFieldLabel?`: `string`; `labelHint?`: `string`; `labelPlaceholder?`: `string`; `removeButton?`: `string`; `removeConfirmText?`: `string`; `updateButton?`: `string`; `validationResult?`: \{ \}; \}; `stringModes?`: \{ `contains?`: `string`; `endsWith?`: `string`; `exact?`: `string`; `regex?`: `string`; `startsWith?`: `string`; \}; `uuidModes?`: \{ `contains?`: `string`; `exact?`: `string`; \}; `validation?`: \{ `regexInvalid?`: `string`; `regexTooLong?`: `string`; `regexUnsupported?`: `string`; `uuidInvalid?`: `string`; \}; \}

#### filters.activeFiltersLabel?

`string`

Toolbar label on the filter bar itself.

#### filters.applyButton?

`string`

#### filters.ariaLabels?

\{ `dateFilterMode?`: \{ \}; `endDate?`: \{ \}; `filterMode?`: \{ \}; `filterValue?`: \{ \}; `fromTime?`: \{ \}; `intervalFilter?`: \{ \}; `maxValue?`: \{ \}; `minValue?`: \{ \}; `nullFilter?`: \{ \}; `removeFilter?`: \{ \}; `startDate?`: \{ \}; `toTime?`: \{ \}; `uuidFilterMode?`: \{ \}; `uuidValue?`: \{ \}; \}

aria-labels on the filter field controls.

#### filters.ariaLabels.dateFilterMode?

\{ \}

#### filters.ariaLabels.endDate?

\{ \}

#### filters.ariaLabels.filterMode?

\{ \}

#### filters.ariaLabels.filterValue?

\{ \}

#### filters.ariaLabels.fromTime?

\{ \}

#### filters.ariaLabels.intervalFilter?

\{ \}

#### filters.ariaLabels.maxValue?

\{ \}

#### filters.ariaLabels.minValue?

\{ \}

#### filters.ariaLabels.nullFilter?

\{ \}

#### filters.ariaLabels.removeFilter?

\{ \}

#### filters.ariaLabels.startDate?

\{ \}

#### filters.ariaLabels.toTime?

\{ \}

#### filters.ariaLabels.uuidFilterMode?

\{ \}

#### filters.ariaLabels.uuidValue?

\{ \}

#### filters.booleanOptions?

\{ `false?`: `string`; `null?`: `string`; `true?`: `string`; \}

#### filters.booleanOptions.false?

`string`

#### filters.booleanOptions.null?

`string`

#### filters.booleanOptions.true?

`string`

#### filters.chipDescriptions?

\{ `anyValue?`: `string`; `inSet?`: \{ \}; `isNotNull?`: `string`; `isNull?`: `string`; `notInSet?`: \{ \}; `patternModes?`: \{ `contains?`: `string`; `endsWith?`: `string`; `regex?`: `string`; `startsWith?`: `string`; \}; `pointPrefix?`: `string`; `rangeSeparator?`: `string`; `sqlColumn?`: `string`; `valueListMore?`: \{ \}; \}

Strings used by `formatFilter()` for chip descriptions.

#### filters.chipDescriptions.anyValue?

`string`

#### filters.chipDescriptions.inSet?

\{ \}

#### filters.chipDescriptions.isNotNull?

`string`

#### filters.chipDescriptions.isNull?

`string`

#### filters.chipDescriptions.notInSet?

\{ \}

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

\{ \}

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

\{ \}

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

\{ `applyButton?`: `string`; `closeLabel?`: `string`; `conditionLabel?`: `string`; `createTitle?`: `string`; `editorPlaceholder?`: `string`; `editTitle?`: `string`; `labelFieldLabel?`: `string`; `labelHint?`: `string`; `labelPlaceholder?`: `string`; `removeButton?`: `string`; `removeConfirmText?`: `string`; `updateButton?`: `string`; `validationResult?`: \{ \}; \}

SQL (raw WHERE) filter modal.

#### filters.sqlFilter.applyButton?

`string`

#### filters.sqlFilter.closeLabel?

`string`

#### filters.sqlFilter.conditionLabel?

`string`

#### filters.sqlFilter.createTitle?

`string`

#### filters.sqlFilter.editorPlaceholder?

`string`

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

\{ \}

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

\{ `closeLabel?`: `string`; `deleteButton?`: `string`; `deleteConfirmText?`: `string`; `descriptionPlaceholder?`: `string`; `emptyState?`: `string`; `exportButton?`: `string`; `importButton?`: `string`; `importEmpty?`: `string`; `importFailed?`: `string`; `importPartial?`: \{ \}; `importSuccess?`: \{ \}; `loadButton?`: `string`; `meta?`: \{ \}; `namePlaceholder?`: `string`; `saveButton?`: `string`; `title?`: `string`; \}

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

\{ \}

#### presets.importSuccess?

\{ \}

#### presets.loadButton?

`string`

#### presets.meta?

\{ \}

#### presets.namePlaceholder?

`string`

#### presets.saveButton?

`string`

#### presets.title?

`string`

#### statistics?

\{ `allNull?`: `string`; `allUnique?`: `string`; `allUniqueCategory?`: \{ \}; `allValues?`: \{ \}; `binLabel?`: `string`; `categoryLabel?`: `string`; `chartFailed?`: `string`; `filteredRowCount?`: \{ \}; `matchCount?`: \{ \}; `max?`: \{ \}; `median?`: \{ \}; `min?`: \{ \}; `noData?`: `string`; `nonNullCategory?`: `string`; `nullBinLabel?`: `string`; `nullCount?`: \{ \}; `otherCategory?`: \{ \}; `otherSegmentLabel?`: `string`; `percentTrue?`: \{ \}; `rowCount?`: \{ \}; `rowWord?`: \{ \}; `selectedLabel?`: `string`; `selectionRowCount?`: \{ \}; `separator?`: `string`; `uniqueCount?`: \{ \}; `uniquePercent?`: \{ \}; `valueListSuffix?`: \{ \}; \}

#### statistics.allNull?

`string`

#### statistics.allUnique?

`string`

#### statistics.allUniqueCategory?

\{ \}

Display value for the all-unique segment (count = distinct values).

#### statistics.allValues?

\{ \}

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

\{ \}

#### statistics.matchCount?

\{ \}

Rows of a hovered bin/segment passing all active filters, e.g. "300 match".

#### statistics.max?

\{ \}

#### statistics.median?

\{ \}

#### statistics.min?

\{ \}

#### statistics.noData?

`string`

What a column-header chart draws for a column with no values and no
nulls, as an empty table has: "No data".

#### statistics.nonNullCategory?

`string`

Display value for the non-null segment of a nested column's summary
bar in a hover detail line, the counterpart of `nullBinLabel`.

#### statistics.nullBinLabel?

`string`

Display value for the null bin/segment in a selection detail line.

#### statistics.nullCount?

\{ \}

#### statistics.otherCategory?

\{ \}

Display value for the folded "Other" segment (count = folded distinct values).

#### statistics.otherSegmentLabel?

`string`

The label drawn inside the folded "Other" segment of a value-count
bar, where it fits; [otherCategory](#mergestrings) is its hover text.

#### statistics.percentTrue?

\{ \}

#### statistics.rowCount?

\{ \}

#### statistics.rowWord?

\{ \}

#### statistics.selectedLabel?

`string`

Bold label prefix for a multi-category selection detail line.

#### statistics.selectionRowCount?

\{ \}

Selection/hover size, e.g. "4,000 rows (40.0%)" — pct arrives pre-formatted.

#### statistics.separator?

`string`

" · " separator used between stats segments.

#### statistics.uniqueCount?

\{ \}

#### statistics.uniquePercent?

\{ \}

#### statistics.valueListSuffix?

\{ \}

Truncation suffix for a long multi-select value list (total = selected values).

#### values?

\{ `addAsColumn?`: `string`; `addColumn?`: `string`; `adding?`: `string`; `addLengthAsColumn?`: `string`; `addSizeAsColumn?`: `string`; `addTagAsColumn?`: `string`; `bucketLabel?`: \{ \}; `closeLabel?`: `string`; `columnAdded?`: \{ \}; `columnNameLabel?`: `string`; `copied?`: `string`; `copyFailed?`: `string`; `copyJson?`: `string`; `elementNode?`: `string`; `entryCount?`: \{ \}; `expressionLabel?`: `string`; `extractButtonLabel?`: \{ \}; `extractButtonTitle?`: `string`; `extractCloseLabel?`: `string`; `extractFailed?`: \{ \}; `extractTitle?`: \{ \}; `extractTreeLabel?`: \{ \}; `fieldCount?`: \{ \}; `inspectorTitle?`: \{ \}; `itemCount?`: \{ \}; `jsonPathHint?`: `string`; `jsonPathInvalid?`: \{ \}; `jsonPathLabel?`: `string`; `keyCount?`: \{ \}; `keyLabel?`: \{ \}; `keyRequired?`: `string`; `lengthNode?`: `string`; `loadFailed?`: `string`; `loading?`: `string`; `mapValueNode?`: `string`; `moreCharacters?`: \{ \}; `nothingToExtract?`: `string`; `panelLoadFailed?`: `string`; `positionInvalid?`: `string`; `positionLabel?`: \{ \}; `readAs?`: \{ `boolean?`: `string`; `json?`: `string`; `length?`: `string`; `number?`: `string`; `string?`: `string`; \}; `readAsLabel?`: `string`; `retry?`: `string`; `rowLabel?`: \{ \}; `sizeNode?`: `string`; `tagNode?`: `string`; `tooLargeToCopy?`: `string`; `treeLabel?`: \{ \}; `truncatedNotice?`: \{ \}; `typeArray?`: \{ \}; `typeJson?`: `string`; `typeList?`: \{ \}; `typeMap?`: \{ \}; `typeStruct?`: \{ \}; `typeUnion?`: \{ \}; `typeVariant?`: `string`; \}

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

\{ \}

One bucket of a container too big to list at once, by the numbers of
its first and last child (1-based for DuckDB values, 0-based inside
JSON, the same number twice for a bucket of one): "[1 … 100]",
"[10001 … 10001]".

#### values.closeLabel?

`string`

`aria-label` of the value inspector's × button.

#### values.columnAdded?

\{ \}

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

\{ \}

Entries of a map, in the tree: "600 entries".

#### values.expressionLabel?

`string`

Label of the extract panel's preview of the SQL expression the column reads.

#### values.extractButtonLabel?

\{ \}

`aria-label` of a nested or JSON column header's extract button: "Extract from point".

#### values.extractButtonTitle?

`string`

`title` of the header's extract button.

#### values.extractCloseLabel?

`string`

`aria-label` of the extract panel's × button.

#### values.extractFailed?

\{ \}

A column could not be added, with the reason (in English, from the action): "Could not add the column: …".

#### values.extractTitle?

\{ \}

Title of the extract panel, which names it for assistive technology: "Extract from point".

#### values.extractTreeLabel?

\{ \}

Accessible name of the extract panel's tree of the column's type: "Parts of point".

#### values.fieldCount?

\{ \}

Fields of a struct, in the tree: "3 fields".

#### values.inspectorTitle?

\{ \}

Title of the value inspector, the panel that shows one nested or JSON
cell's whole value (F2, a double click, or the cell's inspect icon):
the column and `rowLabel`'s text, "tags · Row 1,235". It also
names the panel for assistive technology.

#### values.itemCount?

\{ \}

Elements of a list, an array or a JSON array, in the tree: "3 items".

#### values.jsonPathHint?

`string`

How to write a JSON path, under the input.

#### values.jsonPathInvalid?

\{ \}

The JSON path does not parse, by the 1-based character where it goes wrong.

#### values.jsonPathLabel?

`string`

Label of the extract panel's JSON path input, for a part that is JSON or VARIANT.

#### values.keyCount?

\{ \}

Keys of a JSON object, in the tree: "2 keys".

#### values.keyLabel?

\{ \}

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

\{ \}

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

\{ \}

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

\{ \}

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

\{ \}

Accessible name of the value inspector's tree: "Value of tags".

#### values.truncatedNotice?

\{ \}

Value inspector status for a value too long to show whole, by the
characters shown and the value's length:
"Showing the first 2,097,152 of 3,000,000 characters".

#### values.typeArray?

\{ \}

Spoken type of a fixed-size ARRAY: "array of 768 float".

#### values.typeJson?

`string`

Spoken name of the JSON type.

#### values.typeList?

\{ \}

Spoken type of a LIST, given its element's spoken type: "list of
integer". A column header's accessible name ends with it ("tags, list
of integer"); the visible label stays DuckDB's notation (`[integer]`).

#### values.typeMap?

\{ \}

Spoken type of a MAP, given its key's and value's: "map from varchar to integer".

#### values.typeStruct?

\{ \}

Spoken type of a STRUCT, by its number of fields: "struct with 3 fields".

#### values.typeUnion?

\{ \}

Spoken type of a UNION, by its number of members: "union of 2 types".

#### values.typeVariant?

`string`

Spoken name of the VARIANT type.

## Returns

[`Strings`](../interfaces/Strings.md)
