import { sendApiRequest, type ApiRequest } from "../apiRequest";
import { getFieldValue } from "../catalog";
import { defineEngine, type EngineResponse } from "../engine";
import { required } from "../parse";

// https://developers.kakao.com/docs/latest/ko/translate/dev-guide
export const kakaoLangCode: Record<string, string> = {
  ko: "kr",
  en: "en",
  ja: "jp",
  "zh-CN": "cn",
  vi: "vi",
  id: "id",
  ar: "ar",
  bn: "bn",
  de: "de",
  es: "es",
  fr: "fr",
  hi: "hi",
  it: "it",
  ms: "ms",
  nl: "nl",
  pt: "pt",
  ru: "ru",
  th: "th",
  tr: "tr",
};
export const kakaoTranslateUrl = "https://dapi.kakao.com/v2/translation/translate";
export const kakaoDetectUrl = "https://dapi.kakao.com/v3/translation/language/detect";

const authHeaders = (apiKey: string) => ({ Authorization: `KakaoAK ${apiKey}` });

export const buildKakaoDetectRequest = (text: string, apiKey: string): ApiRequest => ({
  method: "get",
  url: kakaoDetectUrl,
  headers: authHeaders(apiKey),
  searchParams: { query: text },
});

interface KakaoDetectResponse {
  language_info?: { code: string; confidence?: number }[];
}

export const parseKakaoDetectResponse = (res: KakaoDetectResponse): string =>
  required(res.language_info?.[0], "kakao language").code;

export function buildKakaoTranslateRequest(
  text: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string,
): ApiRequest {
  return {
    method: "get",
    url: kakaoTranslateUrl,
    headers: authHeaders(apiKey),
    searchParams: { query: text, src_lang: sourceLang, target_lang: targetLang },
  };
}

// one entry per input line, each a list of sentences
interface KakaoTranslateResponse {
  translated_text?: string[][];
}

export function parseKakaoTranslateResponse(
  res: KakaoTranslateResponse,
  sourceLang: string,
): EngineResponse {
  const lines = required(res.translated_text, "kakao translated_text");
  return {
    targetText: lines.map((sentences) => sentences.join(" ")).join("\n"),
    detectedLang: sourceLang,
    transliteration: "",
  };
}

export default defineEngine(async (text, sourceLang, targetLang, { engineConfig }) => {
  const apiKey = getFieldValue(engineConfig, "kakao", "apiKey");
  // src_lang is mandatory, so "auto" goes through the detect endpoint first
  const source =
    sourceLang === "auto"
      ? parseKakaoDetectResponse(
          await sendApiRequest<KakaoDetectResponse>(buildKakaoDetectRequest(text, apiKey)),
        )
      : sourceLang;
  const request = buildKakaoTranslateRequest(text, source, targetLang, apiKey);
  return parseKakaoTranslateResponse(await sendApiRequest<KakaoTranslateResponse>(request), source);
}, kakaoLangCode);
