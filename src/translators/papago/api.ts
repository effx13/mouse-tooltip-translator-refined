import { sendApiRequest, type ApiRequest } from "../apiRequest";
import { getFieldValue } from "../catalog";
import { defineEngine, type EngineResponse } from "../engine";
import { papagoLangCode } from "./web";
import { required } from "../parse";

// https://api.ncloud-docs.com/docs/ai-naver-papagonmt-translation
export const papagoApiUrl = "https://papago.apigw.ntruss.com/nmt/v1/translation";

export function buildPapagoApiRequest(
  text: string,
  sourceLang: string,
  targetLang: string,
  clientId: string,
  clientSecret: string,
): ApiRequest {
  return {
    method: "post",
    url: papagoApiUrl,
    headers: { "X-NCP-APIGW-API-KEY-ID": clientId, "X-NCP-APIGW-API-KEY": clientSecret },
    json: { source: sourceLang, target: targetLang, text },
  };
}

interface PapagoApiResponse {
  message?: { result?: { srcLangType?: string; translatedText?: string } };
}

export function parsePapagoApiResponse(res: PapagoApiResponse): EngineResponse {
  const result = required(res.message?.result, "papago result");
  return {
    targetText: required(result.translatedText, "papago translatedText"),
    detectedLang: result.srcLangType,
    transliteration: "",
  };
}

export default defineEngine(
  async (text, sourceLang, targetLang, { engineConfig }) => {
    const request = buildPapagoApiRequest(
      text,
      sourceLang,
      targetLang,
      getFieldValue(engineConfig, "papago", "clientId"),
      getFieldValue(engineConfig, "papago", "clientSecret"),
    );
    return parsePapagoApiResponse(await sendApiRequest<PapagoApiResponse>(request));
  },
  { ...papagoLangCode, auto: "auto" },
);
