import { defineEngineMeta } from "../engineMeta";
import icon from "./icon.svg";

export default defineEngineMeta({
  id: "yandex",
  order: 4,
  label: "Yandex",
  icon: { kind: "image", src: icon },
  setup: "none",
  fields: [],
});
