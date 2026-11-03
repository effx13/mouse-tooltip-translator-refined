import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import subtitle from "@/subtitle/subtitle.js";
import { registerFeature } from "@/util/feature.js";

// injected on demand by src/util/feature.js (see FEATURE_FILES)
export default defineUnlistedScript(() => {
  registerFeature("subtitle", subtitle);
});
