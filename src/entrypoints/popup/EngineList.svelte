<script lang="ts">
  import type { EngineId } from "@/translators/catalog";
  import EngineRow from "./EngineRow.svelte";
  import { store } from "./state.svelte";

  let { hint, notify }: { hint: string; notify: (message: string) => void } = $props();

  let expanded = $state<EngineId | null>(null);
  const engines = $derived(store.settings.translatorEngines);
</script>

<section class="grid gap-2 px-3.5 py-(--row-gap)" aria-label={hint}>
  <p class="text-xs text-muted-foreground">{hint}</p>
  <ol class="grid gap-1.5">
    {#each engines as entry, index (entry.id)}
      <EngineRow
        {entry}
        first={index === 0}
        last={index === engines.length - 1}
        open={expanded === entry.id}
        ontoggle={() => (expanded = expanded === entry.id ? null : entry.id)}
        {notify}
      />
    {/each}
  </ol>
</section>
