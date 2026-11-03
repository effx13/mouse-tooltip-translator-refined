<script lang="ts">
  import XIcon from "@lucide/svelte/icons/x";
  import { Badge } from "@/components/ui/badge";
  import { t } from "@/utils/i18n";

  let { text, onremove }: { text: string; onremove: () => void } = $props();
</script>

<Badge
  variant="secondary"
  class="h-6 max-w-full gap-0.5 ps-2.5 pe-0.5 text-[0.8125rem] font-normal"
>
  <span class="truncate">{text}</span>
  <button
    type="button"
    class="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
    aria-label="{t('Remove')} {text}"
    onclick={onremove}
  >
    <XIcon class="size-3.5" />
  </button>
</Badge>
