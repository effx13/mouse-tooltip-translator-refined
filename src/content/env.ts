export const writingField =
  'input[type="text"], input[type="search"], input:not([type]), textarea, [contenteditable], [contenteditable="true"], [role=textbox], [spellcheck]';

export const isPdfViewer = () => location.pathname.includes("/pdfjs/web/viewer.html");

export const isEbookReader = () => location.pathname.includes("/foliate-js/reader.html");

export const isBookFusion = () => location.hostname === "reader.bookfusion.com";

export const isGoogleDoc = () =>
  location.href.startsWith("https://docs.google.com/document") ||
  location.href.startsWith("https://docs.google.com/presentation");

// Chromium has Range.expand(); Firefox needs the Intl.Segmenter path
export const hasRangeExpand = () => "expand" in Range.prototype;

// Chrome used to show a web PDF as <embed type="application/pdf">; newer Chrome leaves body empty
export const isPdfDocument = () =>
  document.contentType === "application/pdf" ||
  (document.body?.children[0] as HTMLEmbedElement | undefined)?.type === "application/pdf";

export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

// frames are filtered by the page that embeds them
export const getCurrentUrl = () => (isInIframe() ? document.referrer : location.href);

export function getActiveElement(root: Document | ShadowRoot = document): Element | null {
  const active = root.activeElement;
  if (active?.shadowRoot) return getActiveElement(active.shadowRoot);
  return active;
}

export function getFocusedWritingBox(): Element | null {
  const active = getActiveElement();
  return active?.matches(writingField) ? active : null;
}

export function getAllShadows(root: ParentNode | null = document.body): ShadowRoot[] {
  if (!root) return [];
  const shadows: ShadowRoot[] = [];
  for (const el of root.querySelectorAll("*")) {
    if (el.shadowRoot) shadows.push(el.shadowRoot, ...getAllShadows(el.shadowRoot));
  }
  return shadows;
}

// foliate renders the book inside an iframe in its second shadow root
export function getEbookIframe(): HTMLIFrameElement | null {
  return (
    getAllShadows()[1]?.querySelector("iframe") ??
    document.querySelector<HTMLIFrameElement>('iframe[id^="bf-epub-view-"]')
  );
}

export const isCharKey = (code: string) => /Key|Digit|Numpad|Space/.test(code);

export const onDomReady = () =>
  new Promise<void>((resolve) => {
    if (document.readyState !== "loading") resolve();
    else document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
