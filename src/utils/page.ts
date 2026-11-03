import { followColorScheme } from "@/utils/colorScheme.svelte";
import { getUiLangCode, loadUiLanguage, t } from "@/utils/i18n";
import { getSettings, type Settings } from "@/utils/settings";

const RTL_UI_LANGS = new Set(["ar", "fa", "he", "iw", "ur"]);

interface BootOptions {
  // the popup wires its settings store here; the viewers only read the settings once
  loadSettings?: () => Promise<Settings>;
  // message key for document.title
  titleKey?: string;
  // mirror the UI language direction on <html dir>
  setDir?: boolean;
}

// shared start of every extension page; returns the element to mount the app on
export async function bootPage({
  loadSettings = getSettings,
  titleKey,
  setDir = false,
}: BootOptions = {}): Promise<HTMLElement> {
  followColorScheme();
  const settings = await loadSettings();
  await loadUiLanguage(settings.uiLanguage);

  const root = document.documentElement;
  const uiLang = getUiLangCode();
  root.lang = uiLang;
  if (setDir) root.dir = RTL_UI_LANGS.has(uiLang.split("-")[0] ?? "") ? "rtl" : "ltr";
  if (titleKey) document.title = t(titleKey);

  const target = document.getElementById("app");
  if (!target) throw new Error("#app is missing from the page");
  return target;
}
