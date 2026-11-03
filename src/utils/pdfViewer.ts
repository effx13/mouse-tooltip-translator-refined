import { browser } from "wxt/browser";

export const pdfViewerUrl = (file: string) =>
  `${browser.runtime.getURL("/pdf.html")}?file=${encodeURIComponent(file)}`;
