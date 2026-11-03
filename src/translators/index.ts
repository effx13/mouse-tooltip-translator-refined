import { isRedundantTranslation, isSameLanguage } from "@/utils/lang";
import type { TranslateRequest, TranslateResult } from "@/utils/messaging";
import type { Settings } from "@/utils/settings";
import type { EngineResult } from "./engine";
import { translationCache } from "./cache";
import { isEngineReady } from "./catalog";
import { getEngine } from "./registry";
import { getWiktionaryDict } from "./wiktionary";

export type { EngineResult } from "./engine";
export { fetchLlmModels } from "./localLlm";

const engineWaitTime = 60 * 60 * 1000;

// A failure is usually about one language pair, not the whole engine (deepl rejects pt-BR/pt-PT,
// yandex pt-PT), so the cooldown is kept per engine+pair and the engine itself is only benched
// once it has failed on more than one pair.
const engineCrashTime = new Map<string, number>();
const engineCrashCount = new Map<string, number>();
const pairCrashTime = new Map<string, number>();
const pairCrashCount = new Map<string, number>();
const engineFailedPairs = new Map<string, Set<string>>();

type Attempt = { result: EngineResult } | { error: string };

// ky puts the request URL in its messages; Google Cloud carries the key in the query
const scrubSecrets = (message: string) =>
  message.replace(/([?&](?:key|api_key)=)[^&\s]+/gi, "$1***");

async function runEngine(
  text: string,
  sourceLang: string,
  targetLang: string,
  engine: string,
  settings: Settings,
): Promise<Attempt> {
  try {
    const result = await getEngine(engine)?.translate(text, sourceLang, targetLang, settings);
    if (!result) return { error: `${engine} returned no translation` };
    return { result };
  } catch (error) {
    console.log(error);
    return { error: scrubSecrets(error instanceof Error ? error.message : String(error)) };
  }
}

const pairKeyOf = (engine: string, sourceLang: string, targetLang: string) =>
  `${engine}|${sourceLang}|${targetLang}`;

function isCoolingDown(engine: string, sourceLang: string, targetLang: string, now: number) {
  const pairKey = pairKeyOf(engine, sourceLang, targetLang);
  return (engineCrashTime.get(engine) ?? 0) > now || (pairCrashTime.get(pairKey) ?? 0) > now;
}

function recordFailure(engine: string, sourceLang: string, targetLang: string) {
  const pairKey = pairKeyOf(engine, sourceLang, targetLang);
  const pairCount = (pairCrashCount.get(pairKey) ?? 0) + 1;
  pairCrashCount.set(pairKey, pairCount);
  pairCrashTime.set(pairKey, Date.now() + engineWaitTime * pairCount);

  const failedPairs = engineFailedPairs.get(engine) ?? new Set<string>();
  engineFailedPairs.set(engine, failedPairs.add(pairKey));
  if (failedPairs.size > 1) {
    const engineCount = (engineCrashCount.get(engine) ?? 0) + 1;
    engineCrashCount.set(engine, engineCount);
    engineCrashTime.set(engine, Date.now() + engineWaitTime * engineCount);
  }
}

// a working answer clears whatever was remembered about this engine and pair
function recordSuccess(engine: string, sourceLang: string, targetLang: string) {
  const pairKey = pairKeyOf(engine, sourceLang, targetLang);
  pairCrashCount.delete(pairKey);
  pairCrashTime.delete(pairKey);
  engineCrashCount.delete(engine);
  engineCrashTime.delete(engine);
  engineFailedPairs.get(engine)?.delete(pairKey);
}

// enabled engines in priority order, minus the ones whose required setup is missing
export function getEngineOrder(settings: Settings, preferred?: string): string[] {
  const enabled = (settings.translatorEngines ?? [])
    .filter((entry) => entry.enabled && isEngineReady(settings.engineConfig, entry.id))
    .map((entry) => entry.id);
  return preferred ? [preferred, ...enabled.filter((id) => id !== preferred)] : enabled;
}

// tries each engine in order; one cooling down for this pair is only retried when nothing else answered
async function translateWithEngines(
  text: string,
  sourceLang: string,
  targetLang: string,
  order: readonly string[],
  settings: Settings,
): Promise<EngineResult | null> {
  const now = Date.now();
  const cooling = order.filter((engine) => isCoolingDown(engine, sourceLang, targetLang, now));
  const fresh = order.filter((engine) => !cooling.includes(engine));
  for (const engine of [...fresh, ...cooling]) {
    const attempt = await runEngine(text, sourceLang, targetLang, engine, settings);
    if ("result" in attempt) {
      recordSuccess(engine, sourceLang, targetLang);
      return attempt.result;
    }
    recordFailure(engine, sourceLang, targetLang);
  }
  return null;
}

// detected language already is the target: translate into reverseLang instead ("null" = off)
async function translateSameLangInReverse(
  response: EngineResult | null,
  text: string,
  targetLang: string,
  reverseLang: string,
  order: readonly string[],
  settings: Settings,
): Promise<EngineResult | null> {
  if (
    response &&
    isRedundantTranslation(text, response.targetText, response.sourceLang, targetLang) &&
    reverseLang !== "null" &&
    !isSameLanguage(reverseLang, targetLang) &&
    reverseLang !== targetLang
  ) {
    return translateWithEngines(text, response.sourceLang, reverseLang, order, settings);
  }
  return response;
}

// Wiktionary replaces the engine's dict for the hovered word
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

const brokenResult = (
  engine: string,
  sourceLang: string,
  targetLang: string,
  error?: string,
): TranslateResult => ({
  targetText: `${engine} is broken`,
  transliteration: "",
  sourceLang,
  targetLang,
  isBroken: true,
  ...(error && { error }),
});

// exactly one engine, no cache, no fallback, no cooldown bookkeeping (the settings "Test" button)
async function translateOnce(request: TranslateRequest, engine: string, settings: Settings) {
  const { text, sourceLang, targetLang } = request;
  const attempt = await runEngine(text, sourceLang, targetLang, engine, settings);
  return "result" in attempt
    ? attempt.result
    : brokenResult(engine, sourceLang, targetLang, attempt.error);
}

export async function translate(
  request: TranslateRequest,
  settings: Settings,
): Promise<TranslateResult | null> {
  const { text, sourceLang, targetLang, reverseLang = "null", engine } = request;
  if (engine && request.noFallback) return translateOnce(request, engine, settings);

  const order = getEngineOrder(settings, engine);
  // the chain head and dictionary mode are part of the key so another setup never gets a stale answer
  const cacheKey = settings.translationCache
    ? JSON.stringify([
        text,
        sourceLang,
        targetLang,
        reverseLang,
        settings.tooltipWordDictionary,
        settings.tooltipWordDictionarySource,
        order[0] ?? "",
      ])
    : undefined;
  const cached = cacheKey ? await translationCache.get(cacheKey) : undefined;
  if (cached) return cached;

  let response = await translateWithEngines(text, sourceLang, targetLang, order, settings);
  response = await translateSameLangInReverse(
    response,
    text,
    targetLang,
    reverseLang,
    order,
    settings,
  );
  response = await applyWiktionaryDict(response, text, settings);
  // stored in the background; the tooltip does not wait for IndexedDB
  if (response && cacheKey) void translationCache.put(cacheKey, response);

  // names the first engine in line, not the last one that also failed
  const firstEnabled = settings.translatorEngines?.find((entry) => entry.enabled)?.id;
  return response ?? brokenResult(order[0] ?? firstEnabled ?? "translator", sourceLang, targetLang);
}
