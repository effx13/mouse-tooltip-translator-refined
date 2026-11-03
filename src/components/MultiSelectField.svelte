<script lang="ts">
  import { Badge } from "@/components/ui/badge";
  import * as Select from "@/components/ui/select";
  import type { Option } from "@/utils/settings";
  import FieldLabel from "./FieldLabel.svelte";

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

  const selected = $derived(
    Array.isArray(value) ? value.filter((item) => typeof item === "string") : [],
  );
  const labelOf = $derived(new Map(options.map((option) => [String(option.value), option.label])));
</script>

<div class="grid gap-1.5">
  <FieldLabel {id} {label} />
  <Select.Root type="multiple" value={selected} onValueChange={onchange}>
    <Select.Trigger
      {id}
      class="w-full whitespace-normal data-[size=default]:h-auto data-[size=default]:min-h-9 data-[size=default]:py-1.5"
    >
      <span class="flex min-w-0 flex-1 flex-wrap gap-1">
        {#each selected as item (item)}
          <Badge variant="secondary" class="font-normal">{labelOf.get(item) ?? item}</Badge>
        {:else}
          <span class="text-muted-foreground">–</span>
        {/each}
      </span>
    </Select.Trigger>
    <Select.Content class="max-h-72">
      {#each options as option (option.value)}
        <Select.Item value={String(option.value)} label={option.label}>{option.label}</Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
</div>
