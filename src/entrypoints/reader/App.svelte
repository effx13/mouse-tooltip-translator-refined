<script lang="ts">
  import { type LanguageMap, type TocItem, View } from "foliate-js/view.js";
  import { onMount } from "svelte";
  import type { ContentScriptContext } from "wxt/utils/content-script-context";
  import BookOpenIcon from "@lucide/svelte/icons/book-open";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
  import ListTreeIcon from "@lucide/svelte/icons/list-tree";
  import { Button } from "@/components/ui/button";
  import * as Sheet from "@/components/ui/sheet";
  import { cn } from "@/utils/cn";
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

<div
  class={cn(
    "grid h-screen grid-rows-[auto_1fr_auto] bg-muted/40",
    dragging &&
      "[&>main]:outline-3 [&>main]:-outline-offset-8 [&>main]:outline-primary [&>main]:outline-dashed",
  )}
  aria-busy={loading}
>
  <header class="flex items-center gap-1 border-b bg-background px-2 py-1.5">
    <Button
      variant="ghost"
      size="icon"
      title={t("Table_of_Contents")}
      aria-label={t("Table_of_Contents")}
      aria-expanded={tocOpen}
      disabled={!toc.length}
      onclick={() => (tocOpen = !tocOpen)}
    >
      <ListTreeIcon />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      title={t("Open_File")}
      aria-label={t("Open_File")}
      onclick={() => fileInput.click()}
    >
      <FolderOpenIcon />
    </Button>
    <h1 class="mx-2 min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">
      {title || t("Ebook_Reader")}
    </h1>
    <input bind:this={fileInput} type="file" accept={ACCEPT} hidden onchange={onFileChange} />
  </header>

  <main class="relative min-h-0 overflow-hidden">
    <div class="h-full" bind:this={host}></div>
    {#if !view}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <span class="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
          <BookOpenIcon class="size-8" />
        </span>
        <p class="text-muted-foreground">{t("Drop_an_ebook_file_here_or_open_one")}</p>
        {#if error}
          <p class="text-destructive" role="alert">{error}</p>
        {/if}
        <Button disabled={loading} onclick={() => fileInput.click()}>
          <FolderOpenIcon />
          {t("Open_File")}
        </Button>
      </div>
    {/if}
  </main>

  {#if view}
    <footer class="flex items-center gap-2 border-t bg-background px-2 py-1.5">
      <Button
        variant="ghost"
        size="icon"
        title={t("Previous_Page")}
        aria-label={t("Previous_Page")}
        onclick={() => void view?.goLeft()}
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
        onclick={() => void view?.goRight()}
      >
        <ChevronRightIcon />
      </Button>
    </footer>
  {/if}
</div>

<Sheet.Root bind:open={tocOpen}>
  <Sheet.Content
    side="left"
    class="gap-0 data-[side=left]:w-[min(20rem,85vw)] data-[side=left]:sm:max-w-none"
  >
    <Sheet.Header class="border-b">
      <Sheet.Title>{t("Table_of_Contents")}</Sheet.Title>
    </Sheet.Header>
    <div class="min-h-0 flex-1 overflow-y-auto p-2">
      <Toc items={toc} {currentHref} onselect={goToHref} />
    </div>
  </Sheet.Content>
</Sheet.Root>
