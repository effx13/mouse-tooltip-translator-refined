import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import * as ocrView from "@/ocr/ocrView.js";
import { registerFeature } from "@/util/feature.js";

// injected on demand by src/util/feature.js (see FEATURE_FILES)
export default defineUnlistedScript(() => {
  registerFeature("ocr", ocrView);
});
