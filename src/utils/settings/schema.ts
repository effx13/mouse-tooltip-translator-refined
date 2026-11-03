import { langList } from "../lang";

export type SettingTab =
  | "main"
  | "keyboard"
  | "graphic"
  | "exclude"
  | "advanced"
  | "backup"
  | "remains";

// rendered tab order
export const SETTING_TABS: readonly Exclude<SettingTab, "remains">[] = [
  "main",
  "keyboard",
  "graphic",
  "exclude",
  "advanced",
  "backup",
];

export type OptionValue = string | number | boolean;
// label -> stored value. Labels are i18n keys when a message exists, else shown as-is.
export type OptionList = Record<string, OptionValue>;

export type ButtonAction =
  | "excludeCurrentWebsite"
  | "whitelistCurrentWebsite"
  | "importSetting"
  | "exportSetting"
  | "resetSetting";

// loosely typed so the schema does not depend on its own inferred Settings type
type SettingsView = Readonly<Record<string, unknown>>;

interface BaseItem {
  i18nKey: string;
  settingTab: SettingTab;
  visibleWhen?: (setting: SettingsView) => boolean;
}

export type SettingItem<V = unknown> = BaseItem &
  (
    | { optionType?: "select"; default: V; optionList: OptionList; langOptionList?: boolean }
    | { optionType: "toggle"; default: V }
    | { optionType: "multipleSelect"; default: V; optionList: OptionList; langOptionList?: boolean }
    | { optionType: "comboBox"; default: V }
    | { optionType: "fontSelect"; default: V }
    | { optionType: "colorPicker"; default: V }
    | {
        optionType: "textField";
        default: V;
        inputType?: "text" | "url" | "password";
        placeholder?: string;
        readonlyWhen?: (setting: SettingsView) => boolean;
      }
    | { optionType: "llmModelSelect"; default: V }
    | {
        optionType: "button";
        default?: undefined;
        action: ButtonAction;
        tone: "primary" | "positive" | "danger";
      }
    | { optionType: "hidden"; default: V }
  );

const keyList: OptionList = {
  None: "null",
  Ctrl_Left: "ControlLeft",
  Ctrl_Right: "ControlRight",
  Alt_Left: "AltLeft",
  Alt_Right: "AltRight",
  Shift_Left: "ShiftLeft",
  Shift_Right: "ShiftRight",
  Meta_Left: "MetaLeft",
  Meta_Right: "MetaRight",
  Click_Left: "ClickLeft",
  Click_Middle: "ClickMiddle",
  Click_Right: "ClickRight",
  F2: "F2",
  F8: "F8",
  F9: "F9",
};
const keyListWithAlways: OptionList = { ...keyList, Always: "always" };

export const translatorList: OptionList = {
  google: "google",
  bing: "bing",
  "LLM - OpenAI / Claude / Gemini / Local (Experimental)": "localLlm",
  "deepl (Experimental)": "deepl",
  "yandex (Experimental)": "yandex",
  "baidu (Experimental)": "baidu",
  "papago (Experimental)": "papago",
  "browser API (Experimental)": "browserAPI",
  "googleWebImage (Experimental)": "googleWebImage",
  "googleGTX (Experimental)": "googleGTX",
  "googleWeb (Experimental)": "googleWeb",
  "googleV2 (Experimental)": "googleV2",
};

export const llmProviderEndpoints: Record<string, string> = {
  custom: "",
  openai: "https://api.openai.com/v1",
  claude: "https://api.anthropic.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  grok: "https://api.x.ai/v1",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  githubModels: "https://models.inference.ai.azure.com",
  ollama: "http://localhost:11434/v1",
  lmstudio: "http://localhost:1234/v1",
};

const llmProviderList: OptionList = {
  Custom: "custom",
  "OpenAI (ChatGPT)": "openai",
  "Claude (Anthropic)": "claude",
  "Gemini (Google, free tier available)": "gemini",
  "Grok (xAI)": "grok",
  "Groq (free, fast Llama)": "groq",
  "OpenRouter (free models with :free suffix)": "openrouter",
  "GitHub Models (free with GitHub token)": "githubModels",
  "Ollama (local)": "ollama",
  "LM Studio (local)": "lmstudio",
};

