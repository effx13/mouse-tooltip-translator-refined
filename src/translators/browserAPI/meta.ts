import { siGooglechrome } from "simple-icons";
import { defineEngineMeta, simpleIcon } from "../engineMeta";

export default defineEngineMeta({
  id: "browserAPI",
  order: 6,
  label: "Browser built-in translator",
  i18nKey: "Browser_built_in_translator",
  icon: simpleIcon(siGooglechrome),
  setup: "none",
  fields: [],
});
