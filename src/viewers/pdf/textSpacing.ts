const ITEMS = "br, :scope > span:not(.markedContent), .markedContent > span:not(.markedContent)";

function separator(prev: HTMLElement, next: HTMLElement) {
  const a = prev.getBoundingClientRect();
  const b = next.getBoundingClientRect();
  if (Math.abs(b.top - a.top) > Math.max(a.height, 1) * 1.3) return "\n";
  return /\s$/.test(prev.textContent ?? "") ? "" : " ";
}

function lineBreak(text: string, prev: HTMLElement) {
  const span = document.createElement("span");
  span.className = "mttEol";
  span.setAttribute("role", "presentation");
  span.textContent = text;
  // a 1px font keeps it in selection.toString() while it stays too small to catch the mouse
  span.style.cssText = `left:${prev.style.left};top:${prev.style.top};font-size:1px`;
  return span;
}

// pdf.js ends lines with <br>, so a selection over several lines reads as separate lines;
// swap them for a space, or "\n" across a paragraph gap, so sentences stay whole
export function fixTextLayerSpacing(layer: HTMLElement) {
  if (layer.dataset.mttSpacing) return;
  layer.dataset.mttSpacing = "1";

  const breaks: { brs: HTMLElement[]; prev?: HTMLElement; next: HTMLElement }[] = [];
  let pending: HTMLElement[] = [];
  let prev: HTMLElement | undefined;
  for (const node of layer.querySelectorAll<HTMLElement>(ITEMS)) {
    if (node.tagName === "BR") {
      pending.push(node);
      continue;
    }
    if (pending.length > 0) breaks.push({ brs: pending, prev, next: node });
    pending = [];
    prev = node;
  }

  // measure everything before touching the DOM to avoid a relayout per line
  const texts = breaks.map(({ prev: last, next }) => (last ? separator(last, next) : ""));
  breaks.forEach(({ brs, prev: last }, i) => {
    const text = texts[i];
    if (last && text) brs[0]?.before(lineBreak(text, last));
    for (const br of brs) br.remove();
  });
  for (const br of pending) br.remove();
}
