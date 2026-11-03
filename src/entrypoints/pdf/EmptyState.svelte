<script lang="ts">
  import Icon from "@/components/Icon.svelte";
  import { t } from "@/utils/i18n";

  let { error, onopen }: { error: boolean; onopen: () => void } = $props();
</script>

<div class="empty">
  <div class="card">
    <span class="icon" class:error><Icon name="pdf" size={48} /></span>
    {#if error}
      <p class="message">{t("Failed_to_load_the_PDF_file")}</p>
    {/if}
    <button type="button" class="open" onclick={onopen}>
      <Icon name="folderOpen" size={18} />
      {t("Open_File")}
    </button>
    <p class="hint">{t("Drop_a_PDF_file_here")}</p>
  </div>
</div>

<style>
  .empty {
    position: absolute;
    inset: var(--bar-height) 0 0;
    z-index: 5;
    display: grid;
    place-items: center;
    padding: 16px;
    pointer-events: none;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    max-width: 360px;
    padding: 32px 40px;
    background: var(--bar-bg);
    border: 1px solid var(--bar-border);
    border-radius: 12px;
    box-shadow: var(--shadow);
    text-align: center;
    pointer-events: auto;
  }
  .icon {
    color: var(--accent);
  }
  .icon.error {
    color: var(--danger);
  }
  p {
    margin: 0;
  }
  .message {
    font-weight: 600;
  }
  .hint {
    color: var(--muted);
  }
  .open {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    border: 0;
    border-radius: 999px;
    background: var(--accent);
    color: var(--bar-bg);
    font-weight: 600;
    cursor: pointer;
  }
  .open:hover {
    filter: brightness(1.08);
  }
  .open:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
