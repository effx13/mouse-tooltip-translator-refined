import { vi } from "vitest";
import type { Engine } from "@/translators/engine";
import type { Settings } from "@/utils/settings";

// no network: the engine registry is mocked so only the fallback bookkeeping is exercised (#363 follow-up)
const { calls, record } = vi.hoisted(() => {
  const log: string[] = [];
  const fakeEngine =
    (name: string): Engine["translate"] =>
    async (text, sourceLang, targetLang) => {
      log.push(`${name}:${sourceLang}->${targetLang}`);
      // deepl knows PT but not the regional variants
      if (name === "deepl" && targetLang.includes("-")) return undefined;
      return { targetText: `${name}(${text})`, transliteration: "", sourceLang: "en", targetLang };
    };
  return { calls: log, record: fakeEngine };
});

vi.mock("@/translators/registry", () => {
  const engines: Record<string, Engine> = Object.fromEntries(
    ["deepl", "google", "bing", "baidu"].map((name) => [name, { translate: record(name) }]),
  );
  return { engines, getEngine: (name: string) => engines[name] };
});

const { translate } = await import("@/translators");

const settings = {
  translatorVendor: "google",
  fallbackTranslatorEngine: true,
  tooltipWordDictionary: false,
  tooltipWordDictionarySource: "translator",
} as Settings;

const engineOf = (res: { targetText?: string } | null) =>
  String(res?.targetText ?? "").split("(")[0];

describe("fallback engine cooldown", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  test("an unsupported language pair does not bench the engine for other languages", async () => {
    // pt-BR is not supported by the mocked deepl -> another engine answers
    const first = await translate(
      {
        text: "hello",
        sourceLang: "auto",
        targetLang: "pt-BR",
        reverseLang: "null",
        engine: "deepl",
      },
      settings,
    );
    expect(engineOf(first)).not.toBe("deepl");
    expect(calls).toContain("deepl:auto->pt-BR");

    // a different target must still go to deepl (it used to be benched for an hour)
    calls.length = 0;
    const second = await translate(
      { text: "hello", sourceLang: "auto", targetLang: "es", reverseLang: "null", engine: "deepl" },
      settings,
    );
    expect(engineOf(second)).toBe("deepl");
    expect(calls).toContain("deepl:auto->es");
  });

  test("the failing pair is not retried while it is cooling down", async () => {
    await translate(
      {
        text: "second call",
        sourceLang: "auto",
        targetLang: "pt-PT",
        reverseLang: "null",
        engine: "deepl",
      },
      settings,
    );
    calls.length = 0;
    const again = await translate(
      {
        text: "third call",
        sourceLang: "auto",
        targetLang: "pt-PT",
        reverseLang: "null",
        engine: "deepl",
      },
      settings,
    );
    expect(calls).not.toContain("deepl:auto->pt-PT");
    expect(engineOf(again)).not.toBe("deepl");
  });
});
