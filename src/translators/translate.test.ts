import type { Engine } from "@/translators/engine";
import type { TranslateRequest } from "@/utils/messaging";
import { defaultSettings, type Settings } from "@/utils/settings/schema";

const { engineTranslate } = vi.hoisted(() => ({ engineTranslate: vi.fn<Engine["translate"]>() }));

vi.mock("@/translators/registry", () => {
  const engine: Engine = { translate: engineTranslate };
  return { engines: { google: engine }, getEngine: (name: string) => (name ? engine : undefined) };
});

const { translate } = await import("@/translators");

const settings: Settings = {
  ...defaultSettings(),
  translatorEngines: [{ id: "google", enabled: true }],
  tooltipWordDictionarySource: "translator",
};

const request = (patch: Partial<TranslateRequest>): TranslateRequest => ({
  text: "hello",
  sourceLang: "auto",
  targetLang: "ko",
  reverseLang: "null",
  ...patch,
});

beforeEach(() => {
  engineTranslate.mockReset();
});

describe("translate", () => {
  test("a repeated request is answered from the cache", async () => {
    engineTranslate.mockResolvedValue({
      targetText: "캐시",
      sourceLang: "en",
      targetLang: "ko",
    });
    const first = await translate(request({ text: "cache me" }), settings);
    const second = await translate(request({ text: "cache me" }), settings);
    expect(second).toEqual(first);
    expect(engineTranslate).toHaveBeenCalledTimes(1);

    await translate(request({ text: "cache me", targetLang: "ja" }), settings);
    expect(engineTranslate).toHaveBeenCalledTimes(2);
  });

  test("uses the engine named in the request over the settings", async () => {
    engineTranslate.mockResolvedValue({ targetText: "x", sourceLang: "en", targetLang: "ko" });
    await translate(request({ text: "named engine", engine: "google" }), {
      ...settings,
      translatorEngines: [],
    });
    expect(engineTranslate).toHaveBeenCalledOnce();
  });

  test("text already in the target language is translated into the reverse language", async () => {
    engineTranslate.mockImplementation(async (text, _source, targetLang) =>
      targetLang === "ko"
        ? { targetText: text, sourceLang: "ko", targetLang: "ko" }
        : { targetText: "hello", sourceLang: "ko", targetLang },
    );
    const result = await translate(request({ text: "안녕하세요", reverseLang: "en" }), settings);
    expect(result?.targetText).toBe("hello");
    expect(result?.targetLang).toBe("en");
    expect(engineTranslate).toHaveBeenLastCalledWith("안녕하세요", "ko", "en", settings);
  });

  test("no reverse translation when it is off or the same language", async () => {
    engineTranslate.mockImplementation(async (text) => ({
      targetText: text,
      sourceLang: "ko",
      targetLang: "ko",
    }));
    const off = await translate(request({ text: "하나", reverseLang: "null" }), settings);
    expect(off?.targetLang).toBe("ko");
    const same = await translate(request({ text: "둘", reverseLang: "ko" }), settings);
    expect(same?.targetLang).toBe("ko");
    expect(engineTranslate).toHaveBeenCalledTimes(2);
  });

  test("a failed engine without fallback reports itself as broken", async () => {
    engineTranslate.mockResolvedValue(undefined);
    const result = await translate(request({ text: "fails", engine: "google" }), settings);
    expect(result).toMatchObject({
      sourceLang: "auto",
      targetLang: "ko",
      isBroken: true,
      failures: [{ engine: "google", kind: "empty" }],
    });
  });

  test("a failed result is not cached", async () => {
    engineTranslate.mockResolvedValueOnce(undefined);
    engineTranslate.mockResolvedValueOnce({ targetText: "ok", sourceLang: "en", targetLang: "ko" });
    expect((await translate(request({ text: "retry" }), settings))?.isBroken).toBe(true);
    expect((await translate(request({ text: "retry" }), settings))?.targetText).toBe("ok");
  });
});
