import { hmac } from "@noble/hashes/hmac.js";
import { md5 } from "@noble/hashes/legacy.js";
import ky from "ky";
import { defineEngine } from "./engine";

// https://github.com/PinMIlk/nodepapago
const papagoLangCode: Record<string, string> = {
  ar: "ar",
  en: "en",
  fa: "fa",
  fr: "fr",
  de: "de",
  hi: "hi",
  id: "id",
  it: "it",
  ja: "ja",
  ko: "ko",
  my: "mm",
  pt: "pt",
  ru: "ru",
  es: "es",
  th: "th",
  vi: "vi",
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
};
const urlTranslate = "https://papago.naver.com/apis/n2mt/translate";
const urlDect = "https://papago.naver.com/apis/langs/dect";
const mainUrl = "https://papago.naver.com/";

let version = "";

async function getVersion(): Promise<string> {
  const page = await ky(mainUrl).text();
  const script = await ky(`${mainUrl}main.${page.match(/"\/main.([^"]+)"/)![1]}`).text();
  return `v1.${script.match(/"v1.([^"]+)"/)![1]}`;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

export function signPapago(key: string, uuid: string, url: string, time: number): string {
  const encoder = new TextEncoder();
  return toBase64(hmac(md5, encoder.encode(key), encoder.encode(`${uuid}\n${url}\n${time}`)));
}

async function getOptionsAndUuid(url: string) {
  const uuid = crypto.randomUUID();
  const time = Date.now();
  version ||= await getVersion();
  return {
    headers: {
      Authorization: `PPG ${uuid}:${signPapago(version, uuid, url, time)}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Timestamp: String(time),
    },
    uuid,
  };
}

export default defineEngine(async (text, sourceLang, targetLang) => {
  if (sourceLang === "auto") {
    const { headers } = await getOptionsAndUuid(urlDect);
    const { langCode } = await ky
      .post(urlDect, { searchParams: { query: text }, headers })
      .json<{ langCode: string }>();
    sourceLang = langCode;
  }
  const { headers, uuid } = await getOptionsAndUuid(urlTranslate);
  const res = await ky
    .post(urlTranslate, {
      searchParams: {
        deviceId: uuid,
        locale: "ko",
        dict: "true",
        dictDisplay: "30",
        honorific: "false",
        instant: "false",
        paging: "false",
        source: sourceLang,
        target: targetLang,
        text,
      },
      headers,
    })
    .json<{ translatedText: string; srcLangType: string }>();
  return { targetText: res.translatedText, detectedLang: res.srcLangType, transliteration: "" };
}, papagoLangCode);
