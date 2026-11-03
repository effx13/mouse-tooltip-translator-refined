import type { Page } from "@playwright/test";
import { fakeTranslate, PULL_QUOTE } from "./support/content.ts";
import { expect, test } from "./fixtures.ts";

const FIRST_SENTENCE = "Across Europe, overnight trains are making a quiet comeback.";

const tooltip = (page: Page) => page.locator("#mttContainer .mtt-root");

test.beforeEach(async ({ page, server, useOfflineSettings }) => {
  await useOfflineSettings();
  await page.goto(`${server.origin}/article.html`);
  await page.bringToFront();
});

test("hovering a sentence shows its translation in the tooltip", async ({ page, server }) => {
  const paragraph = page.locator("article p").first();
  const box = await paragraph.boundingBox();
  if (!box) throw new Error("paragraph is not rendered");
  await page.mouse.move(box.x + 40, box.y + 12, { steps: 5 });
  await page.mouse.move(box.x + 90, box.y + 14, { steps: 5 });

  await expect(tooltip(page)).toHaveAttribute("data-state", "visible");
  await expect(tooltip(page)).toHaveText(fakeTranslate(FIRST_SENTENCE));
  expect(server.translated).toContain(FIRST_SENTENCE);

  // a left click dismisses it until the mouse moves again
  await page.mouse.down();
  await page.mouse.up();
  await expect(tooltip(page)).toHaveAttribute("data-state", "hidden");
});

test("selecting text shows the translation of the selection", async ({ page, server }) => {
  const quote = page.locator("#quote");
  await quote.click({ clickCount: 3 });

  await expect(tooltip(page)).toHaveAttribute("data-state", "visible");
  await expect(tooltip(page)).toHaveText(fakeTranslate(PULL_QUOTE));
  expect(server.translated).toContain(PULL_QUOTE);

  // it sits next to the cursor on the quote, not at a stale spot from before the click
  const quoteBox = await quote.boundingBox();
  const tipBox = await tooltip(page).locator(".mtt-box").boundingBox();
  if (!quoteBox || !tipBox) throw new Error("quote or tooltip is not rendered");
  expect(Math.abs(tipBox.y + tipBox.height - quoteBox.y - quoteBox.height / 2)).toBeLessThan(80);
});

test("the writing key replaces the typed text with its translation", async ({ page }) => {
  const box = page.locator("#writing");
  await box.click();
  await box.pressSequentially(FIRST_SENTENCE);
  await page.keyboard.press("AltRight");
  await expect(box).toHaveValue(fakeTranslate(FIRST_SENTENCE));
});

test("an excluded site gets no tooltip", async ({ page, server, useOfflineSettings }) => {
  await useOfflineSettings({ websiteExcludeList: ["127.0.0.1"] });
  await page.reload();
  const box = await page.locator("article p").first().boundingBox();
  if (!box) throw new Error("paragraph is not rendered");
  await page.mouse.move(box.x + 40, box.y + 12, { steps: 5 });
  await page.mouse.move(box.x + 90, box.y + 14, { steps: 5 });
  await page.locator("#quote").click({ clickCount: 3 });
  // give a translation round-trip time to (not) happen
  await page.waitForTimeout(1000);
  expect(server.translated).toHaveLength(0);
  await expect(page.locator("#mttContainer")).toHaveCount(0);
});
