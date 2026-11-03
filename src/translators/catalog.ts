import type {
  EngineConfig,
  EngineEntry,
  EngineFieldValues,
  EngineId,
  EngineInfo,
} from "./engineMeta";

export type * from "./engineMeta";

// one folder per engine; meta.ts is light (no request code) so the settings UI can load it too
const metaModules = import.meta.glob<EngineInfo>("./*/meta.ts", { eager: true, import: "default" });

export const engineInfos: readonly EngineInfo[] = Object.values(metaModules).toSorted(
  (a, b) => a.order - b.order,
);

export const engineIds: readonly EngineId[] = engineInfos.map((info) => info.id);

const engineCatalog: ReadonlyMap<EngineId, EngineInfo> = new Map(
  engineInfos.map((info) => [info.id, info]),
);

export const isEngineId = (value: unknown): value is EngineId =>
  typeof value === "string" && engineCatalog.has(value);

export const getEngineInfo = (id: EngineId): EngineInfo =>
  engineCatalog.get(id) ?? {
    id,
    order: Infinity,
    label: id,
    icon: { kind: "mark", mark: "?", color: "#888888" },
    setup: "none",
    fields: [],
  };

export const defaultEngineList = (): EngineEntry[] =>
  engineInfos.map((info) => ({ id: info.id, enabled: info.defaultEnabled === true }));

// known ids only, no duplicates, and every engine listed (new ones are appended disabled)
export function normalizeEngineList(value: unknown): EngineEntry[] {
  const seen = new Set<EngineId>();
  const list: EngineEntry[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const id: unknown = entry?.id;
    if (!isEngineId(id) || seen.has(id)) continue;
    seen.add(id);
    list.push({ id, enabled: entry.enabled === true });
  }
  for (const id of engineIds) if (!seen.has(id)) list.push({ id, enabled: false });
  return list;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function normalizeEngineConfig(value: unknown): EngineConfig {
  if (!isRecord(value)) return {};
  const config: EngineConfig = {};
  for (const [id, values] of Object.entries(value)) {
    if (!isEngineId(id) || !isRecord(values)) continue;
    config[id] = Object.fromEntries(
      Object.entries(values).filter(
        (pair): pair is [string, string] => typeof pair[1] === "string",
      ),
    ) satisfies EngineFieldValues;
  }
  return config;
}

export function getFieldValue(config: EngineConfig | undefined, id: EngineId, key: string): string {
  const value = config?.[id]?.[key]?.trim();
  if (value) return value;
  return getEngineInfo(id).fields.find((field) => field.key === key)?.default ?? "";
}

const hasRequiredFields = (config: EngineConfig | undefined, id: EngineId) =>
  getEngineInfo(id)
    .fields.filter((field) => field.required)
    .every((field) => getFieldValue(config, id, field.key));

// optional-key engines switch to their official API once the key fields are filled
export const usesApiKey = (config: EngineConfig | undefined, id: EngineId) =>
  getEngineInfo(id).setup === "optional" && hasRequiredFields(config, id);

// required config present (always true for engines without setup)
export const isEngineReady = (config: EngineConfig | undefined, id: EngineId) =>
  getEngineInfo(id).setup !== "required" || hasRequiredFields(config, id);

export type EngineStatus = "ready" | "usesApiKey" | "needsApiKey" | "needsSetup";

export function getEngineStatus(config: EngineConfig | undefined, id: EngineId): EngineStatus {
  if (usesApiKey(config, id)) return "usesApiKey";
  if (isEngineReady(config, id)) return "ready";
  const required = getEngineInfo(id).fields.filter((field) => field.required);
  return required.every((field) => field.type === "password") ? "needsApiKey" : "needsSetup";
}
