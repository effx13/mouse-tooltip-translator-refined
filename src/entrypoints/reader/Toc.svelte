<script lang="ts">
  import type { TocItem } from "foliate-js/view.js";

  let {
    items,
    currentHref,
    onselect,
  }: { items: TocItem[]; currentHref?: string; onselect: (href: string) => void } = $props();
</script>

{#snippet list(entries: TocItem[])}
  <ul>
    {#each entries as item, i (i)}
      <li>
        {#if item.href}
          {@const href = item.href}
          <button
            class="entry"
            class:current={href === currentHref}
            aria-current={href === currentHref ? "location" : undefined}
            onclick={() => onselect(href)}
          >
            {item.label}
          </button>
        {:else}
          <span class="entry heading">{item.label}</span>
        {/if}
        {#if item.subitems?.length}
          {@render list(item.subitems)}
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<nav>{@render list(items)}</nav>

<style>
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  ul :global(ul) {
    padding-inline-start: 16px;
  }
  .entry {
    display: block;
    width: 100%;
    padding: 6px 12px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  button.entry:hover {
    background: var(--hover);
  }
  .heading {
    cursor: default;
    opacity: 0.7;
  }
  .current {
    background: var(--selected);
    font-weight: 600;
  }
</style>
