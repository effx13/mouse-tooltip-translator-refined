import type { Page } from "@playwright/test";
import { extensionUrl } from "../support/extension.ts";

export async function openPopup(page: Page, extensionId: string) {
  await page.goto(extensionUrl(extensionId, "popup.html"));
  await page.getByRole("tab", { name: "MAIN" }).waitFor();
  return {
    tab: (name: string) => page.getByRole("tab", { name }),
    toggle: (label: string) => page.getByRole("switch", { name: label }),
  };
}
