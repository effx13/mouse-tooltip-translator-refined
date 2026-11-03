import type { EngineId } from "@/translators/catalog";
import { llmProviderEndpoints } from "@/translators/localLlm/meta";
import {
  getDefaults,
  getSettings,
  updateSettings,
  watchSettings,
  type Settings,
} from "@/utils/settings";

export const LANG_PRIORITY_KEYS: ReadonlySet<string> = new Set([
  "translateSource",
  "translateTarget",
  "translateTarget2",
  "writingLanguage",
  "translateReverseTarget",
]);

export const defaults: Settings = getDefaults();
// replaced by the stored settings in initSettings() before the app mounts
export const store = $state({ settings: getDefaults() });

let queue: Promise<unknown> = Promise.resolve();
let pending = 0;

export async function initSettings(): Promise<Settings> {
  store.settings = await getSettings();
  // skip echoes of our own queued writes; the last write's result is applied directly
  watchSettings((fresh) => {
    if (pending === 0) store.settings = fresh;
  });
  return store.settings;
}

// optimistic local apply, then serialized persist (updateSettings is read-modify-write)
export function save(patch: Partial<Settings>): Promise<void> {
  Object.assign(store.settings, patch);
  const plain: Partial<Settings> = $state.snapshot(patch);
  pending++;
  const previous = queue;
  const run = (async () => {
    await previous;
    try {
      const fresh = await updateSettings(plain);
      if (pending === 1) store.settings = fresh;
    } finally {
      pending--;
    }
  })();
  queue = run.catch((error) => console.log(error));
  return run;
}

function bumpLangPriority(patch: Partial<Settings>, lang: unknown) {
  if (typeof lang !== "string" || !lang || lang === "null") return;
  const priority = { ...$state.snapshot(store.settings.langPriority) };
  priority[lang] = (priority[lang] ?? 0) + 1;
  patch.langPriority = priority;
}

// remembers the current provider's endpoint/key/model and restores the next one's
function llmProviderPatch(provider: string): Partial<Settings> {
  const config = $state.snapshot(store.settings.engineConfig);
  const current = config.localLlm ?? {};
  const saved = { ...$state.snapshot(store.settings.llmProviderSettings) };
  saved[current.provider || "custom"] = {
    apiEndpoint: current.endpoint || "",
    apiKey: current.apiKey || "",
    model: current.model || "",
  };
  const restored = saved[provider];
  const endpoint = restored
    ? restored.apiEndpoint || ""
    : provider === "custom"
      ? ""
      : (llmProviderEndpoints[provider] ?? "");
  return {
    llmProviderSettings: saved,
    engineConfig: {
      ...config,
      localLlm: {
        ...current,
        provider,
        endpoint,
        apiKey: restored?.apiKey || "",
        model: restored?.model || "",
      },
    },
  };
}

export async function setEngineField(id: EngineId, key: string, value: string) {
  const config = $state.snapshot(store.settings.engineConfig);
  if ((config[id]?.[key] ?? "") === value) return;
  if (id === "localLlm" && key === "provider") {
    await save(llmProviderPatch(value));
    return;
  }
  await save({ engineConfig: { ...config, [id]: { ...config[id], [key]: value } } });
}

export async function setEngineEnabled(id: EngineId, enabled: boolean) {
  const list = $state.snapshot(store.settings.translatorEngines);
  await save({
    translatorEngines: list.map((entry) => (entry.id === id ? { ...entry, enabled } : entry)),
  });
}

// returns false when the engine is already at that end of the list
export function moveEngine(id: EngineId, delta: -1 | 1): boolean {
  const list = $state.snapshot(store.settings.translatorEngines);
  const from = list.findIndex((entry) => entry.id === id);
  const to = from + delta;
  const moved = list[from];
  if (from < 0 || to < 0 || to >= list.length || !moved) return false;
  list.splice(from, 1);
  list.splice(to, 0, moved);
  void save({ translatorEngines: list });
  return true;
}

// a value change coming from the settings UI
export async function setValue(key: keyof Settings, value: unknown) {
  if (store.settings[key] === value) return;
  const patch = { [key]: value } as Partial<Settings>;
  if (LANG_PRIORITY_KEYS.has(key)) bumpLangPriority(patch, value);
  await save(patch);
  if (key === "uiLanguage") location.reload();
}
