import { HTTPError, TimeoutError } from "ky";
import type { EngineFailure } from "@/utils/messaging";

// ky puts the request URL in its messages; Google Cloud carries the key in the query
const scrubSecrets = (message: string) =>
  message.replace(/([?&](?:key|api_key)=)[^&\s]+/gi, "$1***");

const kindOfStatus = (status: number): EngineFailure["kind"] => {
  if (status === 429) return "rateLimited";
  if (status === 401 || status === 403) return "auth";
  // 456: DeepL's "quota exceeded"
  if (status === 402 || status === 456) return "quota";
  if (status >= 500) return "server";
  return "other";
};

export function classifyFailure(engine: string, error: unknown): EngineFailure {
  if (error instanceof HTTPError) {
    const { status } = error.response;
    return { engine, kind: kindOfStatus(status), status };
  }
  if (error instanceof TimeoutError) return { engine, kind: "timeout" };
  // fetch rejects with a TypeError when the request never got an answer
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return { engine, kind: "network" };
  }
  const detail = scrubSecrets(error instanceof Error ? error.message : String(error));
  return { engine, kind: "other", detail };
}
