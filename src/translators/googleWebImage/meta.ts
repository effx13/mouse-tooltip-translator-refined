import { siGoogle } from "simple-icons";
import { defineEngineMeta, simpleIcon } from "../engineMeta";

export default defineEngineMeta({
  id: "googleWebImage",
  order: 13,
  label: "Google Web Image",
  experimental: true,
  icon: simpleIcon(siGoogle),
  setup: "none",
  fields: [],
});
