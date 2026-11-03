import { mount } from "svelte";
import { ContentScriptContext } from "wxt/utils/content-script-context";
import { startContentScript } from "@/content";
import { getUiLangCode, loadUiLanguage, t } from "@/utils/i18n";
import { getSettings } from "@/utils/settings";
import App from "./App.svelte";

const ctx = new ContentScriptContext("viewer");
void startContentScript(ctx);

await loadUiLanguage((await getSettings()).uiLanguage);
document.documentElement.lang = getUiLangCode();
document.title = t("Ebook_Reader");

mount(App, { target: document.getElementById("app")!, props: { ctx } });
