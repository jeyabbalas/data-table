---
'@jeyabbalas/data-table': patch
---

The SQL editors in the add-column dialog, the column edit panel and the expression filter take their placeholder and accessible name from `messages`.

- The two derived-column editors showed `Enter SQL expression, e.g. price * quantity` in every language. They now show `messages.derived.expressionPlaceholder`, which only `DefaultExpressionEditor` read before.
- All three editors were named "SQL Expression" for screen readers, in English. Each is now named by the label above it: `messages.derived.expressionLabel`, or in the expression filter `messages.filters.sqlFilter.conditionLabel`, so its English name becomes "SQL WHERE condition".
- `CodeMirrorExpressionEditor` takes `ariaLabel` beside `placeholder` in its fourth argument. One left out is the English default of `derived.expressionLabel` or `derived.expressionPlaceholder`, the same text as before.
