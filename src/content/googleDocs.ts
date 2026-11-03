import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { injectScript } from "wxt/utils/inject-script";
import { waitUntilForever } from "@/utils/async";

const TEXT_EVENT_IFRAME = ".docs-texteventtarget-iframe";

let pointerStyle: HTMLStyleElement | undefined;

// sets window._docs_annotate_canvas_by_ext in the main world so Docs renders aria-labelled SVG rects
export function injectGoogleDocAnnotation() {
  injectScript("/googleDocInject.js", { keepInDom: true }).catch((error) => console.log(error));
}

const getTextEventEditable = () =>
  document
    .querySelector<HTMLIFrameElement>(TEXT_EVENT_IFRAME)
    ?.contentDocument?.querySelector<HTMLElement>("[contenteditable=true]") ?? null;

// key events typed into the document land in Docs' hidden iframe
export async function forwardGoogleDocKeys(
  ctx: ContentScriptContext,
  onKeydown: (e: KeyboardEvent) => void,
  onKeyup: (e: KeyboardEvent) => void,
) {
  const found = await waitUntilForever(
    () => ctx.isInvalid || document.querySelector<HTMLIFrameElement>(TEXT_EVENT_IFRAME),
  );
  const win = found instanceof HTMLIFrameElement ? found.contentWindow : null;
  if (!win || ctx.isInvalid) return;
  ctx.addEventListener(win, "keydown", onKeydown);
  ctx.addEventListener(win, "keyup", onKeyup);
}

function getRectAt(x: number, y: number): Element | null {
  if (!pointerStyle) {
    pointerStyle = document.createElement("style");
    pointerStyle.id = "enable-pointer-events-on-rect";
    pointerStyle.textContent = [
      ".kix-canvas-tile-content{pointer-events:none!important;}",
      "#kix-current-user-cursor-caret{pointer-events:none!important;}",
      ".kix-canvas-tile-content svg>g>rect{pointer-events:all!important; stroke-width:7px !important;}",
    ].join("\n");
    (document.head ?? document.documentElement).append(pointerStyle);
  }
  pointerStyle.disabled = false;
  const rect = document.elementFromPoint(x, y);
  pointerStyle.disabled = true;
  return rect;
}

function createTextOverlay(rect: Element, text: string) {
  const textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
  const transform = rect.getAttribute("transform") ?? "";
  textEl.setAttribute("x", rect.getAttribute("x") ?? "0");
  textEl.setAttribute("y", rect.getAttribute("y") ?? "0");
  const textNode = document.createTextNode(text);
  textEl.append(textNode);
  textEl.style.setProperty("all", "initial", "important");
  textEl.style.setProperty("transform", transform, "important");
  textEl.style.setProperty("font", rect.getAttribute("data-font-css") ?? "", "important");
  textEl.style.setProperty("text-anchor", "start", "important");
  rect.parentNode?.append(textEl);

  const rectBox = rect.getBoundingClientRect();
  const textBox = textEl.getBoundingClientRect();
  const yOffset = (rectBox.top - textBox.top + (rectBox.bottom - textBox.bottom)) * 0.5;
  textEl.style.setProperty("transform", `translate(0px,${yOffset}px) ${transform}`, "important");
  return { textEl, textNode };
}

const isPointInAnyRect = (x: number, y: number, rects: DOMRectList) =>
  Array.from(rects).some(
    (r) =>
      x >= Math.floor(r.left) &&
      x <= Math.floor(r.right) &&
      y >= Math.floor(r.top) &&
      y <= Math.floor(r.bottom),
  );

// a range over a temporary SVG <text> copy of the hovered rect's aria-label; call cleanup when done
export function getGoogleDocRange(
  x: number,
  y: number,
): { range: Range | null; cleanup: () => void } {
  const rect = getRectAt(x, y);
  const text = rect?.getAttribute("aria-label");
  if (!rect || rect.tagName !== "rect" || !text) return { range: null, cleanup: () => {} };

  const { textEl, textNode } = createTextOverlay(rect, text);
  const range = document.createRange();
  let start = 0;
  let end = text.length;
  while (end - start > 1) {
    const mid = Math.floor((start + end) / 2);
    range.setStart(textNode, mid);
    range.setEnd(textNode, end);
    const rects = range.getClientRects();
    if (isPointInAnyRect(x, y, rects)) {
      start = mid;
    } else if (x > (rects[0]?.right ?? Number.POSITIVE_INFINITY)) {
      start = end;
    } else {
      end = mid;
    }
  }
  return { range, cleanup: () => textEl.remove() };
}

// a synthetic copy makes Docs render the selection into its text event iframe
export function getGoogleDocSelection(): string {
  const editable = getTextEventEditable();
  if (!editable) return "";
  editable.dispatchEvent(new CustomEvent("copy"));
  return Array.from(
    editable.ownerDocument.querySelectorAll("span"),
    (span) => span.textContent ?? "",
  )
    .join(" ")
    .trim();
}

// https://github.com/matthewsot/docs-plus
export function pasteGoogleDoc(text: string) {
  const editable = getTextEventEditable();
  if (editable) dispatchPaste(editable, text);
}

export function dispatchPaste(target: Element, text: string) {
  const clipboardData = new DataTransfer();
  clipboardData.setData("text/plain", text);
  const paste = new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true });
  Object.assign(paste, { docs_plus_: true });
  target.dispatchEvent(paste);
  clipboardData.clearData();
}
