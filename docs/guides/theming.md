# Theming

Every colour, spacing value, and z-index used by `@jeyabbalas/data-table`
reads from a CSS custom property. Override the ones you care about on
`:root` (or a per-instance ancestor) and the table picks up the change
without a rebuild.

This guide is the authoritative reference — both for the full `--dt-*`
variable list and for the dark-mode / per-instance scoping model.

## You'll learn how to

- Override the library's theme globally or per instance
- Drive dark mode via OS preference, per-instance attribute, or a runtime API
- Understand the z-index stacking ladder and how to interleave host-app layers
- Widen floating panels or change row height

## Prerequisites

- Read: [Quick start](../../README.md#quick-start), [API reference — `colorScheme` option](../api-reference.md#createdatatable)
- Runnable example: [`examples/06-custom-theme`](../../examples/06-custom-theme/)

## Minimal example

```css
:root {
  --dt-primary: #10b981;
  --dt-radius: 4px;
}
```

That's it. The table picks up the overrides through the normal CSS cascade
— no JavaScript involvement, no rebuild.

## How scoping works

Light-mode values are declared on `:root`:

```css
:root {
  --dt-primary: #2563eb;
  --dt-bg: #ffffff;
  /* … */
}
```

Every element of the table inherits from `:root` — including body-portalled
modals (export dialog, derived-column editor, SQL filter editor, CodeMirror
autocomplete) because they too descend from `<html>`.

### Global override

```css
:root {
  --dt-primary: #10b981;
  --dt-panel-width: 420px;
}
```

Cascades everywhere.

### Per-instance override

```html
<div id="my-table" class="dt-root mint-theme"></div>

<style>
.dt-root.mint-theme { --dt-primary: #10b981; }
</style>
```

Or inline:

```js
container.style.setProperty('--dt-primary', '#10b981');
```

Don't redeclare the library's variables on `.dt-root` unconditionally —
that would shadow `:root` overrides for everything inside the table. Use
inline style or a modifier class with a distinct selector.

## Dark mode

Light is the default. Dark mode has two triggers:

1. **OS preference** (`@media (prefers-color-scheme: dark)`). Applies under
   `:root` automatically — unless a subtree explicitly opts out via
   `data-dt-color-scheme="light"`.
2. **Explicit per-instance** (`data-dt-color-scheme="dark"` attribute).
   Applies regardless of OS preference. Overrides OS-light to force dark.

The `data-dt-color-scheme` attribute is set by `createDataTable()` on the
`.dt-root` element and copied onto body-portalled modal hosts so portalled
chrome stays in sync.

### Setting the scheme from JavaScript

```ts
// At construction:
await createDataTable({ container, source, colorScheme: 'dark' });

// At runtime:
table.setColorScheme('dark');   // force dark
table.setColorScheme('light');  // force light
table.setColorScheme('auto');   // clear override, follow OS
```

`getColorScheme()` returns the currently-applied scheme. `setColorScheme`
throws `ConfigurationError` if passed anything other than `'light' | 'dark'
| 'auto'`.

### Native form-control chrome

The CSS `color-scheme` property is flipped alongside `--dt-*` tokens. That
ensures text inputs, textareas, and scrollbars inside the table (and inside
portalled modals) render with the correct light/dark caret, selection
highlight, autofill, and scrollbar colours — not an off-theme native widget.

## The complete variable reference

<!-- dt-vars:start -->

Every CSS custom property the library reads. All default to light-mode
values declared on `:root`; dark-mode variants apply automatically under
`prefers-color-scheme: dark` (unless the instance carries
`data-dt-color-scheme="light"`) and unconditionally under
`data-dt-color-scheme="dark"`.

### Palette

| Variable | Role | Light default | Dark default |
|---|---|---|---|
| `--dt-primary` | Accent colour for focused UI, buttons, sort indicators. | `#2563eb` | `#3b82f6` |
| `--dt-primary-hover` | Hover state for `--dt-primary`. | `#1d4ed8` | `#60a5fa` |
| `--dt-primary-light` | Light wash behind active rows / filters. | `#eff6ff` | `#1e3a5f` |
| `--dt-primary-lighter` | Lighter wash for selected-row backgrounds. | `#dbeafe` | `#1e40af` |
| `--dt-primary-alpha-10` | 10% alpha of `--dt-primary` (derived via `color-mix`). | — | — |
| `--dt-primary-alpha-20` | 20% alpha of `--dt-primary`. | — | — |
| `--dt-primary-alpha-30` | 30% alpha of `--dt-primary`. | — | — |
| `--dt-primary-alpha-50` | 50% alpha of `--dt-primary`. | — | — |
| `--dt-accent` | Secondary accent (null bars, warning chrome). | `#f59e0b` | `#fbbf24` |
| `--dt-accent-hover` | Hover state for `--dt-accent`. | `#d97706` | `#f59e0b` |
| `--dt-accent-soft` | Soft translucent version of `--dt-accent` (derived). | — | — |
| `--dt-neutral` | Neutral slate for ValueCounts "Other" category. | `#94a3b8` | `#64748b` |
| `--dt-neutral-hover` | Hover state for `--dt-neutral`. | `#64748b` | `#94a3b8` |
| `--dt-neutral-soft` | Soft translucent version of `--dt-neutral` (derived). | — | — |
| `--dt-success` | Success indicator colour (validated SQL, etc.). | `#22c55e` | `#4ade80` |

The four `--dt-primary-alpha-*` and the three `*-soft` tokens are computed
from their base tokens via `color-mix()`. Overriding the base cascades to
all derivatives automatically — you don't need to redeclare them.

### Surfaces

| Variable | Role | Light default | Dark default |
|---|---|---|---|
| `--dt-bg` | Primary table background. | `#ffffff` | `#111827` |
| `--dt-bg-secondary` | Secondary background (header, filter bar). | `#f9fafb` | `#1f2937` |
| `--dt-bg-tertiary` | Tertiary background (hover rows, input fills). | `#f3f4f6` | `#374151` |
| `--dt-border` | Primary border colour. | `#e5e7eb` | `#374151` |
| `--dt-border-light` | Subtle border for nested components. | `#f3f4f6` | `#1f2937` |
| `--dt-backdrop` | Modal scrim (semi-transparent). | `rgba(0,0,0,0.4)` | `rgba(0,0,0,0.6)` |

### Text & icons

| Variable | Role | Light default | Dark default |
|---|---|---|---|
| `--dt-text` | Default text colour. | `#111827` | `#f9fafb` |
| `--dt-text-secondary` | Secondary / caption text. | `#6b7280` | `#d1d5db` |
| `--dt-text-tertiary` | Tertiary / placeholder text. | `#9ca3af` | `#9ca3af` |
| `--dt-arrow-default` | Idle colour for sort / expand icons. | `#d1d5db` | `#4b5563` |
| `--dt-arrow-hover` | Hover colour for sort / expand icons. | `#9ca3af` | `#6b7280` |

### Error / validation

| Variable | Role | Light default | Dark default |
|---|---|---|---|
| `--dt-error` | Base error colour. | `#ef4444` | `#f87171` |
| `--dt-error-dark` | Darker error accent (button hover, text). | `#dc2626` | `#ef4444` |
| `--dt-error-darker` | Strongest error accent. | `#b91c1c` | `#dc2626` |
| `--dt-error-soft` | Soft translucent error wash (derived). | — | — |
| `--dt-error-bg` | Error surface background (banners, panels). | `#fef2f2` | `#451a1a` |
| `--dt-error-border-soft` | Soft border for error banners. | `#fecaca` | `#7f1d1d` |
| `--dt-error-text-strong` | Strong error text for dark-mode legibility. | `#7f1d1d` | `#fca5a5` |
| `--dt-on-error` | Foreground on error-coloured surfaces. | `#ffffff` | `#ffffff` |

### Sizing

| Variable | Default | Role |
|---|--:|---|
| `--dt-header-height` | `120px` | Column header area height (room for visualizations). |
| `--dt-row-height` | `32px` | Virtual-scroller row height. |
| `--dt-col-width` | `200px` | Default column width. |
| `--dt-scrollbar-width` | `17px` | Reserved gutter for the body's vertical scrollbar. |
| `--dt-panel-width` | `320px` | Floating-panel (filter / preset / derived-edit) width. |
| `--dt-radius` | `8px` | Default border radius. |
| `--dt-radius-sm` | `4px` | Small border radius (buttons, chips). |

### Typography

| Variable | Default | Role |
|---|---|---|
| `--dt-font-family` | system-ui stack | Font family for all library chrome. |
| `--dt-font-size` | `0.875rem` | Base font size. |
| `--dt-font-size-sm` | `0.75rem` | Small font size (filter chips, hints). |
| `--dt-font-size-xs` | `0.7rem` | Extra-small font size (stats captions). |

### Effects

| Variable | Default | Role |
|---|---|---|
| `--dt-transition` | `0.15s ease` | Shared transition timing. |
| `--dt-shadow-sm` | `rgba(0,0,0,0.06)` / `rgba(0,0,0,0.4)` | Small elevation shadow. |
| `--dt-shadow-md` | `rgba(0,0,0,0.12)` / `rgba(0,0,0,0.5)` | Medium elevation shadow (panels, modals). |

### Syntax highlighting

| Variable | Light default | Dark default | Role |
|---|---|---|---|
| `--dt-syntax-string` | `#16a34a` | `#4ade80` | String literals in the SQL editor. |
| `--dt-syntax-type` | `#9333ea` | `#c084fc` | Type keywords in the SQL editor. |

### Stacking ladder

Every `z-index` in the library goes through a `--dt-z-*` variable, so you
can interleave your own layers without hunting through the stylesheet.

| Variable | Default | Layer |
|---|--:|---|
| `--dt-z-table-body` | `1` | Table body cells (focused cells, resize handle). |
| `--dt-z-pinned-col` | `20` | Sticky pinned-column base; JS adds per-pin offsets. |
| `--dt-z-header` | `21` | Column header row + hidden-columns gutter. |
| `--dt-z-action-panel` | `30` | Per-column action panel popovers (reserved). |
| `--dt-z-filter-bar` | `40` | Filter bar at the top of the table. |
| `--dt-z-floating-panel` | `50` | In-page panels (filter, preset, derived-edit, drop indicator). |
| `--dt-z-annotation-popover` | `55` | Annotation popover (sits between floating panels and the autocomplete tooltip). |
| `--dt-z-autocomplete` | `60` | CodeMirror autocomplete tooltip (portalled to `<body>`). |
| `--dt-z-modal` | `1000` | Full-screen modals + backdrops. |
| `--dt-z-modal-stack-step` | `2` | Step added per stacked modal/panel so simultaneously-open dialogs layer predictably. |

Simultaneously-open modals or panels receive `--dt-z-{modal,floating-panel}
+ stackIndex * --dt-z-modal-stack-step`. Gaps are ≥ 10 so you can slot
host-app UI between layers:

```css
:root {
  --dt-z-modal: 5000;
  --dt-z-autocomplete: 4900;
  --dt-z-floating-panel: 4800;
}
```

Pinned-column stacking is computed as `--dt-z-pinned-col + pinOrderOffset`,
so overriding `--dt-z-pinned-col` shifts the whole pinned group together.

### Annotations

Palette used by the row / cell / column-header annotation overlays and the
annotation popover. Each severity has a `fg` (text), `bg` (tint) and `bdr`
(stripe / underline / pill border) token. Override any of them to match a
host-app design system; the library reads them through `var()` so there's
no rebuild step.

| Variable | Role | Light default | Dark default |
|---|---|---|---|
| `--dt-annotation-error-fg` | Error-severity text on tinted surfaces. | `#7a0b14` | `#fca5a5` |
| `--dt-annotation-error-bg` | Error-severity surface tint (rows, cells, headers, pills). | `#fde2e5` | `#451a1a` |
| `--dt-annotation-error-bdr` | Error-severity accent (cell left-border, header underline, pill border). | `#d34551` | `#dc2626` |
| `--dt-annotation-warning-fg` | Warning-severity text on tinted surfaces. | `#7a4a00` | `#fcd34d` |
| `--dt-annotation-warning-bg` | Warning-severity surface tint. | `#fff0cc` | `#3f2d0a` |
| `--dt-annotation-warning-bdr` | Warning-severity accent. | `#d89b1b` | `#d89b1b` |
| `--dt-annotation-info-fg` | Info-severity text on tinted surfaces. | `#003e66` | `#93c5fd` |
| `--dt-annotation-info-bg` | Info-severity surface tint. | `#d6ecfa` | `#0f2a44` |
| `--dt-annotation-info-bdr` | Info-severity accent. | `#2687c7` | `#2687c7` |
| `--dt-annotation-error-bg-hover` | Hover surface for error-tinted cells. Derived from `-bg` + `-bdr` via `color-mix`; overriding the base tokens flows through automatically. | derived | derived |
| `--dt-annotation-warning-bg-hover` | Hover surface for warning-tinted cells. Derived from `-bg` + `-bdr`. | derived | derived |
| `--dt-annotation-info-bg-hover` | Hover surface for info-tinted cells. Derived from `-bg` + `-bdr`. | derived | derived |

### Internal

| Variable | Role |
|---|---|
| `--dt-stylesheet-loaded` | Library-internal marker used by `createDataTable()` to warn when the stylesheet import is missing. Do not override. |

<!-- dt-vars:end -->

## Stylesheet detection

If you forget to import `@jeyabbalas/data-table/styles`, the library checks
the computed value of `--dt-stylesheet-loaded` and emits a `warning` event
once per page:

```ts
table.on('warning', ({ code }) => {
  if (code === 'STYLESHEET_MISSING') {
    console.warn('Import @jeyabbalas/data-table/styles (or the CSS file) to render the UI properly.');
  }
});
```

That's the mechanism; don't override `--dt-stylesheet-loaded` yourself.

## Multiple tables with different themes

Per-instance scheme and variable overrides work naturally:

```ts
await createDataTable({
  container: el1,
  source,
  colorScheme: 'dark',    // table A always dark
});

await createDataTable({
  container: el2,
  source,
  colorScheme: 'light',   // table B always light
});

// Then style each container differently:
el1.style.setProperty('--dt-primary', '#10b981');
el2.style.setProperty('--dt-primary', '#f97316');
```

Modals portalled to `<body>` copy the owning table's `data-dt-color-scheme`
attribute on open, so an export dialog opened from the dark table stays
dark even if the page root is light.

## Recipes

### Brand tokens via CSS custom properties you already have

```css
:root {
  --brand-primary: #10b981;
  --brand-danger: #f97316;
}

.dt-root {
  --dt-primary: var(--brand-primary);
  --dt-error: var(--brand-danger);
}
```

### Raise the modal layer above your app's dialog

```css
:root {
  --dt-z-modal: 5000;            /* above your own modal layer */
  --dt-z-autocomplete: 4900;
  --dt-z-floating-panel: 4800;
}
```

### Taller rows for a data-dense view

```css
:root {
  --dt-row-height: 48px;
  --dt-header-height: 160px;     /* give visualizations more vertical room */
}
```

### Disable visualizations' colour palette without rewriting each one

Set `--dt-accent` and `--dt-neutral` to greyscale variants; the built-in
visualizations read those tokens rather than hard-coded colours.

## Gotchas

- **Don't redeclare `--dt-*` on `.dt-root` unconditionally.** That would shadow `:root` overrides for every element inside the table. Use a modifier class or inline style for per-instance differences.
- **Dark mode has two trigger systems.** `prefers-color-scheme: dark` *and* `[data-dt-color-scheme="dark"]`. The attribute wins when explicitly set. To follow OS again, call `setColorScheme('auto')`.
- **`color-scheme` is also flipped in dark.** Native form controls (inputs, scrollbars) use this. If you skin them yourself, watch out for double-flipping.
- **Z-indices have gaps of ≥ 10 intentionally.** Don't set them contiguously — leave room for host-app layers.
- **`--dt-stylesheet-loaded` is an internal sentinel.** Overriding it silences the warning even when the real stylesheet isn't loaded. Don't.
- **Per-instance panel width.** `--dt-panel-width` is read by JS (for edge clamping) via `getComputedStyle(...).offsetWidth`, so an override takes effect immediately.

## Related

- Events: [Events guide — `warning` event, `STYLESHEET_MISSING` code](./events.md)
- Multi-table: [Multi-table dashboards](./multi-table.md) for per-instance scheme propagation
- Troubleshooting: [Stylesheet missing warning](../troubleshooting.md)
- API reference: [`colorScheme` option](../api-reference.md#createdatatable), [`setColorScheme` method](../api-reference.md#datatable-interface)
- Source: `src/styles/01-variables.css`, `src/core/stylesheet.ts`, `src/core/ModalHost.ts`
