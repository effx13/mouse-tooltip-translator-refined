<script lang="ts">
  import * as Select from "@/components/ui/select";
  import type { Option } from "@/utils/settings";
  import type { OptionValue } from "@/utils/settings";
  import FieldLabel from "./FieldLabel.svelte";

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

  // items are keyed by index so number and boolean values round-trip
  const selectedIndex = $derived(options.findIndex((option) => option.value === value));
  const selectedLabel = $derived(options[selectedIndex]?.label ?? String(value ?? ""));
  const fontStyle = (font: unknown) =>
    fontPreview ? `font-family: ${String(font || "") || "inherit"}` : undefined;
</script>

<div class="grid gap-1.5">
  <FieldLabel {id} {label} />
  <Select.Root
    type="single"
    value={String(selectedIndex)}
    onValueChange={(next) => {
      const option = options[Number(next)];
      if (option) onchange(option.value);
    }}
  >
    <Select.Trigger {id} class="w-full" style={fontStyle(value)}>
      <span class="truncate">{selectedLabel}</span>
    </Select.Trigger>
    <Select.Content class="max-h-72">
      {#each options as option, index (index)}
        <Select.Item value={String(index)} label={option.label} style={fontStyle(option.value)}>
          {option.label}
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
</div>
