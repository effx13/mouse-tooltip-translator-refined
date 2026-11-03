import { openPdfViewer, openReader } from "./pages/viewers.ts";
import { EPUB_TITLE, fakeTranslate, PDF_LINES } from "./support/content.ts";
import { expect, test } from "./fixtures.ts";

const [FIRST_PDF_LINE = ""] = PDF_LINES;

test.beforeEach(async ({ useOfflineSettings }) => {
  await useOfflineSettings();
});

test("the pdf viewer renders a served pdf with a text layer", async ({
  page,
  extensionId,
  server,
}) => {
  const viewer = await openPdfViewer(page, extensionId, `${server.origin}/sample.pdf`);
  await expect(viewer.textLayer).toContainText(FIRST_PDF_LINE);
  await expect(page.locator(".page canvas").first()).toBeVisible();
});

test("hovering pdf text shows the tooltip in the viewer", async ({ page, extensionId, server }) => {
  await openPdfViewer(page, extensionId, `${server.origin}/sample.pdf`);
  const line = page.locator(".textLayer span", { hasText: "works in PDF" }).first();
  const box = await line.boundingBox();
  if (!box) throw new Error("pdf text is not rendered");
  await page.mouse.move(box.x + 20, box.y + box.height / 2, { steps: 5 });
  await page.mouse.move(box.x + 60, box.y + box.height / 2, { steps: 5 });
  const tooltip = page.locator("#mttContainer .mtt-root");
  await expect(tooltip).toHaveAttribute("data-state", "visible");
  await expect(tooltip).toHaveText(fakeTranslate(FIRST_PDF_LINE));
});

test("the pdf viewer without a file shows its empty state", async ({ page, extensionId }) => {
  await openPdfViewer(page, extensionId);
  await expect(page.getByRole("button", { name: "Open File" }).last()).toBeVisible();
});

test("the ebook reader opens with its empty state", async ({ page, extensionId }) => {
  const reader = await openReader(page, extensionId);
  await expect(page).toHaveTitle("Ebook Reader");
  await expect(page.getByText("Drop an ebook file here or open one")).toBeVisible();
  await expect(reader.tocButton).toBeDisabled();
});

test("the ebook reader opens an epub", async ({ page, extensionId, server }) => {
  const reader = await openReader(page, extensionId, `${server.origin}/sample.epub`);
  await expect(page.getByRole("heading", { name: EPUB_TITLE })).toBeVisible();
  await expect(reader.tocButton).toBeEnabled();
});
