import ky from "ky";
import { defineEngine, detectLangBrowser } from "../engine";
import { matchOrThrow, required } from "../parse";

const googleSearchUrl = "https://www.google.com/search";

// same data URL a FileReader would produce, "" when the image can't be fetched
async function getBase64(url: string): Promise<string> {
  try {
    const blob = await (await fetch(url)).blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
  } catch (error) {
    console.log(error);
    return "";
  }
}

// https://stackoverflow.com/questions/70638466/how-do-i-scrape-all-the-images-from-a-google-image-search
export default defineEngine(async (text) => {
  const res = await ky(googleSearchUrl, { searchParams: { q: text, tbm: "isch" } }).text();
  const urlJSON: Record<string, string> = JSON.parse(matchOrThrow(res, /google.ldi=(\{[^{]+\});/));
  const imageUrl = required(Object.values(urlJSON)[0], "image url");
  return {
    targetText: "image",
    detectedLang: await detectLangBrowser(text),
    transliteration: "",
    imageUrl: await getBase64(imageUrl),
  };
});
