---
'@jeyabbalas/data-table': patch
---

The SQL editors in the add-column dialog, the column edit panel and the expression filter take their placeholder and accessible name from `messages`, and hand both to an `editorFactory`.

- The two derived-column editors showed `Enter SQL expression, e.g. price * quantity` in every language. They now show `messages.derived.expressionPlaceholder`, which only `DefaultExpressionEditor` read before.
- All three editors were named "SQL Expression" for screen readers, in English. Each is now named by the label above it: `messages.derived.expressionLabel`, or in the expression filter `messages.filters.sqlFilter.conditionLabel`, so its English name becomes "SQL WHERE condition". An empty label falls back to the English name instead of leaving the editor unnamed.
- An `editorFactory` gets a third argument, `config`: the dialog's placeholder and name, translated, as an `ExpressionEditorConfig` (`{ placeholder?, ariaLabel? }`, a new type on the root entry). A factory written for two arguments still works. `CodeMirrorExpressionEditor` takes the same object as its fourth argument, which gains `ariaLabel` beside `placeholder`; one left out is the English default, the same text as before.
- `DefaultExpressionEditor`'s textarea had no accessible name, and through a factory the expression filter showed the derived-column placeholder in it. It now takes `config` as a fifth argument and names the textarea `config.ariaLabel`, else `messages.derived.expressionLabel`; its placeholder is `config.placeholder`, else `messages.derived.expressionPlaceholder`.
