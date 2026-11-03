import { isRedundantTranslation, isSameLanguage } from "@/utils/lang";
import type { TranslateRequest, TranslateResult } from "@/utils/messaging";
import type { Settings } from "@/utils/settings";
import type { EngineResult } from "./engine";
import { getEngine } from "./registry";
import { getWiktionaryDict } from "./wiktionary";

export type { EngineResult } from "./engine";
export { fetchLlmModels } from "./localLlm";

const fallbackEngineActList = new Set(["google", "bing", "baidu", "papago", "deepl", "yandex"]);
const fallbackEngineSwapList = ["google", "bing", "baidu"];
// the seed values order the swap preference: google, bing, baidu
const fallbackEngineCrashTimeInit: ReadonlyMap<string, number> = new Map([
  ["google", 1],
  ["bing", 2],
  ["baidu", 3],
]);
const fallbackWaitTime = 60 * 60 * 1000;
const fallbackMaxRetry = fallbackEngineSwapList.length;

// A failure is usually about one language pair, not the whole engine (deepl rejects pt-BR/pt-PT,
// yandex pt-PT), so the cooldown is kept per engine+pair and the engine itself is only benched
// once it has failed on more than one pair (#363).
let engineCrashTime = new Map(fallbackEngineCrashTimeInit);
const engineCrashCount = new Map<string, number>();
const pairCrashTime = new Map<string, number>();
const pairCrashCount = new Map<string, number>();
const engineFailedPairs = new Map<string, Set<string>>();

function resetFallbackState() {
  engineCrashTime = new Map(fallbackEngineCrashTimeInit);
  engineCrashCount.clear();
  pairCrashTime.clear();
  pairCrashCount.clear();
  engineFailedPairs.clear();
}

const cacheLimit = 10000;
const translateCache = new Map<string, EngineResult>();

async function getTranslateCached(
  text: string,
  sourceLang: string,
  targetLang: string,
  engine: string,
  settings: Settings,
): Promise<EngineResult | undefined> {
  const key = JSON.stringify([text, sourceLang, targetLang, engine]);
  const cached = translateCache.get(key);
  if (cached) return cached;
  const result = await getEngine(engine)?.translate(text, sourceLang, targetLang, settings);
  if (result) {
    if (translateCache.size >= cacheLimit) translateCache.clear();
    translateCache.set(key, result);
  }
  return result;
}

async function translateWithFallbackEngine(
  text: string,
  sourceLang: string,
  targetLang: string,
  engine: string,
  settings: Settings,
  retry = 0,
): Promise<EngineResult | null> {
  const now = Date.now();
  if (retry === 0 && [...engineCrashTime.values()].every((time) => now < time)) {
    resetFallbackState();
  }
  if (retry > fallbackMaxRetry) return null;

  if (!engineCrashCount.has(engine)) engineCrashCount.set(engine, 0);
  if (!engineCrashTime.has(engine)) engineCrashTime.set(engine, 0);

  const isFallbackEnabled = settings.fallbackTranslatorEngine && fallbackEngineActList.has(engine);
  const swapEngine = [...engineCrashTime.keys()]
    .filter((e) => fallbackEngineSwapList.includes(e) && e !== engine)
    .toSorted((a, b) => engineCrashTime.get(a)! - engineCrashTime.get(b)!)
    .at(0);

  const pairKey = `${engine}|${sourceLang}|${targetLang}`;
  const isCoolingDown =
    engineCrashTime.get(engine)! > now || (pairCrashTime.get(pairKey) ?? 0) > now;

  let result: EngineResult | null =
    !isCoolingDown || !isFallbackEnabled
      ? ((await getTranslateCached(text, sourceLang, targetLang, engine, settings)) ?? null)
      : null;

  if (isFallbackEnabled && !result) {
    const pairCount = (pairCrashCount.get(pairKey) ?? 0) + 1;
    pairCrashCount.set(pairKey, pairCount);
    pairCrashTime.set(pairKey, Date.now() + fallbackWaitTime * pairCount);

    const failedPairs = engineFailedPairs.get(engine) ?? new Set<string>();
    engineFailedPairs.set(engine, failedPairs.add(pairKey));
    if (failedPairs.size > 1) {
      const engineCount = engineCrashCount.get(engine)! + 1;
      engineCrashCount.set(engine, engineCount);
      engineCrashTime.set(engine, Date.now() + fallbackWaitTime * engineCount);
    }

    result = swapEngine
      ? await translateWithFallbackEngine(
          text,
          sourceLang,
          targetLang,
          swapEngine,
          settings,
          retry + 1,
        )
      : null;
  } else if (result) {
    // a working answer clears whatever was remembered about this engine and pair
    pairCrashCount.set(pairKey, 0);
    pairCrashTime.set(pairKey, 0);
    engineCrashCount.set(engine, 0);
    engineCrashTime.set(engine, fallbackEngineCrashTimeInit.get(engine) ?? 0);
    engineFailedPairs.get(engine)?.delete(pairKey);
  }
  return result;
}

// detected language already is the target: translate into reverseLang instead ("null" = off)
async function translateSameLangInReverse(
  response: EngineResult | null,
  text: string,
  targetLang: string,
  reverseLang: string,
  engine: string,
  settings: Settings,
): Promise<EngineResult | null> {
  if (
    response &&
    isRedundantTranslation(text, response.targetText, response.sourceLang, targetLang) &&
    reverseLang !== "null" &&
    !isSameLanguage(reverseLang, targetLang) &&
    reverseLang !== targetLang
  ) {
    return translateWithFallbackEngine(text, response.sourceLang, reverseLang, engine, settings);
  }
  return response;
}

// Wiktionary replaces the engine's dict for the hovered word (#149)
async function applyWiktionaryDict(
  response: EngineResult | null,
  text: string,
  settings: Settings,
) {
  if (
    !response ||
    !settings.tooltipWordDictionary ||
    settings.tooltipWordDictionarySource !== "wiktionary"
  ) {
    return response;
  }
  const dict = await getWiktionaryDict(text, response.sourceLang);
  return dict ? { ...response, dict } : response;
}

export async function translate(
  request: TranslateRequest,
  settings: Settings,
): Promise<TranslateResult | null> {
  const { text, sourceLang, targetLang, reverseLang = "null" } = request;
  const engine = request.engine || settings.translatorVendor;

  let response = await translateWithFallbackEngine(text, sourceLang, targetLang, engine, settings);
  response = await translateSameLangInReverse(
    response,
    text,
    targetLang,
    reverseLang,
    engine,
    settings,
  );
  response = await applyWiktionaryDict(response, text, settings);

  // names the requested engine, not the fallback that also failed
  return (
    response ?? {
      targetText: `${engine} is broken`,
      transliteration: "",
      sourceLang,
      targetLang,
      isBroken: true,
    }
  );
}
