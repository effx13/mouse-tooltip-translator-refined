import ky from "ky";
import { langListOpposite } from "@/utils/lang";
import { getFieldValue } from "../catalog";
import { llmProviderEndpoints } from "./meta";
import { defineEngine } from "../engine";

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

interface ModelList {
  data?: ModelEntry[];
  models?: ModelEntry[];
}
interface ModelEntry {
  id?: string;
  name?: string;
  model?: string;
}

const langName = (code: string) => langListOpposite[code] ?? code;
const trimSlash = (endpoint: string) => endpoint.replace(/\/$/, "");
const authHeaders = (apiKey: string): Record<string, string> =>
  apiKey ? { Authorization: `Bearer ${apiKey}` } : {};

// warn once per config, not on every hover
let lastWarnConfigKey: string | null = null;

// expected reply "<iso code>\t<translation>"; a reply ignoring the format is taken whole as the translation
export function parseLlmReply(raw: string): { targetText: string; detectedLang: string } {
  const { lang, text } =
    /^(?<lang>[a-zA-Z]{2,3}(?:-[a-zA-Z]{2,4})?)[\t\n]+(?<text>[\s\S]+)$/.exec(raw)?.groups ?? {};
  if (lang === undefined || text === undefined) return { targetText: raw, detectedLang: "" };
  return { targetText: text.trim(), detectedLang: lang.toLowerCase() };
}

export default defineEngine(async (text, sourceLang, targetLang, { engineConfig }) => {
  const endpoint = getFieldValue(engineConfig, "localLlm", "endpoint");
  const model = getFieldValue(engineConfig, "localLlm", "model");
  const apiKey = getFieldValue(engineConfig, "localLlm", "apiKey");
  if (!endpoint || !model) {
    const key = `${endpoint}|${model}`;
    if (lastWarnConfigKey !== key) {
      console.warn("[localLlm] Skipping translation: API endpoint or model not configured");
      lastWarnConfigKey = key;
    }
    return undefined;
  }

  const target = langName(targetLang);
  const instruction =
    sourceLang && sourceLang !== "auto"
      ? `Translate from ${langName(sourceLang)} to ${target}.`
      : `Translate to ${target}.`;

  const res = await ky
    .post(`${trimSlash(endpoint)}/chat/completions`, {
      headers: { "Content-Type": "application/json", ...authHeaders(apiKey) },
      timeout: 60000,
      retry: 0,
      json: {
        model,
        messages: [
          {
            role: "system",
            content: "Reply only: source ISO 639-1 code, a tab, then the translation.",
          },
          { role: "user", content: `${instruction}\n<text>\n${text}\n</text>` },
        ],
        temperature: 0.1,
      },
    })
    .json<ChatCompletion>();

  const raw = res?.choices?.[0]?.message?.content?.trim() ?? "";
  return { ...parseLlmReply(raw), transliteration: "" };
});

// accepts OpenAI {data:[{id}]}, Ollama {models:[{name}]} and {model} shapes
export async function fetchLlmModels(opts: {
  provider: string;
  endpoint: string;
  apiKey: string;
}): Promise<string[]> {
  const endpoint = opts.endpoint || llmProviderEndpoints[opts.provider] || "";
  if (!endpoint) throw new Error("LLM API endpoint is not set");
  const res = await ky
    .get(`${trimSlash(endpoint)}/models`, {
      headers: authHeaders(opts.apiKey),
      timeout: 15000,
      retry: 0,
    })
    .json<ModelList>();
  return (res.data ?? res.models ?? [])
    .map((m) => m.id || m.name || m.model)
    .filter((id): id is string => Boolean(id));
}
