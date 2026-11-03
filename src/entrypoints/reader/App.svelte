<script lang="ts">
  import { type LanguageMap, type TocItem, View } from "foliate-js/view.js";
  import { onMount } from "svelte";
  import type { ContentScriptContext } from "wxt/utils/content-script-context";
  import Icon from "@/components/Icon.svelte";
  import { getUiLangCode, t } from "@/utils/i18n";
  import { getSettings, type Settings, watchSettings } from "@/utils/settings";
  import { bridgeEbookView } from "@/viewers/ebook";
  import { bookCss, type EbookTheme, isEbookTheme } from "./theme";
  import Toc from "./Toc.svelte";

  let { ctx }: { ctx: ContentScriptContext } = $props();

  const ACCEPT = ".epub,.mobi,.azw,.azw3,.fb2,.fbz,.cbz,.zip";
  const percent = new Intl.NumberFormat(getUiLangCode(), {
    style: "percent",
    maximumFractionDigits: 1,
  });

  let host: HTMLDivElement;
  let fileInput: HTMLInputElement;
  let view = $state.raw<View | null>(null);
  let viewAbort: AbortController | undefined;
  let theme = $state<EbookTheme>("auto");
  let title = $state("");
  let toc = $state.raw<TocItem[]>([]);
  let currentHref = $state<string>();
  let fraction = $state(0);
  let sectionFractions = $state.raw<number[]>([]);
  let tocOpen = $state(false);
  let loading = $state(false);
  let error = $state("");
  let dragging = $state(false);

  const canSeek = $derived(sectionFractions.length > 0);

  const formatLanguageMap = (value?: LanguageMap) =>
    typeof value === "string" ? value : (Object.values(value ?? {})[0] ?? "");

  const applyTheme = (settings: Settings) => {
    theme = isEbookTheme(settings.ebookTheme) ? settings.ebookTheme : "auto";
  };

  $effect(() => {
    view?.renderer?.setStyles?.(bookCss(theme));
  });

  function closeBook() {
    viewAbort?.abort();
    try {
      view?.close();
    } catch {
      // the renderer throws when no section was displayed yet
    }
    view?.remove();
    view = null;
  }

  async function openBook(file: File | string) {
    closeBook();
    error = "";
    tocOpen = false;
    loading = true;
    const abort = new AbortController();
    viewAbort = abort;
    const next = new View();
    bridgeEbookView(next, ctx, abort.signal);
    next.addEventListener(
      "relocate",
      (e) => {
        fraction = e.detail.fraction ?? 0;
        currentHref = e.detail.tocItem?.href;
      },
      { signal: abort.signal },
    );
    host.append(next);
    try {
      await next.open(file);
      // a newer openBook() call took over meanwhile
      if (abort.signal.aborted) return next.remove();
      next.renderer?.setStyles?.(bookCss(theme));
      title = formatLanguageMap(next.book?.metadata?.title) || t("Untitled");
      toc = next.book?.toc ?? [];
      sectionFractions = next.getSectionFractions();
      fraction = 0;
      view = next;
      await next.init({});
      next.renderer?.focusView?.();
    } catch (err) {
      console.log(err);
      next.remove();
      if (abort.signal.aborted) return;
      closeBook();
      title = "";
      toc = [];
      error = t("Could_not_open_this_file");
    } finally {
      if (viewAbort === abort) {
        loading = false;
        document.title = title || t("Ebook_Reader");
      }
    }
  }

  function goToHref(href: string) {
    tocOpen = false;
    void view?.goTo(href);
  }

  function seek(e: Event & { currentTarget: HTMLInputElement }) {
    void view?.goToFraction(Number(e.currentTarget.value));
  }

  // handles keys on this page and the ones the bridge forwards from the book iframe
  function onKeydown(e: Event) {
    const { key, target } = e as KeyboardEvent;
    if (key === "Escape") tocOpen = false;
    if (!view || target instanceof HTMLInputElement) return;
    if (key === "ArrowLeft") void view.goLeft();
    else if (key === "ArrowRight") void view.goRight();
    else if (key === "PageUp") void view.prev();
    else if (key === "PageDown") void view.next();
  }

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dragging = true;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const file = e.dataTransfer?.files[0];
    if (file) void openBook(file);
  }

  function onFileChange(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (file) void openBook(file);
  }

  onMount(() => {
    void getSettings().then(applyTheme);
    const unwatch = watchSettings(applyTheme);
    const url = new URLSearchParams(location.search).get("url");
    if (url) void openBook(url);
    return () => {
      unwatch();
      closeBook();
    };
  });
