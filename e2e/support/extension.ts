import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type BrowserContext, type Page, type Worker } from "playwright";
import type { browser } from "wxt/browser";

// the extension api inside page.evaluate / worker.evaluate callbacks
declare const chrome: typeof browser;

export const EXTENSION_PATH = path.resolve(import.meta.dirname, "../../.output/chrome-mv3");

export interface LaunchOptions {
  headless?: boolean;
  colorScheme?: "light" | "dark" | "no-preference" | null;
  viewport?: { width: number; height: number } | null;
  deviceScaleFactor?: number;
  locale?: string;
}

export interface ExtensionSession {
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
  extensionUrl: (file: string) => string;
  close: () => Promise<void>;
}

export const extensionUrl = (extensionId: string, file: string) =>
  `chrome-extension://${extensionId}/${file.replace(/^\//, "")}`;

const isExtensionWorker = (worker: Worker) => worker.url().startsWith("chrome-extension://");

// the MV3 service worker may already be running by the time we look for it
export async function getServiceWorker(context: BrowserContext): Promise<Worker> {
  return (
    context.serviceWorkers().find(isExtensionWorker) ??
    (await context.waitForEvent("serviceworker", { predicate: isExtensionWorker }))
  );
}

// the install handler opens the online guide in a new tab, which fails offline
function closeIntroTab(page: Page) {
  page.on("requestfailed", (request) => {
    if (request.isNavigationRequest() && /github\.com/.test(request.url())) void page.close();
  });
}

export async function launchExtension({
  headless = true,
  colorScheme = "light",
  viewport = { width: 1280, height: 800 },
  deviceScaleFactor = 1,
  locale = "en-US",
}: LaunchOptions = {}): Promise<ExtensionSession> {
  const userDataDir = await mkdtemp(path.join(tmpdir(), "mtt-e2e-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    // the new headless mode of the full chromium build can load extensions
    channel: "chromium",
    headless,
    colorScheme,
    viewport,
    deviceScaleFactor,
    locale,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      `--lang=${locale}`,
      // offline: only the local fixture server resolves
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
    ],
  });
  context.pages().forEach(closeIntroTab);
  context.on("page", closeIntroTab);

  const serviceWorker = await getServiceWorker(context);
  const extensionId = new URL(serviceWorker.url()).host;
  return {
    context,
    extensionId,
    serviceWorker,
    extensionUrl: (file) => extensionUrl(extensionId, file),
    close: async () => {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}

// writes the stored diff that src/utils/settings reads (`local:settings` -> key "settings")
export async function setStoredSettings(worker: Worker, settings: Record<string, unknown>) {
  await worker.evaluate(async (value) => {
    await chrome.storage.local.set({ settings: value });
  }, settings);
}

export async function getStoredSettings(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(async () => {
    const { settings } = await chrome.storage.local.get("settings");
    return (settings ?? {}) as Record<string, unknown>;
  });
}
