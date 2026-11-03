import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright";
import {
  launchExtension,
  setStoredSettings,
  type ExtensionSession,
  type LaunchOptions,
} from "../e2e/support/extension.ts";
import { offlineSettings, startFixtureServer, type FixtureServer } from "../e2e/support/server.ts";

const OUT_DIR = path.resolve(import.meta.dirname, "../docs/screenshots");
const POPUP_SIZE = { width: 420, height: 600 };
const FRAME_SIZE = { width: 1280, height: 800 };
// the tooltip fades in over 300ms
const SETTLE_MS = 600;

const tooltipSettings = {
  tooltipWidth: 320,
  tooltipFontSize: 18,
  mouseoverHighlightText: true,
};

async function withSession<T>(
  server: FixtureServer,
  options: LaunchOptions,
  // null keeps the stored settings untouched (a clean install)
  settings: Record<string, unknown> | null,
  run: (session: ExtensionSession, page: Page) => Promise<T>,
): Promise<T> {
  const session = await launchExtension({ headless: true, ...options });
  try {
    if (settings) {
      await setStoredSettings(session.serviceWorker, offlineSettings(server, settings));
    }
    const page = await session.context.newPage();
    await page.bringToFront();
    return await run(session, page);
  } finally {
    await session.close();
  }
}

async function waitForTooltip(page: Page) {
  await page
    .locator("#mttContainer .mtt-root[data-state='visible']")
    .waitFor({ state: "attached" });
  await page.waitForTimeout(SETTLE_MS);
}

async function hover(page: Page, selector: string, dx: number, dy = 0.5) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${selector} is not rendered`);
  const y = box.y + box.height * dy;
  await page.mouse.move(box.x + dx - 30, y, { steps: 5 });
  await page.mouse.move(box.x + dx, y, { steps: 5 });
}

// the popup at its real size, centered on a neutral backdrop
async function framePopup(page: Page, png: Buffer, dark: boolean, file: string) {
  const src = `data:image/png;base64,${png.toString("base64")}`;
  const backdrop = dark
    ? "radial-gradient(circle at 30% 20%, #2a2f3a, #14161b)"
    : "radial-gradient(circle at 30% 20%, #f4f6fa, #dfe3ea)";
  await page.setViewportSize(FRAME_SIZE);
  await page.setContent(`<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center;background:${backdrop}">
    <img src="${src}" width="${POPUP_SIZE.width}" height="${POPUP_SIZE.height}"
      style="border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,${dark ? 0.55 : 0.18}),0 0 0 1px rgba(${dark ? "255,255,255,.08" : "0,0,0,.06"})">
  </body></html>`);
  await page.locator("img").evaluate((img: HTMLImageElement) => img.decode());
  await page.screenshot({ path: path.join(OUT_DIR, file) });
}

async function settingsShot(server: FixtureServer, dark: boolean) {
  const colorScheme = dark ? "dark" : "light";
  await withSession(server, { colorScheme, viewport: POPUP_SIZE }, null, async (session, page) => {
    await page.goto(session.extensionUrl("popup.html"));
    await page.getByRole("tab", { name: "MAIN" }).waitFor();
    // the fonts and icons are local, but give the first paint a moment
    await page.waitForTimeout(300);
    const png = await page.screenshot();
    const framePage = await session.context.newPage();
    await framePage.emulateMedia({ colorScheme });
    await framePopup(framePage, png, dark, `settings-${colorScheme}.png`);
  });
}

async function enginesShot(server: FixtureServer) {
  await withSession(server, { viewport: POPUP_SIZE }, null, async (session, page) => {
    await page.goto(session.extensionUrl("popup.html"));
    await page.getByRole("tab", { name: "ENGINES" }).click();
    // one open config panel shows the API key field next to the list
    await page.locator("li[data-engine='deepl']").locator("button[aria-expanded]").click();
    await page.getByLabel("API Key *").waitFor();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    const png = await page.screenshot();
    const framePage = await session.context.newPage();
    await framePage.emulateMedia({ colorScheme: "light" });
    await framePopup(framePage, png, false, "engines.png");
  });
}

async function articleHoverShot(server: FixtureServer) {
  await withSession(server, {}, tooltipSettings, async (_session, page) => {
    await page.goto(`${server.origin}/article.html`);
    await hover(page, "article p", 260, 0.2);
    await waitForTooltip(page);
    await page.screenshot({ path: path.join(OUT_DIR, "tooltip-hover.png") });
  });
}

async function selectionShot(server: FixtureServer) {
  await withSession(
    server,
    {},
    { ...tooltipSettings, translateWhen: "select" },
    async (_session, page) => {
      await page.goto(`${server.origin}/article.html`);
      await page.locator("#quote").scrollIntoViewIfNeeded();
      await page.locator("#quote").click({ clickCount: 3 });
      await waitForTooltip(page);
      await page.screenshot({ path: path.join(OUT_DIR, "tooltip-selection.png") });
    },
  );
}

async function pdfShot(server: FixtureServer) {
  await withSession(server, {}, tooltipSettings, async (session, page) => {
    const file = encodeURIComponent(`${server.origin}/sample.pdf`);
    await page.goto(session.extensionUrl(`pdf.html?file=${file}`));
    await page.locator(".textLayer span", { hasText: "Hover over" }).first().waitFor();
    await hover(page, ".textLayer span:has-text('Hover over')", 180);
    await waitForTooltip(page);
    await page.screenshot({ path: path.join(OUT_DIR, "pdf-viewer.png") });
  });
}

async function readerShot(server: FixtureServer) {
  await withSession(server, {}, tooltipSettings, async (session, page) => {
    const url = encodeURIComponent(`${server.origin}/sample.epub`);
    await page.goto(session.extensionUrl(`reader.html?url=${url}`));
    await page
      .getByRole("button", { name: "Table of Contents" })
      .and(page.locator(":enabled"))
      .waitFor();
    // the book text sits in foliate's iframe; the reader bridges its mouse events to the tooltip
    await page.waitForTimeout(800);
    await page.mouse.move(150, 172, { steps: 5 });
    await page.mouse.move(200, 170, { steps: 5 });
    await waitForTooltip(page);
    await page.screenshot({ path: path.join(OUT_DIR, "ebook-reader.png") });
  });
}

await mkdir(OUT_DIR, { recursive: true });
const server = await startFixtureServer();
try {
  await settingsShot(server, false);
  await settingsShot(server, true);
  await enginesShot(server);
  await articleHoverShot(server);
  await selectionShot(server);
  await pdfShot(server);
  await readerShot(server);
  console.log(`screenshots written to ${path.relative(process.cwd(), OUT_DIR)}`);
} finally {
  await server.close();
}
