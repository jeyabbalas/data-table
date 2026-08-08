/**
 * Strings - typed i18n hook for every user-facing string in the library.
 *
 * All UI components read their text from a resolved `Strings` object
 * (`messages`) rather than inlining literals. `createDataTable({ messages })`
 * accepts a `DeepPartial<Strings>` override; missing leaves fall back to the
 * English defaults exported below.
 *
 * Function-typed strings (templates) take runtime arguments directly, keeping
 * locale grammar (word order, pluralization) inside the consumer's
 * translation rather than baking a format-string DSL into the library.
 */

/**
 * Deep-partial helper for `messages` overrides. Every nested object becomes
 * optional; function-typed leaves are replaced wholesale (no partial
 * application).
 */
export type DeepPartial<T> = T extends (...args: unknown[]) => unknown
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/**
 * Typed shape of every user-facing string the library renders. Pass a
 * `messages: DeepPartial<Strings>` override to {@link createDataTable} to
 * localize button labels, placeholder text, ARIA announcements, and stats
 * templates; missing leaves fall back to the English values in
 * {@link defaultStrings}. Function-typed leaves take runtime arguments
 * directly so locale grammar stays inside the consumer's translation.
 */
export interface Strings {
  // =========================================
  // Common — shared across features
  // =========================================
  common: {
    close: string;
    cancel: string;
    apply: string;
    confirm: string;
    validate: string;
    validating: string;
    create: string;
    creating: string;
    update: string;
    updating: string;
    yes: string;
    no: string;
    showAll: string;
    deleteConfirm: string;
  };

  // =========================================
  // Filters — panels, fields, chips, SQL modal
  // =========================================
  filters: {
    panelTitle: string;
    /** Header text once a column has been selected: e.g. "Filter: price". */
    panelTitleForColumn: (column: string) => string;
    clearButton: string;
    clearAllButton: string;
    applyButton: string;

    /** Toolbar label on the filter bar itself. */
    activeFiltersLabel: string;
    /** "Expression" button label in the filter bar. */
    expressionFilterLabel: string;
    /** Tooltip/title on the expression button. */
    expressionFilterTooltip: string;
    /** "Presets" button label in the filter bar. */
    presetsButtonLabel: string;
    /** Tooltip/title on the presets button. */
    presetsButtonTooltip: string;

    /** aria-label for the "×" close on the filter panel. */
    closePanelLabel: string;

    nullToggle: {
      any: string;
      isNull: string;
      isNotNull: string;
    };

    /** Dropdown text for numeric/date filter modes. */
    numericOperators: {
      between: string;
      equals: string;
      notEquals: string;
      greaterThan: string;
      greaterThanOrEqual: string;
      lessThan: string;
      lessThanOrEqual: string;
    };
    dateOperators: {
      between: string;
      equals: string;
      before: string;
      onOrBefore: string;
      after: string;
      onOrAfter: string;
    };
    stringModes: {
      contains: string;
      startsWith: string;
      endsWith: string;
      regex: string;
      exact: string;
    };
    uuidModes: {
      contains: string;
      exact: string;
    };
    booleanOptions: {
      true: string;
      false: string;
      null: string;
    };

    placeholders: {
      min: string;
      max: string;
      value: string;
      stringFilter: string;
      uuidFilter: string;
      intervalFilter: string;
    };

    labels: {
      from: string;
      to: string;
    };

    /** aria-labels on the filter field controls. */
    ariaLabels: {
      nullFilter: (column: string) => string;
      filterMode: (column: string) => string;
      dateFilterMode: (column: string) => string;
      uuidFilterMode: (column: string) => string;
      minValue: (column: string) => string;
      maxValue: (column: string) => string;
      filterValue: (column: string) => string;
      startDate: (column: string) => string;
      endDate: (column: string) => string;
      fromTime: (column: string) => string;
      toTime: (column: string) => string;
      uuidValue: (column: string) => string;
      intervalFilter: (column: string) => string;
      removeFilter: (column: string) => string;
    };

    /** Inline regex/UUID validation messages. */
    validation: {
      regexTooLong: string;
      regexUnsupported: string;
      regexInvalid: string;
      uuidInvalid: string;
    };

    /** Strings used by `formatFilter()` for chip descriptions. */
    chipDescriptions: {
      anyValue: string;
      rangeSeparator: string;
      pointPrefix: string;
      inSet: (list: string, includeNull: boolean) => string;
      notInSet: (list: string, includeNull: boolean) => string;
      isNull: string;
      isNotNull: string;
      valueListMore: (rest: number) => string;
      patternModes: {
        contains: string;
        startsWith: string;
        endsWith: string;
        regex: string;
      };
      /** Column label shown on raw-sql chips. */
      sqlColumn: string;
    };

    /** SQL (raw WHERE) filter modal. */
    sqlFilter: {
      createTitle: string;
      editTitle: string;
      closeLabel: string;
      labelFieldLabel: string;
      labelPlaceholder: string;
      labelHint: string;
      conditionLabel: string;
      editorPlaceholder: string;
      validationResult: (matchCount: number) => string;
      removeButton: string;
      applyButton: string;
      updateButton: string;
      removeConfirmText: string;
    };
  };

