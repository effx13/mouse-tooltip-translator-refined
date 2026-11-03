import ky from "ky";

const apiUrl = "https://en.wiktionary.org/api/rest_v1/page/definition/";
const maxDefsPerPos = 3;

interface WiktionaryEntry {
  partOfSpeech: string;
  definitions?: { definition?: string }[];
}

const htmlEntities: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

// no DOMParser in the service worker
function stripHtml(html = ""): string {
  return html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => htmlEntities[entity]!)
    .replace(/\s+/g, " ")
    .trim();
}

// Wiktionary as the tooltip dictionary source (#149): "pos: def1; def2" lines like the translator dict, "" when nothing usable
export async function getWiktionaryDict(word: string, sourceLang = "en"): Promise<string> {
  word = (word || "").trim();
  if (!word || /\s/.test(word)) return "";

  let res: Record<string, unknown> | undefined;
  try {
    res = await ky(apiUrl + encodeURIComponent(word), {
      headers: { accept: "application/json" },
    }).json();
  } catch (error) {
    console.log(error);
    return "";
  }

  // prefer the section for the hovered word's language, else the first one
  const entries = res?.[sourceLang] || res?.[Object.keys(res ?? {})[0] ?? ""];
  if (!Array.isArray(entries)) return "";
  return (entries as WiktionaryEntry[])
    .map((entry) => {
      const defs = (entry.definitions ?? [])
        .map((d) => stripHtml(d.definition))
        .filter(Boolean)
        .slice(0, maxDefsPerPos)
        .join("; ");
      return defs ? `${entry.partOfSpeech}: ${defs}` : "";
    })
    .filter(Boolean)
    .join("\n");
}
