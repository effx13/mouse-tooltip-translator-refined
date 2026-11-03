import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  defaultEngineList,
  engineInfos,
  getEngineStatus,
  normalizeEngineConfig,
  normalizeEngineList,
  usesApiKey,
} from "@/translators/catalog";
import { engines } from "@/translators/registry";

const translatorsDir = path.resolve(import.meta.dirname);
const engineFolders = readdirSync(translatorsDir).filter((name) =>
  statSync(path.join(translatorsDir, name)).isDirectory(),
);

// the i18n keys scripts/insertLocale.py writes: each i18List string with spaces as "_"
function localeKeys(): Set<string> {
  const script = readFileSync(
    path.resolve(translatorsDir, "../../scripts/insertLocale.py"),
    "utf8",
  );
  const list = /i18List = \[([\s\S]*?)\n\]/.exec(script)?.[1] ?? "";
  return new Set(
    [...list.matchAll(/"([^"]*)"/g)].map((match) => (match[1] ?? "").replaceAll(" ", "_")),
  );
}

describe("engine folders", () => {
  test("every folder has a meta.ts with a matching id and an index.ts engine", () => {
    expect(engineFolders.length).toBeGreaterThan(0);
    const incomplete = engineFolders.filter((folder) => {
      const files = readdirSync(path.join(translatorsDir, folder));
      return !files.includes("meta.ts") || !files.includes("index.ts") || !engines[folder];
    });
    expect(incomplete).toEqual([]);
    expect(engineInfos.map((info) => info.id).toSorted()).toEqual(engineFolders.toSorted());
  });

  test("default positions are unique", () => {
    const orders = engineInfos.map((info) => info.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  test("every engine and config field label has an i18n key", () => {
    const keys = localeKeys();
    const labelKeys = engineInfos.flatMap((info) => [
      ...(info.i18nKey ? [info.i18nKey] : []),
      ...info.fields.map((field) => field.i18nKey),
    ]);
    expect(labelKeys.filter((key) => !keys.has(key))).toEqual([]);
  });
});

describe("engine list", () => {
  test("defaults enable google and bing only", () => {
    const enabled = defaultEngineList().filter((entry) => entry.enabled);
    expect(enabled.map((entry) => entry.id)).toEqual(["google", "bing"]);
  });

  test("normalizing drops unknown and duplicate ids and appends missing engines disabled", () => {
    const list = normalizeEngineList([
      { id: "deepl", enabled: true },
      { id: "nope", enabled: true },
      { id: "deepl", enabled: false },
      { id: "google", enabled: "yes" },
    ]);
    expect(list.slice(0, 2)).toEqual([
      { id: "deepl", enabled: true },
      { id: "google", enabled: false },
    ]);
    expect(list).toHaveLength(engineInfos.length);
    expect(list.filter((entry) => entry.enabled)).toHaveLength(1);
    expect(normalizeEngineList("garbage")).toHaveLength(engineInfos.length);
  });

  test("normalizing config keeps string fields of known engines", () => {
    expect(
      normalizeEngineConfig({ deepl: { apiKey: "k", n: 1 }, nope: { apiKey: "x" }, kakao: [] }),
    ).toEqual({ deepl: { apiKey: "k" } });
    expect(normalizeEngineConfig(null)).toEqual({});
  });
});

describe("engine status", () => {
  test.each([
    ["google", {}, "ready"],
    ["google", { google: { apiKey: "AIza" } }, "usesApiKey"],
    ["papago", { papago: { clientId: "id" } }, "ready"],
    ["papago", { papago: { clientId: "id", clientSecret: "s" } }, "usesApiKey"],
    ["kakao", {}, "needsApiKey"],
    ["kakao", { kakao: { apiKey: " " } }, "needsApiKey"],
    ["kakao", { kakao: { apiKey: "k" } }, "ready"],
    ["libreTranslate", {}, "needsSetup"],
    ["libreTranslate", { libreTranslate: { url: "http://lt" } }, "ready"],
    ["localLlm", { localLlm: { endpoint: "http://x/v1" } }, "needsSetup"],
    ["localLlm", { localLlm: { endpoint: "http://x/v1", model: "m" } }, "ready"],
  ])("%s with %j is %s", (id, config, status) => {
    expect(getEngineStatus(config, id)).toBe(status);
  });

  test("only optional-key engines switch to the API", () => {
    expect(usesApiKey({ deepl: { apiKey: "k" } }, "deepl")).toBe(true);
    expect(usesApiKey({ kakao: { apiKey: "k" } }, "kakao")).toBe(false);
  });
});
