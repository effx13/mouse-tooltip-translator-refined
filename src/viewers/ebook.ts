import type { View } from "foliate-js/view.js";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { watchSelection } from "@/content";

type BridgedEvent = CustomEvent & {
  ebookWindow: Window;
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  clientX: number | "";
  clientY: number | "";
  iframeX?: number;
  iframeY?: number;
};

const FORWARDED = ["mousemove", "keydown", "keyup"] as const;

// fixed-layout books CSS-scale the iframe, so map its coordinates onto this page
function toPage(iframe: Element, x: unknown, y: unknown) {
  if (typeof x !== "number" || typeof y !== "number") return { clientX: "", clientY: "" } as const;
  const rect = iframe.getBoundingClientRect();
  const el = iframe as HTMLElement;
  const scaleX = el.offsetWidth ? rect.width / el.offsetWidth : 1;
  const scaleY = el.offsetHeight ? rect.height / el.offsetHeight : 1;
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
      (e: Event) => {
        const source = e as MouseEvent & KeyboardEvent;
        const evt = new CustomEvent(type, { bubbles: true }) as BridgedEvent;
        Object.assign(evt, {
          ebookWindow: win,
          key: source.key,
          code: source.code,
          ctrlKey: source.ctrlKey,
          ...toPage(iframe, source.clientX, source.clientY),
          iframeX: source.clientX,
          iframeY: source.clientY,
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
