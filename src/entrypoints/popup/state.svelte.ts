import {
  getDefaults,
  getSettings,
  llmProviderEndpoints,
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

export const store = $state({ settings: {} as Settings });
export const defaults: Settings = getDefaults();

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
  const plain = $state.snapshot(patch) as Partial<Settings>;
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

function llmProviderPatch(provider: string): Partial<Settings> {
  const s = store.settings;
  const saved = { ...$state.snapshot(s.llmProviderSettings) };
  saved[s.llmProvider] = {
    apiEndpoint: s.llmApiEndpoint || "",
    apiKey: s.llmApiKey || "",
    model: s.llmModel || "",
  };
  const restored = saved[provider];
  return {
    llmProvider: provider,
    llmProviderSettings: saved,
    llmApiEndpoint: restored
      ? restored.apiEndpoint || ""
      : provider === "custom"
        ? ""
        : (llmProviderEndpoints[provider] ?? ""),
    llmApiKey: restored?.apiKey || "",
    llmModel: restored?.model || "",
  };
}

// a value change coming from the settings UI
export async function setValue(key: keyof Settings, value: unknown) {
  if (store.settings[key] === value) return;
  if (key === "llmProvider" && typeof value === "string") {
    await save(llmProviderPatch(value));
    return;
  }
  const patch = { [key]: value } as Partial<Settings>;
  if (LANG_PRIORITY_KEYS.has(key)) bumpLangPriority(patch, value);
  await save(patch);
  if (key === "uiLanguage") location.reload();
}
