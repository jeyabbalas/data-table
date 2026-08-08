[**@jeyabbalas/data-table**](../../README.md)

***

[@jeyabbalas/data-table](../../README.md) / [advanced](../README.md) / BaseStatsPanel

# Abstract Class: BaseStatsPanel

Defined in: [visualizations/BaseStatsPanel.ts:128](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/BaseStatsPanel.ts#L128)

Abstract base class for column stats panels.

Subclasses must implement [update](#update); everything else has a sensible
default. The library guarantees:

- The constructor is called with an empty `container` element (the
  `.dt-col-stats` slot inside a column header).
- [update](#update) fires with `null` once on mount, then with each
  `ColumnStatsData` the visualization for this column emits (and on data
  reload). Columns without a visualization receive `update(null)` only.
- [updateFilters](#updatefilters) fires every time the table's active filter array
  changes, before any subsequent `update(stats)` call from a viz refetch.
- [setHoverStats](#sethoverstats) fires when a viz emits a hover snippet for this
  column (and again with `null` to clear). Columns without a viz never
  trigger this.
- [destroy](#destroy) is called exactly once, before the container is reused
  for a freshly-constructed panel (e.g. on a schema change). Subclasses
  are responsible for clearing any DOM nodes they appended.

## Constructors

### Constructor

> **new BaseStatsPanel**(`container`, `column`, `options`): `BaseStatsPanel`

Defined in: [visualizations/BaseStatsPanel.ts:134](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/BaseStatsPanel.ts#L134)

#### Parameters

##### container

`HTMLElement`

##### column

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

##### options

[`StatsPanelOptions`](../interfaces/StatsPanelOptions.md)

#### Returns

`BaseStatsPanel`

## Properties

### column

> `protected` `readonly` **column**: [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseStatsPanel.ts:130](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/BaseStatsPanel.ts#L130)

***

### container

> `protected` `readonly` **container**: `HTMLElement`

Defined in: [visualizations/BaseStatsPanel.ts:129](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/BaseStatsPanel.ts#L129)

***

### destroyed

> `protected` **destroyed**: `boolean` = `false`

Defined in: [visualizations/BaseStatsPanel.ts:132](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/BaseStatsPanel.ts#L132)

***

### options

> `protected` **options**: [`StatsPanelOptions`](../interfaces/StatsPanelOptions.md)

Defined in: [visualizations/BaseStatsPanel.ts:131](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/BaseStatsPanel.ts#L131)

## Methods

### destroy()

> **destroy**(): `void`

Defined in: [visualizations/BaseStatsPanel.ts:199](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/BaseStatsPanel.ts#L199)

Tear down the panel. Subclasses must clear any DOM nodes they appended
to `container` and any subscriptions or listeners they registered, then
call `super.destroy()`. The library does not clear the container for
the panel; that is the panel's responsibility.

The library calls `destroy()` exactly once on its own teardown path
(schema change, table destroy). Panels should **not** call `destroy()`
on themselves — the library tracks active panels in a name-keyed map
and a self-destroy leaves a dangling registration whose
`.dt-col-stats` slot is no longer eligible for fallback rendering.
Use `setHoverStats` / `update` to express resting / loading / empty
states instead, and let the library's lifecycle drive `destroy()`.

#### Returns

`void`

***

### getColumn()

> **getColumn**(): [`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

Defined in: [visualizations/BaseStatsPanel.ts:209](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/BaseStatsPanel.ts#L209)

The column this panel renders stats for.

#### Returns

[`ColumnSchema`](../../index/interfaces/ColumnSchema.md)

***

### isDestroyed()

> **isDestroyed**(): `boolean`

Defined in: [visualizations/BaseStatsPanel.ts:204](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/BaseStatsPanel.ts#L204)

True after [destroy](#destroy) has been called.

#### Returns

`boolean`

***

### setHoverStats()

> **setHoverStats**(`_html`): `void`

Defined in: [visualizations/BaseStatsPanel.ts:168](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/BaseStatsPanel.ts#L168)

Called when the user hovers a visualization bin / segment. `null`
clears the hover and signals the panel should restore its resting state.

The argument is an **HTML string**, not plain text — the same pre-
formatted markup the library's built-in panel briefly renders in place
of the second line (e.g.
`<span class="stats-label">Bin:</span><br>...`). The library's bundled
visualizations escape every user-derived value before producing this
string (see `escapeHTML` calls inside `Histogram` / `ValueCounts`); a
panel writing the value via `innerHTML` is trusting the visualization
to have done that escaping.

Custom visualizations that emit their own hover snippets are
responsible for escaping any user-derived text before passing it to
`onStatsChange`. Panels that only want plain text should write the
value via `textContent`, which strips the markup safely (line breaks
and label styling will be lost, but XSS-safe by construction).

Default implementation is a no-op so simple panels can ignore hover.

#### Parameters

##### \_html

`string` \| `null`

#### Returns

`void`

***

### update()

> `abstract` **update**(`stats`): `void`

Defined in: [visualizations/BaseStatsPanel.ts:145](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/BaseStatsPanel.ts#L145)

Called when default stats become available or change. Receives `null`
on the initial render before the visualization has fetched (or when no
visualization is registered for the column).

#### Parameters

##### stats

[`ColumnStatsData`](../type-aliases/ColumnStatsData.md) \| `null`

#### Returns

`void`

***

### updateFilters()

> **updateFilters**(`filters`): `Promise`\<`void`\>

Defined in: [visualizations/BaseStatsPanel.ts:180](https://github.com/jeyabbalas/data-table/blob/a7f22ed188c02320dd2e0b381eef2c6831c212fa/src/visualizations/BaseStatsPanel.ts#L180)

Called when the table's active filter array changes. The default
implementation only refreshes `this.options.filters`; subclasses that
compute their own statistics should override this to issue queries via
`this.options.bridge`. The visualization is guaranteed to call
[update](#update) with the refreshed `ColumnStatsData` separately, so
panels that only re-render existing stats need not override.

#### Parameters

##### filters

[`Filter`](../../index/type-aliases/Filter.md)[]

#### Returns

`Promise`\<`void`\>
