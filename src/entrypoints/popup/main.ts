import { mount } from "svelte";
import { followColorScheme } from "@/utils/colorScheme.svelte";
import { getUiLangCode, loadUiLanguage } from "@/utils/i18n";
import App from "./App.svelte";
import { initSettings } from "./state.svelte";

const RTL_UI_LANGS = new Set(["ar", "fa", "he", "iw", "ur"]);

followColorScheme();

const settings = await initSettings();
await loadUiLanguage(settings.uiLanguage);

const uiLang = getUiLangCode();
document.documentElement.lang = uiLang;
document.documentElement.dir = RTL_UI_LANGS.has(uiLang.split("-")[0] ?? "") ? "rtl" : "ltr";

mount(App, { target: document.getElementById("app")! });