// {"6": 6, "8": 8, ...} for start <= n < end
function rangeOption(start: number, end: number, step = 1): OptionList {
  const list: OptionList = {};
  for (let n = start; n < end; n += step) list[String(n)] = n;
  return list;
}

const withAuto: OptionList = { Auto: "auto", ...langList };
const withNone: OptionList = { None: "null", ...langList };
const detectTypeList: OptionList = { Word: "word", Sentence: "sentence", Container: "container" };

// UI language picker. Keys are endonyms (shown as-is); values are the
// _locales directory names. "auto" follows the browser language.
const uiLanguageList: OptionList = {
  Auto: "auto",
  English: "en",
  "English (UK)": "en_GB",
  "English (US)": "en_US",
  "English (Australia)": "en_AU",
  العربية: "ar",
  አማርኛ: "am",
  Български: "bg",
  বাংলা: "bn",
  Català: "ca",
  Čeština: "cs",
  Dansk: "da",
  Deutsch: "de",
  Ελληνικά: "el",
  Español: "es",
  "Español (Latinoamérica)": "es_419",
  Eesti: "et",
  فارسی: "fa",
  Suomi: "fi",
  Filipino: "fil",
  Français: "fr",
  ગુજરાતી: "gu",
  עברית: "he",
  हिन्दी: "hi",
  Hrvatski: "hr",
  Magyar: "hu",
  "Bahasa Indonesia": "id",
  Italiano: "it",
  日本語: "ja",
  ಕನ್ನಡ: "kn",
  한국어: "ko",
  Lietuvių: "lt",
  Latviešu: "lv",
  മലയാളം: "ml",
  मराठी: "mr",
  "Bahasa Melayu": "ms",
  Nederlands: "nl",
  Norsk: "no",
  Polski: "pl",
  "Português (Brasil)": "pt_BR",
  "Português (Portugal)": "pt_PT",
  Română: "ro",
  Русский: "ru",
  Slovenčina: "sk",
  Slovenščina: "sl",
  Српски: "sr",
  Svenska: "sv",
  Kiswahili: "sw",
  தமிழ்: "ta",
  తెలుగు: "te",
  ไทย: "th",
  Türkçe: "tr",
  Українська: "uk",
  "Tiếng Việt": "vi",
  "中文(简体)": "zh_CN",
  "中文(繁體)": "zh_TW",
};

const isLlm = (s: SettingsView) => s.translatorVendor === "localLlm";

// declaration order = row order inside a tab

