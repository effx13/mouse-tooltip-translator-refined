<script lang="ts">
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
  import LinkIcon from "@lucide/svelte/icons/link";
  import MinusIcon from "@lucide/svelte/icons/minus";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SearchIcon from "@lucide/svelte/icons/search";
  import type { Component } from "svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import * as Select from "@/components/ui/select";
  import { Separator } from "@/components/ui/separator";
  import { Toggle } from "@/components/ui/toggle";
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
  const percent = (scale: number) => `${Math.round(scale * 100)}%`;
  const zoomLabel = $derived(
    PRESETS.find(([value]) => value === pdf.scaleValue)?.[1] ??
      (PERCENTS.includes(pdf.scaleValue) ? percent(Number(pdf.scaleValue)) : percent(pdf.scale)),
  );

  function goToPage(input: HTMLInputElement) {
    input.value = String(pdf.goToPage(Number(input.value.trim())));
  }
</script>

{#snippet tool(icon: Component, label: string, onclick: () => void, disabled = false)}
  {@const ToolIcon = icon}
  <Button variant="ghost" size="icon-sm" title={label} aria-label={label} {disabled} {onclick}>
    <ToolIcon />
  </Button>
{/snippet}

{#snippet toggle(
  icon: Component,
  label: string,
  onclick: () => void,
  pressed: boolean,
  disabled = false,
)}
  {@const ToolIcon = icon}
  <Toggle
    size="sm"
    class="aria-pressed:bg-primary/15 aria-pressed:text-primary"
    title={label}
    aria-label={label}
    {pressed}
    {disabled}
    onPressedChange={onclick}
  >
    <ToolIcon />
  </Toggle>
{/snippet}

<header
  class="absolute inset-x-0 top-0 z-10 flex h-(--bar-height) items-center gap-1 overflow-hidden border-b bg-background px-2 text-sm whitespace-nowrap"
>
  {@render tool(FolderOpenIcon, t("Open_File"), onopen)}
  <Separator orientation="vertical" class="mx-1 data-vertical:h-5 data-vertical:self-center" />
  {@render tool(
    ChevronUpIcon,
    t("Previous_Page"),
    () => pdf.previousPage(),
    !ready || pdf.pageNumber <= 1,
  )}
  {@render tool(
    ChevronDownIcon,
    t("Next_Page"),
    () => pdf.nextPage(),
    !ready || pdf.pageNumber >= pdf.pagesCount,
  )}
  <Input
    class="ms-1 h-8 w-12 px-1.5 text-end md:text-sm"
    inputmode="numeric"
    title={t("Page")}
    aria-label={t("Page")}
    value={ready ? pdf.pageNumber : ""}
    disabled={!ready}
    onchange={(e) => goToPage(e.currentTarget)}
    onfocus={(e) => e.currentTarget.select()}
  />
  <span class="me-1 text-muted-foreground tabular-nums">/ {ready ? pdf.pagesCount : "–"}</span>
  <Separator orientation="vertical" class="mx-1 data-vertical:h-5 data-vertical:self-center" />
  {@render tool(MinusIcon, t("Zoom_out"), () => pdf.zoomOut(), !ready)}
  <Select.Root
    type="single"
    value={pdf.scaleValue}
    disabled={!ready}
    onValueChange={(value) => pdf.setScale(value)}
  >
    <Select.Trigger size="sm" class="max-w-36" title={t("Zoom")} aria-label={t("Zoom")}>
      <span class="truncate">{zoomLabel}</span>
    </Select.Trigger>
    <Select.Content>
      {#each PRESETS as [value, label] (value)}
        <Select.Item {value} {label}>{label}</Select.Item>
      {/each}
      <Select.Separator />
      {#each PERCENTS as value (value)}
        <Select.Item {value} label={percent(Number(value))}>{percent(Number(value))}</Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
  {@render tool(PlusIcon, t("Zoom_in"), () => pdf.zoomIn(), !ready)}

  <span class="flex-1"></span>

  {@render toggle(SearchIcon, t("Find"), onfind, findOpen, !ready)}
  {#if canCopyUrl}
    {@render tool(LinkIcon, t("Copy_PDF_URL"), oncopy)}
  {/if}
  {@render toggle(MoonIcon, t("Dark_mode"), ondark, dark)}
  {@render tool(DownloadIcon, t("Download"), () => void pdf.download(), !ready)}
</header>
