<script lang="ts">
  import BookOpenIcon from "@lucide/svelte/icons/book-open";
  import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
  import { Button } from "@/components/ui/button";
  import { t } from "@/utils/i18n";

  let { error, loading, onopen }: { error: string; loading: boolean; onopen: () => void } =
    $props();
</script>

<div class="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
  <span class="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
    <BookOpenIcon class="size-8" />
  </span>
  <p class="text-muted-foreground">{t("Drop_an_ebook_file_here_or_open_one")}</p>
  {#if error}
    <p class="text-destructive" role="alert">{error}</p>
  {/if}
  <Button disabled={loading} onclick={onopen}>
    <FolderOpenIcon />
    {t("Open_File")}
  </Button>
</div>
