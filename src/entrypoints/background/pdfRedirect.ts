import { browser } from "wxt/browser";
import { pdfViewerUrl } from "@/utils/pdfViewer";
import { currentSettings, peekSettings } from "./settings";

const isLocalPdf = (url: string) => /^file:\/\/.*\.pdf$/i.test(url);

export function registerPdfRedirects() {
  // local pdfs opened from disk / dropped into a tab
  browser.tabs.onUpdated.addListener(async (tabId, { status, url }) => {
    if (status !== "loading" || !url || !isLocalPdf(url)) return;
    if (!(await currentSettings()).detectPDF) return;
    await browser.tabs.update(tabId, { url: pdfViewerUrl(url) });
  });

  // Firefox's built-in pdf.js is a privileged page we can't inject into
  // (bugzilla 1454760), so swap web pdfs to our viewer before it loads.
  // Chrome keeps the content-script takeover instead.
  if (import.meta.env.FIREFOX && browser.webRequest?.onBeforeRequest) {
    browser.webRequest.onBeforeRequest.addListener(
      (details) => {
        const detectPDF = peekSettings()?.detectPDF ?? true;
        if (!detectPDF || details.url.startsWith(browser.runtime.getURL("/"))) return {};
        return { redirectUrl: pdfViewerUrl(details.url) };
      },
      { urls: ["*://*/*.pdf", "*://*/*.pdf?*"], types: ["main_frame"] },
      ["blocking"],
    );
  }
}
