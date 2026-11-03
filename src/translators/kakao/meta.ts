import { siKakaotalk } from "simple-icons";
import { apiKeyField, defineEngineMeta, simpleIcon } from "../engineMeta";

export default defineEngineMeta({
  id: "kakao",
  order: 7,
  label: "Kakao i",
  icon: simpleIcon(siKakaotalk),
  setup: "required",
  fields: [apiKeyField(true)],
  docsUrl: "https://developers.kakao.com/console/app",
});
