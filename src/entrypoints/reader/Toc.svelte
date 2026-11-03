<script lang="ts">
  import type { TocItem } from "foliate-js/view.js";
  import { cn } from "@/utils/cn";

  let {
    items,
    currentHref,
    onselect,
  }: { items: TocItem[]; currentHref?: string; onselect: (href: string) => void } = $props();
</script>

{#snippet list(entries: TocItem[], nested: boolean)}
  <ul class={cn("grid gap-0.5", nested && "ps-4")}>
    {#each entries as item, i (i)}
      <li>
        {#if item.href}
          {@const href = item.href}
          {@const current = href === currentHref}
          <button
            type="button"
            class={cn(
              "block w-full rounded-md px-3 py-1.5 text-start text-sm transition-colors hover:bg-muted",
              current && "bg-primary/10 font-semibold text-primary hover:bg-primary/15",
            )}
            aria-current={current ? "location" : undefined}
            onclick={() => onselect(href)}
          >
            {item.label}
          </button>
        {:else}
          <span class="block px-3 py-1.5 text-sm text-muted-foreground">{item.label}</span>
        {/if}
        {#if item.subitems?.length}
          {@render list(item.subitems, true)}
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<nav>{@render list(items, false)}</nav>
