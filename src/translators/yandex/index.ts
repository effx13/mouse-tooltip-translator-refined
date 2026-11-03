import { http } from "../http";
import { defineEngine } from "../engine";

// https://github.com/vtosters/lite/blob/cf17ed64c759d366ae7121dc61c4328205963ed4/app/src/main/java/ru/vtosters/lite/translators/YandexTranslator.java#L35
const yandexLangCode: Record<string, string> = {
  af: "af",
  sq: "sq",
  am: "am",
  ar: "ar",
  hy: "hy",
  az: "az",
  eu: "eu",
  be: "be",
  bn: "bn",
  bs: "bs",
  bg: "bg",
  ca: "ca",
  hr: "hr",
  cs: "cs",
  da: "da",
  nl: "nl",
  en: "en",
  eo: "eo",
  et: "et",
  fi: "fi",
  fr: "fr",
  gl: "gl",
  ka: "ka",
  de: "de",
  el: "el",
  gu: "gu",
  ht: "ht",
  hi: "hi",
  hu: "hu",
  is: "is",
  id: "id",
  ga: "ga",
  it: "it",
  ja: "ja",
  kn: "kn",
  kk: "kk",
  km: "km",
  ko: "ko",
  ky: "ky",
  lo: "lo",
  la: "la",
  lv: "lv",
  lt: "lt",
  lb: "lb",
  mk: "mk",
  mg: "mg",
  ms: "ms",
  ml: "ml",
  mt: "mt",
  mi: "mi",
  mr: "mr",
  mn: "mn",
  my: "my",
  ne: "ne",
  no: "no",
  fa: "fa",
  pl: "pl",
  pt: "pt",
  pa: "pa",
  ro: "ro",
  ru: "ru",
  gd: "gd",
  sr: "sr",
  si: "si",
  sk: "sk",
  sl: "sl",
  es: "es",
  su: "su",
  sw: "sw",
  sv: "sv",
  tg: "tg",
  ta: "ta",
  te: "te",
  th: "th",
  tr: "tr",
  uk: "uk",
  ur: "ur",
  uz: "uz",
  vi: "vi",
  cy: "cy",
  xh: "xh",
  yi: "yi",

  tl: "tl",
  // the language list offers Filipino as fil, yandex only knows tl
  fil: "tl",
  iw: "he",
  jw: "jv",
  "zh-CN": "zh",
};
const mainUrl = "https://translate.yandex.net/api/v1/tr.json/translate";

interface YandexResponse {
  code: number | string;
  text: string[];
  lang: string;
}

export default defineEngine(async (text, sourceLang, targetLang) => {
  const uuid = crypto.randomUUID().replaceAll("-", "");
  const lang = sourceLang === "auto" ? targetLang : `${sourceLang}-${targetLang}`;
  const res = await http
    .post(mainUrl, {
      searchParams: { id: `${uuid}-0-0`, srv: "android" },
      body: new URLSearchParams({ lang, text }),
    })
    .json<YandexResponse>();
  if (String(res.code) !== "200") return undefined;
  return { targetText: res.text[0], detectedLang: res.lang.split("-")[0], transliteration: "" };
}, yandexLangCode);
