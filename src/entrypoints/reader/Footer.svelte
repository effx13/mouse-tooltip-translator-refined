<script lang="ts">
  import type { View } from "foliate-js/view.js";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import { Button } from "@/components/ui/button";
  import { getUiLangCode, t } from "@/utils/i18n";

  let {
    view,
    fraction,
    sectionFractions,
  }: { view: View; fraction: number; sectionFractions: number[] } = $props();

  const percent = new Intl.NumberFormat(getUiLangCode(), {
    style: "percent",
    maximumFractionDigits: 1,
  });

  const canSeek = $derived(sectionFractions.length > 0);

  function seek(e: Event & { currentTarget: HTMLInputElement }) {
    void view.goToFraction(Number(e.currentTarget.value));
  }
</script>

<footer class="flex items-center gap-2 border-t bg-background px-2 py-1.5">
  <Button
    variant="ghost"
    size="icon"
    title={t("Previous_Page")}
    aria-label={t("Previous_Page")}
    onclick={() => void view.goLeft()}
  >
    <ChevronLeftIcon />
  </Button>
  <input
    class="min-w-0 flex-1 accent-primary"
    type="range"
    min="0"
    max="1"
    step="any"
    list="section-ticks"
    aria-label={t("Page")}
    dir={view.book?.dir === "rtl" ? "rtl" : "ltr"}
    value={fraction}
    disabled={!canSeek}
    oninput={seek}
  />
  <datalist id="section-ticks">
    {#each sectionFractions as tick, i (i)}
      <option value={tick}></option>
    {/each}
  </datalist>
  <span class="min-w-[4.5em] text-center text-sm text-muted-foreground tabular-nums">
    {percent.format(fraction)}
  </span>
  <Button
    variant="ghost"
    size="icon"
    title={t("Next_Page")}
    aria-label={t("Next_Page")}
    onclick={() => void view.goRight()}
  >
    <ChevronRightIcon />
  </Button>
</footer>
