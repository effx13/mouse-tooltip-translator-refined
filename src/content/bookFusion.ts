import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { emitSelectionEnd } from "./detect/selection";

const BOOK_IFRAME = 'iframe[id^="bf-epub-view-"]';
const SELECTION_DEBOUNCE_MS = 700;
// BookFusion clears the selection right after mouseup; ignore empty reports for a while
const EMPTY_SELECTION_LOCK_MS = 3000;

function redispatch(type: string, props: Record<string, unknown>) {
  window.dispatchEvent(Object.assign(new CustomEvent(type, { bubbles: true }), props));
}

function bindIframe(ctx: ContentScriptContext, iframe: HTMLIFrameElement, win: Window) {
  const doc = win.document;
  let selectTimer: number | undefined;
  let lockTimer: number | undefined;
  let lastGoodSelection = "";
  let locked = false;
  const currentText = () => win.getSelection()?.toString() ?? "";
  ctx.onInvalidated(() => {
    clearTimeout(selectTimer);
    clearTimeout(lockTimer);
  });

  ctx.addEventListener(doc, "selectionchange", () => {
    const text = currentText();
    if (text) lastGoodSelection = text;
    clearTimeout(selectTimer);
    selectTimer = window.setTimeout(() => {
      const current = currentText();
      if (current) {
        emitSelectionEnd(current);
      } else if (!locked) {
        lastGoodSelection = "";
        emitSelectionEnd("");
      }
    }, SELECTION_DEBOUNCE_MS);
  });

  // capture: runs before BookFusion's own handlers clear the selection
  ctx.addEventListener(
    doc,
    "mouseup",
    () => {
      clearTimeout(selectTimer);
      const text = currentText() || lastGoodSelection;
      lastGoodSelection = "";
      if (text) {
        locked = true;
        clearTimeout(lockTimer);
        lockTimer = window.setTimeout(() => (locked = false), EMPTY_SELECTION_LOCK_MS);
      }
      emitSelectionEnd(text);
    },
    { capture: true },
  );

  // the book iframe is CSS-scaled, so map its coordinates onto this page
  ctx.addEventListener(doc, "mousemove", (e: MouseEvent) => {
    const rect = iframe.getBoundingClientRect();
    const scaleX = rect.width / (iframe.offsetWidth || 1);
    const scaleY = rect.height / (iframe.offsetHeight || 1);
    redispatch("mousemove", {
      ebookWindow: win,
      clientX: e.clientX * scaleX + rect.left,
      clientY: e.clientY * scaleY + rect.top,
      iframeX: e.clientX,
      iframeY: e.clientY,
    });
  });

  for (const type of ["keydown", "keyup"] as const) {
    ctx.addEventListener(win, type, (e: KeyboardEvent) => {
      redispatch(type, { key: e.key, code: e.code, ctrlKey: e.ctrlKey });
    });
  }
}

// reader.bookfusion.com draws chapters in same-origin iframes that appear over time
export function bridgeBookFusion(ctx: ContentScriptContext) {
  const bound = new WeakSet<HTMLIFrameElement>();
  ctx.setInterval(() => {
    for (const iframe of document.querySelectorAll<HTMLIFrameElement>(BOOK_IFRAME)) {
      const win = iframe.contentWindow;
      if (bound.has(iframe) || !win) continue;
      bound.add(iframe);
      try {
        bindIframe(ctx, iframe, win);
      } catch (error) {
        console.log(error);
      }
    }
  }, 1000);
}
