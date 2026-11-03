import { bingConfig } from "@/translators/bing/web";
import { buildRequestBody } from "@/translators/deepl/web";
import { getToken } from "@/translators/googleGTX";
import { extractDefinition } from "@/translators/googleWeb";
import { parseLlmReply } from "@/translators/localLlm";
import { signPapago } from "@/translators/papago/web";
import { required } from "@/translators/parse";
import { engines } from "@/translators/registry";
import type { Settings } from "@/utils/settings";

// Every engine is reached by scraping a consumer endpoint and all of them throttle or captcha
// datacenter IPs, so the network suite is skipped on CI and only runs locally as the pre-release check.
const settings = {} as Settings;
const engine = (id: string) => required(engines[id], id);

describe.skipIf(Boolean(process.env.CI))("Translator - translate", () => {
  test("google translator - translate", async () => {
    const result = await engine("google").translate("Hello", "en", "es", settings);
    expect(result?.targetText).toBe("Hola");
  });

  test("bing translator - translate", async () => {
    bingConfig.customAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0";
    const result = await engine("bing").translate("Hello", "en", "es", settings);
    expect(result?.targetText).toBe("Hola");
  });

  // www2.deepl.com refuses datacenter IPs (the 0.1.247 release run died here)
  test("deepl translator - translate", async () => {
    const result = await engine("deepl").translate("Hello", "en", "es", settings);
    expect(result?.targetText).toBe("Hola");
  });

  test("yandex translator - translate", async () => {
    const result = await engine("yandex").translate("Hello", "en", "es", settings);
    expect(result?.targetText).toBe("Hola");
  });

  // TODO(papago): papago.naver.com moved to Next.js and dropped the "v1.<ver>" HMAC key, so this fails everywhere
  test("papago translator - translate", async () => {
    const result = await engine("papago").translate("Hello", "en", "es", settings);
    expect(result?.targetText).toBe("Hola.");
  });
});

describe("Translator - offline helpers", () => {
  test("googleGTX token is deterministic", () => {
    expect(getToken("Hello", "448487.932609646")).toMatch(/^\d+\.\d+$/);
    expect(getToken("Hello", "448487.932609646")).toBe(getToken("Hello", "448487.932609646"));
  });

  test("papago signature matches crypto-js HmacMD5", () => {
    expect(signPapago("key", "uuid", "https://papago.naver.com/apis/n2mt/translate", 1)).toBe(
      "5bBKZXSP21CIrX3TkfJ0yA==",
    );
  });

  test("deepl body spacing depends on the id", () => {
    expect(buildRequestBody("hi", "EN", "ES", 100000000)).toContain('"method": "LMT_handle_texts"');
    expect(buildRequestBody("hi", "EN", "ES", 100002000)).toContain(
      '"method" : "LMT_handle_texts"',
    );
  });

  test("googleWeb reads the first definition block", () => {
    const html =
      '<div class="eQJLDd"><div><span data-dobid="dfn">a greeting</span></div><div><span data-dobid="dfn">other</span></div></div>';
    expect(extractDefinition(html)).toBe("a greeting");
    expect(extractDefinition("<p>none</p>")).toBe("");
  });

  test("localLlm reply parsing", () => {
    expect(parseLlmReply("es\tHola")).toEqual({ targetText: "Hola", detectedLang: "es" });
    expect(parseLlmReply("Hola amigo")).toEqual({ targetText: "Hola amigo", detectedLang: "" });
  });
});
