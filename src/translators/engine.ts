import { browser } from "wxt/browser";
import type { TranslateResult } from "@/utils/messaging";
import type { Settings } from "@/utils/settings";

export interface EngineResponse {
  targetText?: string;
  detectedLang?: string;
  transliteration?: string;
  dict?: string;
  imageUrl?: string;
}

export type EngineResult = TranslateResult;

export type EngineRequest = (
  text: string,
  sourceLang: string,
  targetLang: string,
  settings: Settings,
) => Promise<EngineResponse | undefined>;

export interface Engine {
  // throws or resolves undefined when it failed; the caller moves on to the next engine
  translate(
    text: string,
    sourceLang: string,
    targetLang: string,
    settings: Settings,
  ): Promise<EngineResult | undefined>;
}

// app code <-> engine code; decoding is lossy when several app codes share one engine code (the later key wins)
export function defineEngine(
  request: EngineRequest,
  langCodes: Record<string, string> = {},
): Engine {
  const encodeMap = new Map(Object.entries(langCodes));
  const decodeMap = new Map(Object.entries(langCodes).map(([app, code]) => [code, app]));
  const encode = (lang: string) => encodeMap.get(lang) ?? lang;
  const decode = (lang: string | undefined) => (lang ? (decodeMap.get(lang) ?? lang) : "");

  return {
    async translate(text, sourceLang, targetLang, settings) {
      const tl = encode(targetLang);
      const res = await request(text, encode(sourceLang), tl, settings);
      if (!res) return undefined;
      return {
        targetText: res.targetText ?? "",
        transliteration: res.transliteration,
        dict: res.dict,
        imageUrl: res.imageUrl,
        sourceLang: decode(res.detectedLang),
        targetLang: decode(tl),
      };
    },
  };
}

// the official API once its key is configured, the free web endpoint otherwise
export function preferApi(
  web: Engine,
  api: Engine,
  useApi: (settings: Settings) => boolean,
): Engine {
  return {
    translate: (text, sourceLang, targetLang, settings) =>
      (useApi(settings) ? api : web).translate(text, sourceLang, targetLang, settings),
  };
}

export async function detectLangBrowser(text: string): Promise<string | undefined> {
  const result = await browser.i18n.detectLanguage(text);
  const lang = result?.languages?.[0]?.language;
  return lang === "zh" ? "zh-CN" : lang;
}
