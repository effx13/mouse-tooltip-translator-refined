<script lang="ts">
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronUpIcon from "@lucide/svelte/icons/chevron-up";
  import XIcon from "@lucide/svelte/icons/x";
  import { Button } from "@/components/ui/button";
  import { Checkbox } from "@/components/ui/checkbox";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { cn } from "@/utils/cn";
  import { t } from "@/utils/i18n";
  import type { FindType, PdfController } from "@/viewers/pdf/controller.svelte";

  let { pdf, open, onclose }: { pdf: PdfController; open: boolean; onclose: () => void } = $props();

  let query = $state("");
  let highlightAll = $state(true);
  let caseSensitive = $state(false);
  let input = $state<HTMLInputElement | null>(null);

  const find = (type: FindType, previous = false) =>
    pdf.find(type, { query, highlightAll, caseSensitive }, previous);

  const notFound = $derived(!!query && pdf.notFound);
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

<div
  class="absolute end-2 top-[calc(var(--bar-height)+0.375rem)] z-10 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-lg border bg-popover p-1.5 text-sm whitespace-nowrap text-popover-foreground shadow-md"
  role="search"
  hidden={!open}
>
  <Input
    bind:ref={input}
    bind:value={query}
    class={cn("h-8 w-52 min-w-20 md:text-sm", notFound && "border-destructive")}
    aria-invalid={notFound || undefined}
    placeholder={t("Find_in_document")}
    aria-label={t("Find_in_document")}
    oninput={() => find("")}
    {onkeydown}
  />
  <span class="min-w-12 text-center text-muted-foreground tabular-nums" aria-live="polite"
    >{status}</span
  >
  <Button
    variant="ghost"
    size="icon-sm"
    title={t("Previous_match")}
    aria-label={t("Previous_match")}
    disabled={!query}
    onclick={() => find("again", true)}
  >
    <ChevronUpIcon />
  </Button>
  <Button
    variant="ghost"
    size="icon-sm"
    title={t("Next_match")}
    aria-label={t("Next_match")}
    disabled={!query}
    onclick={() => find("again")}
  >
    <ChevronDownIcon />
  </Button>
  <Label class="mx-1.5 cursor-pointer font-normal">
    <Checkbox
      checked={highlightAll}
      onCheckedChange={(checked) => {
        highlightAll = checked;
        find("highlightallchange");
      }}
    />
    {t("Highlight_all")}
  </Label>
  <Label class="mx-1.5 cursor-pointer font-normal">
    <Checkbox
      checked={caseSensitive}
      onCheckedChange={(checked) => {
        caseSensitive = checked;
        find("casesensitivitychange");
      }}
    />
    {t("Match_case")}
  </Label>
  <Button
    variant="ghost"
    size="icon-sm"
    title={t("Close")}
    aria-label={t("Close")}
    onclick={onclose}
  >
    <XIcon />
  </Button>
</div>
