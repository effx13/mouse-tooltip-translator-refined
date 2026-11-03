import { storage } from "wxt/utils/storage";
import { defaultSettings, type Settings } from "./schema";

export * from "./schema";

type StoredSettings = Partial<Settings>;

const localSettings = storage.defineItem<StoredSettings>("local:settings", {
  fallback: {},
  version: 1,
});

// the api key never leaves the device
const syncedSettings = storage.defineItem<StoredSettings>("sync:settings", { fallback: {} });
const SYNC_EXCLUDE = ["syncSetting", "lastSettingTab", "llmApiKey", "llmProviderSettings"] as const;

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
    const { syncSetting: _, ...rest } = synced;
    Object.assign(settings, rest);
  }
  return settings;
}

export async function getSettings(): Promise<Settings> {
  const [local, synced] = await Promise.all([localSettings.getValue(), syncedSettings.getValue()]);
  return merge(local, synced);
}

// apply a partial change and persist it
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const local = { ...(await localSettings.getValue()), ...patch };
  await localSettings.setValue(local);
  if (local.syncSetting) {
    const toSync: StoredSettings = { ...local };
    for (const key of SYNC_EXCLUDE) delete toSync[key];
    await syncedSettings.setValue(toSync).catch((error) => console.log(error)); // quota/unavailable
  }
  return getSettings();
}

// call `cb` with the fresh settings whenever either copy changes; returns unwatch
export function watchSettings(cb: (settings: Settings) => void): () => void {
  const refresh = async () => cb(await getSettings());
  const unwatchLocal = localSettings.watch(refresh);
  const unwatchSync = syncedSettings.watch(refresh);
  return () => {
    unwatchLocal();
    unwatchSync();
  };
}

export async function resetSettings() {
  await localSettings.removeValue();
  await syncedSettings.removeValue().catch(() => {});
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
  for (const [key, value] of Object.entries(data)) {
    if (key in known && typeof value === typeof known[key]) patch[key] = value;
  }
  await updateSettings(patch as Partial<Settings>);
}
