<script lang="ts">
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import FileXIcon from "@lucide/svelte/icons/file-x";
  import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
  import { Button } from "@/components/ui/button";
  import * as Card from "@/components/ui/card";
  import { t } from "@/utils/i18n";

  let { error, onopen }: { error: boolean; onopen: () => void } = $props();
</script>

<div
  class="pointer-events-none absolute inset-x-0 top-(--bar-height) bottom-0 z-[5] grid place-items-center p-4"
>
  <Card.Root class="pointer-events-auto w-full max-w-sm items-center text-center">
    <Card.Content class="flex flex-col items-center gap-4">
      <span
        class="grid size-16 place-items-center rounded-2xl {error
          ? 'bg-destructive/10 text-destructive'
          : 'bg-primary/10 text-primary'}"
      >
        {#if error}
          <FileXIcon class="size-8" />
        {:else}
          <FileTextIcon class="size-8" />
        {/if}
      </span>
      {#if error}
        <p class="font-medium">{t("Failed_to_load_the_PDF_file")}</p>
      {/if}
      <Button onclick={onopen}>
        <FolderOpenIcon />
        {t("Open_File")}
      </Button>
      <p class="text-muted-foreground">{t("Drop_a_PDF_file_here")}</p>
    </Card.Content>
  </Card.Root>
</div>
