import { siNaver } from "simple-icons";
import { defineEngineMeta, simpleIcon } from "../engineMeta";

export default defineEngineMeta({
  id: "papago",
  order: 3,
  label: "Papago",
  icon: simpleIcon(siNaver),
  setup: "optional",
  fields: [
    { key: "clientId", i18nKey: "Client_ID", type: "text", required: true },
    { key: "clientSecret", i18nKey: "Client_Secret", type: "password", required: true },
  ],
  docsUrl: "https://www.ncloud.com/product/aiService/papagoTranslation",
});
