<script lang="ts">
  import MenuIcon from "@lucide/svelte/icons/menu";
  import { toast } from "svelte-sonner";
  import icon from "@/assets/icon.svg";
  import { Button } from "@/components/ui/button";
  import * as Tabs from "@/components/ui/tabs";
  import { cn } from "@/utils/cn";
  import { t } from "@/utils/i18n";
  import { SETTING_TABS, settingSchema, type Option, type SettingItem } from "@/utils/settings";
  import { getFontOptions } from "./options";
  import SettingRow from "./SettingRow.svelte";
  import { save, store } from "./state.svelte";

  let { onabout }: { onabout: () => void } = $props();

  type Tab = (typeof SETTING_TABS)[number];
  const isTab = (value: unknown): value is Tab => SETTING_TABS.some((id) => id === value);

  const entries: [string, SettingItem][] = Object.entries(settingSchema);
  const rowsByTab = Object.groupBy(
    entries.filter(([, item]) => item.optionType !== "hidden"),
    ([, item]) => item.settingTab,
  );

  let tab = $state<Tab>(
    isTab(store.settings.lastSettingTab) ? store.settings.lastSettingTab : "main",
  );
  let fontOptions = $state<Option[]>([{ label: t("Default"), value: "" }]);
  let scroller: HTMLElement | undefined = $state();

  void getFontOptions().then((list) => (fontOptions = list));

  function selectTab(next: string) {
    if (!isTab(next)) return;
    tab = next;
    scroller?.scrollTo({ top: 0 });
    if (store.settings.lastSettingTab !== next) void save({ lastSettingTab: next });
  }

  const notify = (message: string) => toast(message);

  // vertical wheel scrolls the tab strip sideways when it overflows
  function onTabWheel(e: WheelEvent & { currentTarget: HTMLElement }) {
    const strip = e.currentTarget;
    if (strip.scrollWidth <= strip.clientWidth) return;
    e.preventDefault();
    strip.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  }
</script>

<header class="flex items-center gap-2.5 border-b px-4 py-2.5">
  <img src={icon} alt="" class="size-6 shrink-0" />
  <h1 class="flex-1 truncate text-[0.9375rem] font-semibold">{t("Mouse_Tooltip_Translator")}</h1>
  <Button
    variant="ghost"
    size="icon-sm"
    title={t("About")}
    aria-label={t("About")}
    onclick={onabout}
  >
    <MenuIcon />
  </Button>
</header>

<Tabs.Root value={tab} onValueChange={selectTab} class="flex min-h-0 flex-1 flex-col gap-0">
  <Tabs.List
    variant="line"
    class="w-full shrink-0 group-data-horizontal/tabs:h-10 justify-start gap-0 overflow-x-auto border-b px-2 [scrollbar-width:none]"
    onwheel={onTabWheel}
  >
    {#each SETTING_TABS as id (id)}
      <Tabs.Trigger
        value={id}
        class="flex-none px-3 text-xs font-semibold tracking-wide uppercase group-data-[variant=line]/tabs-list:data-active:after:bg-primary"
      >
        {t(id.toUpperCase())}
      </Tabs.Trigger>
    {/each}
  </Tabs.List>

  <Tabs.Content
    value={tab}
    bind:ref={scroller}
    class={cn(
      "min-h-0 flex-1 overflow-y-auto py-2 pe-1",
      store.settings.compactMode ? "[--row-gap:0.125rem]" : "[--row-gap:0.5rem]",
    )}
  >
    {#each rowsByTab[tab] ?? [] as [key, item] (key)}
      <SettingRow {key} {item} {fontOptions} {notify} />
    {/each}
  </Tabs.Content>
</Tabs.Root>
