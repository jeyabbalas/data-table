[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ColorScheme

# Type Alias: ColorScheme

> **ColorScheme** = `"light"` \| `"dark"` \| `"auto"`

Defined in: [DataTable.ts:114](https://github.com/jeyabbalas/data-table/blob/d5b613fd5482b1cf0f46a12770739e8b8cb300f2/src/DataTable.ts#L114)

Programmatic light/dark theme selector for a [DataTable](../interfaces/DataTable.md) instance.

- `'auto'` (default) — follow the OS `prefers-color-scheme` media query.
- `'light'` / `'dark'` — force the theme regardless of OS preference.

Applied via the `data-dt-color-scheme` attribute on the `.dt-root` element;
body-portalled modals copy the attribute on open so their styling stays in
sync. See the Theming section of the README for the full `--dt-*` variable
reference.