  // =========================================
  // Filter presets
  // =========================================
  presets: {
    title: string;
    closeLabel: string;
    namePlaceholder: string;
    descriptionPlaceholder: string;
    saveButton: string;
    loadButton: string;
    deleteButton: string;
    exportButton: string;
    importButton: string;
    emptyState: string;
    deleteConfirmText: string;
    meta: (filterCount: number, dateStr: string) => string;
    importPartial: (imported: number, errors: number) => string;
    importSuccess: (count: number) => string;
    importEmpty: string;
    importFailed: string;
  };

  // =========================================
  // Export dialog
  // =========================================
  export: {
    title: string;
    closeLabel: string;

    formatLabel: string;
    formats: {
      csv: string;
      json: string;
      parquet: string;
    };

    scopeLabel: string;
    scopes: {
      all: string;
      filtered: string;
      selected: string;
    };

    copyButton: string;
    downloadButton: string;
    cancelButton: string;
    copiedFeedback: string;
    exportFailedFallback: string;
    copyFailedFallback: string;
    /** Label on the "include system columns (e.g. __rowid__)" checkbox. */
    includeSystemColumnsLabel: string;

    csv: {
      delimiterLabel: string;
      delimiters: {
        comma: string;
        tab: string;
        semicolon: string;
        pipe: string;
      };
      headersLabel: string;
      nullValueLabel: string;
      nullValuePlaceholder: string;
    };

    json: {
      formatLabel: string;
      formats: {
        array: string;
        ndjson: string;
      };
      prettyLabel: string;
    };
  };

  // =========================================
  // Derived columns
  // =========================================
  derived: {
    /** Modal: "New Derived Column". */
    newColumnTitle: string;
    /** Default panel header before a column is selected. */
    editTitle: string;
    /** Panel header with column name — "Edit: my_col". */
    editTitleForColumn: (column: string) => string;
    closeLabel: string;
    closeEditLabel: string;

    nameLabel: string;
    namePlaceholder: string;
    nameRequired: string;
    nameDuplicate: (name: string) => string;

    typeLabel: string;
    expressionModeLabel: string;
    vectorModeLabel: string;

    expressionLabel: string;
    expressionRequired: string;
    /** Placeholder text inside the SQL-expression textarea (DefaultExpressionEditor). */
    expressionPlaceholder: string;
    /** Prefix shown before the comma-separated column-hint list (DefaultExpressionEditor). */
    availableColumnsLabel: string;
    typePreview: (type: string, originalType: string) => string;
    validationFailed: string;

    vectorTypeLabel: string;
    vectorValuesLabel: string;
    vectorPlaceholder: string;
    vectorInfo: (count: number, total: number) => string;
    vectorCountMismatch: (expected: number, got: number) => string;
    vectorInvalidBoolean: (lineNum: number, value: string) => string;
    vectorInvalidDate: (lineNum: number, value: string) => string;
    vectorInvalidTimestamp: (lineNum: number, value: string) => string;
    vectorInvalidTime: (lineNum: number, value: string) => string;
    vectorInvalidInterval: (lineNum: number) => string;
    vectorInvalidDecimal: (lineNum: number, value: string) => string;
    vectorInvalidUUID: (lineNum: number, value: string) => string;
    vectorInvalidInteger: (lineNum: number, value: string) => string;
    vectorInvalidFloat: (lineNum: number, value: string) => string;

    createButton: string;
    createFailed: string;
    updateButton: string;
    updateFailed: string;
    deleteButton: string;
    deleteFailed: (message: string) => string;

    /** "Column info" label shown on the edit panel for vector columns. */
    infoLabel: string;
    /** "Vector column (integer), 123 values" */
    vectorInfoText: (vectorType: string, count: number) => string;

    addButtonLabel: string;
  };

