import ky from "ky";
import { parse } from "node-html-parser";
import { defineEngine, detectLangBrowser } from "./engine";

const googleSearchUrl = "https://www.google.com/search";

// cheerio's $(".eQJLDd").children(":first").find("[data-dobid='dfn']").text()
export function extractDefinition(html: string): string {
  const firstChild = parse(html)
    .querySelectorAll(".eQJLDd")
    .flatMap((el) => el.children)[0];
  return (
    firstChild
      ?.querySelectorAll("[data-dobid='dfn']")
      .map((el) => el.text)
      .join("") ?? ""
  );
}

export default defineEngine(async (text) => {
  const lang = "en";
  const res = await ky(googleSearchUrl, {
    searchParams: { q: `meaning:${text}`, hl: lang, lr: `lang_${lang}` },
  }).text();
  return {
    targetText: extractDefinition(res),
    detectedLang: await detectLangBrowser(text),
    transliteration: "",
  };
});
