[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ColorScheme

# Type Alias: ColorScheme

> **ColorScheme** = `"light"` \| `"dark"` \| `"auto"`

Defined in: [DataTable.ts:104](https://github.com/jeyabbalas/data-table/blob/c94803d261acc081fec39bff6f2e4d947bd8bc07/src/DataTable.ts#L104)

Programmatic light/dark theme selector for a [DataTable](../interfaces/DataTable.md) instance.

- `'auto'` (default) — follow the OS `prefers-color-scheme` media query.
- `'light'` / `'dark'` — force the theme regardless of OS preference.

Applied via the `data-dt-color-scheme` attribute on the `.dt-root` element;
body-portalled modals copy the attribute on open so their styling stays in
sync. See the Theming section of the README for the full `--dt-*` variable
reference.
