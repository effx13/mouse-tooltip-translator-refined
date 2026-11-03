<script lang="ts">
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import BookOpenIcon from "@lucide/svelte/icons/book-open";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import CodeIcon from "@lucide/svelte/icons/code";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import InfoIcon from "@lucide/svelte/icons/info";
  import ShieldCheckIcon from "@lucide/svelte/icons/shield-check";
  import type { Component } from "svelte";
  import { browser } from "wxt/browser";
  import icon from "@/assets/icon.svg";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import { t } from "@/utils/i18n";

  let { onback }: { onback: () => void } = $props();

  const REPO = "https://github.com/effx13/MouseTooltipTranslator";

  interface Entry {
    name: string;
    sub: string;
    icon: Component;
    tint: string;
    url: string;
  }

  const entries: Entry[] = [
    {
      name: "How_to_use",
      sub: "Check_how_to_use_this_extension",
      icon: InfoIcon,
      tint: "bg-green-500/15 text-green-600 dark:text-green-400",
      url: `${REPO}/blob/main/docs/intro.md`,
    },
    {
      name: "PDF_Viewer",
      sub: "Translate_local_PDF_file",
      icon: FileTextIcon,
      tint: "bg-red-500/15 text-red-600 dark:text-red-400",
      url: browser.runtime.getURL("/pdf.html"),
    },
    {
      name: "Ebook_Reader",
      sub: "Translate_local_ebook_file",
      icon: BookOpenIcon,
      tint: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
      url: browser.runtime.getURL("/reader.html"),
    },
    {
      name: "Source_code",
      sub: "Check_source_code_in_github",
      icon: CodeIcon,
      tint: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
      url: REPO,
    },
    {
      name: "Privacy_Policy",
      sub: "User_privacy_policy",
      icon: ShieldCheckIcon,
      tint: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
      url: `${REPO}/blob/main/docs/privacy.md`,
    },
  ];

  const version = browser.runtime.getManifest().version;
</script>

<header class="flex items-center gap-2 border-b px-2 py-2">
  <Button variant="ghost" size="icon-sm" title={t("Back")} aria-label={t("Back")} onclick={onback}>
    <ArrowLeftIcon class="rtl:-scale-x-100" />
  </Button>
  <h1 class="truncate text-[0.9375rem] font-semibold">{t("About")}</h1>
</header>

<main class="min-h-0 flex-1 overflow-y-auto">
  <section class="flex flex-col items-center gap-2 px-4 pt-8 pb-6 text-center">
    <img src={icon} alt="" class="size-16" />
    <h2 class="text-lg font-semibold">{t("Mouse_Tooltip_Translator")}</h2>
    <Badge variant="secondary" class="font-mono">v{version}</Badge>
  </section>

  <ul class="mx-3 mb-4 divide-y overflow-hidden rounded-xl border">
    {#each entries as entry (entry.name)}
      <li>
        <button
          type="button"
          class="flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          onclick={() => void browser.tabs.create({ url: entry.url })}
        >
          <span class="grid size-9 shrink-0 place-items-center rounded-lg {entry.tint}">
            <entry.icon class="size-[1.125rem]" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col">
            <span class="text-sm font-medium">{t(entry.name)}</span>
            <span class="truncate text-xs text-muted-foreground">{t(entry.sub)}</span>
          </span>
          <ChevronRightIcon class="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" />
        </button>
      </li>
    {/each}
  </ul>
</main>
