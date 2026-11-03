import { test as base, type BrowserContext, type Worker } from "@playwright/test";
import { getServiceWorker, launchExtension, setStoredSettings } from "./support/extension.ts";
import { offlineSettings, startFixtureServer, type FixtureServer } from "./support/server.ts";

export const test = base.extend<{
  // persistent context with the built extension loaded; the built-in `page` opens in it
  context: BrowserContext;
  extensionId: string;
  serviceWorker: Worker;
  // fake OpenAI-compatible LLM plus the test pages
  server: FixtureServer;
  // stores settings that route translation to the fake server
  useOfflineSettings: (patch?: Record<string, unknown>) => Promise<void>;
}>({
  context: async ({ headless, colorScheme, viewport, locale }, use) => {
    const session = await launchExtension({ headless, colorScheme, viewport, locale });
    await use(session.context);
    await session.close();
  },
  serviceWorker: async ({ context }, use) => {
    await use(await getServiceWorker(context));
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
  server: async ({ browserName: _browserName }, use) => {
    const server = await startFixtureServer();
    await use(server);
    await server.close();
  },
  useOfflineSettings: async ({ serviceWorker, server }, use) => {
    await use((patch) => setStoredSettings(serviceWorker, offlineSettings(server, patch)));
  },
});

export const expect = test.expect;
