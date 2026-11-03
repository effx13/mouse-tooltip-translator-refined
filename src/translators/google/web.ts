import ky from "ky";
import { defineEngine } from "../engine";

const apiUrl = "https://translate.googleapis.com/translate_a/single";

interface GoogleResponse {
  sentences?: { trans?: string; src_translit?: string }[];
  dict?: { pos: string; terms: string[] }[];
  src?: string;
}

export default defineEngine(async (text, sourceLang, targetLang) => {
  const params = `${new URLSearchParams({ client: "gtx", q: text, sl: sourceLang, tl: targetLang, dj: "1", hl: targetLang })}&dt=rm&dt=bd&dt=t`;
  const res = await ky(`${apiUrl}?${params}`).json<GoogleResponse>();

  // each sentence already carries its trailing space / "\n", so join with ""
  const targetText = res.sentences
    ?.map((s) => s.trans)
    .filter(Boolean)
    .join("")
    .replace(/\n /g, "\n");
  const transliteration = res.sentences
    ?.map((s) => s.src_translit)
    .filter(Boolean)
    .join(" ")
    .trim()
    .replace(/\n /g, "\n");
  const dict = res.dict?.map((d) => `${d.pos}: ${d.terms.slice(0, 3).join(", ")}`).join("\n");

  return { targetText, detectedLang: res.src, transliteration, dict };
});
