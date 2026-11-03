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
  // undefined = failed (any error is swallowed so the caller can fall back)
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
  const decodeMap = Object.fromEntries(Object.entries(langCodes).map(([app, code]) => [code, app]));
  const encode = (lang: string) => (Object.hasOwn(langCodes, lang) ? langCodes[lang]! : lang);
  const decode = (lang: string | undefined) =>
    lang && Object.hasOwn(decodeMap, lang) ? decodeMap[lang]! : (lang ?? "");

  return {
    async translate(text, sourceLang, targetLang, settings) {
      try {
        const sl = encode(sourceLang);
        const tl = encode(targetLang);
        const res = await request(text, sl, tl, settings);
        if (!res) return undefined;
        return {
          targetText: res.targetText as string,
          transliteration: res.transliteration,
          dict: res.dict,
          imageUrl: res.imageUrl,
          sourceLang: decode(res.detectedLang),
          targetLang: decode(tl),
        };
      } catch (error) {
        console.log(error);
        return undefined;
      }
    },
  };
}

export async function detectLangBrowser(text: string): Promise<string | undefined> {
  const result = await browser.i18n.detectLanguage(text);
  const lang = result?.languages?.[0]?.language;
  return lang === "zh" ? "zh-CN" : lang;
}
