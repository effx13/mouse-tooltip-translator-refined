<script lang="ts">
  import type { Option } from "@/entrypoints/popup/options";
  import type { OptionValue } from "@/utils/settings";

  let {
    id,
    label,
    value,
    options,
    fontPreview = false,
    onchange,
  }: {
    id: string;
    label: string;
    value: unknown;
    options: Option[];
    fontPreview?: boolean;
    onchange: (value: OptionValue) => void;
  } = $props();

  const selectedIndex = $derived(options.findIndex((option) => option.value === value));
</script>

<label class="field" for={id}>
  <span class="field-label">{label}</span>
  <select
    {id}
    value={String(selectedIndex)}
    style:font-family={fontPreview ? String(value || "") || "inherit" : null}
    onchange={(e) => {
      const option = options[Number(e.currentTarget.value)];
      if (option) onchange(option.value);
    }}
  >
    {#if selectedIndex === -1}
      <option value="-1" disabled>{String(value ?? "")}</option>
    {/if}
    {#each options as option, index (index)}
      <option
        value={String(index)}
        style:font-family={fontPreview ? String(option.value || "inherit") : null}
        >{option.label}</option
      >
    {/each}
  </select>
</label>
