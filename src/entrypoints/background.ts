import { defineBackground } from "wxt/utils/define-background";
import { startBackground } from "@/background";

export default defineBackground({
  // classic script: Firefox MV2 background page / Chrome MV3 service worker
  main() {
    startBackground();
  },
});
