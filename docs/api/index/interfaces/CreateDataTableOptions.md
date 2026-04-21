[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / CreateDataTableOptions

# Interface: CreateDataTableOptions

Defined in: [DataTable.ts:124](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L124)

Options accepted by [createDataTable](../functions/createDataTable.md). All feature toggles default
to `true`; pass `false` (or a configuration object) to customize.

## Properties

### bridge?

> `optional` **bridge?**: [`WorkerBridge`](../classes/WorkerBridge.md)

Defined in: [DataTable.ts:175](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L175)

Share a WorkerBridge across tables. If omitted, one is created and owned by this table.

***

### bridgeOptions?

> `optional` **bridgeOptions?**: [`WorkerBridgeOptions`](WorkerBridgeOptions.md)

Defined in: [DataTable.ts:177](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L177)

Options for the owned WorkerBridge (ignored if `bridge` is supplied).

***

### classPrefix?

> `optional` **classPrefix?**: `string`

Defined in: [DataTable.ts:182](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L182)

CSS class prefix. Default: `'dt'`.

***

### colorScheme?

> `optional` **colorScheme?**: [`ColorScheme`](../type-aliases/ColorScheme.md)

Defined in: [DataTable.ts:202](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L202)

Initial light/dark theme selector. Defaults to `'auto'` (follows
`prefers-color-scheme`). Pass `'light'` or `'dark'` to force a theme per
instance, or call [DataTable.setColorScheme](DataTable.md#setcolorscheme) later to switch at
runtime.

***

### container

> **container**: `HTMLElement`

Defined in: [DataTable.ts:126](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L126)

Element that will host the table. The library takes full ownership of its contents.

***

### editorFactory?

> `optional` **editorFactory?**: [`ExpressionEditorFactory`](../type-aliases/ExpressionEditorFactory.md)

Defined in: [DataTable.ts:190](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L190)

Custom expression editor factory (replaces the CodeMirror-based default).

***

### exportDialog?

> `optional` **exportDialog?**: `boolean`

Defined in: [DataTable.ts:168](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L168)

Enable the built-in export dialog (CSV/JSON/Parquet). Default: `true`.

***

### expressionFilter?

> `optional` **expressionFilter?**: `boolean`

Defined in: [DataTable.ts:154](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L154)

Enable the "Expression" (raw SQL) filter button in the filter bar. Default: `true`.

***

### headerHeight?

> `optional` **headerHeight?**: `number`

Defined in: [DataTable.ts:194](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L194)

Header height in pixels. Default: 120.

***

### instanceId?

> `optional` **instanceId?**: `string`

Defined in: [DataTable.ts:188](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L188)

Unique identifier mixed into element IDs so multiple tables on the
same page don't collide on `aria-labelledby` targets. Auto-generated
if omitted. Primarily useful for deterministic test IDs.

***

### messages?

> `optional` **messages?**: `object`

Defined in: [DataTable.ts:212](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L212)

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

##### a11y.hiddenColumnsLabel?

> `optional` **hiddenColumnsLabel?**: `string`

Hidden-columns gutter.

##### a11y.hideButtonLabel?

> `optional` **hideButtonLabel?**: `object`

Header hide button.

##### a11y.hideColumnTitle?

> `optional` **hideColumnTitle?**: `string`

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

##### statistics.allValues?

> `optional` **allValues?**: `object`

##### statistics.filteredRowCount?

> `optional` **filteredRowCount?**: `object`

##### statistics.max?

> `optional` **max?**: `object`

##### statistics.median?

> `optional` **median?**: `object`

##### statistics.min?

> `optional` **min?**: `object`

##### statistics.nullCount?

> `optional` **nullCount?**: `object`

##### statistics.percentTrue?

> `optional` **percentTrue?**: `object`

##### statistics.rowCount?

> `optional` **rowCount?**: `object`

##### statistics.rowWord?

> `optional` **rowWord?**: `object`

##### statistics.separator?

> `optional` **separator?**: `string`

" · " separator used between stats segments.

##### statistics.uniqueCount?

> `optional` **uniqueCount?**: `object`

##### statistics.uniquePercent?

> `optional` **uniquePercent?**: `object`

***

### persistence?

> `optional` **persistence?**: `boolean` \| \{ `sessionStore?`: [`SessionStore`](../classes/SessionStore.md); \}

Defined in: [DataTable.ts:142](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L142)

Persist UI state (filters, sort, columns, derived columns) to IndexedDB
and auto-restore on next mount. Pass `{ sessionStore }` to reuse an
existing store across tables. Default: `true`.

***

### portalTarget?

> `optional` **portalTarget?**: `HTMLElement`

Defined in: [DataTable.ts:173](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L173)

Where fixed-position modals mount. Default: `document.body`.

***

### presets?

> `optional` **presets?**: `boolean` \| \{ `manager?`: [`FilterPresetManager`](../classes/FilterPresetManager.md); \}

Defined in: [DataTable.ts:148](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L148)

Enable the "Presets" button for saving/loading named filter sets.
Pass `{ manager }` to reuse an existing preset manager. Default: `true`.

***

### rowHeight?

> `optional` **rowHeight?**: `number`

Defined in: [DataTable.ts:192](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L192)

Row height in pixels. Default: 32.

***

### source?

> `optional` **source?**: `string` \| `File` \| `Blob` \| `ArrayBuffer`

Defined in: [DataTable.ts:129](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L129)

Optional initial data source. If omitted, call `table.loadData(source)` later.

***

### sourceFormat?

> `optional` **sourceFormat?**: [`DataFormat`](../type-aliases/DataFormat.md)

Defined in: [DataTable.ts:131](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L131)

Override the format detected from the source (e.g., if URL has no extension).

***

### strictBrowserCheck?

> `optional` **strictBrowserCheck?**: `boolean`

Defined in: [DataTable.ts:222](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L222)

When `true`, probe for required browser APIs before attempting worker
init. Rejects with [WorkerInitError](../classes/WorkerInitError.md) (`code: 'WORKER_UNSUPPORTED'`,
`details.missing: string[]`) if any probe fails. Default `false`: the
library attempts to init and surfaces real failures later via the `error`
event — fine for most apps. Flip this on when you want to render a
dedicated "unsupported browser" screen instead of a half-mounted table.

***

### tableName?

> `optional` **tableName?**: `string`

Defined in: [DataTable.ts:133](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L133)

Table name used inside DuckDB. Auto-generated if omitted.

***

### undoRedo?

> `optional` **undoRedo?**: `boolean`

Defined in: [DataTable.ts:151](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L151)

Enable undo/redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z). Default: `true`.

***

### visualizationRegistry?

> `optional` **visualizationRegistry?**: [`VisualizationRegistry`](../classes/VisualizationRegistry.md)

Defined in: [DataTable.ts:165](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L165)

Per-instance visualization registry. Use this to register custom
visualizations (or override built-ins) without affecting other tables
on the page. When omitted, the shared `defaultVisualizationRegistry`
is used.

***

### visualizations?

> `optional` **visualizations?**: `boolean`

Defined in: [DataTable.ts:157](https://github.com/jeyabbalas/data-table/blob/307a596f3fb6b910b08a4368057ff39f0817f309/src/DataTable.ts#L157)

Enable auto-attached column header visualizations (histograms, value counts). Default: `true`.
