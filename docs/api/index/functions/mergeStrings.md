[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / mergeStrings

# Function: mergeStrings()

> **mergeStrings**(`base`, `overrides?`): [`Strings`](../interfaces/Strings.md)

Defined in: [core/Strings.ts:799](https://github.com/jeyabbalas/data-table/blob/96b7f96026f039095bbc0aa0297473860140213d/src/core/Strings.ts#L799)

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

\{ `ascending?`: `string`; `cannotHideLastColumn?`: `string`; `descending?`: `string`; `dragHandleLabel?`: \{ \}; `dragHandleTitle?`: `string`; `editDerivedColumnLabel?`: `string`; `editDerivedColumnTitle?`: `string`; `filterButtonLabel?`: \{ \}; `filterColumnTitle?`: `string`; `filteredSuffix?`: `string`; `filtersActive?`: \{ \}; `hiddenColumnsLabel?`: `string`; `hideButtonLabel?`: \{ \}; `hideColumnTitle?`: `string`; `loadingRowLabel?`: \{ \}; `multiFilteredSuffix?`: \{ \}; `noFilters?`: \{ \}; `pinButtonLabel?`: \{ \}; `pinColumnTitle?`: `string`; `resizeHandleLabel?`: `string`; `showColumn?`: \{ \}; `sortAscendingTitle?`: `string`; `sortButtonLabel?`: \{ \}; `sortDescendingTitle?`: `string`; `sortedBy?`: \{ \}; `sortedMultiSuffix?`: \{ \}; `sortedSuffix?`: \{ \}; `sortRemoveTitle?`: `string`; `unpinButtonLabel?`: \{ \}; `unpinColumnTitle?`: `string`; \}

#### a11y.ascending?

`string`

Word used inside `sortedBy` descriptions and header labels.

#### a11y.cannotHideLastColumn?

`string`

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

\{ `addButtonLabel?`: `string`; `availableColumnsLabel?`: `string`; `closeEditLabel?`: `string`; `closeLabel?`: `string`; `createButton?`: `string`; `createFailed?`: `string`; `deleteButton?`: `string`; `deleteFailed?`: \{ \}; `editTitle?`: `string`; `editTitleForColumn?`: \{ \}; `expressionLabel?`: `string`; `expressionModeLabel?`: `string`; `expressionPlaceholder?`: `string`; `expressionRequired?`: `string`; `infoLabel?`: `string`; `nameDuplicate?`: \{ \}; `nameLabel?`: `string`; `namePlaceholder?`: `string`; `nameRequired?`: `string`; `newColumnTitle?`: `string`; `typeLabel?`: `string`; `typePreview?`: \{ \}; `updateButton?`: `string`; `updateFailed?`: `string`; `validationFailed?`: `string`; `vectorCountMismatch?`: \{ \}; `vectorInfo?`: \{ \}; `vectorInfoText?`: \{ \}; `vectorInvalidBoolean?`: \{ \}; `vectorInvalidDate?`: \{ \}; `vectorInvalidDecimal?`: \{ \}; `vectorInvalidFloat?`: \{ \}; `vectorInvalidInteger?`: \{ \}; `vectorInvalidInterval?`: \{ \}; `vectorInvalidTime?`: \{ \}; `vectorInvalidTimestamp?`: \{ \}; `vectorInvalidUUID?`: \{ \}; `vectorModeLabel?`: `string`; `vectorPlaceholder?`: `string`; `vectorTypeLabel?`: `string`; `vectorValuesLabel?`: `string`; \}

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

\{ `allNull?`: `string`; `allUnique?`: `string`; `allValues?`: \{ \}; `filteredRowCount?`: \{ \}; `max?`: \{ \}; `median?`: \{ \}; `min?`: \{ \}; `nullCount?`: \{ \}; `percentTrue?`: \{ \}; `rowCount?`: \{ \}; `rowWord?`: \{ \}; `separator?`: `string`; `uniqueCount?`: \{ \}; `uniquePercent?`: \{ \}; \}

#### statistics.allNull?

`string`

#### statistics.allUnique?

`string`

#### statistics.allValues?

\{ \}

#### statistics.filteredRowCount?

\{ \}

#### statistics.max?

\{ \}

#### statistics.median?

\{ \}

#### statistics.min?

\{ \}

#### statistics.nullCount?

\{ \}

#### statistics.percentTrue?

\{ \}

#### statistics.rowCount?

\{ \}

#### statistics.rowWord?

\{ \}

#### statistics.separator?

`string`

" · " separator used between stats segments.

#### statistics.uniqueCount?

\{ \}

#### statistics.uniquePercent?

\{ \}

## Returns

[`Strings`](../interfaces/Strings.md)