  // =========================================
  // Accessibility — ARIA labels, live-region text, keyboard nav
  // =========================================
  a11y: {
    /** Accessible name of the grid itself (`aria-label` on `.dt-grid`). */
    gridLabel: string;

    /** Live-region: "3 filters active, showing 1,234 of 5,678 rows". */
    filtersActive: (n: number, shown: number, total: number) => string;
    /** Live-region: "Showing all 5,678 rows". */
    noFilters: (total: number) => string;
    /** Live-region: "sorted by Price ascending, then Name descending". */
    sortedBy: (descriptions: string[]) => string;
    /** Word used inside `sortedBy` descriptions and header labels. */
    ascending: string;
    descending: string;

    /** Column-header aria-label fragments. */
    sortedSuffix: (direction: string) => string;
    sortedMultiSuffix: (direction: string, priority: number) => string;
    filteredSuffix: string;
    multiFilteredSuffix: (count: number) => string;

    /** Header drag handle. */
    dragHandleLabel: (column: string) => string;
    dragHandleTitle: string;

    /** Header sort button. */
    sortButtonLabel: (column: string) => string;
    sortAscendingTitle: string;
    sortDescendingTitle: string;
    sortRemoveTitle: string;

    /** Header pin button. */
    pinButtonLabel: (column: string) => string;
    unpinButtonLabel: (column: string) => string;
    pinColumnTitle: string;
    unpinColumnTitle: string;

    /** Header hide button. */
    hideButtonLabel: (column: string) => string;
    hideColumnTitle: string;
    cannotHideLastColumn: string;

    /** Header filter button. */
    filterButtonLabel: (column: string) => string;
    filterColumnTitle: string;

    /** Derived-column edit icon. */
    editDerivedColumnLabel: string;
    editDerivedColumnTitle: string;

    /** Hidden-columns gutter. */
    hiddenColumnsLabel: string;
    showColumn: (column: string) => string;

    /** Aria-label on the column-resize handle (`.dt-col-resize-handle`). */
    resizeHandleLabel: string;
    /** Placeholder text shown for not-yet-fetched rows during fast scroll. */
    loadingRowLabel: (rowNumber: number) => string;

    /**
     * Column layout mode (`Shift+F2` on a column header) — the keyboard
     * gesture for resize and reorder. The entry announcement is the only
     * place the key map is spoken aloud, so it doubles as the mode's
     * discoverability affordance; keep the key names in a translation.
     */
    columnLayoutModeEntered: (column: string) => string;
    /** Live-region: the column's new width after a resize step. */
    columnWidthAnnouncement: (column: string, px: number) => string;
    /** Live-region: resize step landed on the minimum width. */
    columnWidthAtMinimum: (column: string, px: number) => string;
    /** Live-region: resize step landed on the maximum width. */
    columnWidthAtMaximum: (column: string, px: number) => string;
    /** Live-region: the column's new 1-based position after a move. */
    columnMovedAnnouncement: (column: string, position: number, total: number) => string;
    /** Live-region: a move was refused because the column is pinned. */
    columnMoveBlockedPinned: (column: string) => string;
    /** Live-region: Escape restored the entry width and position. */
    columnLayoutCancelled: (column: string) => string;
    /** Live-region: Enter (or leaving the grid) committed the gesture. */
    columnLayoutCommitted: (column: string) => string;
  };

