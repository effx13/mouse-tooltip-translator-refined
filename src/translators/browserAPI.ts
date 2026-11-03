import { isSameLanguage } from "@/utils/lang";
import { defineEngine } from "./engine";

interface BuiltinTranslator {
  translate(text: string): Promise<string>;
  destroy(): void;
}
interface BuiltinDetector {
  detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]>;
  destroy(): void;
}
interface LangPair {
  sourceLanguage: string;
  targetLanguage: string;
}
interface BuiltinApis {
  Translator?: {
    availability(pair: LangPair): Promise<string>;
    create(options: LangPair & { monitor?: (m: EventTarget) => void }): Promise<BuiltinTranslator>;
  };
  LanguageDetector?: { create(): Promise<BuiltinDetector> };
}

let detector: BuiltinDetector | null = null;
const translators = new Map<string, BuiltinTranslator>();

// Chrome 138+ built-in Translator / LanguageDetector; on a failure inside it hands back the source text
export default defineEngine(async (text, sourceLang, targetLang) => {
  const { Translator, LanguageDetector } = globalThis as BuiltinApis;
  if (!Translator || !LanguageDetector) {
    throw new Error("Chrome Translator API not available. Requires Chrome 138+");
  }

  let detectedLang = sourceLang;
  try {
    if (sourceLang === "auto") {
      detector ??= await LanguageDetector.create();
      const results = await detector.detect(text);
      const top = results?.[0];
      if (!top || top.confidence <= 0.5) {
        throw new Error("Language detection failed or confidence too low.");
      }
      detectedLang = top.detectedLanguage;
    }

    // pt vs pt-BR too: the built-in API has no variant pair either
    if (isSameLanguage(detectedLang, targetLang) || detectedLang === targetLang) {
      throw new Error("Source and target languages are the same. Translation skipped.");
    }

    const pair = { sourceLanguage: detectedLang, targetLanguage: targetLang };
    if ((await Translator.availability(pair)) === "unavailable") {
      throw new Error(`Translator not available for ${detectedLang} to ${targetLang}.`);
    }

    const key = `${detectedLang}-${targetLang}`;
    let translator = translators.get(key);
    if (!translator) {
      translator = await Translator.create({
        ...pair,
        monitor(m) {
          m.addEventListener("downloadprogress", (e) => {
            console.log(`Downloaded ${Math.floor((e as ProgressEvent).loaded * 100)}%`);
          });
        },
      });
      translators.set(key, translator);
    }
    return { targetText: await translator.translate(text), detectedLang };
  } catch (error) {
    console.error("Translation failed:", error);
    return { targetText: text, detectedLang };
  }
});
