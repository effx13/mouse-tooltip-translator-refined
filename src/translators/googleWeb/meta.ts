import { siGoogle } from "simple-icons";
import { defineEngineMeta, simpleIcon } from "../engineMeta";

export default defineEngineMeta({
  id: "googleWeb",
  order: 11,
  label: "Google Web",
  experimental: true,
  icon: simpleIcon(siGoogle),
  setup: "none",
  fields: [],
});