  // =========================================
  // Statistics — column-header stats line
  // =========================================
  statistics: {
    rowWord: (count: number) => string;
    rowCount: (count: number) => string;
    filteredRowCount: (filtered: number, total: number) => string;
    nullCount: (count: number) => string;
    allNull: string;
    allValues: (value: string) => string;
    min: (value: string) => string;
    median: (value: string) => string;
    max: (value: string) => string;
    percentTrue: (pct: number) => string;
    allUnique: string;
    uniqueCount: (count: number) => string;
    uniquePercent: (count: number, pct: number) => string;
    /**
     * Distinct count from `approx_count_distinct` — used instead of
     * `uniqueCount` above 100,000 rows. Keep a marker for "approximate" in
     * the translation.
     */
    approxUniqueCount: (count: number) => string;
    /**
     * Approximate distinct count with its share of non-null rows — the
     * approximate twin of `uniquePercent`.
     */
    approxUniquePercent: (count: number, pct: number) => string;
    /** " · " separator used between stats segments. */
    separator: string;
    /** Bold label prefix for a histogram bin/brush selection detail line. */
    binLabel: string;
    /** Bold label prefix for a single selected category detail line. */
    categoryLabel: string;
    /** Bold label prefix for a multi-category selection detail line. */
    selectedLabel: string;
    /** Display value for the null bin/segment in a selection detail line. */
    nullBinLabel: string;
    /** Display value for the folded "Other" segment (count = folded distinct values). */
    otherCategory: (count: number) => string;
    /** Display value for the all-unique segment (count = distinct values). */
    allUniqueCategory: (count: number) => string;
    /** Selection/hover size, e.g. "4,000 rows (40.0%)" — pct arrives pre-formatted. */
    selectionRowCount: (count: number, pct: string) => string;
    /** Rows of a hovered bin/segment passing all active filters, e.g. "300 match". */
    matchCount: (count: number) => string;
    /** Truncation suffix for a long multi-select value list (total = selected values). */
    valueListSuffix: (total: number) => string;
  };

  // =========================================
  // Errors / warnings surfaced via events + console
  // =========================================
  errors: {
    stylesheetMissing: string;
  };
}

// =========================================
// Default English strings (verbatim match for current UI text)
// =========================================

/**
 * Default English strings for every user-facing label, placeholder, ARIA
 * announcement, and stats template. Pass `messages: DeepPartial<Strings>` to
 * {@link createDataTable} to override any subtree; missing keys fall back to
 * these defaults via {@link mergeStrings}. Messages are resolved once at
 * construction — recreate the table to switch locales at runtime.
 */
