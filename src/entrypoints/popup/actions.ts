import { browser } from "wxt/browser";
import { downloadBlob } from "@/utils/download";
import { t } from "@/utils/i18n";
import { exportSettings, importSettings, resetSettings, type ButtonAction } from "@/utils/settings";
import { save, store } from "./state.svelte";

async function getActiveHost(): Promise<string | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  try {
    const url = new URL(tab.url);
    return url.protocol === "http:" || url.protocol === "https:" ? url.hostname : null;
  } catch {
    return null;
  }
}

async function addActiveHost(key: "websiteExcludeList" | "websiteWhiteList"): Promise<string> {
  const host = await getActiveHost();
  // from the options tab the active tab is this extension page
  if (!host) return t("Open_this_popup_on_a_website_to_use_this_button");
  const list = store.settings[key] ?? [];
  if (!list.includes(host)) await save({ [key]: [...list, host] });
  return host;
}

function pickJsonFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

const EXPORT_FILENAME = "mouse-tooltip-translator-refined-settings.json";
const EXPORT_URL_LIFETIME_MS = 1000;

// returns a status message to show, or null
export async function runAction(action: ButtonAction): Promise<string | null> {
  switch (action) {
    case "excludeCurrentWebsite":
      return addActiveHost("websiteExcludeList");
    case "whitelistCurrentWebsite":
      return addActiveHost("websiteWhiteList");
    case "importSetting": {
      const file = await pickJsonFile();
      if (!file) return null;
      try {
        await importSettings(JSON.parse(await file.text()));
      } catch (error) {
        return `${t("Import_failed")}: ${error instanceof Error ? error.message : String(error)}`;
      }
      location.reload();
      return null;
    }
    case "exportSetting":
      downloadBlob(
        new Blob([JSON.stringify(await exportSettings(), null, 2)], { type: "application/json" }),
        EXPORT_FILENAME,
        EXPORT_URL_LIFETIME_MS,
      );
      return null;
    case "resetSetting":
      await resetSettings();
      location.reload();
      return null;
  }
}
