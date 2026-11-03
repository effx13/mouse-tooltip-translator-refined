<script lang="ts">
  import { t } from "@/utils/i18n";
  import Icon from "./Icon.svelte";

  let { text, onremove }: { text: string; onremove: () => void } = $props();
</script>

<span class="chip">
  <span class="chip-text">{text}</span>
  <button type="button" class="chip-remove" aria-label="{t('Remove')} {text}" onclick={onremove}>
    <Icon name="close" size={14} />
  </button>
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    max-width: 100%;
    padding: 2px 4px 2px 10px;
    border-radius: 14px;
    background: var(--chip);
    font-size: 0.8125rem;
    line-height: 20px;
  }
  .chip-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip-remove {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    opacity: 0.7;
    cursor: pointer;
  }
  .chip-remove:hover {
    opacity: 1;
    background: var(--hover);
  }
</style>
