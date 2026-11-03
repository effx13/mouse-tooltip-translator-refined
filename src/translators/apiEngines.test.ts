import {
  buildMicrosoftRequest,
  microsoftUrl,
  parseMicrosoftResponse,
} from "@/translators/bing/api";
import {
  buildDeeplApiRequest,
  fromDeeplLang,
  parseDeeplApiResponse,
  toDeeplSource,
  toDeeplTarget,
} from "@/translators/deepl/api";
import { buildGoogleCloudRequest, parseGoogleCloudResponse } from "@/translators/google/api";
import {
  buildKakaoDetectRequest,
  buildKakaoTranslateRequest,
  parseKakaoDetectResponse,
  parseKakaoTranslateResponse,
} from "@/translators/kakao";
import {
  buildLibreTranslateRequest,
  parseLibreTranslateResponse,
} from "@/translators/libreTranslate";
import {
  buildPapagoApiRequest,
  papagoApiUrl,
  parsePapagoApiResponse,
} from "@/translators/papago/api";

describe("DeepL API", () => {
  test("free keys go to api-free, pro keys to api", () => {
    expect(buildDeeplApiRequest("hi", "auto", "ko", "abc:fx").url).toBe(
      "https://api-free.deepl.com/v2/translate",
    );
    expect(buildDeeplApiRequest("hi", "auto", "ko", "abc").url).toBe(
      "https://api.deepl.com/v2/translate",
    );
  });

  test("request carries the auth header and DeepL language codes", () => {
    const request = buildDeeplApiRequest("hi", "zh-CN", "pt-BR", "k:fx");
    expect(request).toMatchObject({
      method: "post",
      headers: { Authorization: "DeepL-Auth-Key k:fx" },
      json: { text: ["hi"], source_lang: "ZH", target_lang: "PT-BR" },
    });
    expect(buildDeeplApiRequest("hi", "auto", "en", "k").json).toEqual({
      text: ["hi"],
      target_lang: "EN-US",
    });
  });

  test.each([
    ["en", "EN-US"],
    ["pt", "PT-BR"],
    ["pt-PT", "PT-PT"],
    ["zh-CN", "ZH-HANS"],
    ["zh-TW", "ZH-HANT"],
    ["no", "NB"],
    ["ko", "KO"],
  ])("target %s -> %s", (lang, code) => expect(toDeeplTarget(lang)).toBe(code));

  test("source codes drop the variant and detected codes map back", () => {
    expect(toDeeplSource("pt-BR")).toBe("PT");
    expect(toDeeplSource("auto")).toBeUndefined();
    expect(fromDeeplLang("ZH")).toBe("zh-CN");
    expect(fromDeeplLang("EN")).toBe("en");
  });

  test("response parsing", () => {
    expect(
      parseDeeplApiResponse({ translations: [{ text: "안녕", detected_source_language: "EN" }] }),
    ).toEqual({ targetText: "안녕", detectedLang: "en", transliteration: "" });
    expect(() => parseDeeplApiResponse({})).toThrow("deepl translation is missing");
  });
});

describe("Papago (Naver Cloud)", () => {
  test("request", () => {
    expect(buildPapagoApiRequest("hi", "auto", "ko", "id", "secret")).toEqual({
      method: "post",
      url: papagoApiUrl,
      headers: { "X-NCP-APIGW-API-KEY-ID": "id", "X-NCP-APIGW-API-KEY": "secret" },
      json: { source: "auto", target: "ko", text: "hi" },
    });
  });

  test("response", () => {
    expect(
      parsePapagoApiResponse({
        message: { result: { srcLangType: "en", translatedText: "안녕" } },
      }),
    ).toEqual({ targetText: "안녕", detectedLang: "en", transliteration: "" });
    expect(() => parsePapagoApiResponse({ message: {} })).toThrow("papago result is missing");
  });
});

