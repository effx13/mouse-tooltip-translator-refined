import { browser } from "wxt/browser";
import type { ScriptPublicPath } from "wxt/utils/inject-script";

const INTRO_URL = "https://github.com/effx13/MouseTooltipTranslator/blob/main/docs/intro.md";

const NOT_INJECTABLE =
  /^(chrome|edge|about|moz-extension|chrome-extension):|^file:|^https:\/\/(chrome\.google\.com|chromewebstore\.google\.com|addons\.mozilla\.org)/;

// already open tabs only get the content script on reload, so inject it now
async function injectIntoOpenTabs() {
  for (const cs of browser.runtime.getManifest().content_scripts ?? []) {
    const tabs = await browser.tabs.query({ url: cs.matches });
    for (const tab of tabs) {
      if (tab.id == null || !tab.url || NOT_INJECTABLE.test(tab.url)) continue;
      const target = { tabId: tab.id, allFrames: cs.all_frames };
      if (cs.css?.length) {
        browser.scripting.insertCSS({ target, files: cs.css }).catch(() => {});
      }
      if (cs.js?.length) {
        // the manifest lists the content script's own output paths, typed as plain strings
        const files = cs.js as ScriptPublicPath[];
        browser.scripting.executeScript({ target, files }).catch(() => {});
      }
    }
  }
}

export function registerInstallListeners() {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === "install") void browser.tabs.create({ url: INTRO_URL });
    if (!import.meta.env.DEV && (reason === "install" || reason === "update")) {
      void injectIntoOpenTabs();
    }
  });
}
