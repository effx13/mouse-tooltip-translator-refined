<script lang="ts">
  import Chip from "./Chip.svelte";
  import FieldLabel from "./FieldLabel.svelte";

  let {
    id,
    label,
    value,
    onchange,
  }: { id: string; label: string; value: unknown; onchange: (value: string[]) => void } = $props();

  const items = $derived(Array.isArray(value) ? (value as string[]) : []);
  let draft = $state("");

  function commit() {
    const text = draft.trim();
    draft = "";
    if (text && !items.includes(text)) onchange([...items, text]);
  }
</script>

<div class="grid gap-1.5">
  <FieldLabel {id} {label} />
  <div
    class="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-1.5 py-1 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
  >
    {#each items as item (item)}
      <Chip text={item} onremove={() => onchange(items.filter((v) => v !== item))} />
    {/each}
    <input
      {id}
      type="text"
      class="h-7 min-w-20 flex-1 bg-transparent px-1 text-sm outline-none"
      autocomplete="off"
      spellcheck="false"
      bind:value={draft}
      onkeydown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Backspace" && !draft && items.length) {
          onchange(items.slice(0, -1));
        }
      }}
      onblur={commit}
    />
  </div>
</div>
