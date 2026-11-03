import { filterWord } from "@/utils/text";
import { getAllShadows, hasRangeExpand, isPdfViewer } from "../env";

export type DetectType = "word" | "sentence" | "container";

interface ExpandableRange extends Range {
  expand(unit: "word" | "sentence"): void;
}

const EXCLUDED_PARENTS = new Set(["STYLE", "SCRIPT", "TITLE"]);

let prevSegIndex = 0;

export function isPointInRect(rect: DOMRect, x: number, y: number) {
  return rect.left <= x && x <= rect.right && rect.top <= y && y <= rect.bottom;
}

export function isPointInElement(target: Range | Element | null | undefined, x: number, y: number) {
  if (!target) return false;
  try {
    return isPointInRect(target.getBoundingClientRect(), x, y);
  } catch {
    return false;
  }
}

const isPointInRange = (range: Range, x: number, y: number) =>
  Array.from(range.getClientRects()).some((rect) => isPointInRect(rect, x, y));

export function caretRangeFromPoint(x: number, y: number, doc: Document): Range | null {
  let range: Range | null = null;
  // Chromium has caretRangeFromPoint, Firefox only caretPositionFromPoint
  if (typeof doc.caretRangeFromPoint === "function") {
    range = doc.caretRangeFromPoint(x, y);
  } else {
    const pos = doc.caretPositionFromPoint?.(x, y);
    if (!pos?.offsetNode) return null;
    range = doc.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.setEnd(pos.offsetNode, pos.offset);
  }
  return range?.startContainer.nodeType === Node.TEXT_NODE ? range : null;
}

function textNodesUnder(root: Node): Text[] {
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      EXCLUDED_PARENTS.has(node.parentElement?.nodeName ?? "")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}

function nodeRange(node: Text, start: number, end: number) {
  const range = (node.ownerDocument ?? document).createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  return range;
}

function rangeFromTextNodes(x: number, y: number, nodes: Text[]): Range | null {
  for (const node of nodes) {
    if (!node.data.trim() || !isPointInElement(nodeRange(node, 0, node.length), x, y)) continue;
    // legacy skipped the last character of each node; keep the exact char scan inclusive
    for (let i = 0; i < node.length; i++) {
      const range = nodeRange(node, i, i + 1);
      if (isPointInElement(range, x, y)) return range;
    }
  }
  return null;
}

// big elements (>1000px) are skipped so the scan stays cheap
function caretRangeFromPointedElement(x: number, y: number, doc: Document) {
  const outermost = doc
    .elementsFromPoint(x, y)
    .filter(
      (el) => (el as HTMLElement).offsetHeight < 1000 && (el as HTMLElement).offsetWidth < 1000,
    )
    .at(-1);
  return outermost ? rangeFromTextNodes(x, y, textNodesUnder(outermost)) : null;
}

function caretRangeFromShadowDom(x: number, y: number, doc: Document) {
  const nodes = getAllShadows(doc.body)
    .filter((shadow) => isPointInElement(shadow.host, x, y))
    .flatMap((shadow) => textNodesUnder(shadow));
  return rangeFromTextNodes(x, y, nodes);
}

export function getPointedRange(x: number, y: number, doc: Document): Range | null {
  return (
    caretRangeFromPoint(x, y, doc) ??
    caretRangeFromPointedElement(x, y, doc) ??
    caretRangeFromShadowDom(x, y, doc)
  );
}

export const shouldUseSegmentation = () => !hasRangeExpand() || isPdfViewer();

export function expandRange(
  range: Range | null,
  type: DetectType,
  useSegmentation = false,
): Range | null {
  try {
    // detached nodes make expand()/setEndAfter() throw
    if (!range?.startContainer.isConnected) return null;
    if (type === "container") return getContainerRange(range);
    if (useSegmentation || shouldUseSegmentation()) return expandRangeWithSegmenter(range, type);
    const expanded = range.cloneRange() as ExpandableRange;
    expanded.expand(type);
    return expanded;
  } catch (error) {
    console.log(error);
    return null;
  }
}

