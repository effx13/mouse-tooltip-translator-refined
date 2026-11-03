import { browser } from "wxt/browser";
import { sleep } from "@/utils/async";
import { t } from "@/utils/i18n";
import { getSettings } from "@/utils/settings";

interface PdfViewerApplication {
  initializedPromise: Promise<void>;
  eventBus: { on(name: string, cb: () => void): void };
}

declare global {
  interface Window {
    PDFViewerApplication?: PdfViewerApplication;
    PDFViewerApplicationOptions?: { set(name: string, value: unknown): void };
  }
}

// extension locale -> PDF.js locale where they differ (am/sw/ml have none -> English)
const PDF_LOCALE: Record<string, string> = { fil: "tl", no: "nb-NO" };

const fileParam = () => new URLSearchParams(location.search).get("file") ?? "";

function onViewerEvent(name: string, cb: () => void) {
  document.addEventListener("webviewerloaded", () => {
    void window.PDFViewerApplication?.initializedPromise.then(() =>
      window.PDFViewerApplication?.eventBus.on(name, cb),
    );
  });
}

// localize the viewer toolbar to the chosen UI language
async function setViewerLocale() {
  let lang: string | undefined;
  const apply = () => {
    if (!lang || lang === "auto") return;
    window.PDFViewerApplicationOptions?.set("localeProperties", {
      lang: PDF_LOCALE[lang] ?? lang.replaceAll("_", "-"),
    });
  };
  document.addEventListener("webviewerloaded", apply);
  lang = (await getSettings()).uiLanguage;
  apply();
}

async function checkLocalFileAccess() {
  const url = fileParam();
  if (!url.toLowerCase().startsWith("file://")) return;
  if (!/\.pdf$/i.test(url)) {
    location.replace("/pdfjs/web/viewer.html?file=");
    return;
  }
  if (await browser.extension.isAllowedFileSchemeAccess()) return;
  alert(t("Allow_access_to_file_URLs_to_open_local_PDF_files"));
  await browser.tabs.create({ url: `chrome://extensions/?id=${browser.runtime.id}` });
}

// the page that embedded us falls back to loading the pdf as a blob
function reportLoadError() {
  onViewerEvent("documenterror", () => {
    const message = { type: "pdfErrorLoadDocument" };
    window.postMessage(message, "*");
    if (window.parent !== window) window.parent.postMessage(message, "*");
  });
}

// one-click copy of the original web pdf url
function addCopyUrlButton() {
  const url = fileParam();
  if (!/^https?:\/\//i.test(url)) return;
  const container = document.getElementById("secondaryToolbarButtonContainer");
  if (!container || document.getElementById("mttCopyPdfUrl")) return;

  const label = t("Copy_PDF_URL");
  const button = document.createElement("button");
  button.id = "mttCopyPdfUrl";
  button.className = "toolbarButton labeled";
  button.type = "button";
  button.title = label;
  const span = document.createElement("span");
  span.textContent = label;
  button.append(span);
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      span.textContent = t("Copied");
    } catch {
      span.textContent = t("Copy_failed");
    }
    setTimeout(() => (span.textContent = label), 1200);
  });
  container.prepend(button);
}

const isTyping = () => {
  const el = document.activeElement;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el as HTMLElement | null)?.isContentEditable
  );
};

// T = free text annotation, D = ink
function addEditorShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (isTyping() || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.code === "KeyT") document.getElementById("editorFreeText")?.click();
    if (e.code === "KeyD") document.getElementById("editorInk")?.click();
  });
}

let spacingFixed = false;

// pdf.js splits lines into <br>-separated spans; turn the gaps into "\n"/" "
// so sentence detection sees real line breaks
function fixTextSpacing() {
  if (spacingFixed) return;
  const breaks = document.querySelectorAll(".page br");
  if (breaks.length === 0) return;
  spacingFixed = true;
  breaks.forEach((br) => br.remove());

  let prev: { el: Element; y: number } | undefined;
  for (const line of document.querySelectorAll<HTMLElement>(".page span:not(:has(*))")) {
    if (!line.textContent?.trim()) continue;
    const y = line.getBoundingClientRect().top;
    const fontSize = parseFloat(getComputedStyle(line).fontSize);
    if (prev && !/[\n ]$/.test(prev.el.textContent ?? "")) {
      const gap = Math.abs(prev.y - y);
      if (gap > fontSize * 1.3) prev.el.textContent += "\n";
      else if (gap > fontSize) prev.el.textContent += " ";
    }
    prev = { el: line, y };
  }
}

export async function enhancePdfViewer() {
  reportLoadError();
  void setViewerLocale();
  onViewerEvent("documentloaded", () =>
    window.PDFViewerApplication?.eventBus.on("textlayerrendered", fixTextSpacing),
  );
  if (document.readyState === "loading") {
    await new Promise((resolve) =>
      document.addEventListener("DOMContentLoaded", resolve, { once: true }),
    );
  }
  void checkLocalFileAccess();
  addEditorShortcuts();
  addCopyUrlButton();
  // the text layer event can fire before we hook it, so retry for a while
  for (const wait of [1000, 4000, 5000, 5000, 5000, 10000, 30000]) {
    await sleep(wait);
    fixTextSpacing();
  }
}
