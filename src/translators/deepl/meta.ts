import { siDeepl } from "simple-icons";
import { apiKeyField, defineEngineMeta, simpleIcon } from "../engineMeta";

export default defineEngineMeta({
  id: "deepl",
  order: 2,
  label: "DeepL",
  icon: simpleIcon(siDeepl),
  setup: "optional",
  fields: [apiKeyField(true, "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx")],
  docsUrl: "https://www.deepl.com/your-account/keys",
});
