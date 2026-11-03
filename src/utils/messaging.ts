import { defineExtensionMessaging } from "@webext-core/messaging";

export interface TranslateRequest {
  text: string;
  // "auto" to detect
  sourceLang: string;
  targetLang: string;
  // when the detected source already is the target, translate into this ("null" = off)
  reverseLang?: string;
  // override the configured engine
  engine?: string;
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
}

interface ProtocolMap {
  // content/pages -> background
  translate(data: TranslateRequest): TranslateResult | null;
  // content -> background: the tooltip showed this pair (feeds the "copy" context menu / commands)
  tooltipShown(data: { sourceText: string; targetText: string }): void;
  // background -> content (active tab): copy this text to the clipboard
  copyText(text: string): void;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
