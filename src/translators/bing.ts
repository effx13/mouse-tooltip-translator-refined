import ky from "ky";
import { defineEngine } from "./engine";

const bingLangCode: Record<string, string> = {
  auto: "auto-detect",
  af: "af",
  sq: "sq",
  am: "am",
  ar: "ar",
  hy: "hy",
  as: "as",
  az: "az",
  ba: "ba",
  eu: "eu",
  bn: "bn",
  bho: "bho",
  bs: "bs",
  bg: "bg",
  yue: "yue",
  ca: "ca",
  ny: "nya",
  "zh-CN": "zh-Hans",
  "zh-TW": "zh-Hant",
  hr: "hr",
  cs: "cs",
  da: "da",
  dv: "dv",
  doi: "doi",
  nl: "nl",
  en: "en",
  et: "et",
  fj: "fj",
  fil: "fil",
  fi: "fi",
  fr: "fr",
  "fr-FR": "fr",
  "fr-CA": "fr-CA",
  gl: "gl",
  lg: "lug",
  ka: "ka",
  de: "de",
  el: "el",
  gu: "gu",
  ht: "ht",
  ha: "ha",
  iw: "he",
  hi: "hi",
  hmn: "mww",
  hu: "hu",
  is: "is",
  ig: "ig",
  id: "id",
  ga: "ga",
  it: "it",
  ja: "ja",
  kn: "kn",
  kk: "kk",
  km: "km",
  rw: "rw",
  gom: "gom",
  ko: "ko",
  ku: "ku",
  ckb: "ku",
  ky: "ky",
  lo: "lo",
  lv: "lv",
  ln: "ln",
  lt: "lt",
  mk: "mk",
  mai: "mai",
  mg: "mg",
  ms: "ms",
  ml: "ml",
  mt: "mt",
  mi: "mi",
  mr: "mr",
  mn: "mn-Cyrl",
  my: "my",
  ne: "ne",
  nso: "nso",
  no: "nb",
  or: "or",
  ps: "ps",
  fa: "fa",
  // Dari: bing calls it prs and rejects the raw fa-AF
  "fa-AF": "prs",
  pl: "pl",
  pt: "pt",
  "pt-PT": "pt-PT",
  "pt-BR": "pt",
  pa: "pa",
  ro: "ro",
  rn: "run",
  ru: "ru",
  sm: "sm",
  sr: "sr-Cyrl",
  st: "st",
  sn: "sn",
  sd: "sd",
  si: "si",
  sk: "sk",
  sl: "sl",
  so: "so",
  es: "es",
  sw: "sw",
  sv: "sv",
  ta: "ta",
  tt: "tt",
  te: "te",
  th: "th",
  ti: "ti",
  tn: "tn",
  tr: "tr",
  tk: "tk",
  uk: "uk",
  ur: "ur",
  ug: "ug",
  uz: "uz",
  vi: "vi",
  cy: "cy",
  xh: "xh",
  yo: "yo",
  yua: "yua",
  zu: "zu",
};

const urls = {
  global: {
    translate: "https://www.bing.com/ttranslatev3",
    token: "https://www.bing.com/translator",
  },
  china: { translate: "https://cn.bing.com/ttranslatev3", token: "https://cn.bing.com/translator" },
};

interface BingToken {
  IG: string;
  IID: string;
  key: number;
  token: string;
  tokenTs: number;
  tokenExpiryInterval: number;
  count: number;
  cookie: string;
}

type BingResponse = [
  { detectedLanguage: { language: string }; translations: { text: string }[] },
  { inputTransliteration?: string }?,
];

// only set by the tests: the service worker uses navigator.userAgent
export const bingConfig = { customAgent: "" };

let accessToken: BingToken | undefined;
// switched on when only cn.bing.com is reachable (#50)
let useChina = false;

const userAgent = () =>
  bingConfig.customAgent || (typeof navigator !== "undefined" ? navigator.userAgent : "");

// https://github.com/plainheart/bing-translate-api/blob/dd0319e1046d925fa4cd4850e2323c5932de837a/src/index.js#L42
async function fetchBingToken(tokenUrl: string): Promise<BingToken> {
  const response = await ky(tokenUrl, { headers: { "User-Agent": userAgent() } });
  const data = await response.text();
  const setCookie = response.headers.get("set-cookie");
  const setCookies = response.headers.getSetCookie?.() ?? (setCookie ? [setCookie] : []);
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  const IG = data.match(/IG:"([^"]+)"/)![1]!;
  const IID = data.match(/data-iid="([^"]+)"/)![1]!;
  const [key, token, interval] = JSON.parse(
    data.match(/params_AbusePreventionHelper\s?=\s?([^\]]+\])/)![1]!,
  ) as [number, string, number];
  return {
    IG,
    IID,
    key,
    token,
    tokenTs: Date.now(),
    tokenExpiryInterval: interval,
    count: 0,
    cookie,
  };
}

async function getBingAccessToken(): Promise<BingToken | undefined> {
  if (accessToken && Date.now() - accessToken.tokenTs <= accessToken.tokenExpiryInterval) {
    return accessToken;
  }
  // global host first, then the China mirror which stays reachable behind the GFW (#50)
  for (const china of [false, true]) {
    try {
      accessToken = await fetchBingToken(china ? urls.china.token : urls.global.token);
      useChina = china;
      return accessToken;
    } catch (error) {
      console.log(error);
    }
  }
  return undefined;
}

export default defineEngine(async (text, sourceLang, targetLang) => {
  const auth = await getBingAccessToken();
  if (!auth) throw new Error("bing token unavailable");
  const host = useChina ? urls.china : urls.global;

  const res = await ky
    .post(host.translate, {
      headers: {
        "User-Agent": userAgent(),
        Referer: host.token,
        ...(auth.cookie ? { Cookie: auth.cookie } : {}),
      },
      searchParams: {
        IG: auth.IG,
        IID: auth.IID ? `${auth.IID}.${auth.count++}` : "",
        isVertical: "1",
      },
      body: new URLSearchParams({
        text,
        fromLang: sourceLang,
        to: targetLang,
        token: auth.token,
        key: String(auth.key),
      }),
    })
    .json<BingResponse>();

  if (!res?.[0]) return undefined;
  return {
    targetText: res[0].translations[0]!.text,
    detectedLang: res[0].detectedLanguage.language,
    transliteration: res[1]?.inputTransliteration ?? "",
  };
}, bingLangCode);
