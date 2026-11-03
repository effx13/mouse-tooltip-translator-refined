import { isRedundantTranslation, isSameLanguage } from "@/utils/lang";
import type { EngineFailure, TranslateRequest, TranslateResult } from "@/utils/messaging";
import type { Settings } from "@/utils/settings";
import type { EngineResult } from "./engine";
import { translationCache } from "./cache";
import { isEngineReady } from "./catalog";
import { classifyFailure } from "./failure";
import { describeFailures } from "./failureMessage";
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

type Attempt = { result: EngineResult } | { failure: EngineFailure };

// what one translate() call went through: why engines failed and which one answered
interface Run {
  failures: EngineFailure[];
  answeredBy?: string;
}

// a timeout or a Wi-Fi blip doesn't demote an engine; an empty answer does, since that is how
// engines turn down a language pair they don't support
const isDurable = (failure: EngineFailure) =>
  failure.kind !== "timeout" && failure.kind !== "network";

async function runEngine(
  text: string,
  sourceLang: string,
  targetLang: string,
  engine: string,
  settings: Settings,
): Promise<Attempt> {
  try {
    const result = await getEngine(engine)?.translate(text, sourceLang, targetLang, settings);
    if (!result || (!result.targetText && !result.imageUrl)) {
      return { failure: { engine, kind: "empty" } };
    }
    return { result };
  } catch (error) {
    console.log(error);
    return { failure: classifyFailure(engine, error) };
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
  run: Run = { failures: [] },
): Promise<EngineResult | null> {
  const now = Date.now();
  const cooling = order.filter((engine) => isCoolingDown(engine, sourceLang, targetLang, now));
  const fresh = order.filter((engine) => !cooling.includes(engine));
  for (const engine of [...fresh, ...cooling]) {
    const attempt = await runEngine(text, sourceLang, targetLang, engine, settings);
    if ("result" in attempt) {
      recordSuccess(engine, sourceLang, targetLang);
      run.answeredBy = engine;
      return attempt.result;
    }
    run.failures.push(attempt.failure);
    if (isDurable(attempt.failure)) recordFailure(engine, sourceLang, targetLang);
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
  run: Run,
): Promise<EngineResult | null> {
  if (
    response &&
    isRedundantTranslation(text, response.targetText, response.sourceLang, targetLang) &&
    reverseLang !== "null" &&
    !isSameLanguage(reverseLang, targetLang) &&
    reverseLang !== targetLang
  ) {
    return translateWithEngines(text, response.sourceLang, reverseLang, order, settings, run);
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
  failures: EngineFailure[],
  sourceLang: string,
  targetLang: string,
): TranslateResult => {
  const message = describeFailures(failures);
  return {
    targetText: message,
    transliteration: "",
    sourceLang,
    targetLang,
    isBroken: true,
    failures,
    error: message,
  };
};

// exactly one engine, no cache, no fallback, no cooldown bookkeeping (the settings "Test" button)
async function translateOnce(request: TranslateRequest, engine: string, settings: Settings) {
  const { text, sourceLang, targetLang } = request;
  const attempt = await runEngine(text, sourceLang, targetLang, engine, settings);
  return "result" in attempt
    ? attempt.result
    : brokenResult([attempt.failure], sourceLang, targetLang);
}

// stable, non-reversible tag of an engine's setup for the cache key (keeps keys out of IndexedDB)
function fingerprint(config: Readonly<Record<string, string>> | undefined): string {
  const text = JSON.stringify(
    Object.entries(config ?? {}).toSorted(([a], [b]) => a.localeCompare(b)),
  );
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

export async function translate(
  request: TranslateRequest,
  settings: Settings,
): Promise<TranslateResult | null> {
  const { text, sourceLang, targetLang, reverseLang = "null", engine } = request;
  if (engine && request.noFallback) return translateOnce(request, engine, settings);

  const order = getEngineOrder(settings, engine);
  const head = order[0] ?? "";
  // the chain head, its setup (API key or not, LLM model) and the dictionary mode are part of the
  // key, so another setup never gets a stale answer; writing/page translation is never stored
  const cacheKey =
    settings.translationCache && request.cache !== false
      ? JSON.stringify([
          text,
          sourceLang,
          targetLang,
          reverseLang,
          settings.tooltipWordDictionary,
          settings.tooltipWordDictionarySource,
          head,
          fingerprint(settings.engineConfig[head]),
        ])
      : undefined;
  const cached = cacheKey ? await translationCache.get(cacheKey) : undefined;
  if (cached) return cached;

  const run: Run = { failures: [] };
  let response = await translateWithEngines(text, sourceLang, targetLang, order, settings, run);
  response = await translateSameLangInReverse(
    response,
    text,
    targetLang,
    reverseLang,
    order,
    settings,
    run,
  );
  response = await applyWiktionaryDict(response, text, settings);
  // only the chain head's own answers are kept: a fallback answer would outlive the head's outage;
  // stored in the background, the tooltip does not wait for IndexedDB
  if (response && cacheKey && run.answeredBy === head)
    void translationCache.put(cacheKey, response);

  return response ?? brokenResult(run.failures, sourceLang, targetLang);
}
