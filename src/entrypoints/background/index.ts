import { defineBackground } from "wxt/utils/define-background";
import { translate } from "@/translators";
import { translationCache } from "@/translators/cache";
import { onMessage } from "@/utils/messaging";
import { registerCopyListeners, rememberTooltip } from "./copy";
import { registerInstallListeners } from "./install";
import { registerOmnibox } from "./omnibox";
import { registerPdfRedirects } from "./pdfRedirect";
import { currentSettings, trackSettings } from "./settings";

export default defineBackground({
  // classic script: Firefox MV2 background page / Chrome MV3 service worker
  main() {
    trackSettings();
    onMessage("translate", async ({ data }) => translate(data, await currentSettings()));
    onMessage("translationCache", async ({ data }) => {
      if (data === "clear") await translationCache.clear();
      return translationCache.count();
    });
    onMessage("tooltipShown", ({ data }) => rememberTooltip(data.sourceText, data.targetText));
    registerCopyListeners();
    registerInstallListeners();
    registerPdfRedirects();
    registerOmnibox();
  },
});
