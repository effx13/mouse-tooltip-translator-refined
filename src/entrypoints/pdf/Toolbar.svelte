<script lang="ts">
  import Icon, { type IconName } from "@/components/Icon.svelte";
  import { t } from "@/utils/i18n";
  import type { PdfController } from "@/viewers/pdf/controller.svelte";

  interface Props {
    pdf: PdfController;
    findOpen: boolean;
    dark: boolean;
    canCopyUrl: boolean;
    onopen: () => void;
    onfind: () => void;
    ondark: () => void;
    oncopy: () => void;
  }

  let { pdf, findOpen, dark, canCopyUrl, onopen, onfind, ondark, oncopy }: Props = $props();

  const PRESETS = [
    ["auto", t("Automatic_zoom")],
    ["page-fit", t("Page_fit")],
    ["page-width", t("Page_width")],
  ] as const;
  const PERCENTS = ["0.5", "0.75", "1", "1.25", "1.5", "2", "3", "4"];

  const ready = $derived(pdf.status === "ready");
  const isListed = $derived(
    PRESETS.some(([value]) => value === pdf.scaleValue) || PERCENTS.includes(pdf.scaleValue),
  );
  const percent = (scale: number) => `${Math.round(scale * 100)}%`;

  function goToPage(input: HTMLInputElement) {
    input.value = String(pdf.goToPage(Number(input.value.trim())));
  }
</script>

{#snippet tool(
  icon: IconName,
  label: string,
  onclick: () => void,
  disabled = false,
  pressed?: boolean,
)}
  <button
    type="button"
    class="tool"
    title={label}
    aria-label={label}
    aria-pressed={pressed}
    {disabled}
    {onclick}
  >
    <Icon name={icon} />
  </button>
{/snippet}

<header class="bar">
  {@render tool("folderOpen", t("Open_File"), onopen)}
  <span class="sep"></span>
  {@render tool(
    "chevronUp",
    t("Previous_Page"),
    () => pdf.previousPage(),
    !ready || pdf.pageNumber <= 1,
  )}
  {@render tool(
    "chevronDown",
    t("Next_Page"),
    () => pdf.nextPage(),
    !ready || pdf.pageNumber >= pdf.pagesCount,
  )}
  <input
    class="page"
    type="text"
    inputmode="numeric"
    title={t("Page")}
    aria-label={t("Page")}
    value={ready ? pdf.pageNumber : ""}
    disabled={!ready}
    onchange={(e) => goToPage(e.currentTarget)}
    onfocus={(e) => e.currentTarget.select()}
  />
  <span class="total">/ {ready ? pdf.pagesCount : "–"}</span>
  <span class="sep"></span>
  {@render tool("minus", t("Zoom_out"), () => pdf.zoomOut(), !ready)}
  <select
    class="zoom"
    title={t("Zoom")}
    aria-label={t("Zoom")}
    disabled={!ready}
    onchange={(e) => pdf.setScale(e.currentTarget.value)}
  >
    {#each PRESETS as [value, label] (value)}
      <option {value} selected={pdf.scaleValue === value}>{label}</option>
    {/each}
    {#each PERCENTS as value (value)}
      <option {value} selected={pdf.scaleValue === value}>{percent(Number(value))}</option>
    {/each}
    {#if !isListed}
      <option value={pdf.scaleValue} selected hidden>{percent(pdf.scale)}</option>
    {/if}
  </select>
  {@render tool("plus", t("Zoom_in"), () => pdf.zoomIn(), !ready)}

  <span class="spacer"></span>

  {@render tool("magnify", t("Find"), onfind, !ready, findOpen)}
  {#if canCopyUrl}
    {@render tool("copy", t("Copy_PDF_URL"), oncopy)}
  {/if}
  {@render tool("moon", t("Dark_mode"), ondark, false, dark)}
  {@render tool("download", t("Download"), () => void pdf.download(), !ready)}
</header>

<style>
  .bar {
    position: absolute;
    inset: 0 0 auto;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 2px;
    height: var(--bar-height);
    padding: 0 6px;
    box-sizing: border-box;
    background: var(--bar-bg);
    border-bottom: 1px solid var(--bar-border);
    white-space: nowrap;
    overflow: hidden;
  }
  .tool {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
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
  .tool[aria-pressed="true"] {
    background: var(--pressed);
    color: var(--accent);
  }
  .tool:disabled {
    opacity: 0.38;
    cursor: default;
  }
  .tool:focus-visible,
  .page:focus-visible,
  .zoom:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .sep {
    width: 1px;
    height: 20px;
    margin: 0 4px;
    background: var(--bar-border);
    flex: none;
  }
  .spacer {
    flex: 1;
  }
  .page {
    width: 44px;
    height: 26px;
    margin-left: 4px;
    padding: 0 4px;
    box-sizing: border-box;
    text-align: end;
    border: 1px solid var(--field-border);
    border-radius: 4px;
    background: var(--field-bg);
  }
  .total {
    margin: 0 6px 0 4px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .zoom {
    height: 26px;
    max-width: 140px;
    padding: 0 4px;
    border: 1px solid var(--field-border);
    border-radius: 4px;
    background: var(--field-bg);
  }
  .page:disabled,
  .zoom:disabled {
    opacity: 0.5;
  }
</style>
