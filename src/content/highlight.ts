const HIGHLIGHT_NAME = "mtt-mouseover-text";
const STYLE_ATTR = "data-mtt-highlight";

// document -> color its ::highlight rule currently uses
const styledDocs = new Map<Document, string>();
let highlightedDoc: Document | null = null;

const registryOf = (doc: Document | null) => doc?.defaultView?.CSS?.highlights;

function ensureStyle(doc: Document, color: string) {
  let style = doc.querySelector<HTMLStyleElement>(`style[${STYLE_ATTR}]`);
  if (!style) {
    style = doc.createElement("style");
    style.setAttribute(STYLE_ATTR, "");
    (doc.head ?? doc.documentElement).append(style);
  }
  style.textContent = `::highlight(${HIGHLIGHT_NAME}) { background-color: ${color}; }`;
  styledDocs.set(doc, color);
}

// CSS Custom Highlight API: paints the range without wrapping page text; the range's own document
// (an ebook iframe, for instance) owns the registry and the ::highlight rule
export function showHighlight(range: Range, color: string) {
  clearHighlight();
  const doc = range.startContainer.ownerDocument;
  const win = doc?.defaultView;
  const registry = registryOf(doc);
  if (!doc || !win?.Highlight || !registry) return;
  if (styledDocs.get(doc) !== color) ensureStyle(doc, color);
  registry.set(HIGHLIGHT_NAME, new win.Highlight(range));
  highlightedDoc = doc;
}

export function clearHighlight() {
  registryOf(highlightedDoc)?.delete(HIGHLIGHT_NAME);
  highlightedDoc = null;
}

export function removeHighlightStyles() {
  clearHighlight();
  for (const doc of styledDocs.keys()) doc.querySelector(`style[${STYLE_ATTR}]`)?.remove();
  styledDocs.clear();
}
