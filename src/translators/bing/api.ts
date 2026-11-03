import { sendApiRequest, type ApiRequest } from "../apiRequest";
import { bingLangCode } from "./web";
import { getFieldValue } from "../catalog";
import { defineEngine, type EngineResponse } from "../engine";
import { required } from "../parse";

// https://learn.microsoft.com/azure/ai-services/translator/text-translation/reference/v3/translate
export const microsoftUrl = "https://api.cognitive.microsofttranslator.com/translate";

// bingLangCode encodes "auto" as "auto-detect"; the API detects when `from` is left out
const givenSource = (sourceLang: string) =>
  sourceLang === "auto" || sourceLang === "auto-detect" ? undefined : sourceLang;

export function buildMicrosoftRequest(
  text: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string,
  region: string,
): ApiRequest {
  const from = givenSource(sourceLang);
  return {
    method: "post",
    url: microsoftUrl,
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
      ...(region && { "Ocp-Apim-Subscription-Region": region }),
    },
    searchParams: { "api-version": "3.0", to: targetLang, ...(from && { from }) },
    json: [{ Text: text }],
  };
}

type MicrosoftResponse = {
  detectedLanguage?: { language: string };
  translations?: { text: string }[];
}[];

export function parseMicrosoftResponse(res: MicrosoftResponse, sourceLang: string): EngineResponse {
  const item = required(res[0], "microsoft result");
  return {
    targetText: required(item.translations?.[0], "microsoft translation").text,
    detectedLang: item.detectedLanguage?.language ?? givenSource(sourceLang),
    transliteration: "",
  };
}

export default defineEngine(async (text, sourceLang, targetLang, { engineConfig }) => {
  const request = buildMicrosoftRequest(
    text,
    sourceLang,
    targetLang,
    getFieldValue(engineConfig, "bing", "apiKey"),
    getFieldValue(engineConfig, "bing", "region"),
  );
  return parseMicrosoftResponse(await sendApiRequest<MicrosoftResponse>(request), sourceLang);
}, bingLangCode);
