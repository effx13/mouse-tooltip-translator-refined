import { fakeBrowser } from "wxt/testing/fake-browser";
import { defaultEngineList } from "@/translators/catalog";
import { legacyEngineList, migrateSettingsV2 } from "./migrate";
import type { Settings } from "./schema";

const migrate = (value: object) => migrateSettingsV2(value) as Partial<Settings>;
const enabledIds = (list: { id: string; enabled: boolean }[] = []) =>
  list.filter((entry) => entry.enabled).map((entry) => entry.id);

describe("migrateSettingsV2", () => {
  test("the old vendor comes first, then the old fallback engines in their order", () => {
    const migrated = migrate({ translatorVendor: "deepl", tooltipFontSize: 20 });
    expect(migrated).not.toHaveProperty("translatorVendor");
    expect(migrated.tooltipFontSize).toBe(20);
    expect(enabledIds(migrated.translatorEngines)).toEqual(["deepl", "google", "bing", "baidu"]);
    expect(migrated.translatorEngines).toHaveLength(defaultEngineList().length);
  });

  test("fallback off keeps only the vendor enabled", () => {
    const migrated = migrate({
      translatorVendor: "bing",
      fallbackTranslatorEngine: false,
    });
    expect(migrated).not.toHaveProperty("fallbackTranslatorEngine");
    expect(enabledIds(migrated.translatorEngines)).toEqual(["bing"]);
  });

  test("a stored fallback flag alone applies to the default vendor", () => {
    expect(enabledIds(migrate({ fallbackTranslatorEngine: false }).translatorEngines)).toEqual([
      "google",
    ]);
    expect(enabledIds(migrate({ fallbackTranslatorEngine: true }).translatorEngines)).toEqual([
      "google",
      "bing",
      "baidu",
    ]);
  });

  // v1 never fell back from these, so enabling google would send their text somewhere new
  test.each(["localLlm", "browserAPI", "googleGTX"])("%s had no fallback", (vendor) => {
    expect(enabledIds(legacyEngineList(vendor, true))).toEqual([vendor]);
  });

  test("the remaining engines follow the default order, disabled", () => {
    const list = legacyEngineList("yandex", false);
    const defaultsWithoutYandex = defaultEngineList()
      .map((entry) => entry.id)
      .filter((id) => id !== "yandex");
    expect(list.map((entry) => entry.id)).toEqual(["yandex", ...defaultsWithoutYandex]);
  });

  test("the llm keys move into engineConfig.localLlm", () => {
    const migrated = migrate({
      llmProvider: "openai",
      llmApiEndpoint: "https://api.openai.com/v1",
      llmApiKey: "sk-1",
      llmModel: "gpt",
      llmProviderSettings: { custom: { apiEndpoint: "http://x" } },
    });
    expect(migrated).toEqual({
      engineConfig: {
        localLlm: {
          provider: "openai",
          endpoint: "https://api.openai.com/v1",
          apiKey: "sk-1",
          model: "gpt",
        },
      },
      llmProviderSettings: { custom: { apiEndpoint: "http://x" } },
    });
  });

  test("defaults stay defaults and v2 values pass through", () => {
    expect(migrate({ tooltipFontSize: 20 })).toEqual({ tooltipFontSize: 20 });
    const v2 = { translatorEngines: [{ id: "bing", enabled: true }], engineConfig: {} };
    expect(migrateSettingsV2(v2)).toEqual(v2);
    expect(migrateSettingsV2(null)).toBeNull();
  });
});

describe("local:settings storage migration", () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.resetModules();
  });

  test("a v1 store is rewritten as v2 on first use", async () => {
    await fakeBrowser.storage.local.set({
      settings: { translatorVendor: "papago", llmModel: "m", tooltipWidth: 300 },
    });
    // the storage item (and its migration) is created on the first read
    const { getSettings } = await import(".");
    const settings = await getSettings();
    expect(enabledIds(settings.translatorEngines)).toEqual(["papago", "google", "bing", "baidu"]);
    expect(settings.engineConfig).toEqual({ localLlm: { model: "m" } });
    expect(settings.tooltipWidth).toBe(300);

    const stored = await fakeBrowser.storage.local.get(["settings", "settings$"]);
    expect(stored.settings).not.toHaveProperty("translatorVendor");
    expect(stored.settings).not.toHaveProperty("llmModel");
    expect(stored["settings$"]).toEqual({ v: 2 });
  });

  test("a v1 synced copy from another device is read in the v2 shape", async () => {
    await fakeBrowser.storage.local.set({ settings: { syncSetting: true } });
    await fakeBrowser.storage.sync.set({ settings: { translatorVendor: "yandex" } });
    const { getSettings } = await import(".");
    expect(enabledIds((await getSettings()).translatorEngines)).toEqual([
      "yandex",
      "google",
      "bing",
      "baidu",
    ]);
  });
});
