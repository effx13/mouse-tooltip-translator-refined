import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { isGoogleDoc } from "../env";
import { getGoogleDocSelection } from "../googleDocs";
import { extractTextFromFragment } from "./range";

export const SELECTION_END_EVENT = "selectionEnd";
const SELECTION_DEBOUNCE_MS = 700;

export interface SelectionEndEvent extends CustomEvent<string | undefined> {
  selectedText?: string;
}

// the event also carries `selectedText` like the legacy ebook/BookFusion bridges did
export function emitSelectionEnd(text: string, target: Document = document) {
  const evt: SelectionEndEvent = new CustomEvent(SELECTION_END_EVENT, {
    detail: text,
    bubbles: true,
  });
  evt.selectedText = text;
  target.dispatchEvent(evt);
}

export const readSelectionEnd = (e: Event) => {
  const evt = e as SelectionEndEvent;
  return evt.detail ?? evt.selectedText ?? "";
};

export function getWindowSelectionText(win: Window = window): string {
  const sel = win.getSelection();
  if (!sel) return "";
  const container = win.document.createElement("div");
  for (let i = 0; i < sel.rangeCount; i++) container.append(sel.getRangeAt(i).cloneContents());
  // ruby readings get duplicated into toString(), prefer the furigana-free text then
  const hasRuby = Boolean(container.querySelector("ruby>rt"));
  const filtered = extractTextFromFragment(container);
  const raw = sel.toString();
  return hasRuby ? filtered || raw : raw || filtered;
}

export function getSelectionText(win: Window = window): string {
  return win === window && isGoogleDoc() ? getGoogleDocSelection() : getWindowSelectionText(win);
}

const isUserSelectNone = (target: EventTarget | null) => {
  try {
    return target instanceof Element && getComputedStyle(target).userSelect === "none";
  } catch {
    return false;
  }
};

// selectionchange (keyboard, "select all") settles after 700ms; mouseup reports right away.
// Emits a `selectionEnd` event on this script's document, so a bridge can watch an ebook iframe.
// `signal` lets callers drop the listeners early (ebook sections that get swapped out)
export function watchSelection(win: Window, ctx: ContentScriptContext, signal?: AbortSignal) {
  let timer: number | undefined;
  let downOnNoneSelect = false;
  const doc = win.document;
  const options = { signal: signal ? AbortSignal.any([ctx.signal, signal]) : ctx.signal };
  options.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });

  doc.addEventListener(
    "selectionchange",
    () => {
      clearTimeout(timer);
      timer = window.setTimeout(
        () => emitSelectionEnd(getSelectionText(win)),
        SELECTION_DEBOUNCE_MS,
      );
    },
    options,
  );
  doc.addEventListener(
    "mousedown",
    (e) => {
      downOnNoneSelect = isUserSelectNone(e.target);
    },
    options,
  );
  doc.addEventListener(
    "mouseup",
    (e) => {
      clearTimeout(timer);
      const blocked = downOnNoneSelect && isUserSelectNone(e.target);
      emitSelectionEnd(blocked ? "" : getSelectionText(win));
    },
    options,
  );
}