export const settingSchema = {
  // main
  translateSource: {
    default: "auto",
    i18nKey: "Translate_From",
    optionList: withAuto,
    langOptionList: true,
    settingTab: "main",
  },
  translateTarget: {
    default: "en",
    i18nKey: "Translate_Into",
    optionList: langList,
    langOptionList: true,
    settingTab: "main",
  },
  translateTarget2: {
    default: "null",
    i18nKey: "Translate_Into_2",
    optionList: withNone,
    langOptionList: true,
    settingTab: "main",
  },
  translatorVendor: {
    default: "google",
    i18nKey: "Translator_Engine",
    optionList: translatorList,
    settingTab: "main",
  },
  llmProvider: {
    default: "custom",
    i18nKey: "LLM_Provider",
    optionList: llmProviderList,
    settingTab: "main",
    visibleWhen: isLlm,
  },
  llmApiEndpoint: {
    default: "",
    i18nKey: "LLM_Api_Endpoint",
    optionType: "textField",
    inputType: "url",
    placeholder: "http://localhost:11434/v1",
    settingTab: "main",
    visibleWhen: isLlm,
    readonlyWhen: (s) => Boolean(s.llmProvider) && s.llmProvider !== "custom",
  },
  llmApiKey: {
    default: "",
    i18nKey: "LLM_Api_Key",
    optionType: "textField",
    inputType: "password",
    placeholder: "sk-...",
    settingTab: "main",
    visibleWhen: isLlm,
  },
  llmModel: {
    default: "",
    i18nKey: "LLM_Model",
    optionType: "llmModelSelect",
    settingTab: "main",
    visibleWhen: isLlm,
  },
  translateWhen: {
    default: "mouseoverselect",
    i18nKey: "Translate_When",
    optionList: { Select: "select", Mouseover: "mouseover", Mouseover_n_Select: "mouseoverselect" },
    settingTab: "main",
  },
  mouseoverTextType: {
    default: "sentence",
    i18nKey: "Mouseover_Text_Type",
    optionList: detectTypeList,
    settingTab: "main",
  },
  writingLanguage: {
    default: "en",
    i18nKey: "Writing_Language",
    optionList: langList,
    langOptionList: true,
    settingTab: "main",
  },
  translateReverseTarget: {
    default: "null",
    i18nKey: "Reverse_Translate_Language",
    optionList: withNone,
    langOptionList: true,
    settingTab: "main",
  },

  // keyboard
  showTooltipWhen: {
    default: "always",
    i18nKey: "Show_Tooltip_When",
    optionList: keyListWithAlways,
    settingTab: "keyboard",
  },
  keyDownTranslateWriting: {
    default: "AltRight",
    i18nKey: "Translate_Writing_When",
    optionList: keyList,
    settingTab: "keyboard",
  },
  // On: AltGr (Ctrl+AltRight with getModifierState("AltGraph")) counts as typing,
  // so it never fires an AltRight-bound shortcut. Off: AltGr is a normal key.
  ignoreAltGr: {
    default: false,
    i18nKey: "Ignore_AltGr_Modifier",
    optionType: "toggle",
    settingTab: "keyboard",
  },
  keyDownTranslatePage: {
    default: "null",
    i18nKey: "Translate_Page_When",
    optionList: keyList,
    settingTab: "keyboard",
  },
  keyHoldMouseoverTextType: {
    default: "F8",
    i18nKey: "Mouseover_Text_Type_Key_Hold",
    optionList: keyList,
    settingTab: "keyboard",
  },
  keySecondaryLang: {
    default: "null",
    i18nKey: "Secondary_Language_When",
    optionList: keyList,
    settingTab: "keyboard",
  },
  // the two keys above act as press-to-toggle instead of hold
  swapKeyToggleMode: {
    default: false,
    i18nKey: "Swap_Key_Toggle_Mode",
    optionType: "toggle",
    settingTab: "keyboard",
  },
  // turn the tooltip on/off for the session
  keyToggleEnable: {
    default: "null",
    i18nKey: "Toggle_Extension_When",
    optionList: keyList,
    settingTab: "keyboard",
  },

  // graphic
  tooltipFontSize: {
    default: 18,
    i18nKey: "Tooltip_Font_Size",
    optionList: rangeOption(6, 41, 2),
    settingTab: "graphic",
  },
  // "" = default stack; options come from fontSettings.getFontList()
  tooltipFontFamily: {
    default: "",
    i18nKey: "Tooltip_Font_Family",
    optionType: "fontSelect",
    settingTab: "graphic",
  },
  tooltipWidth: {
    default: 200,
    i18nKey: "Tooltip_Width",
    optionList: rangeOption(100, 1001, 100),
    settingTab: "graphic",
  },
  tooltipDistance: {
    default: 20,
    i18nKey: "Tooltip_Distance",
    optionList: rangeOption(0, 41),
    settingTab: "graphic",
  },
  tooltipAnimation: {
    default: "fade",
    i18nKey: "Tooltip_Animation",
    optionList: {
      None: "",
      Fade: "fade",
      Scale: "scale",
      Shift_away: "shift-away",
      Shift_toward: "shift-toward",
      Perspective: "perspective",
    },
    settingTab: "graphic",
  },
  tooltipDisappearDuration: {
    default: 250,
    i18nKey: "Tooltip_Disappear_Duration",
    optionList: rangeOption(0, 501, 50),
    settingTab: "graphic",
  },
  tooltipPosition: {
    default: "follow",
    i18nKey: "Tooltip_Position",
    optionList: { Follow: "follow", Fixed: "fixed", Top_Right: "topright" },
    settingTab: "graphic",
  },
  // ignored in Top Right mode
  tooltipPlacement: {
    default: "top",
    i18nKey: "Tooltip_Placement",
    optionList: { Above: "top", Below: "bottom" },
    settingTab: "graphic",
  },
  tooltipTextAlign: {
    default: "center",
    i18nKey: "Tooltip_Text_Align",
    optionList: { Center: "center", Left: "left", Right: "right", Justify: "justify" },
    settingTab: "graphic",
  },
  tooltipBackgroundBlur: {
    default: 6,
    i18nKey: "Tooltip_Background_Blur",
    optionList: rangeOption(0, 21),
    settingTab: "graphic",
  },
  mouseoverHighlightText: {
    default: false,
    i18nKey: "Mouseover_Highlight_Text",
    optionType: "toggle",
    settingTab: "graphic",
  },
  tooltipFontColor: {
    default: "#ffffffff",
    i18nKey: "Tooltip_Font_Color",
    optionType: "colorPicker",
    settingTab: "graphic",
  },
  tooltipBackgroundColor: {
    default: "#00000080",
    i18nKey: "Tooltip_Background_Color",
    optionType: "colorPicker",
    settingTab: "graphic",
  },
  tooltipBorderColor: {
    default: "#ffffff00",
    i18nKey: "Tooltip_Border_Color",
    optionType: "colorPicker",
    settingTab: "graphic",
  },
  mouseoverTextHighlightColor: {
    default: "#21dc6d40",
    i18nKey: "Mouseover_Text_Highlight_Color",
    optionType: "colorPicker",
    settingTab: "graphic",
  },
  // forces the ebook reader's page colors
  ebookTheme: {
    default: "auto",
    i18nKey: "Ebook_Theme",
    optionList: { Auto: "auto", Light: "light", Dark: "dark" },
    settingTab: "graphic",
  },
  // compact settings screen
  compactMode: {
    default: false,
    i18nKey: "Setting_Compact_mode",
    optionType: "toggle",
    settingTab: "graphic",
  },

  // exclude
  langExcludeList: {
    default: [] as string[],
    i18nKey: "Exclude_Language",
    optionList: langList,
    langOptionList: true,
    optionType: "multipleSelect",
    settingTab: "exclude",
  },
  websiteFilterMode: {
    default: "auto",
    i18nKey: "Website_Filter_Mode",
    // auto: exclude list blocks and a non-empty whitelist also restricts (legacy)
    optionList: { Both: "auto", Blacklist: "blacklist", Whitelist: "whitelist" },
    settingTab: "exclude",
  },
  websiteExcludeList: {
    default: ["*.example.com"] as string[],
    i18nKey: "Exclude_Website",
    optionType: "comboBox",
    settingTab: "exclude",
  },
  websiteWhiteList: {
    default: [] as string[],
    i18nKey: "Whitelist_Website",
    optionType: "comboBox",
    settingTab: "exclude",
  },
  // "site=lang" entries: matching pages translate into that language
  websiteTargetLangList: {
    default: [] as string[],
    i18nKey: "Website_Target_Language",
    optionType: "comboBox",
    settingTab: "exclude",
  },
  websiteExcludeBtn: {
    i18nKey: "Block_Current_Site",
    optionType: "button",
    action: "excludeCurrentWebsite",
    tone: "danger",
    settingTab: "exclude",
  },
  websiteWhitelistBtn: {
    i18nKey: "Allow_Current_Site",
    optionType: "button",
    action: "whitelistCurrentWebsite",
    tone: "positive",
    settingTab: "exclude",
  },

  // advanced
  uiLanguage: {
    default: "auto",
    i18nKey: "UI_Language",
    optionList: uiLanguageList,
    settingTab: "advanced",
  },
  detectPDF: { default: true, i18nKey: "Detect_PDF", optionType: "toggle", settingTab: "advanced" },
  mouseoverTextType2: {
    default: "sentence",
    i18nKey: "Mouseover_Text_Type_2",
    optionList: detectTypeList,
    settingTab: "advanced",
  },
  mouseoverWhileWriting: {
    default: false,
    i18nKey: "Show_Tooltip_While_Typing",
    optionType: "toggle",
    settingTab: "advanced",
  },
  tooltipInfoSourceText: {
    default: false,
    i18nKey: "Tooltip_Info_Source_Text",
    optionType: "toggle",
    settingTab: "advanced",
  },
  // detected text matching this regex is not translated
  translateExcludeRegex: {
    default: "",
    i18nKey: "Translate_Exclude_Regex",
    optionType: "textField",
    placeholder: "e.g. ^[0-9.,]+$|https?://",
    settingTab: "advanced",
  },
  tooltipInfoSourceLanguage: {
    default: false,
    i18nKey: "Tooltip_Info_Source_Language",
    optionType: "toggle",
    settingTab: "advanced",
  },
  tooltipInfoTransliteration: {
    default: false,
    i18nKey: "Tooltip_Info_Transliteration",
    optionType: "toggle",
    settingTab: "advanced",
  },
  tooltipWordDictionary: {
    default: true,
    i18nKey: "Tooltip_Word_Dictionary",
    optionType: "toggle",
    settingTab: "advanced",
  },
  tooltipWordDictionarySource: {
    default: "translator",
    i18nKey: "Tooltip_Word_Dictionary_Source",
    optionList: { Translator: "translator", Wiktionary: "wiktionary" },
    settingTab: "advanced",
  },
  fallbackTranslatorEngine: {
    default: true,
    i18nKey: "Fallback_Translator_Engine",
    optionType: "toggle",
    settingTab: "advanced",
  },
  // debounce (ms) before the mouseover tooltip appears
  mouseoverEventInterval: {
    default: 300,
    i18nKey: "Tooltip_Show_Delay",
    optionList: rangeOption(0, 1001, 50),
    settingTab: "advanced",
  },

  // backup
  // mirror settings to storage.sync, per-device opt-in
  syncSetting: {
    default: false,
    i18nKey: "Sync_Setting",
    optionType: "toggle",
    settingTab: "backup",
  },
  importSetting: {
    i18nKey: "Import_Setting",
    optionType: "button",
    action: "importSetting",
    tone: "primary",
    settingTab: "backup",
  },
  exportSetting: {
    i18nKey: "Export_Setting",
    optionType: "button",
    action: "exportSetting",
    tone: "positive",
    settingTab: "backup",
  },
  resetSetting: {
    i18nKey: "Reset_Setting",
    optionType: "button",
    action: "resetSetting",
    tone: "danger",
    settingTab: "backup",
  },

  // remains: stored, never rendered
  // per-provider {apiEndpoint, apiKey, model}
  llmProviderSettings: {
    default: {} as Record<string, { apiEndpoint?: string; apiKey?: string; model?: string }>,
    i18nKey: "LLM_Provider_Settings",
    optionType: "hidden",
    settingTab: "remains",
  },
  // select-menu sort weight per language code (most used first)
  langPriority: {
    default: { auto: 9999999, null: 9999999 } as Record<string, number>,
    i18nKey: "Language_Priority",
    optionType: "hidden",
    settingTab: "remains",
  },
  // last viewed settings tab
  lastSettingTab: {
    default: "main",
    i18nKey: "Last_Setting_Tab",
    optionType: "hidden",
    settingTab: "remains",
  },
} satisfies Record<string, SettingItem>;

type Schema = typeof settingSchema;
export type SettingKey = keyof Schema;

type ValueOf<K extends SettingKey> = Schema[K] extends { default: infer V }
  ? V extends string
    ? string
    : V
  : never;

// keys that hold a value (buttons do not)
export type ValueKey = {
  [K in SettingKey]: Schema[K] extends { default: unknown } ? K : never;
}[SettingKey];

export type SettingValues = { [K in ValueKey]: ValueOf<K> };

// the settings object as seen at runtime
export type Settings = SettingValues;

export const defaultSettings = (): SettingValues =>
  Object.fromEntries(
    Object.entries(settingSchema)
      .filter(([, item]) => "default" in item && item.default !== undefined)
      .map(([key, item]) => [key, structuredClone((item as { default: unknown }).default)]),
  ) as SettingValues;
