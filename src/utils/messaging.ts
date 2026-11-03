import { defineExtensionMessaging } from "@webext-core/messaging";

export interface TranslateRequest {
  text: string;
  // "auto" to detect
  sourceLang: string;
  targetLang: string;
  // when the detected source already is the target, translate into this ("null" = off)
  reverseLang?: string;
  // try this engine first, before the configured order
  engine?: string;
  // only `engine`: no fallback, no cache (the settings "Test" button)
  noFallback?: boolean;
}

export interface TranslateResult {
  targetText: string;
  // detected (or given) source language
  sourceLang: string;
  targetLang: string;
  transliteration?: string;
  // data URL from the googleWebImage engine; shown instead of the text
  imageUrl?: string;
  // dictionary entries for a single word, one per line ("noun: a, b")
  dict?: string;
  // engine (and fallbacks) failed; targetText holds "<engine> is broken"
  isBroken?: boolean;
  // why a noFallback request failed
  error?: string;
}

interface ProtocolMap {
  // content/pages -> background
  translate(data: TranslateRequest): TranslateResult | null;
  // content -> background: the tooltip showed this pair (feeds the "copy" context menu / commands)
  tooltipShown(data: { sourceText: string; targetText: string }): void;
  // popup -> background: entry count of the persistent translation cache, emptied first on "clear"
  translationCache(action: "count" | "clear"): number;
  // background -> content (active tab): copy this text to the clipboard
  copyText(text: string): void;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
