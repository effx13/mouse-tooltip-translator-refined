import { openPopup } from "./pages/popup.ts";
import { getStoredSettings } from "./support/extension.ts";
import { expect, test } from "./fixtures.ts";

test("renders every settings tab with the main tab selected", async ({ page, extensionId }) => {
  const popup = await openPopup(page, extensionId);
  await expect(
    page.getByRole("heading", { name: "Mouse Tooltip Translator Refined" }),
  ).toBeVisible();
  await expect(page.getByRole("tab")).toHaveText([
    "MAIN",
    "KEYBOARD",
    "GRAPHIC",
    "EXCLUDE",
    "ADVANCED",
    "BACKUP",
  ]);
  await expect(popup.tab("MAIN")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Translator Engine")).toBeVisible();
});

test("switching tabs shows that tab's settings and remembers it", async ({ page, extensionId }) => {
  const popup = await openPopup(page, extensionId);
  await popup.tab("GRAPHIC").click();
  await expect(popup.tab("GRAPHIC")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Tooltip Font Size")).toBeVisible();
  await expect(page.getByText("Translator Engine")).toBeHidden();

  await expect.poll(async () => (await getStoredSettings(page)).lastSettingTab).toBe("graphic");
  await page.reload();
  await expect(popup.tab("GRAPHIC")).toHaveAttribute("aria-selected", "true");
});

test("a toggle persists to storage and survives a reload", async ({ page, extensionId }) => {
  const popup = await openPopup(page, extensionId);
  await popup.tab("GRAPHIC").click();
  const toggle = popup.toggle("Mouseover Highlight Text");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect.poll(async () => (await getStoredSettings(page)).mouseoverHighlightText).toBe(true);

  await page.reload();
  await expect(popup.toggle("Mouseover Highlight Text")).toHaveAttribute("aria-checked", "true");
  // the reset button restores the default and stores it
  await page.getByRole("button", { name: "Default: Mouseover Highlight Text" }).click();
  await expect.poll(async () => (await getStoredSettings(page)).mouseoverHighlightText).toBe(false);
});

test("the about page opens and links to the viewers", async ({ page, extensionId }) => {
  const popup = await openPopup(page, extensionId);
  await page.getByRole("button", { name: "About" }).click();
  await expect(page).toHaveURL(/#\/about$/);
  await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
  await expect(page.getByRole("button", { name: /PDF Viewer/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ebook Reader/ })).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(popup.tab("MAIN")).toBeVisible();
});
