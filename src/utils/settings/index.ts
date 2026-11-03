import { storage } from "wxt/utils/storage";
import { normalizeEngineConfig, normalizeEngineList } from "@/translators/catalog";
import { migrateSettingsV2 } from "./migrate";
import { defaultSettings, type Settings } from "./schema";

export * from "./schema";

type StoredSettings = Partial<Settings>;

// created on first use: defining an item touches storage, which throws in a context
// without extension APIs (orphaned content scripts after an update, sandboxed frames)
const createItems = () => ({
  local: storage.defineItem<StoredSettings>("local:settings", {
    fallback: {},
    version: 2,
    migrations: { 2: migrateSettingsV2 },
  }),
  synced: storage.defineItem<StoredSettings>("sync:settings", { fallback: {} }),
});
let cachedItems: ReturnType<typeof createItems> | undefined;
const items = () => (cachedItems ??= createItems());

// API keys never leave the device; engineConfig is excluded whole because merge() overlays shallowly
const SYNC_EXCLUDE = [
  "syncSetting",
  "lastSettingTab",
  "engineConfig",
  "llmProviderSettings",
] as const;

// browser locale -> translate target code (zh -> zh-CN, he -> iw, fil -> tl)
function parseLocaleLang(localeLang: string): string {
  if (localeLang === "zh-TW") return "zh-TW";
  let lang: string;
  try {
    lang = new Intl.Locale(localeLang).language;
  } catch {
    lang = localeLang.split(/[-_]/)[0] ?? localeLang;
  }
  const convert: Record<string, string> = { zh: "zh-CN", he: "iw", fil: "tl" };
  return convert[lang] ?? lang;
}

export function getDefaults(): Settings {
  const defaults = defaultSettings();
  defaults.translateTarget = parseLocaleLang(navigator.language);
  return defaults;
}

function merge(local: StoredSettings, synced: StoredSettings): Settings {
  const settings = { ...getDefaults(), ...local };
  if (settings.syncSetting) {
    // another device may still write the v1 shape
    const { syncSetting: _, ...rest } = migrateSettingsV2(synced);
    Object.assign(settings, rest);
  }
  settings.translatorEngines = normalizeEngineList(settings.translatorEngines);
  settings.engineConfig = normalizeEngineConfig(settings.engineConfig);
  return settings;
}

export async function getSettings(): Promise<Settings> {
  const [local, synced] = await Promise.all([items().local.getValue(), items().synced.getValue()]);
  return merge(local, synced);
}

// apply a partial change and persist it
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const local = { ...(await items().local.getValue()), ...patch };
  await items().local.setValue(local);
  if (local.syncSetting) {
    const toSync: StoredSettings = { ...local };
    for (const key of SYNC_EXCLUDE) delete toSync[key];
    await items()
      .synced.setValue(toSync)
      .catch((error) => console.log(error)); // quota/unavailable
  }
  return getSettings();
}

// call `cb` with the fresh settings whenever either copy changes; returns unwatch
export function watchSettings(cb: (settings: Settings) => void): () => void {
  const refresh = async () => {
    try {
      cb(await getSettings());
    } catch (error) {
      // the extension was reloaded or updated under this page; nothing left to refresh
      console.log(error);
    }
  };
  const unwatchLocal = items().local.watch(refresh);
  const unwatchSync = items().synced.watch(refresh);
  return () => {
    unwatchLocal();
    unwatchSync();
  };
}

export async function resetSettings() {
  await items().local.removeValue();
  await items()
    .synced.removeValue()
    .catch(() => {});
}

// export file content: only the values that differ from the defaults are needed, but keep all for readability
export async function exportSettings(): Promise<Settings> {
  return getSettings();
}

export async function importSettings(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("invalid settings file");
  }
  const known: Readonly<Record<string, unknown>> = getDefaults();
  const patch: Record<string, unknown> = {};
  // files exported before v2 still name a single translatorVendor
  for (const [key, value] of Object.entries(migrateSettingsV2(data))) {
    if (key in known && typeof value === typeof known[key]) patch[key] = value;
  }
  await updateSettings(patch as Partial<Settings>);
}
