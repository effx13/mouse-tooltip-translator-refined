<script lang="ts">
  import { isEqual } from "es-toolkit";
  import ColorField from "@/components/ColorField.svelte";
  import ComboBoxField from "@/components/ComboBoxField.svelte";
  import Icon, { type IconName } from "@/components/Icon.svelte";
  import MultiSelectField from "@/components/MultiSelectField.svelte";
  import SelectField from "@/components/SelectField.svelte";
  import TextField from "@/components/TextField.svelte";
  import ToggleField from "@/components/ToggleField.svelte";
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

  const ACTION_ICONS: Record<ButtonAction, IconName> = {
    excludeCurrentWebsite: "block",
    whitelistCurrentWebsite: "check",
    importSetting: "upload",
    exportSetting: "download",
    resetSetting: "trash",
  };

  const settingKey = $derived(key as keyof Settings);
  const id = $derived(`setting-${key}`);
  const label = $derived(t(item.i18nKey));
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

  async function onButton(action: ButtonAction) {
    if (action === "resetSetting" && !confirming) {
      confirming = true;
      return;
    }
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
  <div class="row" class:modified>
    <span class="mark" aria-hidden="true"></span>
    <div class="control">
      {#if item.optionType === "button"}
        {@const action = item.action}
        <div class="button-row">
          <button
            type="button"
            class="action tone-{item.tone}"
            disabled={busy}
            onclick={() => onButton(action)}
          >
            <Icon name={ACTION_ICONS[action]} />
            <span>{label}{confirming ? "?" : ""}</span>
          </button>
          {#if confirming}
            <button type="button" class="action" onclick={() => (confirming = false)}
              >{t("Cancel")}</button
            >
          {/if}
        </div>
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
    <div class="reset">
      {#if modified}
        <button
          type="button"
          class="icon-btn"
          title={getMessage("Default") || "Default"}
          aria-label="{getMessage('Default') || 'Default'}: {label}"
          onclick={() => change(structuredClone(defaults[settingKey]))}
        >
          <Icon name="restore" size={18} />
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: var(--row-gap) 0;
  }
  .mark {
    align-self: stretch;
    flex: none;
    width: 2px;
    border-radius: 1px;
    background: var(--modified);
    opacity: 0;
  }
  .modified .mark {
    opacity: 0.6;
  }
  .control {
    flex: 1;
    min-width: 0;
  }
  .reset {
    flex: none;
    width: 32px;
  }
  .button-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .action {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .action:hover {
    background: var(--hover);
  }
  .action:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .tone-primary :global(svg) {
    color: var(--primary);
  }
  .tone-positive :global(svg) {
    color: var(--positive);
  }
  .tone-danger :global(svg),
  .tone-danger {
    color: var(--danger);
  }
</style>
