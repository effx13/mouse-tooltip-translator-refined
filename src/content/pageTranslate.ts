import { sleep } from "@/utils/async";
import type { TranslateResult } from "@/utils/messaging";
import { requestTranslate } from "./translate";

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "CODE",
  "PRE",
]);
const MAX_TEXT_NODES = 6000;
// utf-8 bytes, not chars: bing fails from ~1200 chars and CJK is 3 bytes per char
const MAX_BATCH_BYTES = 700;
const MAX_REQUESTS = 2000;
const MAX_DURATION_MS = 120_000;
const BATCH_PAUSE_MS = 80;
const NODE_REQUEST_WINDOW = 4;
const MAX_CONSECUTIVE_FAILURES = 3;

const encoder = new TextEncoder();
const byteLength = (text: string) => encoder.encode(text).length;

function collectTextNodes(): Text[] {
  if (!document.body) return [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (
        !node.nodeValue?.trim() ||
        !parent ||
        SKIP_TAGS.has(parent.tagName) ||
        parent.isContentEditable
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  while (walker.nextNode() && nodes.length < MAX_TEXT_NODES) nodes.push(walker.currentNode as Text);
  return nodes;
}

// cut on word boundaries; each piece keeps the separator that was cut away
function splitLongText(text: string, maxBytes: number) {
  const pieces: { text: string; separator: string }[] = [];
  let rest = text;
  while (byteLength(rest) > maxBytes) {
    let end = Math.min(rest.length, maxBytes);
    while (end > 1 && byteLength(rest.slice(0, end)) > maxBytes) end = Math.floor(end * 0.8);
    // never split a surrogate pair
    if (end > 1 && /[\uD800-\uDBFF]/.test(rest[end - 1] ?? "")) end -= 1;
    const spaceAt = rest.lastIndexOf(" ", end);
    const atSpace = spaceAt > 0;
    const cut = atSpace ? spaceAt : end;
    pieces.push({ text: rest.slice(0, cut), separator: atSpace ? " " : "" });
    rest = rest.slice(atSpace ? cut + 1 : cut);
  }
  if (rest) pieces.push({ text: rest, separator: "" });
  return pieces;
}

// full-page in-place translation, toggled by keyDownTranslatePage
export function createPageTranslator() {
  let originals: { node: Text; text: string }[] = [];
  let isTranslated = false;
  let busy = false;
  let cancelled = false;
  let aborted = false;
  let requestCount = 0;
  let consecutiveFailures = 0;
  let startedAt = 0;
  // bing answers a newline-joined batch as one line; stop batching after that
  let batchingUseless = false;

  const canRequest = () =>
    !aborted &&
    !cancelled &&
    requestCount < MAX_REQUESTS &&
    Date.now() - startedAt < MAX_DURATION_MS;

  const abortRun = (reason: string) => {
    if (aborted) return;
    aborted = true;
    console.log(`Mouse Tooltip Translator Refined: page translate stopped - ${reason}`);
  };

  const noteOutcome = (ok: boolean) => {
    if (ok) {
      consecutiveFailures = 0;
      return;
    }
    consecutiveFailures++;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES)
      abortRun("the translator engine kept failing");
  };

  // parallel window results settle in latency order, so they report one outcome per window instead
  async function requestOnce(
    text: string,
    targetLang: string,
    trackConsecutive = true,
  ): Promise<TranslateResult | null> {
    if (!canRequest()) return null;
    const res = await requestTranslate({
      text,
      sourceLang: "auto",
      targetLang,
      reverseLang: "null",
    });
    const ok = Boolean(res && !res.isBroken && res.targetText);
    requestCount++;
    if (trackConsecutive) noteOutcome(ok);
    return ok ? res : null;
  }

  function replaceText(node: Text, translated: string | undefined) {
    if (!node.isConnected || translated == null) return;
    originals.push({ node, text: node.nodeValue ?? "" });
    node.nodeValue = translated;
  }

  async function translateLongNode(node: Text, targetLang: string) {
    let out = "";
    for (const piece of splitLongText(node.nodeValue ?? "", MAX_BATCH_BYTES)) {
      const res = await requestOnce(piece.text, targetLang);
      // leave the node untouched rather than half translated
      if (!res) return;
      out += res.targetText + piece.separator;
    }
    replaceText(node, out);
  }

  async function runWindowed(nodes: Text[], targetLang: string) {
    for (let i = 0; i < nodes.length; i += NODE_REQUEST_WINDOW) {
      if (!canRequest()) return;
      const results = await Promise.all(
        nodes.slice(i, i + NODE_REQUEST_WINDOW).map(async (node) => {
          const res = await requestOnce(node.nodeValue ?? "", targetLang, false);
          if (res) replaceText(node, res.targetText);
          return Boolean(res);
        }),
      );
      if (results.length) noteOutcome(results.some(Boolean));
      await sleep(BATCH_PAUSE_MS);
    }
  }

  async function translateBatch(group: Text[], targetLang: string) {
    if (!batchingUseless || group.length === 1) {
      const joined = group.map((n) => (n.nodeValue ?? "").replaceAll("\n", " ")).join("\n");
      const res = await requestOnce(joined, targetLang);
      const parts = res?.targetText.split("\n");
      if (parts?.length === group.length) {
        group.forEach((node, i) => replaceText(node, parts[i]));
        return;
      }
      // only the exact "everything on one line" signature means the engine drops newlines
      if (parts?.length === 1 && group.length > 1) batchingUseless = true;
    }
    await runWindowed(group, targetLang);
  }

  async function translatePage(targetLang: string) {
    const nodes = collectTextNodes();
    isTranslated = true;
    originals = [];
    requestCount = 0;
    consecutiveFailures = 0;
    aborted = false;
    cancelled = false;
    batchingUseless = false;
    startedAt = Date.now();

    let batch: Text[] = [];
    let size = 0;
    let stoppedEarly = false;
    for (const node of nodes) {
      if (!canRequest()) {
        stoppedEarly = true;
        break;
      }
      const nodeSize = byteLength(node.nodeValue ?? "");
      if (size + nodeSize > MAX_BATCH_BYTES && batch.length) {
        await translateBatch(batch, targetLang);
        await sleep(BATCH_PAUSE_MS);
        batch = [];
        size = 0;
      }
      if (nodeSize > MAX_BATCH_BYTES) {
        await translateLongNode(node, targetLang);
        await sleep(BATCH_PAUSE_MS);
        continue;
      }
      batch.push(node);
      size += nodeSize;
    }
    if (batch.length) {
      if (canRequest()) await translateBatch(batch, targetLang);
      else stoppedEarly = true;
    }
    if (stoppedEarly && !aborted && !cancelled) {
      console.log(
        "Mouse Tooltip Translator Refined: page translate stopped early (request or time budget); the rest of the page was left untranslated",
      );
    }
  }

  function revertPage() {
    for (const { node, text } of originals) {
      if (node.isConnected) node.nodeValue = text;
    }
    originals = [];
    isTranslated = false;
  }

  return async function togglePageTranslate(targetLang: string) {
    // a press while running cancels the run
    if (busy) {
      cancelled = true;
      return;
    }
    busy = true;
    try {
      if (isTranslated) revertPage();
      else await translatePage(targetLang);
    } catch (error) {
      console.log(error);
    } finally {
      busy = false;
    }
  };
}
