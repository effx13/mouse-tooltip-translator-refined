import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  defaultSettings,
  getSettings,
  importSettings,
  resetSettings,
  updateSettings,
  watchSettings,
  type Settings,
} from ".";

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("settings storage", () => {
  test("an empty store reads as the defaults", async () => {
    const settings = await getSettings();
    const { translateTarget: _, ...rest } = settings;
    const { translateTarget: __, ...defaults } = defaultSettings();
    expect(rest).toEqual(defaults);
  });

  test.each([
    ["en-US", "en"],
    ["pt-BR", "pt"],
    ["zh-HK", "zh-CN"],
    ["zh-TW", "zh-TW"],
    ["he", "iw"],
    ["fil-PH", "tl"],
  ])("browser locale %s defaults the target to %s", async (locale, target) => {
    vi.spyOn(navigator, "language", "get").mockReturnValue(locale);
    expect((await getSettings()).translateTarget).toBe(target);
  });

  test("only the changed values are stored, merged over the defaults on read", async () => {
    const result = await updateSettings({ tooltipFontSize: 24, translateWhen: "select" });
    expect(result.tooltipFontSize).toBe(24);
    expect(result.tooltipWidth).toBe(defaultSettings().tooltipWidth);

    const { settings: stored } = await fakeBrowser.storage.local.get("settings");
    expect(stored).toEqual({ tooltipFontSize: 24, translateWhen: "select" });

    await updateSettings({ tooltipFontSize: 30 });
    expect((await getSettings()).translateWhen).toBe("select");
    expect((await getSettings()).tooltipFontSize).toBe(30);
  });

  test("nothing is mirrored to sync while sync is off", async () => {
    await updateSettings({ tooltipFontSize: 24 });
    expect(await fakeBrowser.storage.sync.get("settings")).toEqual({});
  });

  test("sync mirrors everything except device-only keys", async () => {
    await updateSettings({
      syncSetting: true,
      tooltipFontSize: 22,
      engineConfig: { deepl: { apiKey: "secret" }, localLlm: { apiKey: "secret" } },
      llmProviderSettings: { openai: { apiKey: "secret" } },
      lastSettingTab: "graphic",
    });
    const { settings: synced } = await fakeBrowser.storage.sync.get("settings");
    expect(synced).toEqual({ tooltipFontSize: 22 });
  });

  test("synced values apply on read only while sync is enabled locally", async () => {
    await fakeBrowser.storage.sync.set({ settings: { tooltipFontSize: 40, syncSetting: false } });
    expect((await getSettings()).tooltipFontSize).toBe(defaultSettings().tooltipFontSize);

    await updateSettings({ syncSetting: true, tooltipFontSize: 20 });
    await fakeBrowser.storage.sync.set({ settings: { tooltipFontSize: 40, syncSetting: false } });
    const settings = await getSettings();
    expect(settings.tooltipFontSize).toBe(40);
    // a synced copy can never turn sync off on this device
    expect(settings.syncSetting).toBe(true);
  });

  test("watchSettings reports the merged settings after a change", async () => {
    const seen = vi.fn<(settings: Settings) => void>();
    const unwatch = watchSettings(seen);
    await updateSettings({ tooltipFontSize: 26 });
    await vi.waitFor(() =>
      expect(seen).toHaveBeenCalledWith(expect.objectContaining({ tooltipFontSize: 26 })),
    );
    unwatch();
  });

  test("reset clears both copies", async () => {
    await updateSettings({ syncSetting: true, tooltipFontSize: 22 });
    await resetSettings();
    expect(await fakeBrowser.storage.local.get("settings")).toEqual({});
    expect(await fakeBrowser.storage.sync.get("settings")).toEqual({});
    expect((await getSettings()).tooltipFontSize).toBe(defaultSettings().tooltipFontSize);
  });
});

describe("importSettings", () => {
  test("keeps known keys whose value type matches the default", async () => {
    await importSettings({
      tooltipFontSize: 30,
      mouseoverHighlightText: true,
      websiteExcludeList: ["a.com"],
      engineConfig: { deepl: { apiKey: "key" } },
    });
    const settings = await getSettings();
    expect(settings.tooltipFontSize).toBe(30);
    expect(settings.mouseoverHighlightText).toBe(true);
    expect(settings.websiteExcludeList).toEqual(["a.com"]);
    expect(settings.engineConfig).toEqual({ deepl: { apiKey: "key" } });
  });

  test("a v1 export file keeps its engine choice and LLM setup", async () => {
    await importSettings({
      translatorVendor: "localLlm",
      fallbackTranslatorEngine: true,
      llmApiEndpoint: "http://localhost:1234/v1",
      llmModel: "qwen",
    });
    const settings = await getSettings();
    expect(settings.translatorEngines.filter((e) => e.enabled).map((e) => e.id)).toEqual([
      "localLlm",
    ]);
    expect(settings.engineConfig.localLlm).toEqual({
      endpoint: "http://localhost:1234/v1",
      model: "qwen",
    });
  });

  test("drops unknown keys and mismatched types", async () => {
    await importSettings({
      notASetting: 1,
      tooltipFontSize: "30",
      mouseoverHighlightText: "yes",
      translatorEngines: "google",
      importSetting: "button",
    });
    const { settings: stored } = await fakeBrowser.storage.local.get("settings");
    expect(stored).toEqual({});
  });

  test("rejects anything that is not a plain object", async () => {
    await expect(importSettings(null)).rejects.toThrow("invalid settings file");
    await expect(importSettings([{ tooltipFontSize: 30 }])).rejects.toThrow(
      "invalid settings file",
    );
    await expect(importSettings("{}")).rejects.toThrow("invalid settings file");
  });
});
