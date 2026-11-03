import type { View } from "foliate-js/view.js";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { watchSelection } from "@/content";

const FORWARDED = ["mousemove", "keydown", "keyup"] as const;

// fixed-layout books CSS-scale the iframe, so map its coordinates onto this page
function toPage(iframe: Element, x: number | undefined, y: number | undefined) {
  if (x === undefined || y === undefined) return { clientX: "", clientY: "" } as const;
  const rect = iframe.getBoundingClientRect();
  const width = iframe instanceof HTMLElement ? iframe.offsetWidth : 0;
  const height = iframe instanceof HTMLElement ? iframe.offsetHeight : 0;
  const scaleX = width ? rect.width / width : 1;
  const scaleY = height ? rect.height / height : 1;
  return { clientX: x * scaleX + rect.left, clientY: y * scaleY + rect.top };
}

function bindSection(doc: Document, ctx: ContentScriptContext, viewSignal: AbortSignal) {
  const win = doc.defaultView;
  const iframe = win?.frameElement;
  if (!win || !iframe) return;
  // drop our listeners when foliate swaps this section out
  const unload = new AbortController();
  win.addEventListener("pagehide", () => unload.abort(), { once: true });
  const signal = AbortSignal.any([viewSignal, unload.signal]);
  watchSelection(win, ctx, signal);

  for (const type of FORWARDED) {
    win.addEventListener(
      type,
      (e) => {
        // the iframe's events come from another realm, so tell them apart by shape, not instanceof
        const key = "key" in e ? e : undefined;
        const mouse = "clientX" in e ? e : undefined;
        const evt = Object.assign(new CustomEvent(type, { bubbles: true }), {
          ebookWindow: win,
          key: key?.key,
          code: key?.code,
          ctrlKey: e.ctrlKey,
          ...toPage(iframe, mouse?.clientX, mouse?.clientY),
          iframeX: mouse?.clientX,
          iframeY: mouse?.clientY,
        });
        // dispatching once on document also reaches window listeners; twice would flip toggle keys back
        document.dispatchEvent(evt);
      },
      { signal },
    );
  }
}

// the book lives in an iframe inside foliate's closed shadow DOM, one document per section
export function bridgeEbookView(view: View, ctx: ContentScriptContext, signal = ctx.signal) {
  const viewSignal = AbortSignal.any([ctx.signal, signal]);
  view.addEventListener("load", (e) => bindSection(e.detail.doc, ctx, viewSignal), {
    signal: viewSignal,
  });
}
