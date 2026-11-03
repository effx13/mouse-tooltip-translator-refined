import { loadUiLanguage } from "@/utils/i18n";
import { getSettings, watchSettings, type Settings } from "@/utils/settings";

let current: Settings | undefined;
let ready: Promise<Settings> | undefined;

// failure messages are built here, so the background follows the chosen UI language too
async function adopt(settings: Settings) {
  current = settings;
  await loadUiLanguage(settings.uiLanguage);
  return settings;
}

const load = () => (ready ??= getSettings().then(adopt));

// called first in main() so listeners registered after it see the cached copy
export function trackSettings() {
  void load();
  watchSettings((settings) => void adopt(settings));
}

export const currentSettings = async (): Promise<Settings> => current ?? load();

// for listeners that must answer synchronously (blocking webRequest)
export const peekSettings = () => current;
