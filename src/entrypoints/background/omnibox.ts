import { browser } from "wxt/browser";
import { translate } from "@/translators";
import { currentSettings } from "./settings";

export function registerOmnibox() {
  browser.omnibox.setDefaultSuggestion({ description: "search with translator" });
  browser.omnibox.onInputEntered.addListener(async (text) => {
    const settings = await currentSettings();
    const result = await translate(
      {
        text,
        sourceLang: "auto",
        targetLang: settings.writingLanguage,
        reverseLang: settings.translateTarget,
        cache: false,
      },
      settings,
    );
    const query = !result || result.isBroken ? text : result.targetText;
    await browser.search.query({ text: query, disposition: "CURRENT_TAB" });
  });
}
