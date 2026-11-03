import { followColorScheme } from "@/utils/colorScheme.svelte";
import { getUiLangCode, loadUiLanguage, t } from "@/utils/i18n";
import { getSettings, type Settings } from "@/utils/settings";

interface BootOptions {
  // the popup wires its settings store here; the viewers only read the settings once
  loadSettings?: () => Promise<Settings>;
  // message key for document.title
  titleKey?: string;
}

// shared start of every extension page; returns the element to mount the app on
export async function bootPage({
  loadSettings = getSettings,
  titleKey,
}: BootOptions = {}): Promise<HTMLElement> {
  followColorScheme();
  const settings = await loadSettings();
  await loadUiLanguage(settings.uiLanguage);

  document.documentElement.lang = getUiLangCode();
  if (titleKey) document.title = t(titleKey);

  const target = document.getElementById("app");
  if (!target) throw new Error("#app is missing from the page");
  return target;
}
