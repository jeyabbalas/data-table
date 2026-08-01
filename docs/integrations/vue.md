# Vue 3

Create the table in `onMounted`, destroy it in `onBeforeUnmount`. For
reactive data sources, `watch` the `source` ref and call
`table.loadData(newSource)` without re-creating the table.

## Minimal example

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

const props = defineProps<{ source: File | string }>();
const host = ref<HTMLElement | null>(null);
let table: DataTable | undefined;

onMounted(async () => {
  if (host.value) {
    table = await createDataTable({ container: host.value, source: props.source });
  }
});

onBeforeUnmount(async () => {
  if (table && !table.isDestroyed()) await table.destroy();
});
</script>

<template>
  <div ref="host" style="height: 600px" />
</template>
```

The height on the host is a requirement, not styling. The table virtualizes
against the container's measured height and renders only the rows that fit;
an unbounded container silently renders every row in the dataset. See
[Sizing the container](../../README.md#sizing-the-container).

## Reactive source changes

Re-load data inside the existing table rather than destroying and
recreating it:

```vue
<script setup lang="ts">
import { watch } from 'vue';
// … onMounted setup as above …

watch(
  () => props.source,
  async (next) => {
    if (table && !table.isDestroyed()) {
      await table.loadData(next);
    }
  },
);
</script>
```

If the schema changes between sources, call `clearSession()` before
`loadData()` to reset filter/column state that references old column names.

## Subscribing to events (reactive)

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';

const filteredCount = ref(0);
let unsub: (() => void) | undefined;

onMounted(async () => {
  table = await createDataTable({ container: host.value!, source: props.source });
  unsub = table.on('filterChange', ({ filteredRowCount }) => {
    filteredCount.value = filteredRowCount;
  });
});

onBeforeUnmount(() => {
  unsub?.();
});
</script>

<template>
  <div ref="host" style="height: 600px" />
  <p>Matching: {{ filteredCount.toLocaleString() }}</p>
</template>
```

## Vue reactivity caveats

- **Don't pass a reactive `ref` as `container`.** The library wants a raw
  `HTMLElement`. Use `host.value` inside `onMounted`, not `host` directly.
- **Don't make the `table` object reactive.** It's a big imperative
  object with methods; wrapping it in `ref()` or `reactive()` can trigger
  proxy-based recursion issues. Keep it in a plain `let` at module scope
  or inside `<script setup>`.
- **Props are reactive.** `props.source` is a Vue ref-like; if you
  dereference it in a one-time setup, you lose reactivity. Use `watch` for
  anything that should update.

## Composable wrapper

For reuse across multiple components:

```ts
// composables/useDataTable.ts
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';

export function useDataTable(hostRef: Ref<HTMLElement | null>, source: Ref<File | string | null>) {
  let table: DataTable | undefined;
  const filteredCount = ref(0);

  onMounted(async () => {
    if (hostRef.value && source.value) {
      table = await createDataTable({ container: hostRef.value, source: source.value });
      table.on('filterChange', ({ filteredRowCount }) => {
        filteredCount.value = filteredRowCount;
      });
    }
  });

  watch(source, async (next) => {
    if (table && !table.isDestroyed() && next) {
      await table.loadData(next);
    }
  });

  onBeforeUnmount(async () => {
    if (table && !table.isDestroyed()) await table.destroy();
  });

  return { filteredCount };
}
```

## Gotchas

- **Host element is null on first render.** Use `onMounted` — by that time `ref` is populated.
- **Async mount + fast unmount race.** If the parent unmounts before `createDataTable()` resolves, `onBeforeUnmount` sees `table === undefined`. Guard with a `cancelled` flag (like the React pattern) if you hit this in practice.
- **Avoid deep-reactive proxies on the table object.** Vue's reactivity system tries to recursively track property access; keep `table` out of `reactive()` / `ref()`.
- **SSR.** Vue SSR (Nuxt Universal Mode) can't run this library server-side. See the [Nuxt integration](./nuxt.md) for `<ClientOnly>` patterns.

## Related

- Nuxt: [Nuxt integration](./nuxt.md) for SSR-safe mounting
- Events: [Events guide](../guides/events.md)
- API reference: [`createDataTable`](../api-reference.md#createdatatable), [`DataTable.loadData`](../api-reference.md#datatable-interface)
