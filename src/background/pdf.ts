import { browser } from "wxt/browser";
import { currentSettings, peekSettings } from "./settings";

export const pdfViewerUrl = (url: string) =>
  `${browser.runtime.getURL("/pdfjs/web/viewer.html")}?file=${encodeURIComponent(url)}`;

const isLocalPdf = (url = "") => /^file:\/\/.*\.pdf$/i.test(url);

export function registerPdfRedirects() {
  // local pdfs opened from disk / dropped into a tab
  browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status !== "loading" || !isLocalPdf(changeInfo.url)) return;
    if (!(await currentSettings()).detectPDF) return;
    await browser.tabs.update(tabId, { url: pdfViewerUrl(changeInfo.url!) });
  });

  // Firefox's built-in pdf.js is a privileged page we can't inject into
  // (bugzilla 1454760), so swap web pdfs to our viewer before it loads.
  // Chrome keeps the content-script takeover instead.
  if (import.meta.env.FIREFOX && browser.webRequest?.onBeforeRequest) {
    browser.webRequest.onBeforeRequest.addListener(
      (details) => {
        const detectPDF = peekSettings()?.detectPDF ?? true;
        if (!detectPDF || details.url.includes("/pdfjs/web/viewer.html")) return {};
        return { redirectUrl: pdfViewerUrl(details.url) };
      },
      { urls: ["*://*/*.pdf", "*://*/*.pdf?*"], types: ["main_frame"] },
      ["blocking"],
    );
  }
}
