import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";

// makes Google Docs render its canvas text into annotation elements we can read
// https://github.com/Amaimersion/google-docs-utils/issues/10
export default defineUnlistedScript(() => {
  Reflect.set(window, "_docs_annotate_canvas_by_ext", "clfoagbcljppiogigjclfjnjpcijnijl");
});
