import {
  defaultEngineList,
  isEngineId,
  type EngineEntry,
  type EngineId,
} from "@/translators/catalog";

type StoredValues = Record<string, unknown>;

// the v1 fallback only kicked in for these vendors and swapped to google, bing, baidu in that order
const legacyFallbackVendors: ReadonlySet<string> = new Set([
  "google",
  "bing",
  "baidu",
  "papago",
  "deepl",
  "yandex",
]);
const legacyFallbackEngines: readonly EngineId[] = ["google", "bing", "baidu"];

const legacyLlmKeys = {
  llmProvider: "provider",
  llmApiEndpoint: "endpoint",
  llmApiKey: "apiKey",
  llmModel: "model",
} as const;

// the v1 engine set: the chosen vendor, then the fallback engines; the rest stay listed but off
export function legacyEngineList(vendor: string, fallback: boolean): EngineEntry[] {
  const enabled: EngineId[] = isEngineId(vendor) ? [vendor] : ["google"];
  if (fallback && legacyFallbackVendors.has(enabled[0] ?? "")) {
    enabled.push(...legacyFallbackEngines.filter((id) => !enabled.includes(id)));
  }
  const rest = defaultEngineList()
    .filter(({ id }) => !enabled.includes(id))
    .map(({ id }) => ({ id, enabled: false }));
  return [...enabled.map((id) => ({ id, enabled: true })), ...rest];
}

// v1 -> v2: translatorVendor + fallbackTranslatorEngine become translatorEngines and the llm* keys
// move into engineConfig.localLlm. Values are a diff over the defaults, so only stored keys migrate.
export function migrateSettingsV2<T>(value: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const old = value as StoredValues;
  const {
    translatorVendor,
    fallbackTranslatorEngine,
    llmProvider: _provider,
    llmApiEndpoint: _endpoint,
    llmApiKey: _apiKey,
    llmModel: _model,
    ...rest
  } = old;
  const next: StoredValues = { ...rest };

  if (
    !("translatorEngines" in old) &&
    (translatorVendor !== undefined || fallbackTranslatorEngine !== undefined)
  ) {
    next.translatorEngines = legacyEngineList(
      typeof translatorVendor === "string" ? translatorVendor : "google",
      fallbackTranslatorEngine !== false,
    );
  }

  const llm = Object.fromEntries(
    Object.entries(legacyLlmKeys).flatMap(([oldKey, field]) => {
      const fieldValue = old[oldKey];
      return typeof fieldValue === "string" && fieldValue ? [[field, fieldValue]] : [];
    }),
  );
  if (Object.keys(llm).length) {
    const config = (old.engineConfig ?? {}) as Record<string, Record<string, string>>;
    next.engineConfig = { ...config, localLlm: { ...llm, ...config.localLlm } };
  }
  return next as T;
}
