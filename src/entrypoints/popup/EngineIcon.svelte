<script lang="ts">
  import type { EngineIcon } from "@/translators/catalog";
  import { cn } from "@/utils/cn";

  let { icon }: { icon: EngineIcon } = $props();

  // relative luminance of #rrggbb, 0 (black) to 1 (white)
  function luminance(hex: string): number {
    const channels = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const [r = 0, g = 0, b = 0] = channels;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // near-black brand colors (DeepL navy) vanish on the dark tile, so they follow the text color there
  const darkBrand = $derived(icon.kind === "path" && luminance(icon.hex) < 0.05);
</script>

{#if icon.kind === "mark"}
  <span
    class="grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold tracking-tight"
    style:background-color={icon.color}
    style:color={icon.textColor ?? "#ffffff"}
    aria-hidden="true"
  >
    {icon.mark}
  </span>
{:else}
  <span
    class="grid size-8 shrink-0 place-items-center rounded-lg border bg-background dark:bg-muted"
    aria-hidden="true"
  >
    {#if icon.kind === "path"}
      <svg
        viewBox="0 0 24 24"
        class={cn("size-5 fill-(--brand)", darkBrand && "dark:fill-foreground")}
        style:--brand={icon.hex}
      >
        <path d={icon.path} />
      </svg>
    {:else}
      <img src={icon.src} alt="" class="size-5 object-contain" />
    {/if}
  </span>
{/if}
