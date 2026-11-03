<script lang="ts">
  import { type LanguageMap, type TocItem, View } from "foliate-js/view.js";
  import { onMount } from "svelte";
  import type { ContentScriptContext } from "wxt/utils/content-script-context";
  import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
  import ListTreeIcon from "@lucide/svelte/icons/list-tree";
  import { Button } from "@/components/ui/button";
  import * as Sheet from "@/components/ui/sheet";
  import { cn } from "@/utils/cn";
  import { t } from "@/utils/i18n";
  import { getSettings, type Settings, watchSettings } from "@/utils/settings";
  import { bridgeEbookView } from "./bridge";
  import EmptyState from "./EmptyState.svelte";
  import Footer from "./Footer.svelte";
  import { bookCss, type EbookTheme, isEbookTheme } from "./theme";
  import Toc from "./Toc.svelte";

  let { ctx }: { ctx: ContentScriptContext } = $props();

  const ACCEPT = ".epub,.mobi,.azw,.azw3,.fb2,.fbz,.cbz,.zip";

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

  // handles keys on this page and the ones the bridge forwards from the book iframe
  function onKeydown({ key, target }: KeyboardEvent) {
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
      <EmptyState {error} {loading} onopen={() => fileInput.click()} />
    {/if}
  </main>

  {#if view}
    <Footer {view} {fraction} {sectionFractions} />
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
