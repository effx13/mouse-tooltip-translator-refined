import type { TranslateResult } from "@/utils/messaging";
import type { Settings } from "@/utils/settings";
import { getLocalizedLangName, getRtlDir, langListOpposite } from "@/utils/lang";

function el(tag: string, text: string, dirLang?: string | null) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (dirLang !== undefined) node.dir = getRtlDir(dirLang);
  return node;
}

// one "label: entries" line per dictionary entry; the label up to the first colon is bold
function buildDict(dict: string, targetLang: string) {
  const wrapper = el("span", "", targetLang);
  dict.split("\n").forEach((line, i) => {
    if (i > 0) wrapper.append("\n");
    const idx = line.indexOf(":");
    if (idx === -1) wrapper.append(el("span", line));
    else wrapper.append(el("b", line.slice(0, idx + 1)), el("span", line.slice(idx + 1)));
  });
  return wrapper;
}

function buildImage(src: string) {
  const img = document.createElement("img");
  img.className = "mtt-image";
  img.src = src;
  img.alt = "";
  return img;
}

// the leading newline breaks the line under white-space: pre-line
const infoLine = (tag: string, text: string | undefined, dirLang: string | null = null) =>
  text ? [el(tag, `\n${text}`, dirLang)] : [];

const getUiLangCode = (settings: Settings) =>
  settings.uiLanguage && settings.uiLanguage !== "auto"
    ? settings.uiLanguage.replaceAll("_", "-")
    : navigator.language || "en";

export function buildTooltipContent(
  sourceText: string,
  result: TranslateResult,
  settings: Settings,
): Node[] {
  const { targetText, sourceLang, targetLang, transliteration, dict, imageUrl } = result;
  const main = imageUrl
    ? buildImage(imageUrl)
    : settings.tooltipWordDictionary && dict
      ? buildDict(dict, targetLang)
      : el("span", targetText, targetLang);
  const langName = settings.tooltipInfoSourceLanguage
    ? getLocalizedLangName(
        sourceLang,
        langListOpposite[sourceLang] ?? sourceLang,
        getUiLangCode(settings),
      )
    : "";
  return [
    main,
    ...infoLine("i", settings.tooltipInfoSourceText ? sourceText : "", sourceLang),
    ...infoLine("b", settings.tooltipInfoTransliteration ? transliteration : ""),
    ...infoLine("sup", langName),
  ];
}
