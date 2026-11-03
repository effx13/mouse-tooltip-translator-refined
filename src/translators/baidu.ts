import ky from "ky";
import { defineEngine } from "./engine";

const baseUrl = "https://fanyi.baidu.com/transapi";
const baiduLangCode: Record<string, string> = {
  en: "en",
  ja: "jp",
  ko: "kor",
  fr: "fra",
  es: "spa",
  th: "th",
  ar: "ara",
  ru: "ru",
  pt: "pt",
  de: "de",
  it: "it",
  el: "el",
  nl: "nl",
  pl: "pl",
  bg: "bul",
  et: "est",
  da: "dan",
  fi: "fin",
  cs: "cs",
  ro: "rom",
  sl: "slo",
  sv: "swe",
  hu: "hu",
  vi: "vie",
  "zh-CN": "zh",
  "zh-TW": "cht",
};

interface BaiduResponse {
  data: { result: ([unknown, string] | null)[] }[];
  from: string;
}

export default defineEngine(async (text, sourceLang, targetLang) => {
  const res = await ky
    .post(baseUrl, {
      searchParams: { from: sourceLang, to: targetLang },
      body: new URLSearchParams({
        from: sourceLang,
        to: targetLang,
        query: text,
        source: "txt",
        isAi: "false",
        sseStartTime: String(Date.now()),
        reference: "",
        corpusIds: "",
        needPhonetic: "false",
        domain: "common",
        detectLang: "",
        milliTimestamp: String(Date.now()),
      }),
    })
    .json<BaiduResponse>();
  const targetText = res.data[0]!.result.map((item) => item?.[1])
    .filter(Boolean)
    .join(" ");
  return { targetText, detectedLang: res.from, transliteration: "" };
}, baiduLangCode);
