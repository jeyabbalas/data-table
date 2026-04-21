# Nuxt 3

The library is browser-only. Nuxt's Universal Mode defaults to SSR, so
every table component must be client-only — either via the `<ClientOnly>`
component, a `.client.vue` suffix, or a plugin that runs in client mode.

## Minimal example — `<ClientOnly>` wrapper

```vue
<!-- app.vue -->
<template>
  <div>
    <h1>Dashboard</h1>
    <ClientOnly>
      <DataTableView source="/data/trips.csv" />
      <template #fallback>
        <p>Loading table…</p>
      </template>
    </ClientOnly>
  </div>
</template>
```

```vue
<!-- components/DataTableView.vue -->
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { createDataTable, type DataTable } from '@jeyabbalas/data-table';
import '@jeyabbalas/data-table/styles';

const props = defineProps<{ source: string }>();
const host = ref<HTMLElement | null>(null);
let table: DataTable | undefined;

onMounted(async () => {
  if (host.value) {
    table = await createDataTable({ container: host.value, source: props.source });
  }
});

watch(() => props.source, async (next) => {
  if (table && !table.isDestroyed()) await table.loadData(next);
});

onBeforeUnmount(async () => {
  if (table && !table.isDestroyed()) await table.destroy();
});
</script>

<template>
  <div ref="host" style="height: 600px" />
</template>
```

Nuxt auto-imports components from `components/`, so `<DataTableView>` is
available anywhere without an explicit import.

## `.client.vue` suffix

Rename the component to `DataTableView.client.vue` and Nuxt will only
mount it on the client — no `<ClientOnly>` wrapper needed:

```
components/
  DataTableView.client.vue
```

```vue
<!-- app.vue -->
<template>
  <DataTableView source="/data/trips.csv" />
</template>
```

Compared to `<ClientOnly>`, the `.client.vue` approach is less flexible
(the whole file is client-only) but more ergonomic for table-heavy
dashboards.

## Putting the library in a plugin

If multiple pages need a shared manager (e.g., `FilterPresetManager`),
create it in a client-only plugin:

```ts
// plugins/data-table.client.ts
import {
  FilterPresetManager,
  SessionStore,
} from '@jeyabbalas/data-table';

export default defineNuxtPlugin(() => {
  const presets = new FilterPresetManager();
  const store = new SessionStore();

  return {
    provide: { dataTable: { presets, store } },
  };
});
```

Use inside a component:

```vue
<script setup lang="ts">
const { $dataTable } = useNuxtApp();

onMounted(async () => {
  await $dataTable.store.open();
  table = await createDataTable({
    container: host.value!,
    source,
    presets: { manager: $dataTable.presets },
    persistence: { sessionStore: $dataTable.store },
  });
});
</script>
```

The `.client.ts` suffix ensures the plugin only runs on the client,
skipping it entirely during SSR.

## Static fixtures

Place data under `public/`:

```
public/
  data/
    trips.csv
```

Reference them with absolute paths — Nuxt serves `public/` at the site
root.

## Self-hosted WASM

Same pattern as Next.js — drop DuckDB WASM bundles into `public/duckdb/`
and point `bridgeOptions.duckdbBundles` at them. See
[CSP and offline](../guides/csp-and-offline.md).

## CSP

Add to `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  nitro: {
    routeRules: {
      '/**': {
        headers: {
          'Content-Security-Policy': "script-src 'self'; worker-src 'self';",
        },
      },
    },
  },
});
```

Adjust to match your app's other CSP requirements.

## Gotchas

- **Forgetting `<ClientOnly>` or `.client.vue`.** Trying to render the table during SSR causes errors like "document is not defined" — the library uses `document`/`window`/`Worker` directly.
- **`useAsyncData` doesn't help.** The library isn't a data fetcher; it mounts DOM and opens a worker. Don't wrap `createDataTable` in `useAsyncData`.
- **Module auto-import weirdness.** Nuxt auto-imports `useNuxtApp` but not the `@jeyabbalas/data-table` symbols. Import those explicitly.
- **HMR of `.client.vue` components.** Hot-module reload re-runs the component's setup; make sure your `onBeforeUnmount` fires cleanly. Check for `DestroyedError` warnings in the console.

## Related

- Vue 3: [Vue integration](./vue.md) for the underlying mount pattern
- CSP / offline: [CSP and offline guide](../guides/csp-and-offline.md)
- Vite: [Vite integration](./vite.md) (Nuxt 3 uses Vite by default)
