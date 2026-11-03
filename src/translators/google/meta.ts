import { siGoogletranslate } from "simple-icons";
import { apiKeyField, defineEngineMeta, simpleIcon } from "../engineMeta";

export default defineEngineMeta({
  id: "google",
  order: 0,
  defaultEnabled: true,
  label: "Google",
  icon: simpleIcon(siGoogletranslate),
  setup: "optional",
  fields: [apiKeyField(true, "AIza...")],
  docsUrl: "https://console.cloud.google.com/apis/library/translate.googleapis.com",
});
