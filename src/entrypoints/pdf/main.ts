import { mount } from "svelte";
import { ContentScriptContext } from "wxt/utils/content-script-context";
import { startContentScript } from "@/content";
import { followColorScheme } from "@/utils/colorScheme.svelte";
import { getUiLangCode, loadUiLanguage } from "@/utils/i18n";
import { getSettings } from "@/utils/settings";
import App from "./App.svelte";

followColorScheme();

// extension pages get no content script, so the tooltip runs from here
void startContentScript(new ContentScriptContext("viewer"));

await loadUiLanguage((await getSettings()).uiLanguage);
document.documentElement.lang = getUiLangCode();

mount(App, { target: document.getElementById("app")! });
