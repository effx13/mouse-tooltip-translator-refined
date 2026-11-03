import { sendApiRequest, type ApiRequest } from "../apiRequest";
import { getFieldValue } from "../catalog";
import { defineEngine, type EngineResponse } from "../engine";
import { required } from "../parse";

// https://docs.libretranslate.com/guides/api_usage/
export const libreLangCode: Record<string, string> = {
  "zh-CN": "zh",
  "zh-TW": "zt",
  iw: "he",
};

const givenSource = (sourceLang: string) => (sourceLang === "auto" ? undefined : sourceLang);

export function buildLibreTranslateRequest(
  text: string,
  sourceLang: string,
  targetLang: string,
  serverUrl: string,
  apiKey: string,
): ApiRequest {
  return {
    method: "post",
    url: `${serverUrl.replace(/\/+$/, "")}/translate`,
    headers: {},
    json: {
      q: text,
      source: sourceLang,
      target: targetLang,
      format: "text",
      ...(apiKey && { api_key: apiKey }),
    },
  };
}

interface LibreTranslateResponse {
  translatedText?: string;
  detectedLanguage?: { language: string; confidence?: number };
}

export function parseLibreTranslateResponse(
  res: LibreTranslateResponse,
  sourceLang: string,
): EngineResponse {
  return {
    targetText: required(res.translatedText, "libretranslate translatedText"),
    detectedLang: res.detectedLanguage?.language ?? givenSource(sourceLang),
    transliteration: "",
  };
}

export default defineEngine(async (text, sourceLang, targetLang, { engineConfig }) => {
  const request = buildLibreTranslateRequest(
    text,
    sourceLang,
    targetLang,
    getFieldValue(engineConfig, "libreTranslate", "url"),
    getFieldValue(engineConfig, "libreTranslate", "apiKey"),
  );
  return parseLibreTranslateResponse(
    await sendApiRequest<LibreTranslateResponse>(request),
    sourceLang,
  );
}, libreLangCode);
