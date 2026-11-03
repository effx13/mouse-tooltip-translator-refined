import { ContentScriptContext } from "wxt/utils/content-script-context";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { startContentScript } from "@/content";
import { bridgeEbookFrames } from "@/viewers/ebook";

// loaded by public/foliate-js/reader.html
export default defineUnlistedScript(() => {
  const ctx = new ContentScriptContext("viewer");
  void startContentScript(ctx);
  bridgeEbookFrames(ctx);
});
