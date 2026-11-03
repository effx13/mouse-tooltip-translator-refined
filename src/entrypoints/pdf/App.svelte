<script lang="ts">
  import { onMount } from "svelte";
  import { storage } from "wxt/utils/storage";
  import { t } from "@/utils/i18n";
  import { PdfController } from "@/viewers/pdf/controller.svelte";
  import {
    checkLocalFileAccess,
    fileParam,
    isPdfFile,
    isWebUrl,
    reportLoadError,
  } from "@/viewers/pdf/source";
  import EmptyState from "./EmptyState.svelte";
  import FindBar from "./FindBar.svelte";
  import Toolbar from "./Toolbar.svelte";

  const darkModeItem = storage.defineItem<boolean>("local:pdfDarkMode", { fallback: false });

  let container: HTMLDivElement;
  let viewer: HTMLDivElement;
  let fileInput: HTMLInputElement;
  let findBar = $state<ReturnType<typeof FindBar>>();
  let pdf = $state<PdfController>();
  let findOpen = $state(false);
  let dark = $state(false);
  let dragDepth = $state(0);
  let toast = $state("");
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    const controller = new PdfController(container, viewer, reportLoadError);
    pdf = controller;
    void darkModeItem.getValue().then((value) => (dark = value));
    const unwatch = darkModeItem.watch((value) => (dark = value));
    void openFromUrl(controller);
    return () => {
      unwatch();
      controller.destroy();
    };
  });

  $effect(() => {
    document.documentElement.classList.toggle("pdf-dark", dark);
  });

  async function openFromUrl(controller: PdfController) {
    const url = fileParam();
    if (url && (await checkLocalFileAccess(url))) await controller.open({ url });
  }

  async function openFile(file: File | undefined) {
    if (!pdf || !file || !isPdfFile(file)) return;
    // a reload should not bring back the previous ?file=
    history.replaceState(null, "", location.pathname);
    findOpen = false;
    document.title = file.name;
    await pdf.open({ data: new Uint8Array(await file.arrayBuffer()), name: file.name });
  }

  function showToast(text: string) {
    toast = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ""), 1200);
  }

  async function copyUrl() {
    if (!pdf) return;
    try {
      await navigator.clipboard.writeText(pdf.url);
      showToast(t("Copied"));
    } catch {
      showToast(t("Copy_failed"));
    }
  }

  function openFind() {
    if (pdf?.status !== "ready") return;
    findOpen = true;
    const selection = window.getSelection()?.toString().trim() ?? "";
    // wait for the bar to be shown before focusing it
    requestAnimationFrame(() => findBar?.focus(selection));
  }

  function closeFind() {
    findOpen = false;
    pdf?.closeFind();
  }

  function toggleDark() {
    dark = !dark;
    void darkModeItem.setValue(dark);
  }

  function onkeydown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) {
      if (e.key === "Escape" && findOpen && !e.defaultPrevented) closeFind();
      return;
    }
    const key = e.key.toLowerCase();
    const actions: Record<string, (() => void) | undefined> = {
      f: openFind,
      o: () => fileInput.click(),
      s: () => void pdf?.download(),
      "=": () => pdf?.zoomIn(),
      "+": () => pdf?.zoomIn(),
      "-": () => pdf?.zoomOut(),
      "0": () => pdf?.setScale("auto"),
    };
    const action = actions[key];
    if (!action || (key !== "o" && pdf?.status !== "ready")) return;
    e.preventDefault();
    action();
  }

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

  function ondrop(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    void openFile([...(e.dataTransfer?.files ?? [])].find(isPdfFile));
  }
</script>

<svelte:window {onkeydown} {ondragenter} {ondragleave} {ondragover} {ondrop} />

{#if pdf}
  <Toolbar
    {pdf}
    {findOpen}
    {dark}
    canCopyUrl={isWebUrl(pdf.url)}
    onopen={() => fileInput.click()}
    onfind={() => (findOpen ? closeFind() : openFind())}
    ondark={toggleDark}
    oncopy={copyUrl}
  />
  <FindBar bind:this={findBar} {pdf} open={findOpen} onclose={closeFind} />
  {#if pdf.status === "loading"}
    <div class="progress" style:--progress={pdf.progress}></div>
  {:else if pdf.status === "empty" || pdf.status === "error"}
    <EmptyState error={pdf.status === "error"} onopen={() => fileInput.click()} />
  {/if}
{/if}

<!-- PDFViewer requires an absolutely positioned container when it is created -->
<div bind:this={container} id="viewerContainer" tabindex="-1" style="position: absolute">
  <div bind:this={viewer} id="viewer" class="pdfViewer"></div>
</div>

<input
  bind:this={fileInput}
  type="file"
  accept="application/pdf,.pdf"
  hidden
  onchange={(e) => {
    void openFile(e.currentTarget.files?.[0]);
    e.currentTarget.value = "";
  }}
/>

{#if dragDepth > 0}
  <div class="dropzone">{t("Drop_a_PDF_file_here")}</div>
{/if}

{#if toast}
  <div class="toast" role="status">{toast}</div>
{/if}

<style>
  .progress {
    position: absolute;
    top: var(--bar-height);
    left: 0;
    z-index: 11;
    height: 3px;
    width: calc(max(var(--progress), 0.05) * 100%);
    background: var(--accent);
    transition: width 0.2s;
  }
  .dropzone {
    position: fixed;
    inset: 8px;
    z-index: 20;
    display: grid;
    place-items: center;
    border: 3px dashed var(--accent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--bar-bg) 85%, transparent);
    color: var(--accent);
    font-size: 18px;
    font-weight: 600;
    pointer-events: none;
  }
  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    z-index: 20;
    translate: -50% 0;
    padding: 8px 16px;
    border-radius: 6px;
    background: var(--bar-fg);
    color: var(--bar-bg);
    box-shadow: var(--shadow);
  }
</style>
