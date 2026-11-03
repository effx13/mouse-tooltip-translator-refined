import { t } from "@/utils/i18n";
import type { EngineFailure } from "@/utils/messaging";
import { getEngineInfo, isEngineId } from "./catalog";

const reasonKeys: Record<Exclude<EngineFailure["kind"], "other">, string> = {
  rateLimited: "Too_many_requests",
  auth: "API_key_rejected",
  quota: "Quota_exceeded",
  server: "Server_error",
  timeout: "Request_timed_out",
  network: "Network_error",
  empty: "No_translation_returned",
};

export function engineName(engine: string): string {
  if (!isEngineId(engine)) return engine;
  const info = getEngineInfo(engine);
  return info.i18nKey ? t(info.i18nKey) : info.label;
}

export function describeFailure({ engine, kind, status, detail }: EngineFailure): string {
  const reason = kind === "other" ? detail || t("Translation_failed") : t(reasonKeys[kind]);
  return `${engineName(engine)}: ${status ? `${reason} (${status})` : reason}`;
}

// one line per engine that was tried, in order
export const describeFailures = (failures: readonly EngineFailure[]): string =>
  failures.length
    ? failures.map(describeFailure).join("\n")
    : t("No_translation_engine_is_enabled");
