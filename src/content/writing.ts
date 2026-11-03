import { sleep } from "@/utils/async";
import type { Settings } from "@/utils/settings";
import { getActiveElement, getFocusedWritingBox, isGoogleDoc } from "./env";
import { dispatchPaste, pasteGoogleDoc } from "./googleDocs";
import { getSelectionText } from "./detect/selection";
import { requestTranslate } from "./translate";

const hasSelection = () => window.getSelection()?.type !== "Caret";

// blur + refocus commits a pending IME composition so the last character is not lost
async function finishImeComposition() {
  await sleep(10);
  const el = getActiveElement() as HTMLElement | null;
  window.getSelection()?.removeAllRanges();
  el?.blur();
  await sleep(10);
  el?.focus();
  await sleep(50);
  document.execCommand("selectAll", false);
  await sleep(50);
}

async function getWritingText() {
  const selected = getSelectionText();
  if (hasSelection() && selected.length > 1) return selected;
  document.execCommand("selectAll", false);
  const text = getSelectionText();
  await finishImeComposition();
  return text;
}

async function insertWithExecCommand(text: string, onlyIfSelected: boolean) {
  if (onlyIfSelected && !hasSelection()) return;
  document.execCommand("insertText", false, text);
  await sleep(300);
}

async function insertWithPaste(text: string, onlyIfSelected: boolean) {
  if (onlyIfSelected && !hasSelection()) return;
  const el = getActiveElement();
  if (el) dispatchPaste(el, text);
  await sleep(300);
}

async function insertText(text: string) {
  if (!text) return;
  if (isGoogleDoc()) {
    pasteGoogleDoc(text);
  } else if (getFocusedWritingBox()?.matches("[spellcheck='true']")) {
    // Discord, Twitch: paste first
    await insertWithPaste(text, false);
    await insertWithExecCommand(text, true);
  } else {
    await insertWithExecCommand(text, false);
    await insertWithPaste(text, true);
  }
}

export function createWritingTranslator(getSettings: () => Settings) {
  // a second press while the async flow runs would duplicate or drop the result
  let busy = false;

  return async function translateWriting() {
    if (busy || (!getFocusedWritingBox() && !isGoogleDoc())) return;
    busy = true;
    try {
      const text = await getWritingText();
      if (!text) return;
      const settings = getSettings();
      // text already in the writing language is translated into the target instead
      const result = await requestTranslate({
        text,
        sourceLang: "auto",
        targetLang: settings.writingLanguage,
        reverseLang: settings.translateTarget,
      });
      if (!result || result.isBroken) return;
      await insertText(result.targetText);
    } finally {
      busy = false;
    }
  };
}
