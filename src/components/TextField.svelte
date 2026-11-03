<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    id,
    label,
    value,
    type = "text",
    placeholder,
    readonly = false,
    list,
    oninput,
    append,
  }: {
    id: string;
    label: string;
    value: string;
    type?: "text" | "url" | "password";
    placeholder?: string;
    readonly?: boolean;
    list?: string;
    oninput: (value: string) => void;
    append?: Snippet;
  } = $props();

  let focused = $state(false);
  let draft = $state("");

  // while typing, ignore the async storage echo so the caret never jumps
  $effect(() => {
    if (!focused) draft = value;
  });
</script>

<div class="field">
  <label class="field-label" for={id}>{label}</label>
  <div class="text-row">
    <input
      {id}
      {type}
      {placeholder}
      {readonly}
      {list}
      autocomplete="off"
      spellcheck="false"
      value={draft}
      onfocus={() => (focused = true)}
      onblur={() => (focused = false)}
      oninput={(e) => {
        draft = e.currentTarget.value;
        oninput(draft);
      }}
    />
    {@render append?.()}
  </div>
</div>

<style>
  .text-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .text-row input {
    flex: 1;
    min-width: 0;
  }
  input[readonly] {
    opacity: 0.6;
  }
</style>
