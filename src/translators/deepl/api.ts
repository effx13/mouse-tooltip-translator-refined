import { sendApiRequest, type ApiRequest } from "../apiRequest";
import { getFieldValue } from "../catalog";
import { defineEngine, type EngineResponse } from "../engine";
import { required } from "../parse";

// https://developers.deepl.com/docs/getting-started/supported-languages
const sourceAlias: Record<string, string> = { no: "NB", iw: "HE" };
const targetAlias: Record<string, string> = {
  en: "EN-US",
  pt: "PT-BR",
  "pt-BR": "PT-BR",
  "pt-PT": "PT-PT",
  "zh-CN": "ZH-HANS",
  "zh-TW": "ZH-HANT",
  no: "NB",
  iw: "HE",
};
const detectedAlias: Record<string, string> = { ZH: "zh-CN", NB: "no", HE: "iw" };

const baseLang = (lang: string) => lang.split("-")[0] ?? lang;

export const toDeeplSource = (lang: string) =>
  lang === "auto" ? undefined : (sourceAlias[lang] ?? baseLang(lang).toUpperCase());
export const toDeeplTarget = (lang: string) => targetAlias[lang] ?? baseLang(lang).toUpperCase();
export const fromDeeplLang = (code: string) => detectedAlias[code] ?? code.toLowerCase();

// free-plan keys end in ":fx" and have their own host
export const deeplApiUrl = (apiKey: string) =>
  apiKey.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";

export function buildDeeplApiRequest(
  text: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string,
): ApiRequest {
  const source = toDeeplSource(sourceLang);
  return {
    method: "post",
    url: deeplApiUrl(apiKey),
    headers: { Authorization: `DeepL-Auth-Key ${apiKey}` },
    json: {
      text: [text],
      target_lang: toDeeplTarget(targetLang),
      ...(source && { source_lang: source }),
    },
  };
}

interface DeeplApiResponse {
  translations?: { text: string; detected_source_language?: string }[];
}

export function parseDeeplApiResponse(res: DeeplApiResponse): EngineResponse {
  const translation = required(res.translations?.[0], "deepl translation");
  return {
    targetText: translation.text,
    detectedLang: fromDeeplLang(translation.detected_source_language ?? ""),
    transliteration: "",
  };
}

// language codes are mapped here: the source and target tables differ (EN vs EN-US)
export default defineEngine(async (text, sourceLang, targetLang, { engineConfig }) => {
  const apiKey = getFieldValue(engineConfig, "deepl", "apiKey");
  const request = buildDeeplApiRequest(text, sourceLang, targetLang, apiKey);
  return parseDeeplApiResponse(await sendApiRequest<DeeplApiResponse>(request));
});
