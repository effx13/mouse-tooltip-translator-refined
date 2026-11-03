import { http } from "../http";
import { defineEngine } from "../engine";
import { required } from "../parse";

// https://github.com/akl7777777/bob-plugin-akl-deepl-free-translate/blob/fc8460a8e24776e4e95961fc4607f77994f6b2ab/src/main.js#L8
// pt-BR / pt-PT / zh-TW have no entry and are rejected by deepl (the pair cooldown case)
const deeplLangCode: Record<string, string> = {
  auto: "auto",
  ar: "AR",
  bg: "BG",
  cs: "CS",
  da: "DA",
  de: "DE",
  el: "EL",
  en: "EN",
  es: "ES",
  et: "ET",
  fi: "FI",
  fr: "FR",
  hu: "HU",
  id: "ID",
  it: "IT",
  ja: "JA",
  ko: "KO",
  lt: "LT",
  lv: "LV",
  no: "NB",
  nl: "NL",
  pl: "PL",
  pt: "PT",
  ro: "RO",
  ru: "RU",
  sk: "SK",
  sl: "SL",
  sv: "SV",
  tr: "TR",
  uk: "UK",
  "zh-CN": "ZH",
};
const deeplBaseUrl = "https://www2.deepl.com/jsonrpc";

interface DeeplResponse {
  result?: { texts: { text: string }[]; lang: string };
}

function getTimeStamp(iCount: number): number {
  const ts = Date.now();
  if (iCount === 0) return ts;
  const n = iCount + 1;
  return ts - (ts % n) + n;
}

// deepl fingerprints the exact spacing after "method"
export function buildRequestBody(
  text: string,
  sourceLang: string,
  targetLang: string,
  id: number,
): string {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    method: "LMT_handle_texts",
    params: {
      splitting: "newlines",
      lang: { source_lang_user_selected: sourceLang, target_lang: targetLang },
      texts: [{ text, requestAlternatives: 3 }],
      timestamp: getTimeStamp(text.split("i").length - 1),
    },
    id,
  });
  const spaced = (id + 5) % 29 === 0 || (id + 3) % 13 === 0 ? '"method" : "' : '"method": "';
  return body.replace('"method":"', spaced);
}

export default defineEngine(async (text, sourceLang, targetLang) => {
  const id = (Math.floor(Math.random() * 99999) + 100000) * 1000;
  const res = await http
    .post(deeplBaseUrl, {
      headers: { "Content-Type": "application/json" },
      body: buildRequestBody(text, sourceLang, targetLang, id),
    })
    .json<DeeplResponse>();
  if (!res.result) return undefined;
  return {
    targetText: required(res.result.texts[0], "deepl text").text,
    detectedLang: res.result.lang,
    transliteration: "",
  };
}, deeplLangCode);
