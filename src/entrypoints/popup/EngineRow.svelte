<script lang="ts">
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ExternalLinkIcon from "@lucide/svelte/icons/external-link";
  import { tick } from "svelte";
  import SelectField from "@/components/SelectField.svelte";
  import TextField from "@/components/TextField.svelte";
  import { Badge, type BadgeVariant } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import { Switch } from "@/components/ui/switch";
  import {
    getEngineInfo,
    getEngineStatus,
    getFieldValue,
    type EngineEntry,
    type EngineField,
    type EngineStatus,
  } from "@/translators/catalog";
  import { cn } from "@/utils/cn";
  import { t } from "@/utils/i18n";
  import { sendMessage } from "@/utils/messaging";
  import EngineIcon from "./EngineIcon.svelte";
  import LlmModelField from "./LlmModelField.svelte";
  import { moveEngine, setEngineEnabled, setEngineField, store } from "./state.svelte";

  let {
    entry,
    first,
    last,
    open,
    ontoggle,
    notify,
  }: {
    entry: EngineEntry;
    first: boolean;
    last: boolean;
    open: boolean;
    ontoggle: () => void;
    notify: (message: string) => void;
  } = $props();

  const STATUS: Record<EngineStatus, { key: string; variant: BadgeVariant }> = {
    ready: { key: "Ready", variant: "secondary" },
    usesApiKey: { key: "Uses_API_key", variant: "default" },
    needsApiKey: { key: "Needs_API_key", variant: "destructive" },
    needsSetup: { key: "Needs_setup", variant: "destructive" },
  };

  const info = $derived(getEngineInfo(entry.id));
  const name = $derived(info.i18nKey ? t(info.i18nKey) : info.label);
  const config = $derived(store.settings.engineConfig);
  const status = $derived(getEngineStatus(config, entry.id));
  const values = $derived(config[entry.id] ?? {});
  const panelId = $derived(`engine-${entry.id}-panel`);

  let testing = $state(false);
  let testResult = $state<{ ok: boolean; text: string } | null>(null);

  const fieldValue = (field: EngineField) => getFieldValue(config, entry.id, field.key);
  const selectOptions = (field: EngineField) =>
    Object.entries(field.options ?? {}).map(([label, value]) => ({ label: t(label), value }));

  // a keyed #each moves the row node, which drops focus; put it back on the same control
  async function move(delta: -1 | 1, focusTarget: HTMLElement | null) {
    if (!moveEngine(entry.id, delta)) return;
    await tick();
    focusTarget?.focus();
  }

  function onHeaderKeydown(e: KeyboardEvent & { currentTarget: HTMLButtonElement }) {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    void move(e.key === "ArrowUp" ? -1 : 1, e.currentTarget);
  }

  // English targets get a French sample so the answer differs from the input
  async function test() {
    const targetLang = store.settings.translateTarget;
    const english = targetLang.startsWith("en");
    testing = true;
    testResult = null;
    try {
      const result = await sendMessage("translate", {
        text: english ? "Bonjour tout le monde" : "Hello, world",
        sourceLang: english ? "fr" : "en",
        targetLang,
        engine: entry.id,
        noFallback: true,
      });
      testResult =
        result && !result.isBroken
          ? { ok: true, text: result.targetText }
          : { ok: false, text: result?.error || t("Test_failed") };
    } catch (error) {
      testResult = { ok: false, text: error instanceof Error ? error.message : String(error) };
    } finally {
      testing = false;
    }
  }
</script>

