import { browser } from "wxt/browser";

type Messages = Record<string, { message: string }>;

// the generated typings only accept known message keys and public paths; language names and
// the chosen locale are looked up too
type UntypedI18n = { getMessage(messageName: string): string };
type UntypedRuntime = { getURL(path: string): string };

let customMessages: Messages | null = null;
let customLang: string | null = null;

export async function loadUiLanguage(lang: string | undefined) {
  customMessages = null;
  customLang = null;
  if (!lang || lang === "auto") return;
  try {
    const runtime: UntypedRuntime = browser.runtime;
    const messages: Messages = await (
      await fetch(runtime.getURL(`/_locales/${lang}/messages.json`))
    ).json();
    customMessages = messages;
    customLang = lang;
  } catch (error) {
    console.log(error);
  }
}

// effective UI language as a BCP47 tag (for Intl.DisplayNames)
export function getUiLangCode(): string {
  const lang = customLang || browser.i18n?.getUILanguage?.() || navigator.language || "en";
  return lang.replaceAll("_", "-");
}

// localized message or "" (no key fallback)
export function getMessage(key: string): string {
  const custom = customMessages?.[key]?.message;
  if (custom) return custom;
  // browser.i18n throws for names outside [a-zA-Z0-9_@] (e.g. "Chinese (Simplified)")
  try {
    const i18n: UntypedI18n = browser.i18n;
    return i18n.getMessage(key) || "";
  } catch {
    return "";
  }
}

// localized message, falling back to the key itself
export const t = (key: string) => getMessage(key) || key;
