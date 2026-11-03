<script lang="ts">
  import BanIcon from "@lucide/svelte/icons/ban";
  import CircleCheckIcon from "@lucide/svelte/icons/circle-check";
  import DownloadIcon from "@lucide/svelte/icons/download";
  import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import UploadIcon from "@lucide/svelte/icons/upload";
  import { isEqual } from "es-toolkit";
  import type { Component } from "svelte";
  import ColorField from "@/components/ColorField.svelte";
  import ComboBoxField from "@/components/ComboBoxField.svelte";
  import MultiSelectField from "@/components/MultiSelectField.svelte";
  import SelectField from "@/components/SelectField.svelte";
  import TextField from "@/components/TextField.svelte";
  import ToggleField from "@/components/ToggleField.svelte";
  import * as AlertDialog from "@/components/ui/alert-dialog";
  import { Button, type ButtonVariant } from "@/components/ui/button";
  import { cn } from "@/utils/cn";
  import { getMessage, t } from "@/utils/i18n";
  import type { ButtonAction, SettingItem, Settings } from "@/utils/settings";
  import { runAction } from "./actions";
  import LlmModelField from "./LlmModelField.svelte";
  import { getOptions, type Option } from "./options";
  import { defaults, setValue, store } from "./state.svelte";

  let {
    key,
    item,
    fontOptions,
    notify,
  }: { key: string; item: SettingItem; fontOptions: Option[]; notify: (message: string) => void } =
    $props();

  const ACTION_ICONS: Record<ButtonAction, Component> = {
    excludeCurrentWebsite: BanIcon,
    whitelistCurrentWebsite: CircleCheckIcon,
    importSetting: UploadIcon,
    exportSetting: DownloadIcon,
    resetSetting: Trash2Icon,
  };
  const TONE_VARIANTS: Record<"primary" | "positive" | "danger", ButtonVariant> = {
    primary: "outline",
    positive: "outline",
    danger: "destructive",
  };
  const TONE_ICON_CLASSES = { primary: "text-primary", positive: "text-positive", danger: "" };

  const settingKey = $derived(key as keyof Settings);
  const id = $derived(`setting-${key}`);
  const label = $derived(t(item.i18nKey));
  const defaultLabel = getMessage("Default") || "Default";
  const value = $derived(store.settings[settingKey] as unknown);
  const visible = $derived(item.visibleWhen?.(store.settings) ?? true);
  const isButton = $derived(item.optionType === "button");
  // #RRGGBB and #RRGGBBff are the same color
  const normalize = (v: unknown) =>
    item.optionType === "colorPicker" && typeof v === "string" && v.length === 7 ? `${v}ff` : v;
  const modified = $derived(
    !isButton && !isEqual(normalize($state.snapshot(value)), normalize(defaults[settingKey])),
  );
  const options = $derived(
    "optionList" in item
      ? getOptions(key, item.optionList, Boolean(item.langOptionList), store.settings.langPriority)
      : [],
  );

  let confirming = $state(false);
  let busy = $state(false);

  const change = (next: unknown) => void setValue(settingKey, next);

  async function run(action: ButtonAction) {
    confirming = false;
    busy = true;
    try {
      const message = await runAction(action);
      if (message) notify(message);
    } finally {
      busy = false;
    }
  }
</script>

{#if visible}
  <div
    class={cn(
      "flex items-center gap-1 border-s-2 py-(--row-gap) ps-3.5 transition-colors",
      modified ? "border-modified" : "border-transparent",
    )}
  >
    <div class="min-w-0 flex-1">
      {#if item.optionType === "button"}
        {@const action = item.action}
        {@const ActionIcon = ACTION_ICONS[action]}
        <Button
          variant={TONE_VARIANTS[item.tone]}
          disabled={busy}
          onclick={() => (action === "resetSetting" ? (confirming = true) : void run(action))}
        >
          <ActionIcon class={TONE_ICON_CLASSES[item.tone]} />
          {label}
        </Button>
        {#if action === "resetSetting"}
          <AlertDialog.Root bind:open={confirming}>
            <AlertDialog.Content size="sm">
              <AlertDialog.Header>
                <AlertDialog.Title>{label}?</AlertDialog.Title>
              </AlertDialog.Header>
              <AlertDialog.Footer>
                <AlertDialog.Cancel>{t("Cancel")}</AlertDialog.Cancel>
                <AlertDialog.Action variant="destructive" onclick={() => void run(action)}>
                  {label}
                </AlertDialog.Action>
              </AlertDialog.Footer>
            </AlertDialog.Content>
          </AlertDialog.Root>
        {/if}
      {:else if item.optionType === "toggle"}
        <ToggleField {id} {label} checked={Boolean(value)} onchange={change} />
      {:else if item.optionType === "multipleSelect"}
        <MultiSelectField {id} {label} {value} {options} onchange={change} />
      {:else if item.optionType === "comboBox"}
        <ComboBoxField {id} {label} {value} onchange={change} />
      {:else if item.optionType === "fontSelect"}
        <SelectField {id} {label} {value} options={fontOptions} fontPreview onchange={change} />
      {:else if item.optionType === "colorPicker"}
        <ColorField {id} {label} value={String(value ?? "")} onchange={change} />
      {:else if item.optionType === "textField"}
        <TextField
          {id}
          {label}
          value={String(value ?? "")}
          type={item.inputType}
          placeholder={item.placeholder}
          readonly={item.readonlyWhen?.(store.settings) ?? false}
          oninput={change}
        />
      {:else if item.optionType === "llmModelSelect"}
        <LlmModelField {id} {label} oninput={change} onerror={notify} />
      {:else if item.optionType !== "hidden"}
        <SelectField {id} {label} {value} {options} onchange={change} />
      {/if}
    </div>
    <div class="flex w-8 shrink-0 justify-center self-end pb-0.5">
      {#if modified}
        <Button
          variant="ghost"
          size="icon-sm"
          class="text-muted-foreground"
          title={defaultLabel}
          aria-label="{defaultLabel}: {label}"
          onclick={() => change(structuredClone(defaults[settingKey]))}
        >
          <RotateCcwIcon />
        </Button>
      {/if}
    </div>
  </div>
{/if}
