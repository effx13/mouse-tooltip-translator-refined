<script lang="ts">
  import type { Option } from "@/entrypoints/popup/options";
  import Chip from "./Chip.svelte";

  let {
    id,
    label,
    value,
    options,
    onchange,
  }: {
    id: string;
    label: string;
    value: unknown;
    options: Option[];
    onchange: (value: string[]) => void;
  } = $props();

  const selected = $derived(Array.isArray(value) ? (value as string[]) : []);
  const labelOf = $derived(new Map(options.map((option) => [String(option.value), option.label])));
  const remaining = $derived(options.filter((option) => !selected.includes(String(option.value))));
</script>

<div class="field">
  <label class="field-label" for={id}>{label}</label>
  {#if selected.length}
    <div class="chips">
      {#each selected as item (item)}
        <Chip
          text={labelOf.get(item) ?? item}
          onremove={() => onchange(selected.filter((v) => v !== item))}
        />
      {/each}
    </div>
  {/if}
  <select
    {id}
    value=""
    onchange={(e) => {
      const option = remaining[Number(e.currentTarget.value)];
      e.currentTarget.value = "";
      if (option) onchange([...selected, String(option.value)]);
    }}
  >
    <option value="" disabled>+</option>
    {#each remaining as option, index (option.value)}
      <option value={String(index)}>{option.label}</option>
    {/each}
  </select>
</div>

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 4px 0;
  }
</style>
