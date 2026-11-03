<script lang="ts">
  import Icon from "@/components/Icon.svelte";
  import { getMessage, t } from "@/utils/i18n";
  import { SETTING_TABS, settingSchema, type SettingItem, type SettingTab } from "@/utils/settings";
  import { getFontOptions, type Option } from "./options";
  import SettingRow from "./SettingRow.svelte";
  import { save, store } from "./state.svelte";

  let { onabout }: { onabout: () => void } = $props();

  type Tab = (typeof SETTING_TABS)[number];
  const isTab = (value: unknown): value is Tab => SETTING_TABS.includes(value as Tab);

  const entries = Object.entries(settingSchema) as [string, SettingItem][];
  const rowsByTab = Object.groupBy(
    entries.filter(([, item]) => item.optionType !== "hidden"),
    ([, item]) => item.settingTab,
  ) as Partial<Record<SettingTab, [string, SettingItem][]>>;

  let tab = $state<Tab>(
    isTab(store.settings.lastSettingTab) ? store.settings.lastSettingTab : "main",
  );
  let fontOptions = $state<Option[]>([{ label: getMessage("Default") || "Default", value: "" }]);
  let toast = $state("");
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let scroller: HTMLElement | undefined = $state();

  void getFontOptions().then((list) => (fontOptions = list));

  function selectTab(next: Tab) {
    tab = next;
    scroller?.scrollTo({ top: 0 });
    if (store.settings.lastSettingTab !== next) void save({ lastSettingTab: next });
  }

  function notify(message: string) {
    toast = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ""), 4000);
  }

  // vertical wheel scrolls the tab strip sideways when it overflows
  function onTabWheel(e: WheelEvent) {
    const strip = e.currentTarget as HTMLElement;
    if (strip.scrollWidth <= strip.clientWidth) return;
    e.preventDefault();
    strip.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  }
</script>

<header class="appbar">
  <h1>{t("Mouse_Tooltip_Translator")}</h1>
  <button
    type="button"
    class="icon-btn"
    title={t("About")}
    aria-label={t("About")}
    onclick={onabout}
  >
    <Icon name="menu" />
  </button>
</header>

<div class="tabs" role="tablist" tabindex="-1" onwheel={onTabWheel}>
  {#each SETTING_TABS as id (id)}
    <button
      type="button"
      role="tab"
      class="tab"
      aria-selected={tab === id}
      class:active={tab === id}
      onclick={() => selectTab(id)}
    >
      {getMessage(id.toUpperCase()) || id.toUpperCase()}
    </button>
  {/each}
</div>

<main class="content" class:compact={store.settings.compactMode} bind:this={scroller}>
  {#each rowsByTab[tab] ?? [] as [key, item] (key)}
    <SettingRow {key} {item} {fontOptions} {notify} />
  {/each}
</main>

{#if toast}
  <div class="toast" role="status">{toast}</div>
{/if}

<style>
  .appbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 6px 16px;
    background: var(--primary);
    color: var(--on-primary);
  }
  h1 {
    flex: 1;
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .appbar .icon-btn {
    color: inherit;
  }
  .tabs {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
    background: var(--primary);
    color: var(--on-primary);
  }
  .tab {
    flex: none;
    min-width: 60px;
    padding: 10px 12px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    opacity: 0.75;
    cursor: pointer;
  }
  .tab:hover {
    opacity: 1;
  }
  .tab.active {
    opacity: 1;
    border-bottom-color: var(--tab-indicator);
  }
  .content {
    --row-gap: 10px;
    flex: 1;
    overflow-y: auto;
    padding: 4px 4px 16px 0;
  }
  .content.compact {
    --row-gap: 2px;
  }
  .toast {
    position: fixed;
    inset-inline: 12px;
    bottom: 12px;
    padding: 10px 14px;
    border-radius: 6px;
    background: var(--toast);
    color: #fff;
    font-size: 0.875rem;
    box-shadow: 0 4px 12px rgb(0 0 0 / 0.3);
    overflow-wrap: anywhere;
  }
</style>
