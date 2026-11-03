import { siGoogletranslate } from "simple-icons";
import { defineEngineMeta, simpleIcon } from "../engineMeta";

export default defineEngineMeta({
  id: "googleGTX",
  order: 10,
  label: "Google GTX",
  experimental: true,
  icon: simpleIcon(siGoogletranslate),
  setup: "none",
  fields: [],
});
