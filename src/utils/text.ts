const protocolAndDomainRE = /^(?:\w+:)?\/\/(\S+)$/;
const localhostDomainRE = /^localhost[:?\d]*(?:[^:?\d]\S*)?$/;
const nonLocalhostDomainRE = /^[^\s.]+\.\S{2,}$/;

export function isUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const rest = value.match(protocolAndDomainRE)?.[1];
  if (!rest) return false;
  return localhostDomainRE.test(rest) || nonLocalhostDomainRE.test(rest);
}

// collapse whitespace runs to one space and trim
export function trimAllSpace(word: string | null | undefined): string {
  if (!word) return "";
  return word.replace(/\s+/g, " ").trim();
}

// text made only of digits, spaces, punctuation, currency signs or emoji
const NOTHING_TO_TRANSLATE =
  /[^\s\d»«…~`!@#$%^&*()「」‑_+\-=[\]{};、':"\\|,.<>/?$\xA2-\xA5\u058F\u060B\u09F2\u09F3\u09FB\u0AF1\u0BF9\u0E3F\u17DB\u20A0-\u20BD\uA838\uFDFC\uFE69\uFF04\uFFE0\uFFE1\uFFE5\uFFE6\p{Extended_Pictographic}]/u;

// "" when not worth translating: over 1000 chars, a URL, or only numbers/symbols
export function filterWord(input: string | null | undefined): string {
  const word = trimAllSpace(input);
  if (word.length > 1000 || isUrl(word) || !NOTHING_TO_TRANSLATE.test(word)) {
    return "";
  }
  return word;
}

export const truncate = (str: string, n: number) =>
  str.length > n ? `${str.slice(0, n - 1)}...` : str;
