import type { Page } from "@playwright/test";
import { extensionUrl } from "../support/extension.ts";

export async function openPdfViewer(page: Page, extensionId: string, file?: string) {
  const query = file ? `?file=${encodeURIComponent(file)}` : "";
  await page.goto(extensionUrl(extensionId, `pdf.html${query}`));
  return { textLayer: page.locator(".page .textLayer") };
}

export async function openReader(page: Page, extensionId: string, url?: string) {
  const query = url ? `?url=${encodeURIComponent(url)}` : "";
  await page.goto(extensionUrl(extensionId, `reader.html${query}`));
  return { tocButton: page.getByRole("button", { name: "Table of Contents" }) };
}
