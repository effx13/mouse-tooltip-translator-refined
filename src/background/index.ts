import { browser } from "wxt/browser";
import { translate } from "@/translators";
import { onMessage } from "@/utils/messaging";
import { registerCopyListeners, rememberTooltip } from "./copy";
import { registerInstallListeners } from "./install";
import { registerPdfRedirects } from "./pdf";
import { currentSettings } from "./settings";

function registerOmnibox() {
  browser.omnibox.setDefaultSuggestion({ description: "search with translator" });
  browser.omnibox.onInputEntered.addListener(async (text) => {
    const settings = await currentSettings();
    const result = await translate(
      {
        text,
        sourceLang: "auto",
        targetLang: settings.writingLanguage,
        reverseLang: settings.translateTarget,
      },
      settings,
    );
    const query = !result || result.isBroken ? text : result.targetText;
    await browser.search.query({ text: query, disposition: "CURRENT_TAB" });
  });
}

export function startBackground() {
  onMessage("translate", async ({ data }) => translate(data, await currentSettings()));
  onMessage("tooltipShown", ({ data }) => rememberTooltip(data.sourceText, data.targetText));
  registerCopyListeners();
  registerInstallListeners();
  registerPdfRedirects();
  registerOmnibox();
}
