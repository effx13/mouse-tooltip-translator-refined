import ky from "ky";
import { defineEngine } from "./engine";

const tokenUrl = "https://translate.google.com";
const batchUrl = "https://translate.google.com/_/TranslateWebserverUi/data/batchexecute";
const tokenTTL = 60 * 60 * 1000;

let token: { sid: string; bl: string; at: string; time: number } | undefined;

async function getTokenV2() {
  if (token && token.time + tokenTTL > Date.now()) {
    return token;
  }
  const res = await ky(tokenUrl).text();
  const sid = res.match(/"FdrFJe":"(.*?)"/)![1]!;
  const bl = res.match(/"cfb2h":"(.*?)"/)![1]!;
  const at = res.match(/"SNlM0e":"(.*?)"/)?.[1] ?? "";
  token = { sid, bl, at, time: Date.now() };
  return token;
}

export default defineEngine(async (text, sourceLang, targetLang) => {
  const { sid, bl, at } = await getTokenV2();
  const req = JSON.stringify([
    [["MkEWBc", JSON.stringify([[text, sourceLang, targetLang, true], [null]]), null, "generic"]],
  ]);
  const res = await ky
    .post(batchUrl, {
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      searchParams: {
        rpcids: "MkEWBc",
        "source-path": "/",
        "f.sid": sid,
        bl,
        hl: "ko",
        "soc-app": 1,
        "soc-platform": 1,
        "soc-device": 1,
        _reqid: Math.floor(10000 + 10000 * Math.random()),
        rt: "c",
      },
      body: new URLSearchParams({ "f.req": req, at }),
    })
    .text();

  const json = JSON.parse(JSON.parse(/\[.*\]/.exec(res)![0])[0][2]);
  // chunks carry their own trailing space, so join with ""
  const targetText = (json[1][0][0][5] as ([string] | null)[])
    .map((chunk) => chunk?.[0])
    .filter(Boolean)
    .join("");
  return { targetText, detectedLang: json[0][2], transliteration: json[1][0][0][1] };
});
