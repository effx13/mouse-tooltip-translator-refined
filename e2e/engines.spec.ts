import { openPopup } from "./pages/popup.ts";
import { fakeTranslate } from "./support/content.ts";
import { getStoredSettings } from "./support/extension.ts";
import { expect, test } from "./fixtures.ts";

interface StoredEntry {
  id: string;
  enabled: boolean;
}

const storedEngines = async (page: Parameters<typeof getStoredSettings>[0]) =>
  ((await getStoredSettings(page)).translatorEngines ?? []) as StoredEntry[];

test("engines reorder, enable and test against the fake LLM", async ({
  page,
  extensionId,
  server,
  useOfflineSettings,
}) => {
  // google first and the LLM configured but off: nothing here may reach the network
  await useOfflineSettings({
    translatorEngines: [
      { id: "google", enabled: false },
      { id: "bing", enabled: false },
      { id: "localLlm", enabled: false },
    ],
  });
  const popup = await openPopup(page, extensionId);
  await popup.tab("ENGINES").click();
  const rows = page.locator("li[data-engine]");
  await expect(rows.first()).toHaveAttribute("data-engine", "google");
  await expect(page.locator("li[data-engine='kakao']")).toContainText("Needs API key");

  await page.getByRole("button", { name: "Move down: Google", exact: true }).click();
  await expect(rows.first()).toHaveAttribute("data-engine", "bing");
  await expect
    .poll(async () => (await storedEngines(page)).map((entry) => entry.id).slice(0, 2))
    .toEqual(["bing", "google"]);

  const llm = page.locator("li[data-engine='localLlm']");
  await page.getByRole("switch", { name: "Enable: OpenAI-compatible LLM" }).click();
  await expect
    .poll(async () => (await storedEngines(page)).find((entry) => entry.id === "localLlm"))
    .toEqual({ id: "localLlm", enabled: true });

  // Alt+ArrowUp on the row header moves it and keeps the focus there
  const header = llm.locator("button[aria-expanded]");
  await header.focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(rows.nth(1)).toHaveAttribute("data-engine", "localLlm");
  await expect(header).toBeFocused();
  await expect
    .poll(async () => (await storedEngines(page)).findIndex((entry) => entry.id === "localLlm"))
    .toBe(1);

  await header.click();
  await expect(llm.getByLabel("LLM Model *")).toHaveValue("test");
  await llm.getByRole("button", { name: "Test", exact: true }).click();
  await expect(llm.getByRole("status")).toHaveText(
    `Test succeeded: ${fakeTranslate("Hello, world")}`,
  );
  expect(server.translated).toContain("Hello, world");
});
