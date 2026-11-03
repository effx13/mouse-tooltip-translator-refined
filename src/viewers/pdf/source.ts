import { browser } from "wxt/browser";
import { t } from "@/utils/i18n";

export const fileParam = () => new URLSearchParams(location.search).get("file") ?? "";

export const isWebUrl = (url: string) => /^https?:\/\//i.test(url);

export const isPdfFile = (file: File) =>
  file.type === "application/pdf" || /\.pdf$/i.test(file.name);

// false when the viewer must not try to load the url
export async function checkLocalFileAccess(url: string): Promise<boolean> {
  if (!/^file:/i.test(url)) return true;
  if (!/\.pdf$/i.test(URL.parse(url)?.pathname ?? "")) {
    location.replace(browser.runtime.getURL("/pdf.html"));
    return false;
  }
  if (await browser.extension.isAllowedFileSchemeAccess()) return true;
  alert(t("Allow_access_to_file_URLs_to_open_local_PDF_files"));
  try {
    await browser.tabs.create({ url: `chrome://extensions/?id=${browser.runtime.id}` });
  } catch (error) {
    // Firefox has no chrome:// pages
    console.log(error);
  }
  return false;
}

// the page embedding the viewer (src/content/pdf.ts) retries with a blob url
export function reportLoadError() {
  const message = { type: "pdfErrorLoadDocument" };
  window.postMessage(message, "*");
  if (window.parent !== window) window.parent.postMessage(message, "*");
}
