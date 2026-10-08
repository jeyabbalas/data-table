---
'@jeyabbalas/data-table': patch
---

Callbacks in `messages` keep their parameter types, so `rowCount: (count) => …` type-checks under strict TypeScript, and a value of the wrong type is a type error.

`DeepPartial<Strings>`, the type of `messages`, has turned every callback in it into `{}` since the option was added. Under `strict`, a callback written without annotations failed with TS7006, `Parameter 'count' implicitly has an 'any' type`, unless each parameter was annotated. A value of the wrong type was accepted without error: `rowCount: 42`, `panelTitleForColumn: 'oops'` and `rowCount: (x: boolean) => x` all compiled.

`DeepPartial` told a callback from a group of strings by testing it against `(...args: unknown[]) => unknown`. Under `strictFunctionTypes`, which `strict` turns on, parameters compare contravariantly, so no function with a typed parameter matched. It now tests against `(...args: never[]) => unknown`, which every function matches, so each callback keeps its signature from `Strings`: `count` is a `number`, and each of the three values above is an error. Only code that passed a value of the wrong type can fail to compile now.