<li class="rounded-lg border bg-card text-card-foreground" data-engine={entry.id}>
  <div class="flex items-center gap-1.5 py-1.5 ps-1 pe-3">
    <div class="flex shrink-0 flex-col">
      <Button
        variant="ghost"
        size="icon-xs"
        class="h-4.5 text-muted-foreground"
        disabled={first}
        title={t("Move_up")}
        aria-label="{t('Move_up')}: {name}"
        onclick={(e) => void move(-1, e.currentTarget)}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        class="h-4.5 text-muted-foreground"
        disabled={last}
        title={t("Move_down")}
        aria-label="{t('Move_down')}: {name}"
        onclick={(e) => void move(1, e.currentTarget)}
      >
        <ArrowDownIcon />
      </Button>
    </div>
    <button
      type="button"
      class="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-0.5 text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      aria-expanded={open}
      aria-controls={panelId}
      title={t("Press_Alt_and_arrow_keys_to_reorder")}
      onclick={ontoggle}
      onkeydown={onHeaderKeydown}
    >
      <EngineIcon icon={info.icon} />
      <span class="grid min-w-0 flex-1 gap-0.5">
        <span class={cn("truncate text-sm font-medium", !entry.enabled && "text-muted-foreground")}>
          {name}
        </span>
        <span class="flex flex-wrap gap-1">
          <Badge variant={STATUS[status].variant} class="h-4.5 px-1.5 text-[0.6875rem]">
            {t(STATUS[status].key)}
          </Badge>
          {#if info.experimental}
            <Badge variant="outline" class="h-4.5 px-1.5 text-[0.6875rem] text-muted-foreground">
              {t("Experimental")}
            </Badge>
          {/if}
        </span>
      </span>
      <ChevronDownIcon
        class={cn(
          "size-4 shrink-0 text-muted-foreground transition-transform",
          open && "rotate-180",
        )}
      />
    </button>
    <Switch
      checked={entry.enabled}
      aria-label="{t('Enable')}: {name}"
      onCheckedChange={(checked) => void setEngineEnabled(entry.id, checked)}
    />
  </div>

  {#if open}
    <div id={panelId} class="grid gap-3 border-t px-3 py-3">
      {#each info.fields as field (field.key)}
        {@const id = `engine-${entry.id}-${field.key}`}
        <!-- optional-setup engines work without these; their "required" fields only enable the API -->
        {@const label =
          field.required && info.setup === "required" ? `${t(field.i18nKey)} *` : t(field.i18nKey)}
        {#if field.type === "select"}
          <SelectField
            {id}
            {label}
            value={fieldValue(field)}
            options={selectOptions(field)}
            onchange={(value) => void setEngineField(entry.id, field.key, String(value))}
          />
        {:else if field.type === "llmModel"}
          <LlmModelField
            {id}
            {label}
            value={values[field.key] ?? ""}
            provider={getFieldValue(config, entry.id, "provider")}
            endpoint={getFieldValue(config, entry.id, "endpoint")}
            apiKey={getFieldValue(config, entry.id, "apiKey")}
            oninput={(value) => void setEngineField(entry.id, field.key, value)}
            onerror={notify}
          />
        {:else}
          <TextField
            {id}
            {label}
            type={field.type}
            value={values[field.key] ?? ""}
            placeholder={field.placeholder}
            readonly={field.readonlyWhen?.(values) ?? false}
            oninput={(value) => void setEngineField(entry.id, field.key, value)}
          />
        {/if}
      {/each}

      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          variant="outline"
          size="sm"
          disabled={testing || status === "needsApiKey" || status === "needsSetup"}
          onclick={test}
        >
          {testing ? t("Testing") : t("Test")}
        </Button>
        {#if info.docsUrl}
          <a
            href={info.docsUrl}
            target="_blank"
            rel="noreferrer"
            class="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
          >
            {t("Get_a_key")}
            <ExternalLinkIcon class="size-3" />
          </a>
        {/if}
      </div>
      {#if testResult}
        <p
          role="status"
          class={cn(
            "rounded-md px-2.5 py-1.5 text-xs break-words",
            testResult.ok ? "bg-positive/10 text-positive" : "bg-destructive/10 text-destructive",
          )}
        >
          {testResult.ok ? `${t("Test_succeeded")}: ${testResult.text}` : testResult.text}
        </p>
      {/if}
    </div>
  {/if}
</li>
