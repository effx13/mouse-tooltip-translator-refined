<script lang="ts">
  import { Label } from "@/components/ui/label";
  import { Switch } from "@/components/ui/switch";

  let {
    id,
    label,
    checked,
    onchange,
  }: { id: string; label: string; checked: boolean; onchange: (value: boolean) => void } = $props();
</script>

<div class="flex min-h-9 items-center gap-3">
  <Label for={id} class="flex-1 cursor-pointer leading-snug font-normal">{label}</Label>
  <Switch {id} {checked} onCheckedChange={onchange} />
</div>
