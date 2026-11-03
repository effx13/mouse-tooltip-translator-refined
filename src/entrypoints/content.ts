import { defineContentScript } from "wxt/utils/define-content-script";
import "@/styles/tippy.css";
import "@/contentScript.js";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  allFrames: true,
  matchAboutBlank: true,
  main() {},
});
