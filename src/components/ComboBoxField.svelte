<script lang="ts">
  import Chip from "./Chip.svelte";

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

<div class="field">
  <label class="field-label" for={id}>{label}</label>
  <div class="combo">
    {#each items as item (item)}
      <Chip text={item} onremove={() => onchange(items.filter((v) => v !== item))} />
    {/each}
    <input
      {id}
      type="text"
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

<style>
  .combo {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }
  .combo:focus-within {
    border-bottom-color: var(--primary);
  }
  .combo input {
    flex: 1;
    min-width: 80px;
    border: 0;
    padding: 4px 0;
  }
</style>
