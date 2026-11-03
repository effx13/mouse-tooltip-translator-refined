import { siLibretranslate } from "simple-icons";
import { apiKeyField, defineEngineMeta, simpleIcon } from "../engineMeta";

export default defineEngineMeta({
  id: "libreTranslate",
  order: 8,
  label: "LibreTranslate",
  icon: simpleIcon(siLibretranslate),
  setup: "required",
  fields: [
    {
      key: "url",
      i18nKey: "Server_URL",
      type: "url",
      required: true,
      placeholder: "https://libretranslate.com",
    },
    apiKeyField(false),
  ],
  docsUrl: "https://portal.libretranslate.com/",
});
