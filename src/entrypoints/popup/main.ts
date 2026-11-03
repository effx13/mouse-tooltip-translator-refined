import { mount } from "svelte";
import { bootPage } from "@/utils/page";
import App from "./App.svelte";
import { initSettings } from "./state.svelte";

const target = await bootPage({ loadSettings: initSettings });
mount(App, { target });
