import { apiKeyField, defineEngineMeta } from "../engineMeta";
import icon from "./icon.svg";

export default defineEngineMeta({
  id: "bing",
  order: 1,
  defaultEnabled: true,
  label: "Bing",
  icon: { kind: "image", src: icon },
  setup: "optional",
  fields: [
    apiKeyField(true),
    { key: "region", i18nKey: "Region", type: "text", placeholder: "eastus" },
  ],
  docsUrl: "https://portal.azure.com/#create/Microsoft.CognitiveServicesTextTranslation",
});
