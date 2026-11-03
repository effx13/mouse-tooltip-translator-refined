import { siGoogletranslate } from "simple-icons";
import { defineEngineMeta, simpleIcon } from "../engineMeta";

export default defineEngineMeta({
  id: "googleV2",
  order: 12,
  label: "Google V2",
  experimental: true,
  icon: simpleIcon(siGoogletranslate),
  setup: "none",
  fields: [],
});
