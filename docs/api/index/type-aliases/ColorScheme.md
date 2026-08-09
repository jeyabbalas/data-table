[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [index](../README.md) / ColorScheme

# Type Alias: ColorScheme

> **ColorScheme** = `"light"` \| `"dark"` \| `"auto"`

Defined in: [DataTable.ts:110](https://github.com/jeyabbalas/data-table/blob/0fffb089390f6336ccfbca8768e01ab6139df260/src/DataTable.ts#L110)

Programmatic light/dark theme selector for a [DataTable](../interfaces/DataTable.md) instance.

- `'auto'` (default) — follow the OS `prefers-color-scheme` media query.
- `'light'` / `'dark'` — force the theme regardless of OS preference.

Applied via the `data-dt-color-scheme` attribute on the `.dt-root` element;
body-portalled modals copy the attribute on open so their styling stays in
sync. See the Theming section of the README for the full `--dt-*` variable
reference.
