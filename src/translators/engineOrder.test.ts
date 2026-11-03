import { vi } from "vitest";
import type { Engine } from "@/translators/engine";
import type { TranslateRequest } from "@/utils/messaging";
import { defaultSettings, type Settings } from "@/utils/settings/schema";

// no network: the engine registry is mocked so only the ordering and cooldown bookkeeping run
const { calls, record } = vi.hoisted(() => {
  const log: string[] = [];
  const fakeEngine =
    (name: string): Engine["translate"] =>
    async (text, sourceLang, targetLang) => {
      log.push(`${name}:${sourceLang}->${targetLang}`);
      // deepl knows PT but not the regional variants; bing is down
      if (name === "deepl" && targetLang.includes("-")) return undefined;
      if (name === "bing") throw new Error("bing is down");
      return { targetText: `${name}(${text})`, transliteration: "", sourceLang: "en", targetLang };
    };
  return { calls: log, record: fakeEngine };
});

vi.mock("@/translators/registry", () => {
  const engines: Record<string, Engine> = Object.fromEntries(
    ["deepl", "google", "bing", "baidu", "kakao"].map((name) => [
      name,
      { translate: record(name) },
    ]),
  );
  return { engines, getEngine: (name: string) => engines[name] };
});

const { translate } = await import("@/translators");

const withEngines = (ids: string[], patch: Partial<Settings> = {}): Settings => ({
  ...defaultSettings(),
  translatorEngines: ids.map((id) => ({ id, enabled: true })),
  translationCache: false,
  tooltipWordDictionary: false,
  ...patch,
});

const request = (patch: Partial<TranslateRequest>): TranslateRequest => ({
  text: "hello",
  sourceLang: "auto",
  targetLang: "es",
  reverseLang: "null",
  ...patch,
});

const engineOf = (res: { targetText?: string } | null) =>
  String(res?.targetText ?? "").split("(")[0];

beforeEach(() => {
  calls.length = 0;
});

describe("engine order", () => {
  test("enabled engines are tried top to bottom and the first answer wins", async () => {
    const result = await translate(
      request({ text: "a" }),
      withEngines(["bing", "google", "baidu"]),
    );
    expect(engineOf(result)).toBe("google");
    expect(calls).toEqual(["bing:auto->es", "google:auto->es"]);
  });

  test("disabled engines and engines missing their required setup are skipped", async () => {
    const settings = withEngines(["kakao", "baidu"], {
      translatorEngines: [
        { id: "google", enabled: false },
        { id: "kakao", enabled: true },
        { id: "baidu", enabled: true },
      ],
    });
    const result = await translate(request({ text: "b" }), settings);
    expect(engineOf(result)).toBe("baidu");
    expect(calls).toEqual(["baidu:auto->es"]);

    calls.length = 0;
    const configured = { ...settings, engineConfig: { kakao: { apiKey: "key" } } };
    expect(engineOf(await translate(request({ text: "c" }), configured))).toBe("kakao");
  });

  test("nothing usable reports the first enabled engine as broken without a request", async () => {
    const result = await translate(request({ text: "d" }), withEngines(["kakao"]));
    expect(result).toMatchObject({ isBroken: true, targetText: "kakao is broken" });
    expect(calls).toEqual([]);
  });

  // a fresh language pair: bing already failed (and is cooling down) for auto->es above
  test("the request engine goes first, then the configured order", async () => {
    const result = await translate(
      request({ text: "e", engine: "bing", targetLang: "de" }),
      withEngines(["baidu", "google"]),
    );
    expect(engineOf(result)).toBe("baidu");
    expect(calls).toEqual(["bing:auto->de", "baidu:auto->de"]);
  });

  test("noFallback uses exactly one engine and reports its error", async () => {
    const result = await translate(
      request({ text: "f", engine: "bing", noFallback: true }),
      withEngines(["google"]),
    );
    expect(calls).toEqual(["bing:auto->es"]);
    expect(result).toMatchObject({ isBroken: true, error: "bing is down" });
  });
});

describe("cooldown", () => {
  test("an unsupported language pair does not bench the engine for other languages", async () => {
    const settings = withEngines(["deepl", "google"]);
    const first = await translate(request({ text: "g", targetLang: "pt-BR" }), settings);
    expect(engineOf(first)).toBe("google");
    expect(calls).toContain("deepl:auto->pt-BR");

    calls.length = 0;
    const second = await translate(request({ text: "g", targetLang: "fr" }), settings);
    expect(engineOf(second)).toBe("deepl");
  });

  test("the failing pair is not retried while it is cooling down", async () => {
    const settings = withEngines(["deepl", "google"]);
    await translate(request({ text: "h", targetLang: "pt-PT" }), settings);
    calls.length = 0;
    const again = await translate(request({ text: "i", targetLang: "pt-PT" }), settings);
    expect(calls).toEqual(["google:auto->pt-PT"]);
    expect(engineOf(again)).toBe("google");
  });

  test("a cooling engine is still the last resort when nothing else answers", async () => {
    await translate(request({ text: "j", targetLang: "zh-TW" }), withEngines(["deepl", "google"]));
    calls.length = 0;
    const result = await translate(
      request({ text: "k", targetLang: "zh-TW" }),
      withEngines(["deepl"]),
    );
    expect(calls).toEqual(["deepl:auto->zh-TW"]);
    expect(result?.isBroken).toBe(true);
  });
});
