# Svelte

The cleanest integration uses Svelte's `onMount` and `onDestroy`, or the
`use:action` directive for reusable mounting logic. Both Svelte 4 and
Svelte 5 (with runes) work the same way — the library is framework-agnostic.

## Minimal example (Svelte 4/5)

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
  import '@jeyabbalas/data-table/styles';

  export let source: File | string;

  let host: HTMLElement;
  let table: DataTable | undefined;

  onMount(async () => {
    table = await createDataTable({ container: host, source });
  });

  onDestroy(async () => {
    if (table && !table.isDestroyed()) await table.destroy();
  });
</script>

<div bind:this={host} style="height: 600px"></div>
```

## Svelte 5 with runes

```svelte
<script lang="ts">
  import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
  import '@jeyabbalas/data-table/styles';

  let { source }: { source: File | string } = $props();

  let host: HTMLElement;
  let table: DataTable | undefined = $state();

  $effect(() => {
    (async () => {
      table = await createDataTable({ container: host, source });
    })();
    return async () => {
      if (table && !table.isDestroyed()) await table.destroy();
    };
  });
</script>

<div bind:this={host} style="height: 600px"></div>
```

Don't wrap `table` in `$state` if you don't need reactivity on its members
— it's a big imperative object and Svelte's proxy doesn't play well with
it. Use plain `let` if you don't need to template-bind anything off the
table.

## `use:action` directive (reusable pattern)

```svelte
<!-- actions/dataTable.ts -->
<script context="module" lang="ts">
  import { createDataTable, type DataTable } from '@jeyabbalas/data-table';

  export function dataTable(node: HTMLElement, params: { source: File | string }) {
    let table: DataTable | undefined;

    (async () => {
      table = await createDataTable({ container: node, source: params.source });
    })();

    return {
      update(next: { source: File | string }) {
        if (table && !table.isDestroyed() && next.source !== params.source) {
          void table.loadData(next.source);
          params = next;
        }
      },
      async destroy() {
        if (table && !table.isDestroyed()) await table.destroy();
      },
    };
  }
</script>
```

Usage:

```svelte
<script>
  import { dataTable } from './actions/dataTable';

  export let source;
</script>

<div use:dataTable={{ source }} style="height: 600px"></div>
```

## `{#key}` to force re-mount

If you want the table to re-create (not just reload) when `source`
changes:

```svelte
{#key source}
  <div use:dataTable={{ source }} style="height: 600px"></div>
{/key}
```

Svelte tears down the element and its action, and remounts a fresh one.
Rarely necessary — `loadData()` on the existing instance is usually what
you want, since it preserves the worker.

## Event subscriptions

```svelte
<script>
  import { onMount, onDestroy } from 'svelte';
  /* … setup as above … */

  let matching = 0;
  let unsub: (() => void) | undefined;

  onMount(async () => {
    table = await createDataTable({ container: host, source });
    unsub = table.on('filterChange', ({ filteredRowCount }) => {
      matching = filteredRowCount;
    });
  });

  onDestroy(() => {
    unsub?.();
  });
</script>

<p>Matching: {matching.toLocaleString()}</p>
```

## Gotchas

- **`onDestroy` runs after `onMount` returns, but the `createDataTable()` Promise may still be pending.** If you expect fast unmounts, add a `cancelled` flag like the React pattern.
- **SvelteKit SSR.** The library is browser-only. Mount components inside `<svelte:fragment slot>`s that run client-side only, or wrap with `{#if browser}` from `$app/environment`.
- **Don't put `table` in a `$state` rune.** Unless you need reactivity on fields inside the table object. Svelte 5's proxy can loop on deep object access.
- **`use:action`'s `update()` receives new params only when the params expression identity changes.** If you pass `{ source }` inline, Svelte compares param objects by reference each render. Memoize or pass flat props.

## Related

- Events: [Events guide](../guides/events.md)
- API reference: [`createDataTable`](../api-reference.md#createdatatable), [`DataTable.loadData`](../api-reference.md#datatable-interface)