describe("Google Cloud Translation v2", () => {
  test("request puts the key in the query and asks for plain text", () => {
    expect(buildGoogleCloudRequest("hi", "auto", "ko", "AIza")).toEqual({
      method: "post",
      url: "https://translation.googleapis.com/language/translate/v2",
      headers: {},
      searchParams: { key: "AIza" },
      json: { q: "hi", target: "ko", format: "text" },
    });
    expect(buildGoogleCloudRequest("hi", "en", "ko", "AIza").json).toMatchObject({ source: "en" });
  });

  test("response", () => {
    const res = {
      data: { translations: [{ translatedText: "안녕", detectedSourceLanguage: "en" }] },
    };
    expect(parseGoogleCloudResponse(res, "auto").detectedLang).toBe("en");
    const given = { data: { translations: [{ translatedText: "안녕" }] } };
    expect(parseGoogleCloudResponse(given, "fr")).toEqual({
      targetText: "안녕",
      detectedLang: "fr",
      transliteration: "",
    });
  });
});

describe("Microsoft Translator", () => {
  test("request sends key and region, and leaves out from for auto-detect", () => {
    expect(buildMicrosoftRequest("hi", "auto-detect", "ko", "key", "eastus")).toEqual({
      method: "post",
      url: microsoftUrl,
      headers: { "Ocp-Apim-Subscription-Key": "key", "Ocp-Apim-Subscription-Region": "eastus" },
      searchParams: { "api-version": "3.0", to: "ko" },
      json: [{ Text: "hi" }],
    });
    const request = buildMicrosoftRequest("hi", "en", "zh-Hans", "key", "");
    expect(request.headers).toEqual({ "Ocp-Apim-Subscription-Key": "key" });
    expect(request.searchParams).toEqual({ "api-version": "3.0", to: "zh-Hans", from: "en" });
  });

  test("response", () => {
    expect(
      parseMicrosoftResponse(
        [{ detectedLanguage: { language: "en" }, translations: [{ text: "안녕" }] }],
        "auto-detect",
      ),
    ).toEqual({ targetText: "안녕", detectedLang: "en", transliteration: "" });
    expect(() => parseMicrosoftResponse([], "en")).toThrow("microsoft result is missing");
  });
});

describe("Kakao i translation", () => {
  test("requests use KakaoAK auth", () => {
    expect(buildKakaoTranslateRequest("hi", "en", "kr", "rest")).toEqual({
      method: "get",
      url: "https://dapi.kakao.com/v2/translation/translate",
      headers: { Authorization: "KakaoAK rest" },
      searchParams: { query: "hi", src_lang: "en", target_lang: "kr" },
    });
    expect(buildKakaoDetectRequest("hi", "rest")).toMatchObject({
      url: "https://dapi.kakao.com/v3/translation/language/detect",
      searchParams: { query: "hi" },
    });
  });

  test("responses", () => {
    expect(parseKakaoDetectResponse({ language_info: [{ code: "jp", confidence: 0.9 }] })).toBe(
      "jp",
    );
    expect(
      parseKakaoTranslateResponse({ translated_text: [["Hello.", "Nice."], ["Bye."]] }, "kr"),
    ).toEqual({ targetText: "Hello. Nice.\nBye.", detectedLang: "kr", transliteration: "" });
    expect(() => parseKakaoTranslateResponse({}, "kr")).toThrow("kakao translated_text is missing");
  });
});

describe("LibreTranslate", () => {
  test("request trims the server URL and adds the key only when set", () => {
    expect(buildLibreTranslateRequest("hi", "auto", "ko", "https://lt.example/", "")).toEqual({
      method: "post",
      url: "https://lt.example/translate",
      headers: {},
      json: { q: "hi", source: "auto", target: "ko", format: "text" },
    });
    expect(buildLibreTranslateRequest("hi", "en", "ko", "http://lt", "k").json).toMatchObject({
      api_key: "k",
    });
  });

  test("response", () => {
    expect(
      parseLibreTranslateResponse(
        { translatedText: "안녕", detectedLanguage: { language: "en", confidence: 90 } },
        "auto",
      ),
    ).toEqual({ targetText: "안녕", detectedLang: "en", transliteration: "" });
    expect(() => parseLibreTranslateResponse({}, "en")).toThrow(
      "libretranslate translatedText is missing",
    );
  });
});
