import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { watchSelection } from "@/content";

type EbookEvent = CustomEvent & {
  ebookWindow?: Window;
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  clientX?: number | "";
  clientY?: number | "";
  iframeX?: number;
  iframeY?: number;
};

// foliate renders the book in an iframe inside its shadow DOM; BookFusion uses bf-epub-view-*
function findBookIframe(): HTMLIFrameElement | null {
  const roots = [...document.querySelectorAll("*")].flatMap((el) =>
    el.shadowRoot ? [el.shadowRoot] : [],
  );
  return (
    roots[1]?.querySelector("iframe") ??
    document.querySelector<HTMLIFrameElement>('iframe[id^="bf-epub-view-"]')
  );
}

// re-dispatch the book iframe's input on our window so the tooltip sees it,
// with coordinates shifted into this page
function bridge(iframe: HTMLIFrameElement, ctx: ContentScriptContext) {
  const win = iframe.contentWindow;
  if (!win) return;
  watchSelection(win, ctx);
  for (const type of ["mousemove", "keydown", "keyup"] as const) {
    win.addEventListener(type, (e: Event) => {
      const source = e as MouseEvent & KeyboardEvent;
      const rect = iframe.getBoundingClientRect();
      const evt = new CustomEvent(type, { bubbles: true }) as EbookEvent;
      Object.assign(evt, {
        ebookWindow: win,
        key: source.key,
        code: source.code,
        ctrlKey: source.ctrlKey,
        clientX: source.clientX ? source.clientX + rect.left : "",
        clientY: source.clientY ? source.clientY + rect.top : "",
        iframeX: source.clientX,
        iframeY: source.clientY,
      });
      window.dispatchEvent(evt);
      document.dispatchEvent(evt);
    });
  }
}

export function bridgeEbookFrames(ctx: ContentScriptContext) {
  let src = "";
  ctx.setInterval(() => {
    const iframe = findBookIframe();
    if (!iframe || iframe.src === src) return;
    src = iframe.src;
    bridge(iframe, ctx);
    // focus so key events reach us
    iframe.contentWindow?.focus();
  }, 1000);
}
