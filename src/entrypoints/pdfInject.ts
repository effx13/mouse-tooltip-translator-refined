import { ContentScriptContext } from "wxt/utils/content-script-context";
import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { startContentScript } from "@/content";
import { enhancePdfViewer } from "@/viewers/pdf";

// loaded by public/pdfjs/web/viewer.html; extension pages get no content script
export default defineUnlistedScript(() => {
  void enhancePdfViewer();
  void startContentScript(new ContentScriptContext("viewer"));
});
