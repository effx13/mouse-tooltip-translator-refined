import { browser } from "wxt/browser";
import { getMessage, getUiLangCode, t } from "@/utils/i18n";
import { getLocalizedLangName } from "@/utils/lang";
import type { Option, OptionList } from "@/utils/settings";
import { LANG_PRIORITY_KEYS } from "./state.svelte";

// computed lazily so labels use the UI language loaded at boot
const localizedCache = new Map<string, Option[]>();

function localize(list: OptionList, isLang: boolean): Option[] {
  const entries = Object.entries(list);
  if (!isLang) return entries.map(([key, value]) => ({ label: t(key), value }));
  const uiLang = getUiLangCode();
  const specials: Option[] = [];
  const langs: Option[] = [];
  for (const [key, value] of entries) {
    const message = getMessage(key);
    if (message) specials.push({ label: message, value });
    else
      langs.push({
        label: getLocalizedLangName(String(value), key.replaceAll("_", " "), uiLang),
        value,
      });
  }
  return [...specials, ...langs.toSorted((a, b) => a.label.localeCompare(b.label, uiLang))];
}

export function getOptions(
  key: string,
  list: OptionList,
  isLang: boolean,
  langPriority: Record<string, number> | undefined,
): Option[] {
  let options = localizedCache.get(key);
  if (!options) {
    options = localize(list, isLang);
    localizedCache.set(key, options);
  }
  if (!LANG_PRIORITY_KEYS.has(key) || !langPriority) return options;
  return options.toSorted(
    (a, b) => (langPriority[String(b.value)] ?? 0) - (langPriority[String(a.value)] ?? 0),
  );
}

const GENERIC_FONTS = ["sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui"];

// baseline when fontSettings is missing (Firefox), grouped by script
const COMMON_FONTS = [
  "Arial",
  "Helvetica",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Segoe UI",
  "Roboto",
  "Open Sans",
  "Lato",
  "Calibri",
  "Cambria",
  "Georgia",
  "Garamond",
  "Palatino Linotype",
  "Times New Roman",
  "Courier New",
  "Consolas",
  "Lucida Console",
  "Comic Sans MS",
  "Impact",
  "Noto Sans",
  "Noto Serif",
  "Malgun Gothic",
  "Nanum Gothic",
  "Noto Sans KR",
  "Batang",
  "Gulim",
  "Dotum",
  "Yu Gothic",
  "Meiryo",
  "MS Gothic",
  "MS Mincho",
  "Noto Sans JP",
  "Hiragino Sans",
  "Microsoft YaHei",
  "SimSun",
  "SimHei",
  "Microsoft JhengHei",
  "Noto Sans SC",
  "Noto Sans TC",
  "PingFang SC",
  "Vazirmatn",
  "Cairo",
  "Amiri",
  "Noto Naskh Arabic",
  "Noto Sans Arabic",
  "Geeza Pro",
  "Arabic Typesetting",
  "Noto Sans Hebrew",
  "David",
  "Arial Hebrew",
  "Noto Sans Thai",
  "Leelawadee UI",
  "Angsana New",
  "Nirmala UI",
  "Noto Sans Devanagari",
  "Mangal",
  "Noto Sans Bengali",
  "Vrinda",
  "Noto Sans Gujarati",
  "Shruti",
  "Noto Sans Tamil",
  "Latha",
  "Noto Sans Telugu",
  "Gautami",
  "Noto Sans Kannada",
  "Tunga",
  "Noto Sans Malayalam",
  "Kartika",
  "Noto Sans Ethiopic",
  "Nyala",
  "Abyssinica SIL",
  "Noto Sans Greek",
  "PT Sans",
  "PT Serif",
];

export async function getFontOptions(): Promise<Option[]> {
  const fonts = new Map<string, string>([[t("Default"), ""]]);
  for (const name of [...GENERIC_FONTS, ...COMMON_FONTS]) fonts.set(name, name);
  try {
    // typed as always present, but Firefox has no fontSettings
    const fontSettings: typeof browser.fontSettings | undefined = browser.fontSettings;
    for (const font of (await fontSettings?.getFontList()) ?? [])
      fonts.set(font.displayName || font.fontId, font.fontId);
  } catch (error) {
    console.log(error);
  }
  return [...fonts].map(([label, value]) => ({ label, value }));
}
