import { decodeHTML } from "entities";
import ky from "ky";
import { defineEngine } from "./engine";

const googleTranslateTKK = "448487.932609646";
const apiPath = "https://translate.googleapis.com/translate_a/t";

// token code from https://github.com/translate-tools/core/blob/master/src/translators/GoogleTranslator/token.js
function shiftLeftOrRightThenSumOrXor(num: number, optString: string): number {
  for (let i = 0; i < optString.length - 2; i += 3) {
    const ch = optString.charAt(i + 2);
    let acc = ch >= "a" ? ch.charCodeAt(0) - 87 : Number(ch);
    acc = optString.charAt(i + 1) === "+" ? num >>> acc : num << acc;
    num = optString.charAt(i) === "+" ? num + (acc & 4294967295) : num ^ acc;
  }
  return num;
}

function transformQuery(query: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < query.length; i++) {
    let charCode = query.charCodeAt(i);
    if (charCode < 128) {
      bytes.push(charCode);
    } else {
      if (charCode < 2048) {
        bytes.push((charCode >> 6) | 192);
      } else {
        if (
          (charCode & 64512) === 55296 &&
          i + 1 < query.length &&
          (query.charCodeAt(i + 1) & 64512) === 56320
        ) {
          charCode = 65536 + ((charCode & 1023) << 10) + (query.charCodeAt(++i) & 1023);
          bytes.push((charCode >> 18) | 240, ((charCode >> 12) & 63) | 128);
        } else {
          bytes.push((charCode >> 12) | 224);
        }
        bytes.push(((charCode >> 6) & 63) | 128);
      }
      bytes.push((charCode & 63) | 128);
    }
  }
  return bytes;
}

export function getToken(query: string, windowTkk: string): string {
  const [indexPart, keyPart] = windowTkk.split(".");
  const tkkIndex = Number(indexPart) || 0;
  const tkkKey = Number(keyPart) || 0;

  let round = tkkIndex;
  for (const byte of transformQuery(query)) {
    round += byte;
    round = shiftLeftOrRightThenSumOrXor(round, "+-a^+6");
  }
  round = shiftLeftOrRightThenSumOrXor(round, "+-3^+b+-f");
  round ^= tkkKey;
  if (round <= 0) {
    round = (round & 2147483647) + 2147483648;
  }
  const normalized = round % 1000000;
  return `${normalized}.${normalized ^ tkkIndex}`;
}

export default defineEngine(async (text, sourceLang, targetLang) => {
  const res = await ky(apiPath, {
    searchParams: {
      client: "te_lib",
      sl: sourceLang,
      tl: targetLang,
      hl: targetLang,
      anno: 3,
      format: "html",
      v: 1.0,
      tc: 1,
      sr: 1,
      mode: 1,
      q: text,
      tk: getToken(text, googleTranslateTKK),
    },
  }).json<unknown[]>();

  const first = res?.[0] as string | [string, string] | undefined;
  if (!first?.[0]) return undefined;
  const isAuto = sourceLang === "auto";
  const targetText = isAuto ? (first as [string, string])[0] : (first as string);
  const detectedLang = isAuto ? (first as [string, string])[1] : sourceLang;
  // drop the <i> source wrappers and <b> tags of the html format
  const cleaned = decodeHTML(targetText)
    .replace(/(<i>).+?(<\/i>)/gi, " ")
    .replace(/<\/?b[^>]*>/g, " ")
    .replace(/\s\s+/g, " ")
    .trim();
  return { targetText: cleaned, detectedLang, transliteration: "" };
});
