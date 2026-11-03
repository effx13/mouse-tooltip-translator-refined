<script lang="ts">
  import { t } from "@/utils/i18n";
  import { isPdfFile } from "./source";

  let { ondrop }: { ondrop: (file: File | undefined) => void } = $props();

  // dragenter/dragleave fire for every child element crossed, so count them
  let dragDepth = $state(0);

  const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;

  function ondragenter(e: DragEvent) {
    if (hasFiles(e)) dragDepth++;
  }

  function ondragleave(e: DragEvent) {
    if (hasFiles(e)) dragDepth = Math.max(0, dragDepth - 1);
  }

  function ondragover(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }

  function onwindowdrop(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    ondrop([...(e.dataTransfer?.files ?? [])].find(isPdfFile));
  }
</script>

<svelte:window {ondragenter} {ondragleave} {ondragover} ondrop={onwindowdrop} />

{#if dragDepth > 0}
  <div
    class="pointer-events-none fixed inset-2 z-20 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-background/85 text-lg font-semibold text-primary"
  >
    {t("Drop_a_PDF_file_here")}
  </div>
{/if}
