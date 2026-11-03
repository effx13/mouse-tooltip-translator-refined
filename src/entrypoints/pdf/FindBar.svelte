<script lang="ts">
  import Icon from "@/components/Icon.svelte";
  import { t } from "@/utils/i18n";
  import type { FindType, PdfController } from "@/viewers/pdf/controller.svelte";

  let { pdf, open, onclose }: { pdf: PdfController; open: boolean; onclose: () => void } = $props();

  let query = $state("");
  let highlightAll = $state(true);
  let caseSensitive = $state(false);
  let input = $state<HTMLInputElement>();

  const find = (type: FindType, previous = false) =>
    pdf.find(type, { query, highlightAll, caseSensitive }, previous);

  const status = $derived.by(() => {
    if (!query) return "";
    if (pdf.matches.total > 0) return `${pdf.matches.current} / ${pdf.matches.total}`;
    return pdf.notFound ? t("Phrase_not_found") : "";
  });

  // called on Ctrl/Cmd+F; a short single-line selection becomes the query
  export function focus(selection = "") {
    if (selection && !selection.includes("\n") && selection.length <= 100) query = selection;
    if (query) find("");
    input?.focus();
    input?.select();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      find("again", e.shiftKey);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onclose();
    }
  }
</script>

<div class="findbar" role="search" hidden={!open}>
  <input
    bind:this={input}
    bind:value={query}
    class="query"
    class:notfound={!!query && pdf.notFound}
    type="text"
    placeholder={t("Find_in_document")}
    aria-label={t("Find_in_document")}
    oninput={() => find("")}
    {onkeydown}
  />
  <span class="status" aria-live="polite">{status}</span>
  <button
    type="button"
    class="tool"
    title={t("Previous_match")}
    aria-label={t("Previous_match")}
    disabled={!query}
    onclick={() => find("again", true)}
  >
    <Icon name="chevronUp" />
  </button>
  <button
    type="button"
    class="tool"
    title={t("Next_match")}
    aria-label={t("Next_match")}
    disabled={!query}
    onclick={() => find("again")}
  >
    <Icon name="chevronDown" />
  </button>
  <label>
    <input
      type="checkbox"
      bind:checked={highlightAll}
      onchange={() => find("highlightallchange")}
    />
    {t("Highlight_all")}
  </label>
  <label>
    <input
      type="checkbox"
      bind:checked={caseSensitive}
      onchange={() => find("casesensitivitychange")}
    />
    {t("Match_case")}
  </label>
  <button type="button" class="tool" title={t("Close")} aria-label={t("Close")} onclick={onclose}>
    <Icon name="close" size={18} />
  </button>
</div>

<style>
  .findbar {
    position: absolute;
    top: calc(var(--bar-height) + 6px);
    right: 8px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 4px;
    max-width: calc(100% - 16px);
    padding: 6px 6px 6px 8px;
    box-sizing: border-box;
    background: var(--bar-bg);
    border: 1px solid var(--bar-border);
    border-radius: 8px;
    box-shadow: var(--shadow);
    white-space: nowrap;
  }
  .findbar[hidden] {
    display: none;
  }
  .query {
    width: 200px;
    min-width: 80px;
    height: 28px;
    padding: 0 8px;
    box-sizing: border-box;
    border: 1px solid var(--field-border);
    border-radius: 4px;
    background: var(--field-bg);
  }
  .query:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .query.notfound {
    border-color: var(--danger);
    outline-color: var(--danger);
  }
  .status {
    min-width: 48px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  label {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0 4px;
    cursor: pointer;
    user-select: none;
  }
  label input {
    margin: 0;
    accent-color: var(--accent);
  }
  .tool {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: none;
    cursor: pointer;
    flex: none;
  }
  .tool:hover:not(:disabled) {
    background: var(--hover);
  }
  .tool:disabled {
    opacity: 0.38;
    cursor: default;
  }
</style>
