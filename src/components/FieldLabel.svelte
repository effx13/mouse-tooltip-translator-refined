<script lang="ts">
  import { Label } from "@/components/ui/label";

  let { id, label }: { id: string; label: string } = $props();
</script>

<Label for={id} class="text-xs font-normal text-muted-foreground">{label}</Label>
