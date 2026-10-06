[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / Strings

# Interface: Strings

Defined in: [core/Strings.ts:33](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/Strings.ts#L33)

Typed shape of every user-facing string the library renders. Pass a
`messages: DeepPartial<Strings>` override to [createDataTable](../functions/createDataTable.md) to
localize button labels, placeholder text, ARIA announcements, and stats
templates; missing leaves fall back to the English values in
[defaultStrings](../variables/defaultStrings.md). Function-typed leaves take runtime arguments
directly so locale grammar stays inside the consumer's translation.

## Properties

### a11y

> **a11y**: `object`

Defined in: [core/Strings.ts:337](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/Strings.ts#L337)

#### ascending

> **ascending**: `string`

Word used inside `sortedBy` descriptions and header labels.

#### cannotHideLastColumn

> **cannotHideLastColumn**: `string`

#### columnLayoutCancelled

> **columnLayoutCancelled**: (`column`) => `string`

Live-region: Escape restored the entry width and position.

##### Parameters

###### column

`string`

##### Returns

`string`

#### columnLayoutCommitted

> **columnLayoutCommitted**: (`column`) => `string`

Live-region: Enter (or leaving the grid) committed the gesture.

##### Parameters

###### column

`string`

##### Returns

`string`

#### columnLayoutModeEntered

> **columnLayoutModeEntered**: (`column`) => `string`

Column layout mode (`Shift+F2` on a column header) — the keyboard
gesture for resize and reorder. The entry announcement is the only
place the key map is spoken aloud, so it doubles as the mode's
discoverability affordance; keep the key names in a translation.

##### Parameters

###### column

`string`

##### Returns

`string`

#### columnMoveBlockedPinned

> **columnMoveBlockedPinned**: (`column`) => `string`

Live-region: a move was refused because the column is pinned.

##### Parameters

###### column

`string`

##### Returns

`string`

#### columnMovedAnnouncement

> **columnMovedAnnouncement**: (`column`, `position`, `total`) => `string`

Live-region: the column's new 1-based position after a move.

##### Parameters

###### column

`string`

###### position

`number`

###### total

`number`

##### Returns

`string`

#### columnWidthAnnouncement

> **columnWidthAnnouncement**: (`column`, `px`) => `string`

Live-region: the column's new width after a resize step.

##### Parameters

###### column

`string`

###### px

`number`

##### Returns

`string`

#### columnWidthAtMaximum

> **columnWidthAtMaximum**: (`column`, `px`) => `string`

Live-region: resize step landed on the maximum width.

##### Parameters

###### column

`string`

###### px

`number`

##### Returns

`string`

#### columnWidthAtMinimum

> **columnWidthAtMinimum**: (`column`, `px`) => `string`

Live-region: resize step landed on the minimum width.

##### Parameters

###### column

`string`

###### px

`number`

##### Returns

`string`

#### descending

> **descending**: `string`

#### dragHandleLabel

> **dragHandleLabel**: (`column`) => `string`

Header drag handle.

##### Parameters

###### column

`string`

##### Returns

`string`

#### dragHandleTitle

> **dragHandleTitle**: `string`

#### editDerivedColumnLabel

> **editDerivedColumnLabel**: `string`

Derived-column edit icon.

#### editDerivedColumnTitle

> **editDerivedColumnTitle**: `string`

#### filterButtonLabel

> **filterButtonLabel**: (`column`) => `string`

Header filter button.

##### Parameters

###### column

`string`

##### Returns

`string`

#### filterColumnTitle

> **filterColumnTitle**: `string`

#### filteredSuffix

> **filteredSuffix**: `string`

#### filtersActive

> **filtersActive**: (`n`, `shown`, `total`) => `string`

Live-region: "3 filters active, showing 1,234 of 5,678 rows".

##### Parameters

###### n

`number`

###### shown

`number`

###### total

`number`

##### Returns

`string`

#### gridLabel

> **gridLabel**: `string`

Accessible name of the grid itself (`aria-label` on `.dt-grid`).

#### hiddenColumnsLabel

> **hiddenColumnsLabel**: `string`

Hidden-columns gutter.

#### hideButtonLabel

> **hideButtonLabel**: (`column`) => `string`

Header hide button.

##### Parameters

###### column

`string`

##### Returns

`string`

#### hideColumnTitle

> **hideColumnTitle**: `string`

#### loadingRowLabel

> **loadingRowLabel**: (`rowNumber`) => `string`

Placeholder text shown for not-yet-fetched rows during fast scroll.

##### Parameters

###### rowNumber

`number`

##### Returns

`string`

#### multiFilteredSuffix

> **multiFilteredSuffix**: (`count`) => `string`

##### Parameters

###### count

`number`

##### Returns

`string`

#### noFilters

> **noFilters**: (`total`) => `string`

Live-region: "Showing all 5,678 rows".

##### Parameters

###### total

`number`

##### Returns

`string`

#### pinButtonLabel

> **pinButtonLabel**: (`column`) => `string`

Header pin button.

##### Parameters

###### column

`string`

##### Returns

`string`

#### pinColumnTitle

> **pinColumnTitle**: `string`

#### resizeHandleLabel

> **resizeHandleLabel**: `string`

Aria-label on the column-resize handle (`.dt-col-resize-handle`).

#### showColumn

> **showColumn**: (`column`) => `string`

##### Parameters

###### column

`string`

##### Returns

`string`

#### sortAscendingTitle

> **sortAscendingTitle**: `string`

#### sortButtonLabel

> **sortButtonLabel**: (`column`) => `string`

Header sort button.

##### Parameters

###### column

`string`

##### Returns

`string`

#### sortDescendingTitle

> **sortDescendingTitle**: `string`

#### sortedBy

> **sortedBy**: (`descriptions`) => `string`

Live-region: "sorted by Price ascending, then Name descending".

##### Parameters

###### descriptions

`string`[]

##### Returns

`string`

#### sortedMultiSuffix

> **sortedMultiSuffix**: (`direction`, `priority`) => `string`

##### Parameters

###### direction

`string`

###### priority

`number`

##### Returns

`string`

#### sortedSuffix

> **sortedSuffix**: (`direction`) => `string`

Column-header aria-label fragments.

##### Parameters

###### direction

`string`

##### Returns

`string`

#### sortRemoveTitle

> **sortRemoveTitle**: `string`

#### unpinButtonLabel

> **unpinButtonLabel**: (`column`) => `string`

##### Parameters

###### column

`string`

##### Returns

`string`

#### unpinColumnTitle

> **unpinColumnTitle**: `string`

***

### common

> **common**: `object`

Defined in: [core/Strings.ts:37](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/Strings.ts#L37)

#### apply

> **apply**: `string`

#### cancel

> **cancel**: `string`

#### close

> **close**: `string`

#### confirm

> **confirm**: `string`

#### create

> **create**: `string`

#### creating

> **creating**: `string`

#### deleteConfirm

> **deleteConfirm**: `string`

#### no

> **no**: `string`

#### showAll

> **showAll**: `string`

#### update

> **update**: `string`

#### updating

> **updating**: `string`

#### validate

> **validate**: `string`

#### validating

> **validating**: `string`

#### yes

> **yes**: `string`

***

### derived

> **derived**: `object`

Defined in: [core/Strings.ts:276](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/Strings.ts#L276)

#### addButtonLabel

> **addButtonLabel**: `string`

#### availableColumnsLabel

> **availableColumnsLabel**: `string`

Prefix shown before the comma-separated column-hint list (DefaultExpressionEditor).

#### closeEditLabel

> **closeEditLabel**: `string`

#### closeLabel

> **closeLabel**: `string`

#### createButton

> **createButton**: `string`

#### createFailed

> **createFailed**: `string`

#### deleteButton

> **deleteButton**: `string`

#### deleteFailed

> **deleteFailed**: (`message`) => `string`

##### Parameters

###### message

`string`

##### Returns

`string`

#### editTitle

> **editTitle**: `string`

Default panel header before a column is selected.

#### editTitleForColumn

> **editTitleForColumn**: (`column`) => `string`

Panel header with column name — "Edit: my_col".

##### Parameters

###### column

`string`

##### Returns

`string`

#### expressionLabel

> **expressionLabel**: `string`

#### expressionModeLabel

> **expressionModeLabel**: `string`

#### expressionPlaceholder

> **expressionPlaceholder**: `string`

Placeholder text inside the SQL-expression textarea (DefaultExpressionEditor).

#### expressionRequired

> **expressionRequired**: `string`

#### infoLabel

> **infoLabel**: `string`

"Column info" label shown on the edit panel for vector columns.

#### nameDuplicate

> **nameDuplicate**: (`name`) => `string`

##### Parameters

###### name

`string`

##### Returns

`string`

#### nameLabel

> **nameLabel**: `string`

#### namePlaceholder

> **namePlaceholder**: `string`

#### nameRequired

> **nameRequired**: `string`

#### newColumnTitle

> **newColumnTitle**: `string`

Modal: "New Derived Column".

#### typeLabel

> **typeLabel**: `string`

#### typePreview

> **typePreview**: (`type`, `originalType`) => `string`

##### Parameters

###### type

`string`

###### originalType

`string`

##### Returns

`string`

#### updateButton

> **updateButton**: `string`

#### updateFailed

> **updateFailed**: `string`

#### validationFailed

> **validationFailed**: `string`

#### vectorCountMismatch

> **vectorCountMismatch**: (`expected`, `got`) => `string`

##### Parameters

###### expected

`number`

###### got

`number`

##### Returns

`string`

#### vectorInfo

> **vectorInfo**: (`count`, `total`) => `string`

##### Parameters

###### count

`number`

###### total

`number`

##### Returns

`string`

#### vectorInfoText

> **vectorInfoText**: (`vectorType`, `count`) => `string`

"Vector column (integer), 123 values"

##### Parameters

###### vectorType

`string`

###### count

`number`

##### Returns

`string`

#### vectorInvalidBoolean

> **vectorInvalidBoolean**: (`lineNum`, `value`) => `string`

##### Parameters

###### lineNum

`number`

###### value

`string`

##### Returns

`string`

#### vectorInvalidDate

> **vectorInvalidDate**: (`lineNum`, `value`) => `string`

##### Parameters

###### lineNum

`number`

###### value

`string`

##### Returns

`string`

#### vectorInvalidDecimal

> **vectorInvalidDecimal**: (`lineNum`, `value`) => `string`

##### Parameters

###### lineNum

`number`

###### value

`string`

##### Returns

`string`

#### vectorInvalidFloat

> **vectorInvalidFloat**: (`lineNum`, `value`) => `string`

##### Parameters

###### lineNum

`number`

###### value

`string`

##### Returns

`string`

#### vectorInvalidInteger

> **vectorInvalidInteger**: (`lineNum`, `value`) => `string`

##### Parameters

###### lineNum

`number`

###### value

`string`

##### Returns

`string`

#### vectorInvalidInterval

> **vectorInvalidInterval**: (`lineNum`) => `string`

##### Parameters

###### lineNum

`number`

##### Returns

`string`

#### vectorInvalidTime

> **vectorInvalidTime**: (`lineNum`, `value`) => `string`

##### Parameters

###### lineNum

`number`

###### value

`string`

##### Returns

`string`

#### vectorInvalidTimestamp

> **vectorInvalidTimestamp**: (`lineNum`, `value`) => `string`

##### Parameters

###### lineNum

`number`

###### value

`string`

##### Returns

`string`

#### vectorInvalidUUID

> **vectorInvalidUUID**: (`lineNum`, `value`) => `string`

##### Parameters

###### lineNum

`number`

###### value

`string`

##### Returns

`string`

#### vectorModeLabel

> **vectorModeLabel**: `string`

#### vectorPlaceholder

> **vectorPlaceholder**: `string`

#### vectorTypeLabel

> **vectorTypeLabel**: `string`

#### vectorValuesLabel

> **vectorValuesLabel**: `string`

***

### errors

> **errors**: `object`

Defined in: [core/Strings.ts:634](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/Strings.ts#L634)

#### stylesheetMissing

> **stylesheetMissing**: `string`

***

### export

> **export**: `object`

Defined in: [core/Strings.ts:223](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/Strings.ts#L223)

#### cancelButton

> **cancelButton**: `string`

#### closeLabel

> **closeLabel**: `string`

#### copiedFeedback

> **copiedFeedback**: `string`

#### copyButton

> **copyButton**: `string`

#### copyFailedFallback

> **copyFailedFallback**: `string`

#### csv

> **csv**: `object`

##### csv.delimiterLabel

> **delimiterLabel**: `string`

##### csv.delimiters

> **delimiters**: `object`

##### csv.delimiters.comma

> **comma**: `string`

##### csv.delimiters.pipe

> **pipe**: `string`

##### csv.delimiters.semicolon

> **semicolon**: `string`

##### csv.delimiters.tab

> **tab**: `string`

##### csv.headersLabel

> **headersLabel**: `string`

##### csv.nullValueLabel

> **nullValueLabel**: `string`

##### csv.nullValuePlaceholder

> **nullValuePlaceholder**: `string`

#### downloadButton

> **downloadButton**: `string`

#### exportFailedFallback

> **exportFailedFallback**: `string`

#### formatLabel

> **formatLabel**: `string`

#### formats

> **formats**: `object`

##### formats.csv

> **csv**: `string`

##### formats.json

> **json**: `string`

##### formats.parquet

> **parquet**: `string`

#### includeSystemColumnsLabel

> **includeSystemColumnsLabel**: `string`

Label on the "include system columns (e.g. __rowid__)" checkbox.

#### json

> **json**: `object`

##### json.formatLabel

> **formatLabel**: `string`

##### json.formats

> **formats**: `object`

##### json.formats.array

> **array**: `string`

##### json.formats.ndjson

> **ndjson**: `string`

##### json.prettyLabel

> **prettyLabel**: `string`

#### scopeLabel

> **scopeLabel**: `string`

#### scopes

> **scopes**: `object`

##### scopes.all

> **all**: `string`

##### scopes.filtered

> **filtered**: `string`

##### scopes.selected

> **selected**: `string`

#### title

> **title**: `string`

***

### filters

> **filters**: `object`

Defined in: [core/Strings.ts:57](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/Strings.ts#L57)

#### activeFiltersLabel

> **activeFiltersLabel**: `string`

Toolbar label on the filter bar itself.

#### applyButton

> **applyButton**: `string`

#### ariaLabels

> **ariaLabels**: `object`

aria-labels on the filter field controls.

##### ariaLabels.dateFilterMode

> **dateFilterMode**: (`column`) => `string`

###### Parameters

###### column

`string`

###### Returns

`string`

##### ariaLabels.endDate

> **endDate**: (`column`) => `string`

###### Parameters

###### column

`string`

###### Returns

`string`

##### ariaLabels.filterMode

> **filterMode**: (`column`) => `string`

###### Parameters

###### column

`string`

###### Returns

`string`

##### ariaLabels.filterValue

> **filterValue**: (`column`) => `string`

###### Parameters

###### column

`string`

###### Returns

`string`

##### ariaLabels.fromTime

> **fromTime**: (`column`) => `string`

###### Parameters

###### column

`string`

###### Returns

`string`

##### ariaLabels.intervalFilter

> **intervalFilter**: (`column`) => `string`

###### Parameters

###### column

`string`

###### Returns

`string`

##### ariaLabels.maxValue

> **maxValue**: (`column`) => `string`

###### Parameters

###### column

`string`

###### Returns

`string`

##### ariaLabels.minValue

> **minValue**: (`column`) => `string`

###### Parameters

###### column

`string`

###### Returns

`string`

##### ariaLabels.nullFilter

> **nullFilter**: (`column`) => `string`

###### Parameters

###### column

`string`

###### Returns

`string`

##### ariaLabels.removeFilter

> **removeFilter**: (`column`) => `string`

###### Parameters

###### column

`string`

###### Returns

`string`

##### ariaLabels.startDate

> **startDate**: (`column`) => `string`

###### Parameters

###### column

`string`

###### Returns

`string`

##### ariaLabels.toTime

> **toTime**: (`column`) => `string`

###### Parameters

###### column

`string`

###### Returns

`string`

##### ariaLabels.uuidFilterMode

> **uuidFilterMode**: (`column`) => `string`

###### Parameters

###### column

`string`

###### Returns

`string`

##### ariaLabels.uuidValue

> **uuidValue**: (`column`) => `string`

###### Parameters

###### column

`string`

###### Returns

`string`

#### booleanOptions

> **booleanOptions**: `object`

##### booleanOptions.false

> **false**: `string`

##### booleanOptions.null

> **null**: `string`

##### booleanOptions.true

> **true**: `string`

#### chipDescriptions

> **chipDescriptions**: `object`

Strings used by `formatFilter()` for chip descriptions.

##### chipDescriptions.anyValue

> **anyValue**: `string`

##### chipDescriptions.inSet

> **inSet**: (`list`, `includeNull`) => `string`

###### Parameters

###### list

`string`

###### includeNull

`boolean`

###### Returns

`string`

##### chipDescriptions.isNotNull

> **isNotNull**: `string`

##### chipDescriptions.isNull

> **isNull**: `string`

##### chipDescriptions.notInSet

> **notInSet**: (`list`, `includeNull`) => `string`

###### Parameters

###### list

`string`

###### includeNull

`boolean`

###### Returns

`string`

##### chipDescriptions.patternModes

> **patternModes**: `object`

##### chipDescriptions.patternModes.contains

> **contains**: `string`

##### chipDescriptions.patternModes.endsWith

> **endsWith**: `string`

##### chipDescriptions.patternModes.regex

> **regex**: `string`

##### chipDescriptions.patternModes.startsWith

> **startsWith**: `string`

##### chipDescriptions.pointPrefix

> **pointPrefix**: `string`

##### chipDescriptions.rangeSeparator

> **rangeSeparator**: `string`

##### chipDescriptions.sqlColumn

> **sqlColumn**: `string`

Column label shown on raw-sql chips.

##### chipDescriptions.valueListMore

> **valueListMore**: (`rest`) => `string`

###### Parameters

###### rest

`number`

###### Returns

`string`

#### clearAllButton

> **clearAllButton**: `string`

#### clearButton

> **clearButton**: `string`

#### closePanelLabel

> **closePanelLabel**: `string`

aria-label for the "×" close on the filter panel.

#### dateOperators

> **dateOperators**: `object`

##### dateOperators.after

> **after**: `string`

##### dateOperators.before

> **before**: `string`

##### dateOperators.between

> **between**: `string`

##### dateOperators.equals

> **equals**: `string`

##### dateOperators.onOrAfter

> **onOrAfter**: `string`

##### dateOperators.onOrBefore

> **onOrBefore**: `string`

#### expressionFilterLabel

> **expressionFilterLabel**: `string`

"Expression" button label in the filter bar.

#### expressionFilterTooltip

> **expressionFilterTooltip**: `string`

Tooltip/title on the expression button.

#### labels

> **labels**: `object`

##### labels.from

> **from**: `string`

##### labels.to

> **to**: `string`

#### nullToggle

> **nullToggle**: `object`

##### nullToggle.any

> **any**: `string`

##### nullToggle.isNotNull

> **isNotNull**: `string`

##### nullToggle.isNull

> **isNull**: `string`

#### numericOperators

> **numericOperators**: `object`

Dropdown text for numeric/date filter modes.

##### numericOperators.between

> **between**: `string`

##### numericOperators.equals

> **equals**: `string`

##### numericOperators.greaterThan

> **greaterThan**: `string`

##### numericOperators.greaterThanOrEqual

> **greaterThanOrEqual**: `string`

##### numericOperators.lessThan

> **lessThan**: `string`

##### numericOperators.lessThanOrEqual

> **lessThanOrEqual**: `string`

##### numericOperators.notEquals

> **notEquals**: `string`

#### panelTitle

> **panelTitle**: `string`

#### panelTitleForColumn

> **panelTitleForColumn**: (`column`) => `string`

Header text once a column has been selected: e.g. "Filter: price".

##### Parameters

###### column

`string`

##### Returns

`string`

#### placeholders

> **placeholders**: `object`

##### placeholders.intervalFilter

> **intervalFilter**: `string`

##### placeholders.max

> **max**: `string`

##### placeholders.min

> **min**: `string`

##### placeholders.stringFilter

> **stringFilter**: `string`

##### placeholders.uuidFilter

> **uuidFilter**: `string`

##### placeholders.value

> **value**: `string`

#### presetsButtonLabel

> **presetsButtonLabel**: `string`

"Presets" button label in the filter bar.

#### presetsButtonTooltip

> **presetsButtonTooltip**: `string`

Tooltip/title on the presets button.

#### sqlFilter

> **sqlFilter**: `object`

SQL (raw WHERE) filter modal.

##### sqlFilter.applyButton

> **applyButton**: `string`

##### sqlFilter.closeLabel

> **closeLabel**: `string`

##### sqlFilter.conditionLabel

> **conditionLabel**: `string`

##### sqlFilter.createTitle

> **createTitle**: `string`

##### sqlFilter.editorPlaceholder

> **editorPlaceholder**: `string`

##### sqlFilter.editTitle

> **editTitle**: `string`

##### sqlFilter.labelFieldLabel

> **labelFieldLabel**: `string`

##### sqlFilter.labelHint

> **labelHint**: `string`

##### sqlFilter.labelPlaceholder

> **labelPlaceholder**: `string`

##### sqlFilter.removeButton

> **removeButton**: `string`

##### sqlFilter.removeConfirmText

> **removeConfirmText**: `string`

##### sqlFilter.updateButton

> **updateButton**: `string`

##### sqlFilter.validationResult

> **validationResult**: (`matchCount`) => `string`

###### Parameters

###### matchCount

`number`

###### Returns

`string`

#### stringModes

> **stringModes**: `object`

##### stringModes.contains

> **contains**: `string`

##### stringModes.endsWith

> **endsWith**: `string`

##### stringModes.exact

> **exact**: `string`

##### stringModes.regex

> **regex**: `string`

##### stringModes.startsWith

> **startsWith**: `string`

#### uuidModes

> **uuidModes**: `object`

##### uuidModes.contains

> **contains**: `string`

##### uuidModes.exact

> **exact**: `string`

#### validation

> **validation**: `object`

Inline regex/UUID validation messages.

##### validation.regexInvalid

> **regexInvalid**: `string`

##### validation.regexTooLong

> **regexTooLong**: `string`

##### validation.regexUnsupported

> **regexUnsupported**: `string`

##### validation.uuidInvalid

> **uuidInvalid**: `string`

***

### presets

> **presets**: `object`

Defined in: [core/Strings.ts:201](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/Strings.ts#L201)

#### closeLabel

> **closeLabel**: `string`

#### deleteButton

> **deleteButton**: `string`

#### deleteConfirmText

> **deleteConfirmText**: `string`

#### descriptionPlaceholder

> **descriptionPlaceholder**: `string`

#### emptyState

> **emptyState**: `string`

#### exportButton

> **exportButton**: `string`

#### importButton

> **importButton**: `string`

#### importEmpty

> **importEmpty**: `string`

#### importFailed

> **importFailed**: `string`

#### importPartial

> **importPartial**: (`imported`, `errors`) => `string`

##### Parameters

###### imported

`number`

###### errors

`number`

##### Returns

`string`

#### importSuccess

> **importSuccess**: (`count`) => `string`

##### Parameters

###### count

`number`

##### Returns

`string`

#### loadButton

> **loadButton**: `string`

#### meta

> **meta**: (`filterCount`, `dateStr`) => `string`

##### Parameters

###### filterCount

`number`

###### dateStr

`string`

##### Returns

`string`

#### namePlaceholder

> **namePlaceholder**: `string`

#### saveButton

> **saveButton**: `string`

#### title

> **title**: `string`

***

### statistics

> **statistics**: `object`

Defined in: [core/Strings.ts:421](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/Strings.ts#L421)

#### allNull

> **allNull**: `string`

#### allUnique

> **allUnique**: `string`

#### allUniqueCategory

> **allUniqueCategory**: (`count`) => `string`

Display value for the all-unique segment (count = distinct values).

##### Parameters

###### count

`number`

##### Returns

`string`

#### allValues

> **allValues**: (`value`) => `string`

##### Parameters

###### value

`string`

##### Returns

`string`

#### binLabel

> **binLabel**: `string`

Bold label prefix for a histogram bin/brush selection detail line.

#### categoryLabel

> **categoryLabel**: `string`

Bold label prefix for a single selected category detail line.

#### chartFailed

> **chartFailed**: `string`

Stats-slot line for a column whose chart's data failed to load.

#### filteredRowCount

> **filteredRowCount**: (`filtered`, `total`) => `string`

##### Parameters

###### filtered

`number`

###### total

`number`

##### Returns

`string`

#### matchCount

> **matchCount**: (`count`) => `string`

Rows of a hovered bin/segment passing all active filters, e.g. "300 match".

##### Parameters

###### count

`number`

##### Returns

`string`

#### max

> **max**: (`value`) => `string`

##### Parameters

###### value

`string`

##### Returns

`string`

#### median

> **median**: (`value`) => `string`

##### Parameters

###### value

`string`

##### Returns

`string`

#### min

> **min**: (`value`) => `string`

##### Parameters

###### value

`string`

##### Returns

`string`

#### noData

> **noData**: `string`

What a column-header chart draws for a column with no values and no
nulls, as an empty table has: "No data".

#### nonNullCategory

> **nonNullCategory**: `string`

Display value for the non-null segment of a nested column's summary
bar in a hover detail line, the counterpart of `nullBinLabel`.

#### nullBinLabel

> **nullBinLabel**: `string`

Display value for the null bin/segment in a selection detail line.

#### nullCount

> **nullCount**: (`count`) => `string`

##### Parameters

###### count

`number`

##### Returns

`string`

#### otherCategory

> **otherCategory**: (`count`) => `string`

Display value for the folded "Other" segment (count = folded distinct values).

##### Parameters

###### count

`number`

##### Returns

`string`

#### percentTrue

> **percentTrue**: (`pct`) => `string`

##### Parameters

###### pct

`number`

##### Returns

`string`

#### rowCount

> **rowCount**: (`count`) => `string`

##### Parameters

###### count

`number`

##### Returns

`string`

#### rowWord

> **rowWord**: (`count`) => `string`

##### Parameters

###### count

`number`

##### Returns

`string`

#### selectedLabel

> **selectedLabel**: `string`

Bold label prefix for a multi-category selection detail line.

#### selectionRowCount

> **selectionRowCount**: (`count`, `pct`) => `string`

Selection/hover size, e.g. "4,000 rows (40.0%)" — pct arrives pre-formatted.

##### Parameters

###### count

`number`

###### pct

`string`

##### Returns

`string`

#### separator

> **separator**: `string`

" · " separator used between stats segments.

#### uniqueCount

> **uniqueCount**: (`count`) => `string`

##### Parameters

###### count

`number`

##### Returns

`string`

#### uniquePercent

> **uniquePercent**: (`count`, `pct`) => `string`

##### Parameters

###### count

`number`

###### pct

`number`

##### Returns

`string`

#### valueListSuffix

> **valueListSuffix**: (`total`) => `string`

Truncation suffix for a long multi-select value list (total = selected values).

##### Parameters

###### total

`number`

##### Returns

`string`

***

### values

> **values**: `object`

Defined in: [core/Strings.ts:472](https://github.com/jeyabbalas/data-table/blob/2c94035bd17377b3e3f4a2a87d56c65d6781551c/src/core/Strings.ts#L472)

#### addAsColumn

> **addAsColumn**: `string`

Value inspector button that adds the active node's value as a column
("extract field → column"); also the `title` of the "+" a row shows
under the pointer.

#### addColumn

> **addColumn**: `string`

The extract panel's submit button.

#### adding

> **adding**: `string`

Status while a column is being added (the value inspector, the extract panel's button).

#### addLengthAsColumn

> **addLengthAsColumn**: `string`

Value inspector button that adds a list's, an array's or a JSON array's length as a column.

#### addSizeAsColumn

> **addSizeAsColumn**: `string`

Value inspector button that adds a map's number of entries as a column.

#### addTagAsColumn

> **addTagAsColumn**: `string`

Value inspector button that adds which member a union holds as a column.

#### bucketLabel

> **bucketLabel**: (`first`, `last`) => `string`

One bucket of a container too big to list at once, by the numbers of
its first and last child (1-based for DuckDB values, 0-based inside
JSON, the same number twice for a bucket of one): "[1 … 100]",
"[10001 … 10001]".

##### Parameters

###### first

`number`

###### last

`number`

##### Returns

`string`

#### closeLabel

> **closeLabel**: `string`

`aria-label` of the value inspector's × button.

#### columnAdded

> **columnAdded**: (`column`) => `string`

Live-region text once a column has been added: "Column point_x added".

##### Parameters

###### column

`string`

##### Returns

`string`

#### columnNameLabel

> **columnNameLabel**: `string`

Label of the extract panel's input for the new column's name.

#### copied

> **copied**: `string`

Value inspector status after a copy (Copy JSON, or Ctrl/Cmd+C on a node).

#### copyFailed

> **copyFailed**: `string`

Value inspector status when the clipboard refused the copy.

#### copyJson

> **copyJson**: `string`

Value inspector button that copies the whole value as JSON.

#### elementNode

> **elementNode**: `string`

The tree's node for a list's or an array's elements, read at a position.

#### entryCount

> **entryCount**: (`count`) => `string`

Entries of a map, in the tree: "600 entries".

##### Parameters

###### count

`number`

##### Returns

`string`

#### expressionLabel

> **expressionLabel**: `string`

Label of the extract panel's preview of the SQL expression the column reads.

#### extractButtonLabel

> **extractButtonLabel**: (`column`) => `string`

`aria-label` of a nested or JSON column header's extract button: "Extract from point".

##### Parameters

###### column

`string`

##### Returns

`string`

#### extractButtonTitle

> **extractButtonTitle**: `string`

`title` of the header's extract button.

#### extractCloseLabel

> **extractCloseLabel**: `string`

`aria-label` of the extract panel's × button.

#### extractFailed

> **extractFailed**: (`error`) => `string`

A column could not be added, with the reason (in English, from the action): "Could not add the column: …".

##### Parameters

###### error

`string`

##### Returns

`string`

#### extractTitle

> **extractTitle**: (`column`) => `string`

Title of the extract panel, which names it for assistive technology: "Extract from point".

##### Parameters

###### column

`string`

##### Returns

`string`

#### extractTreeLabel

> **extractTreeLabel**: (`column`) => `string`

Accessible name of the extract panel's tree of the column's type: "Parts of point".

##### Parameters

###### column

`string`

##### Returns

`string`

#### fieldCount

> **fieldCount**: (`count`) => `string`

Fields of a struct, in the tree: "3 fields".

##### Parameters

###### count

`number`

##### Returns

`string`

#### inspectorTitle

> **inspectorTitle**: (`column`, `rowLabel`) => `string`

Title of the value inspector, the panel that shows one nested or JSON
cell's whole value (F2, a double click, or the cell's inspect icon):
the column and `rowLabel`'s text, "tags · Row 1,235". It also
names the panel for assistive technology.

##### Parameters

###### column

`string`

###### rowLabel

`string`

##### Returns

`string`

#### itemCount

> **itemCount**: (`count`) => `string`

Elements of a list, an array or a JSON array, in the tree: "3 items".

##### Parameters

###### count

`number`

##### Returns

`string`

#### jsonPathHint

> **jsonPathHint**: `string`

How to write a JSON path, under the input.

#### jsonPathInvalid

> **jsonPathInvalid**: (`character`) => `string`

The JSON path does not parse, by the 1-based character where it goes wrong.

##### Parameters

###### character

`number`

##### Returns

`string`

#### jsonPathLabel

> **jsonPathLabel**: `string`

Label of the extract panel's JSON path input, for a part that is JSON or VARIANT.

#### keyCount

> **keyCount**: (`count`) => `string`

Keys of a JSON object, in the tree: "2 keys".

##### Parameters

###### count

`number`

##### Returns

`string`

#### keyLabel

> **keyLabel**: (`container`) => `string`

Label of the input for a map value's key, by the map: "Key in attrs".

##### Parameters

###### container

`string`

##### Returns

`string`

#### keyRequired

> **keyRequired**: `string`

The key input is empty.

#### lengthNode

> **lengthNode**: `string`

The tree's leaf for a list's or an array's number of elements.

#### loadFailed

> **loadFailed**: `string`

Value inspector status when the value could not be read.

#### loading

> **loading**: `string`

Value inspector status while the value loads, shown after 150 ms.

#### mapValueNode

> **mapValueNode**: `string`

The tree's node for a map's values, read by key.

#### moreCharacters

> **moreCharacters**: (`count`) => `string`

After text the tree cut short, by the characters left out: "18,000 more characters".

##### Parameters

###### count

`number`

##### Returns

`string`

#### nothingToExtract

> **nothingToExtract**: `string`

The extract panel's text when the column's type could not be read, so has no parts.

#### panelLoadFailed

> **panelLoadFailed**: `string`

Live-region text when the value inspector or the extract panel, which
load on first use, could not be downloaded.

#### positionInvalid

> **positionInvalid**: `string`

The position input holds something other than a whole number from 1 up.

#### positionLabel

> **positionLabel**: (`container`) => `string`

Label of the input for an element's 1-based position, by the list or
array it is in: "Position in people". A list inside a list is named
after the outer one's element: "Position in matrix › element".

##### Parameters

###### container

`string`

##### Returns

`string`

#### readAs

> **readAs**: `object`

The "Read as" choices: a value inside JSON or VARIANT as text, a
number, a boolean or JSON, or the length of the array there.

##### readAs.boolean

> **boolean**: `string`

##### readAs.json

> **json**: `string`

##### readAs.length

> **length**: `string`

##### readAs.number

> **number**: `string`

##### readAs.string

> **string**: `string`

#### readAsLabel

> **readAsLabel**: `string`

Label of the extract panel's "Read as" select, for a part that is JSON or VARIANT.

#### retry

> **retry**: `string`

Button that reads the value again after it failed to load.

#### rowLabel

> **rowLabel**: (`row`) => `string`

The row a value inspector shows, by its 1-based position in the table
as sorted and filtered (the number a loading row shows): "Row 1,235".

##### Parameters

###### row

`number`

##### Returns

`string`

#### sizeNode

> **sizeNode**: `string`

The tree's leaf for a map's number of entries.

#### tagNode

> **tagNode**: `string`

The tree's leaf for which member a union holds.

#### tooLargeToCopy

> **tooLargeToCopy**: `string`

Value inspector status when the value is too long to copy: over 8 MiB of JSON.

#### treeLabel

> **treeLabel**: (`column`) => `string`

Accessible name of the value inspector's tree: "Value of tags".

##### Parameters

###### column

`string`

##### Returns

`string`

#### truncatedNotice

> **truncatedNotice**: (`shownChars`, `totalChars`) => `string`

Value inspector status for a value too long to show whole, by the
characters shown and the value's length:
"Showing the first 2,097,152 of 3,000,000 characters".

##### Parameters

###### shownChars

`number`

###### totalChars

`number`

##### Returns

`string`

#### typeArray

> **typeArray**: (`element`, `size`) => `string`

Spoken type of a fixed-size ARRAY: "array of 768 float".

##### Parameters

###### element

`string`

###### size

`number`

##### Returns

`string`

#### typeJson

> **typeJson**: `string`

Spoken name of the JSON type.

#### typeList

> **typeList**: (`element`) => `string`

Spoken type of a LIST, given its element's spoken type: "list of
integer". A column header's accessible name ends with it ("tags, list
of integer"); the visible label stays DuckDB's notation (`[integer]`).

##### Parameters

###### element

`string`

##### Returns

`string`

#### typeMap

> **typeMap**: (`key`, `value`) => `string`

Spoken type of a MAP, given its key's and value's: "map from varchar to integer".

##### Parameters

###### key

`string`

###### value

`string`

##### Returns

`string`

#### typeStruct

> **typeStruct**: (`fieldCount`) => `string`

Spoken type of a STRUCT, by its number of fields: "struct with 3 fields".

##### Parameters

###### fieldCount

`number`

##### Returns

`string`

#### typeUnion

> **typeUnion**: (`memberCount`) => `string`

Spoken type of a UNION, by its number of members: "union of 2 types".

##### Parameters

###### memberCount

`number`

##### Returns

`string`

#### typeVariant

> **typeVariant**: `string`

Spoken name of the VARIANT type.
