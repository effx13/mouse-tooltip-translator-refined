import { browser } from "wxt/browser";
import { sendMessage } from "@/utils/messaging";
import { truncate } from "@/utils/text";

let recentTarget = "";
let recentSource = "";

export async function rememberTooltip(sourceText: string, targetText: string) {
  recentTarget = targetText;
  recentSource = sourceText;
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({
    id: "copy",
    title: `Copy : ${truncate(targetText, 20)}`,
    contexts: ["all"],
  });
}

async function copyOnActiveTab(text: string) {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null || !text) return;
  await sendMessage("copyText", text, tab.id).catch((error) => console.log(error));
}

const clearMenu = () => void browser.contextMenus.removeAll();

export function registerCopyListeners() {
  browser.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === "copy") void copyOnActiveTab(recentTarget);
  });
  browser.commands.onCommand.addListener((command) => {
    if (command === "copy-translated-text") void copyOnActiveTab(recentTarget);
    // hotkey only
    if (command === "copy-source-text") void copyOnActiveTab(recentSource);
  });
  // the menu shows the last tooltip of the tab that was active
  browser.tabs.onActivated.addListener(clearMenu);
  browser.tabs.onRemoved.addListener(clearMenu);
}