function isInline(el: Element) {
  try {
    const { display } = getComputedStyle(el);
    return display.startsWith("inline") || display === "ruby" || display === "contents";
  } catch {
    return false;
  }
}

// climb inline wrappers to the nearest block, for sites that put every line in its own span
function getBlockAncestor(node: Node): Element | null {
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  const doc = node.ownerDocument;
  while (
    el?.parentElement &&
    el.parentElement !== doc?.body &&
    el.parentElement !== doc?.documentElement &&
    isInline(el)
  ) {
    el = el.parentElement;
  }
  return el;
}

function getContainerRange(original: Range) {
  const range = original.cloneRange();
  const block = getBlockAncestor(range.startContainer);
  if (block) {
    range.selectNodeContents(block);
    return range;
  }
  range.setStartBefore(range.startContainer);
  range.setEndAfter(range.startContainer);
  range.setStart(range.startContainer, 0);
  return range;
}

function getRangeCenter(range: Range) {
  const rect = range.getClientRects()[0];
  return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 };
}

function getPointedChar(range: Range, x: number, y: number): string | null {
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent ?? "";
  const probe = range.cloneRange();
  for (let i = 0; i < text.length; i++) {
    probe.setStart(node, i);
    probe.setEnd(node, i + 1);
    if (isPointInRange(probe, x, y)) return text[i] ?? null;
  }
  return null;
}

function createNodeIndex(root: Node) {
  const lengths = new WeakMap<Node, number>();
  const lengthOf = (node: Node): number => {
    const cached = lengths.get(node);
    if (cached !== undefined) return cached;
    const length =
      node.nodeType === Node.TEXT_NODE
        ? (node.textContent?.length ?? 0)
        : Array.from(node.childNodes).reduce((sum, child) => sum + lengthOf(child), 0);
    lengths.set(node, length);
    return length;
  };
  const locate = (node: Node, offset: number): { node: Node; offset: number } => {
    if (node.nodeType === Node.TEXT_NODE) return { node, offset };
    let prev = 0;
    for (const child of node.childNodes) {
      const len = lengthOf(child);
      if (prev <= offset && offset <= prev + len) return locate(child, offset - prev);
      prev += len;
    }
    return { node, offset };
  };
  return (offset: number) => locate(root, offset);
}

const nodeText = (node: Node): string =>
  node.nodeType === Node.TEXT_NODE
    ? (node.textContent ?? "")
    : Array.from(node.childNodes).reduce((text, child) => text + nodeText(child), "");

// Intl.Segmenter path for Firefox and the PDF viewer; locale stays en-US like legacy
function expandRangeWithSegmenter(original: Range, type: "word" | "sentence"): Range | null {
  const { x, y } = getRangeCenter(original);
  const root = getContainerRange(original).commonAncestorContainer;
  const char = getPointedChar(original, x, y);
  if (!char) return null;
  const segments = [...new Intl.Segmenter("en-US", { granularity: type }).segment(nodeText(root))]
    .map((seg, itemIndex) => ({ ...seg, itemIndex }))
    .filter((seg) => seg.segment.includes(char))
    .toSorted(
      (a, b) => Math.abs(a.itemIndex - prevSegIndex) - Math.abs(b.itemIndex - prevSegIndex),
    );
  const locate = createNodeIndex(root);
  const doc = root.ownerDocument ?? document;
  for (const seg of segments) {
    try {
      const start = locate(seg.index);
      const end = locate(seg.index + seg.segment.length);
      const range = doc.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      if (isPointInRange(range, x, y)) {
        prevSegIndex = seg.itemIndex;
        return range;
      }
    } catch (error) {
      console.log(error);
    }
  }
  return null;
}

// drop furigana (ruby>rt) so readings are not translated twice
export function extractTextFromFragment(fragment: ParentNode & Node): string {
  for (const rt of fragment.querySelectorAll("ruby>rt")) rt.remove();
  return filterWord(fragment.textContent);
}

export const extractTextFromRange = (range: Range) =>
  extractTextFromFragment(range.cloneContents());
