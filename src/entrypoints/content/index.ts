import { defineContentScript } from "wxt/utils/define-content-script";
import { startContentScript } from "@/content";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  allFrames: true,
  matchAboutBlank: true,
  // the tooltip passes its own css to its shadow root, so it also works on the viewer pages
  cssInjectionMode: "manual",
  main(ctx) {
    return startContentScript(ctx);
  },
});
