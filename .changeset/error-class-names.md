---
'@jeyabbalas/data-table': patch
---

Errors from the built package report their class name (`LoadError`, `WorkerInitError`, …) in `error.name`, `String(error)` and `toJSON()`, instead of a one-letter minified name.

Each error took its `name` from its class, and the build renames classes when it minifies. In 0.8.0 a `LoadError` was named `a`, a `WorkerInitError` `n` and a `DataTableError` `e`, so `String(error)` read `a: …`, and `toJSON().name`, the stack header the console shows and `error.constructor.name` had the letter too. Each class now has its name written out in a string literal, which neither the build nor an app's own minifier renames. `instanceof` checks and `error.code` were right before and are unchanged, and a subclass an app defines is still named after its own class.

Every release from 0.3.1, which brought the typed errors, to 0.8.0 had the minified names, and the letters changed from release to release (`LoadError` was `y` in 0.3.1). A log parser, alert or dashboard keyed on them should key on the class names now, or on `error.code`.
