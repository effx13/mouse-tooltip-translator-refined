<script lang="ts">
  import type { Snippet } from "svelte";
  import { Input } from "@/components/ui/input";
  import FieldLabel from "./FieldLabel.svelte";

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

<div class="grid gap-1.5">
  <FieldLabel {id} {label} />
  <div class="flex items-center gap-1">
    <Input
      {id}
      {type}
      {placeholder}
      {readonly}
      {list}
      class="flex-1 read-only:opacity-60"
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
