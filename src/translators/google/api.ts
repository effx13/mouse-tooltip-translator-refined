import { sendApiRequest, type ApiRequest } from "../apiRequest";
import { getFieldValue } from "../catalog";
import { defineEngine, type EngineResponse } from "../engine";
import { required } from "../parse";

// https://cloud.google.com/translate/docs/reference/rest/v2/translate
export const googleCloudUrl = "https://translation.googleapis.com/language/translate/v2";

const givenSource = (sourceLang: string) => (sourceLang === "auto" ? undefined : sourceLang);

export function buildGoogleCloudRequest(
  text: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string,
): ApiRequest {
  const source = givenSource(sourceLang);
  return {
    method: "post",
    url: googleCloudUrl,
    headers: {},
    searchParams: { key: apiKey },
    json: { q: text, target: targetLang, format: "text", ...(source && { source }) },
  };
}

interface GoogleCloudResponse {
  data?: { translations?: { translatedText: string; detectedSourceLanguage?: string }[] };
}

export function parseGoogleCloudResponse(
  res: GoogleCloudResponse,
  sourceLang: string,
): EngineResponse {
  const translation = required(res.data?.translations?.[0], "google translation");
  return {
    targetText: translation.translatedText,
    detectedLang: translation.detectedSourceLanguage ?? givenSource(sourceLang),
    transliteration: "",
  };
}

export default defineEngine(async (text, sourceLang, targetLang, { engineConfig }) => {
  const apiKey = getFieldValue(engineConfig, "google", "apiKey");
  const request = buildGoogleCloudRequest(text, sourceLang, targetLang, apiKey);
  return parseGoogleCloudResponse(await sendApiRequest<GoogleCloudResponse>(request), sourceLang);
});