export const defaultStrings: Strings = {
  common: {
    close: 'Close',
    cancel: 'Cancel',
    apply: 'Apply',
    confirm: 'Confirm',
    validate: 'Validate',
    validating: 'Validating\u2026',
    create: 'Create',
    creating: 'Creating\u2026',
    update: 'Update',
    updating: 'Updating\u2026',
    yes: 'Yes',
    no: 'No',
    showAll: 'Show all',
    deleteConfirm: 'Are you sure?',
  },

  filters: {
    panelTitle: 'Filter',
    panelTitleForColumn: (column) => `Filter: ${column}`,
    clearButton: 'Clear',
    clearAllButton: 'Clear all',
    applyButton: 'Apply',

    activeFiltersLabel: 'Active filters',
    expressionFilterLabel: 'Expression',
    expressionFilterTooltip: 'Add expression filter (SQL WHERE condition)',
    presetsButtonLabel: 'Presets',
    presetsButtonTooltip: 'Manage filter presets',

    closePanelLabel: 'Close filter panel',

    nullToggle: {
      any: 'Any',
      isNull: 'Is null',
      isNotNull: 'Is not null',
    },

    numericOperators: {
      between: 'between',
      equals: '=',
      notEquals: '!=',
      greaterThan: '>',
      greaterThanOrEqual: '>=',
      lessThan: '<',
      lessThanOrEqual: '<=',
    },
    dateOperators: {
      between: 'between',
      equals: '=',
      before: 'before',
      onOrBefore: 'on or before',
      after: 'after',
      onOrAfter: 'on or after',
    },
    stringModes: {
      contains: 'contains',
      startsWith: 'starts with',
      endsWith: 'ends with',
      regex: 'regex',
      exact: 'exact match',
    },
    uuidModes: {
      contains: 'contains',
      exact: 'exact match',
    },
    booleanOptions: {
      true: 'True',
      false: 'False',
      null: 'Null',
    },

    placeholders: {
      min: 'min',
      max: 'max',
      value: 'value',
      stringFilter: 'Filter value...',
      uuidFilter: 'UUID value...',
      intervalFilter: 'Contains...',
    },

    labels: {
      from: 'From',
      to: 'To',
    },

    ariaLabels: {
      nullFilter: (column) => `Null filter for ${column}`,
      filterMode: (column) => `Filter mode for ${column}`,
      dateFilterMode: (column) => `Date filter mode for ${column}`,
      uuidFilterMode: (column) => `UUID filter mode for ${column}`,
      minValue: (column) => `Minimum value for ${column}`,
      maxValue: (column) => `Maximum value for ${column}`,
      filterValue: (column) => `Filter value for ${column}`,
      startDate: (column) => `Start date for ${column}`,
      endDate: (column) => `End date for ${column}`,
      fromTime: (column) => `From time for ${column}`,
      toTime: (column) => `To time for ${column}`,
      uuidValue: (column) => `UUID value for ${column}`,
      intervalFilter: (column) => `Interval filter for ${column}`,
      removeFilter: (column) => `Remove filter for ${column}`,
    },

    validation: {
      regexTooLong: 'Regular expression is too long (max 1000 characters)',
      regexUnsupported: 'Lookahead, lookbehind, and backreferences are not supported',
      regexInvalid: 'Invalid regular expression',
      uuidInvalid: 'Invalid UUID format',
    },

    chipDescriptions: {
      anyValue: 'any value',
      rangeSeparator: '\u2013',
      pointPrefix: '=',
      inSet: (list, includeNull) => `in {${list}}${includeNull ? ' or null' : ''}`,
      notInSet: (list, includeNull) => `not in {${list}}${includeNull ? ' or null' : ''}`,
      isNull: 'is null',
      isNotNull: 'is not null',
      valueListMore: (rest) => `+${rest} more`,
      patternModes: {
        contains: 'contains',
        startsWith: 'starts with',
        endsWith: 'ends with',
        regex: 'matches',
      },
      sqlColumn: 'SQL',
    },

    sqlFilter: {
      createTitle: 'New Expression Filter',
      editTitle: 'Edit Expression Filter',
      closeLabel: 'Close',
      labelFieldLabel: 'Label (optional)',
      labelPlaceholder: 'e.g., High-value orders',
      labelHint: 'Shown on the filter chip instead of the SQL text',
      conditionLabel: 'SQL WHERE condition',
      editorPlaceholder: "Enter WHERE condition, e.g. age > 18 AND status = 'active'",
      validationResult: (matchCount) => `${matchCount.toLocaleString()} rows match`,
      removeButton: 'Remove Filter',
      applyButton: 'Apply',
      updateButton: 'Update',
      removeConfirmText: 'Are you sure?',
    },
  },

  presets: {
    title: 'Filter Presets',
    closeLabel: 'Close presets panel',
    namePlaceholder: 'Preset name',
    descriptionPlaceholder: 'Description (optional)',
    saveButton: 'Save Current Filters',
    loadButton: 'Load',
    deleteButton: 'Delete',
    exportButton: 'Export All',
    importButton: 'Import',
    emptyState: 'No saved presets',
    deleteConfirmText: 'Delete?',
    meta: (filterCount, dateStr) =>
      `${filterCount} filter${filterCount !== 1 ? 's' : ''} \u00B7 ${dateStr}`,
    importPartial: (imported, errors) => `Imported ${imported}, ${errors} error(s)`,
    importSuccess: (count) => `Imported ${count} preset(s)`,
    importEmpty: 'No presets found in file',
    importFailed: 'Failed to read file',
  },

  export: {
    title: 'Export Data',
    closeLabel: 'Close export dialog',

    formatLabel: 'Format',
    formats: {
      csv: 'CSV',
      json: 'JSON',
      parquet: 'Parquet',
    },

    scopeLabel: 'Rows',
    scopes: {
      all: 'All rows',
      filtered: 'Filtered rows',
      selected: 'Selected rows',
    },

    copyButton: 'Copy to Clipboard',
    downloadButton: 'Download',
    cancelButton: 'Cancel',
    copiedFeedback: 'Copied!',
    exportFailedFallback: 'Export failed',
    copyFailedFallback: 'Copy failed',
    includeSystemColumnsLabel: 'Include system columns (e.g. __rowid__)',

    csv: {
      delimiterLabel: 'Delimiter',
      delimiters: {
        comma: 'Comma (,)',
        tab: 'Tab',
        semicolon: 'Semicolon (;)',
        pipe: 'Pipe (|)',
      },
      headersLabel: 'Include headers',
      nullValueLabel: 'Null value',
      nullValuePlaceholder: '(empty)',
    },

    json: {
      formatLabel: 'Format',
      formats: {
        array: 'JSON Array',
        ndjson: 'NDJSON (one object per line)',
      },
      prettyLabel: 'Pretty-print',
    },
  },

  derived: {
    newColumnTitle: 'New Derived Column',
    editTitle: 'Edit',
    editTitleForColumn: (column) => `Edit: ${column}`,
    closeLabel: 'Close',
    closeEditLabel: 'Close edit panel',

    nameLabel: 'Column name',
    namePlaceholder: 'e.g. total_price',
    nameRequired: 'Name is required',
    nameDuplicate: (name) => `A column named "${name}" already exists`,

    typeLabel: 'Column type',
    expressionModeLabel: 'SQL Expression',
    vectorModeLabel: 'Manually Enter Values',

    expressionLabel: 'SQL Expression',
    expressionRequired: 'Expression is required',
    expressionPlaceholder: 'Enter SQL expression, e.g. price * quantity',
    availableColumnsLabel: 'Available columns:',
    typePreview: (type, originalType) => `Type: ${type} (${originalType})`,
    validationFailed: 'Validation failed',

    vectorTypeLabel: 'Data type',
    vectorValuesLabel: 'Values (one per line)',
    vectorPlaceholder: 'Enter one value per line...',
    vectorInfo: (count, total) => `${count} / ${total} values entered`,
    vectorCountMismatch: (expected, got) => `Expected ${expected} values, got ${got}`,
    vectorInvalidBoolean: (lineNum, value) =>
      `Line ${lineNum}: "${value}" is not a valid boolean (use true/false/1/0)`,
    vectorInvalidDate: (lineNum, value) =>
      `Line ${lineNum}: "${value}" is not a valid date (use YYYY-MM-DD)`,
    vectorInvalidTimestamp: (lineNum, value) =>
      `Line ${lineNum}: "${value}" is not a valid timestamp (use YYYY-MM-DD HH:MM:SS)`,
    vectorInvalidTime: (lineNum, value) =>
      `Line ${lineNum}: "${value}" is not a valid time (use HH:MM:SS)`,
    vectorInvalidInterval: (lineNum) =>
      `Line ${lineNum}: interval cannot be empty (e.g. "1 day 2 hours")`,
    vectorInvalidDecimal: (lineNum, value) =>
      `Line ${lineNum}: "${value}" is not a valid decimal (use a numeric value)`,
    vectorInvalidUUID: (lineNum, value) =>
      `Line ${lineNum}: "${value}" is not a valid UUID (use xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx format)`,
    vectorInvalidInteger: (lineNum, value) =>
      `Line ${lineNum}: "${value}" is not a valid integer (use whole numbers only)`,
    vectorInvalidFloat: (lineNum, value) => `Line ${lineNum}: "${value}" is not a valid float`,

    createButton: 'Create',
    createFailed: 'Failed to create column',
    updateButton: 'Update',
    updateFailed: 'Update failed',
    deleteButton: 'Delete Column',
    deleteFailed: (message) => `Delete failed: ${message}`,

    infoLabel: 'Column info',
    vectorInfoText: (vectorType, count) => `Vector column (${vectorType}), ${count} values`,

    addButtonLabel: 'Add derived column',
  },

  a11y: {
    gridLabel: 'Data table',

    filtersActive: (n, shown, total) =>
      `${n} ${n === 1 ? 'filter' : 'filters'} active, showing ${shown.toLocaleString()} of ${total.toLocaleString()} rows`,
    noFilters: (total) => `Showing all ${total.toLocaleString()} rows`,
    sortedBy: (descriptions) => `sorted by ${descriptions.join(', then ')}`,
    ascending: 'ascending',
    descending: 'descending',

    sortedSuffix: (direction) => `sorted ${direction}`,
    sortedMultiSuffix: (direction, priority) => `sorted ${direction} (priority ${priority})`,
    filteredSuffix: 'filtered',
    multiFilteredSuffix: (count) => `${count} filters`,

    dragHandleLabel: (column) => `Drag to reorder ${column}`,
    dragHandleTitle: 'Reorder column (keyboard: Shift+F2 on the header)',

    sortButtonLabel: (column) => `Sort by ${column}`,
    sortAscendingTitle: 'Sort ascending',
    sortDescendingTitle: 'Sort descending',
    sortRemoveTitle: 'Remove sort',

    pinButtonLabel: (column) => `Pin ${column}`,
    unpinButtonLabel: (column) => `Unpin ${column}`,
    pinColumnTitle: 'Pin column',
    unpinColumnTitle: 'Unpin column',

    hideButtonLabel: (column) => `Hide ${column}`,
    hideColumnTitle: 'Hide column',
    cannotHideLastColumn: 'Cannot hide the last visible column',

    filterButtonLabel: (column) => `Filter ${column}`,
    filterColumnTitle: 'Filter column',

    editDerivedColumnLabel: 'Edit derived column',
    editDerivedColumnTitle: 'Edit derived column',

    hiddenColumnsLabel: 'Hidden columns',
    showColumn: (column) => `Show ${column}`,

    resizeHandleLabel: 'Resize column (keyboard: Shift+F2 on the header)',
    loadingRowLabel: (rowNumber) => `Loading row ${rowNumber}…`,

    columnLayoutModeEntered: (column) =>
      `${column}: column layout mode. Left and Right resize, Shift with Left and Right move the ` +
      `column, Home and End set minimum and maximum width, Backspace resets the width, ` +
      `Enter commits, Escape cancels.`,
    columnWidthAnnouncement: (column, px) => `${column} ${px} pixels wide`,
    columnWidthAtMinimum: (column, px) => `${column} ${px} pixels wide, minimum`,
    columnWidthAtMaximum: (column, px) => `${column} ${px} pixels wide, maximum`,
    columnMovedAnnouncement: (column, position, total) =>
      `${column} moved to column ${position} of ${total}`,
    columnMoveBlockedPinned: (column) => `${column} is pinned and cannot be moved`,
    columnLayoutCancelled: (column) => `${column} layout cancelled, width and position restored`,
    columnLayoutCommitted: (column) => `${column} layout committed`,
  },

  statistics: {
    rowWord: (count) => (count === 1 ? 'row' : 'rows'),
    rowCount: (count) => `${count.toLocaleString()} ${count === 1 ? 'row' : 'rows'}`,
    filteredRowCount: (filtered, total) =>
      `${filtered.toLocaleString()} / ${total.toLocaleString()} ${total === 1 ? 'row' : 'rows'}`,
    nullCount: (count) => `${count.toLocaleString()} null`,
    allNull: 'all null',
    allValues: (value) => `all values: ${value}`,
    min: (value) => `min ${value}`,
    median: (value) => `med ${value}`,
    max: (value) => `max ${value}`,
    percentTrue: (pct) => `${pct}% true`,
    allUnique: 'all unique',
    uniqueCount: (count) => `${count.toLocaleString()} unique`,
    uniquePercent: (count, pct) => `${count.toLocaleString()} unique (${pct}%)`,
    approxUniqueCount: (count) => `~${count.toLocaleString()} unique`,
    approxUniquePercent: (count, pct) => `~${count.toLocaleString()} unique (${pct}%)`,
    separator: ' \u00B7 ',
    binLabel: 'Bin:',
    categoryLabel: 'Category:',
    selectedLabel: 'Selected:',
    nullBinLabel: 'null',
    otherCategory: (count) => `Other (${count.toLocaleString()} values)`,
    allUniqueCategory: (count) => `All unique (${count.toLocaleString()})`,
    selectionRowCount: (count, pct) =>
      `${count.toLocaleString()} ${count === 1 ? 'row' : 'rows'} (${pct})`,
    matchCount: (count) => `${count.toLocaleString()} match`,
    valueListSuffix: (total) => `, ... (${total.toLocaleString()} values)`,
  },

  errors: {
    stylesheetMissing:
      "[data-table] Stylesheet missing: add `import '@jeyabbalas/data-table/styles'` " +
      '(or link dist/data-table.css) before mounting. The table will render without theming.',
  },
};

// =========================================
// Deep merge
// =========================================

/**
 * True if a value is a plain object (not an array, not a function, not null).
 * Functions are treated as leaves so overrides replace them wholesale.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-merge `overrides` into a copy of `base`. Missing keys inherit from
 * `base`; functions in `overrides` replace `base` functions wholesale; nested
 * objects recurse.
 *
 * Consumers typically pass `DeepPartial<Strings>` as overrides, but this
 * helper is type-erased internally because the recursion mirrors runtime
 * shape rather than the compile-time type.
 */
export function mergeStrings(base: Strings, overrides?: DeepPartial<Strings>): Strings {
  if (!overrides) return base;
  return mergeDeep(base as unknown as Record<string, unknown>, overrides) as unknown as Strings;
}

function mergeDeep(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overrides)) {
    const override = overrides[key];
    if (override === undefined) continue;
    const baseValue = base[key];
    if (isPlainObject(baseValue) && isPlainObject(override)) {
      out[key] = mergeDeep(baseValue, override);
    } else {
      out[key] = override;
    }
  }
  return out;
}
