# Migration: Phase 3 — `exactOptionalPropertyTypes` widening

> Phase 3 of the pre-1.0 review enables TypeScript's
> `exactOptionalPropertyTypes` strictness flag in the library's `tsconfig.json`.
> Where the library accepts an optional option / parameter that consumers
> regularly pass through from another optional source, the field signature has
> been widened from `prop?: T` to `prop?: T | undefined` so explicit `undefined`
> remains assignable.

**Released:** 2026-04-26 (`@jeyabbalas/data-table` next patch)
**Affected versions:** consumers compiling against `@jeyabbalas/data-table`'s emitted `.d.ts`
**Migration difficulty:** trivial (consumers who simply omit optional properties are unaffected)

## Summary

`exactOptionalPropertyTypes: true` in TypeScript treats `prop?: T` as
"may be missing — but if present, must be `T` (not `undefined`)". That tighter
contract surfaced in `dist/*.d.ts` would have broken consumers who pass an
already-optional value through to a library option (e.g.
`createDataTable({ portalTarget: maybeEl })` where `maybeEl: HTMLElement | undefined`).
To keep that pattern working, every public option type whose field is genuinely
"optional and may be `undefined`" was widened to `prop?: T | undefined`.

The runtime behaviour is identical. Consumers who **omitted** the property
before see no change. Consumers who explicitly assigned `undefined` (rare,
but legal) also see no change. Only consumers who relied on TypeScript's
old loose-mode behaviour would notice — and the new shape is the same shape
TypeScript emits without the flag, so this is the more permissive direction.

## Breaking changes

### 1. Public option-type fields widened to `T | undefined`

**What changed.** Every optional field on the following public option types
gained an explicit `| undefined`. This appears in the published `.d.ts` but
is invisible at runtime.

- `CreateDataTableOptions` (e.g. `portalTarget`, `rowHeight`, `headerHeight`,
  `editorFactory`, `tableName`, `sourceFormat`, `bridge`, `bridgeOptions`,
  `colorScheme`, `messages`, `presets`, …)
- `TableContainerOptions` (`rowHeight`, `headerHeight`, `classPrefix`,
  `instanceId`, `editorFactory`, `presetManager`, `portalTarget`,
  `colorScheme`, `messages`, `annotations`, `annotationPopover`,
  `columnHeaderTooltipPopover`, …)
- `LoadDataOptions` (`sessionStore`, `presetManager`, `annotationStore`,
  `tableName`, `format`)
- `VirtualScrollerOptions` (`bufferRows`, `classPrefix`,
  `externalScrollContainer`)
- `FilterPreset` (`description`, `sortColumns`)
- `WorkerBridgeOptions` (`cache`, `initializeTimeoutMs`, `workerFactory`,
  `workerUrl`, `duckdbBundles`)
- `LoadOptions` (`tableName`)
- `DataLoaderOptions` (`tableName`, `format`)
- `AutoSaveOptions` (`debounceMs`, `undoManager`, `presetManager`,
  `annotationStore`, `onError`)
- `ColumnSchema` (`isDerived`, `expression`, `system`)
- `RawSQLFilter.label`
- `DataTableErrorOptions` (`code`, `details`)
- `EventEmitter` constructor's `onListenerError` parameter
- `ModalOptions` (every optional field — `dialog`, `labelledBy`,
  `describedBy`, `onClose`, `closeOnEscape`, `closeOnBackdropClick`,
  `closeOnOutsideClick`, `trapFocus`, `restoreFocus`, `initialFocus`,
  `escapeGuard`, `outsideClickIgnore`, `colorSchemeSource`)
- Every `/advanced` UI-component options type (`AnnotationPopoverOptions`,
  `ColumnHeaderTooltipPopoverOptions`, `KeyboardNavigatorOptions`,
  `ColumnHeaderOptions`, `TableBodyOptions`, `ColumnReorderOptions`,
  `ColumnResizerOptions`, `HiddenColumnsGutterOptions`,
  `AddColumnButtonOptions`, `FilterChipOptions`, `FilterBarOptions`,
  `FilterPanelOptions`, `FilterPresetPanelOptions`, `SQLFilterModalOptions`,
  `DerivedColumnEditPanelOptions`, `DerivedColumnModalOptions`,
  `ExportDialogOptions`)
- `TableEvents.derivedChange.columnName`
- `CategoricalColumnStats.trueCount`

**Why.** TypeScript 5.0+ treats `prop?: T` and `prop?: T | undefined`
differently under `exactOptionalPropertyTypes: true`. Because the library
internally enables this flag, any field declared as `prop?: T` would reject
an explicit `prop: undefined` assignment — and call sites that thread an
already-optional value through (`portalTarget: opts.portalTarget` where
`opts: { portalTarget?: HTMLElement }` resolves to `HTMLElement | undefined`)
would no longer compile.

**Before**

```ts
import { createDataTable } from '@jeyabbalas/data-table';

interface MyAppOptions {
  portalTarget?: HTMLElement;
}

function mount(opts: MyAppOptions) {
  return createDataTable({
    container: document.body,
    source: '/data.csv',
    portalTarget: opts.portalTarget, // ✗ would error: HTMLElement | undefined ≠ HTMLElement
  });
}
```

**After (no consumer change required)**

```ts
import { createDataTable } from '@jeyabbalas/data-table';

interface MyAppOptions {
  portalTarget?: HTMLElement;
}

function mount(opts: MyAppOptions) {
  return createDataTable({
    container: document.body,
    source: '/data.csv',
    portalTarget: opts.portalTarget, // ✓ accepts HTMLElement | undefined
  });
}
```

**Automated migration.** None — consumer code does not change. The widening
is observable only when comparing `dist/*.d.ts` contents across the two
versions.

## Non-breaking but recommended

If your project also enables `exactOptionalPropertyTypes: true` and you want
to mirror the library's stricter posture, you can keep your option-passing
sites narrow by spreading conditionally:

```ts
const tableOpts: CreateDataTableOptions = {
  container,
  source,
  ...(opts.portalTarget !== undefined ? { portalTarget: opts.portalTarget } : {}),
};
```

This is purely cosmetic — the library accepts both shapes.

## Verification checklist

- [ ] `npm install @jeyabbalas/data-table@<next-patch>` in the target project.
- [ ] `npm run build` (or `tsc --noEmit`) passes — no consumer-side fixes needed.
- [ ] If you maintain a vendored copy of any of the `/advanced` option
      types' shapes, regenerate or update from the new `.d.ts`.

## See also

- [`tests/api-surface.snapshot.test.ts.snap`](../../tests/__snapshots__/api-surface.snapshot.test.ts.snap)
  for the runtime-key snapshot (unchanged — only `.d.ts` types changed).
- Review report: [`review/phase-3-report.md`](../../review/phase-3-report.md).
