# 06 — Custom theme

Re-skin the table in a warm **terracotta + rose + stone** palette — no blue anywhere — and toggle `light` / `dark` / `auto` at runtime to confirm both modes are fully covered, including body-portaled modals (Export, Derived Column, SQL Filter).

## Run

```bash
npm run dev
# open http://localhost:5173/data-table/examples/06-custom-theme/
```

## API surface

- CSS custom properties — see [`src/styles/01-variables.css`](../../src/styles/01-variables.css) for the canonical list
- [`colorScheme` option](../../docs/api-reference.md#createdatatableoptions)
- [`setColorScheme` method](../../docs/api-reference.md#datatable-interface)

## Data

891 rows × 12 columns — [`tests/fixtures/datasets/csv/titanic.csv`](../../tests/fixtures/datasets/csv/titanic.csv).

## What to observe

1. Every surface — buttons, focus rings, histogram bars, sort chevrons, filter chips, the SQL editor, the export dialog — pulls from `--dt-primary`. Zero blue pixels anywhere.
2. Row height is 28 px (compact), header height 104 px, radii squared off at 3 px.
3. The null bar / missing-values segment (`--dt-accent`) renders in warm magenta — a striking contrast that stays in the "warm palette" family.
4. Click **Dark** — the whole page (including the host header) flips to a warm-black stone background; `--dt-primary` brightens to `orange-400` for readable contrast.
5. Click **Auto** — the table follows OS preference. Flip your system theme and the table re-renders without the page reloading.

## Which variables are overridden

| Family    | Variables                                                                              | Why                                                                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primary   | `--dt-primary`, `--dt-primary-hover`, `--dt-primary-light`, `--dt-primary-lighter`     | Core brand color; drives buttons, focus rings, histogram bars, selection chrome, modal confirms. All four needed because hover states and tinted surfaces pull from separate tokens. |
| Accent    | `--dt-accent`, `--dt-accent-hover`                                                     | Null bar / missing-value segment color in histograms and ValueCounts. Recolored to warm magenta for a striking, non-blue contrast.                                                   |
| Neutral   | `--dt-neutral`, `--dt-neutral-hover`                                                   | ValueCounts "Other" category; switched from slate to stone.                                                                                                                          |
| Syntax    | `--dt-syntax-string`, `--dt-syntax-type`                                               | SQL editor token colors; green + orange replace the default green + purple.                                                                                                          |
| Surfaces  | `--dt-bg`, `--dt-bg-secondary`, `--dt-bg-tertiary`, `--dt-border`, `--dt-border-light` | Whole-page warmth; tinted cream in light, warm stone in dark.                                                                                                                        |
| Dark text | `--dt-text`, `--dt-text-secondary`, `--dt-text-tertiary`, `--dt-arrow-*`               | Re-tuned for the warm-black background.                                                                                                                                              |
| Sizing    | `--dt-row-height`, `--dt-header-height`, `--dt-radius`                                 | Compact demonstration.                                                                                                                                                               |

## Portal gotcha — target both `:root` and `.dt-root`

The library mounts **Export**, **Derived Column**, and **SQL Filter** modals on `document.body` (they portal outside `.dt-root`). Overrides scoped only to `.dt-root` will not reach these modals — they fall back to the library's default blue `:root` values.

This example's `theme.css` targets **both** `:root` and `.dt-root` for light, and **both** `:root[data-dt-color-scheme="dark"]` and `.dt-root[data-dt-color-scheme="dark"]` for dark. `ModalHost` mirrors the `data-dt-color-scheme` attribute from `.dt-root` onto its portal host, so the dark-mode selector reaches both scopes automatically.

## Dark mode needs two triggers — `@media` AND the attribute

`colorScheme: 'auto'` (the default) tells the library to **remove** `data-dt-color-scheme` and let `@media (prefers-color-scheme: dark)` govern the palette. A custom theme that only declares dark overrides under `[data-dt-color-scheme="dark"]` will silently break in auto mode + OS dark: the library's own `@media` block flips library-controlled tokens (`--dt-text`, `--dt-border` defaults) to dark, while the unattributed custom overrides stay on the light palette — yielding light text on light backgrounds.

This example's `theme.css` therefore declares dark overrides in **both** an `@media (prefers-color-scheme: dark)` block (for auto mode) and a bare `[data-dt-color-scheme="dark"]` block (for explicit dark), with a light-restoration block inside the `@media` for instances that opt back to light. This mirrors the dual-trigger pattern in [`src/styles/01-variables.css`](../../src/styles/01-variables.css) — see the `@media` and `[data-dt-color-scheme="dark"]` blocks there for the canonical reference. CSS has no mixins, so the dark block is duplicated; keep the two copies in sync.

## Cascade note — import order matters

The overrides live in a separate `theme.css` file imported from `main.ts` **after** `@jeyabbalas/data-table/styles`. The library's built-in stylesheet declares its defaults on `:root` and `[data-dt-color-scheme="dark"]`; our overrides use the same specificity for portal coverage, so cascade order is what lets them win. Putting the overrides in an inline `<style>` in `<head>` would lose — inline styles in `<head>` load _before_ the JS module's CSS import, and same-specificity rules defer to whichever was declared later.
