import { browser } from "wxt/browser";

type Messages = Record<string, { message: string }>;

let customMessages: Messages | null = null;
let customLang: string | null = null;

export async function loadUiLanguage(lang: string | undefined) {
  customMessages = null;
  customLang = null;
  if (!lang || lang === "auto") return;
  try {
    const url = browser.runtime.getURL(`/_locales/${lang}/messages.json` as "/");
    customMessages = (await (await fetch(url)).json()) as Messages;
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
    return browser.i18n.getMessage(key as never) || "";
  } catch {
    return "";
  }
}

// localized message, falling back to the key itself
export const t = (key: string) => getMessage(key) || key;
