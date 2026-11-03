import { mount } from "svelte";
import { ContentScriptContext } from "wxt/utils/content-script-context";
import { startContentScript } from "@/content";
import { bootPage } from "@/utils/page";
import App from "./App.svelte";

// extension pages get no content script, so the tooltip runs from here
const ctx = new ContentScriptContext("viewer");
void startContentScript(ctx);

const target = await bootPage({ titleKey: "Ebook_Reader" });
mount(App, { target, props: { ctx } });