</script>

<svelte:window
  onkeydown={onKeydown}
  ondragover={onDragOver}
  ondragleave={(e) => {
    if (!e.relatedTarget) dragging = false;
  }}
  ondrop={onDrop}
/>

<div class="reader" class:dragging aria-busy={loading}>
  <header class="bar">
    <button
      class="icon-btn"
      title={t("Table_of_Contents")}
      aria-label={t("Table_of_Contents")}
      aria-expanded={tocOpen}
      disabled={!toc.length}
      onclick={() => (tocOpen = !tocOpen)}
    >
      <Icon name="toc" />
    </button>
    <button
      class="icon-btn"
      title={t("Open_File")}
      aria-label={t("Open_File")}
      onclick={() => fileInput.click()}
    >
      <Icon name="folderOpen" />
    </button>
    <h1 class="title">{title || t("Ebook_Reader")}</h1>
    <input bind:this={fileInput} type="file" accept={ACCEPT} hidden onchange={onFileChange} />
  </header>

  <main class="stage">
    <div class="book" bind:this={host}></div>
    {#if !view}
      <div class="empty">
        <Icon name="book" size={56} />
        <p>{t("Drop_an_ebook_file_here_or_open_one")}</p>
        {#if error}
          <p class="error" role="alert">{error}</p>
        {/if}
        <button class="primary" disabled={loading} onclick={() => fileInput.click()}>
          <Icon name="folderOpen" />
          {t("Open_File")}
        </button>
      </div>
    {/if}

    {#if tocOpen}
      <button class="scrim" aria-label={t("Table_of_Contents")} onclick={() => (tocOpen = false)}
      ></button>
      <aside class="sidebar">
        <Toc items={toc} {currentHref} onselect={goToHref} />
      </aside>
    {/if}
  </main>

  {#if view}
    <footer class="bar">
      <button
        class="icon-btn"
        title={t("Previous_Page")}
        aria-label={t("Previous_Page")}
        onclick={() => void view?.goLeft()}
      >
        <Icon name="back" />
      </button>
      <input
        class="progress"
        type="range"
        min="0"
        max="1"
        step="any"
        list="section-ticks"
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
      <span class="percent">{percent.format(fraction)}</span>
      <button
        class="icon-btn"
        title={t("Next_Page")}
        aria-label={t("Next_Page")}
        onclick={() => void view?.goRight()}
      >
        <Icon name="forward" />
      </button>
    </footer>
  {/if}
</div>

<style>
  .reader {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100vh;
  }
  .reader.dragging .stage {
    outline: 3px dashed var(--accent);
    outline-offset: -8px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--surface);
    border-block: 1px solid var(--border);
  }
  .title {
    flex: 1;
    min-width: 0;
    margin: 0 8px;
    overflow: hidden;
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .icon-btn {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: inherit;
    cursor: pointer;
  }
  .icon-btn:hover:not(:disabled) {
    background: var(--hover);
  }
  .icon-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .stage {
    position: relative;
    min-height: 0;
    overflow: hidden;
  }
  .book {
    height: 100%;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
    opacity: 0.85;
  }
  .error {
    color: var(--danger);
  }
  .primary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border: 0;
    border-radius: 6px;
    background: var(--accent);
    color: #fff;
    font: inherit;
    cursor: pointer;
  }
  .scrim {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgb(0 0 0 / 0.3);
    cursor: default;
  }
  .sidebar {
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    width: min(320px, 85vw);
    padding: 8px;
    overflow-y: auto;
    background: var(--surface);
    box-shadow: 0 0 24px rgb(0 0 0 / 0.3);
  }
  .progress {
    flex: 1;
    min-width: 0;
    accent-color: var(--accent);
  }
  .percent {
    min-width: 4.5em;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
</style>
