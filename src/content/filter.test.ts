import { defaultSettings, type Settings } from "@/utils/settings/schema";
import { createRegexTester, getEffectiveSettings, isUrlExcluded } from "./filter";

const settingsWith = (patch: Partial<Settings>): Settings => ({ ...defaultSettings(), ...patch });

describe("isUrlExcluded", () => {
  test("a wildcard entry matches subdomains but not the bare domain", () => {
    const s = settingsWith({
      websiteFilterMode: "blacklist",
      websiteExcludeList: ["*.example.com"],
    });
    expect(isUrlExcluded(s, "https://sub.example.com/page")).toBe(true);
    expect(isUrlExcluded(s, "https://a.b.example.com/")).toBe(true);
    expect(isUrlExcluded(s, "https://example.com/")).toBe(false);
    expect(isUrlExcluded(s, "https://notexample.com/")).toBe(false);
  });

  test("a bare domain entry matches the domain and its subdomains", () => {
    const s = settingsWith({ websiteFilterMode: "blacklist", websiteExcludeList: ["example.com"] });
    expect(isUrlExcluded(s, "https://example.com/a?b=c")).toBe(true);
    expect(isUrlExcluded(s, "https://www.example.com/")).toBe(true);
    expect(isUrlExcluded(s, "https://example.org/")).toBe(false);
    expect(isUrlExcluded(s, "https://myexample.com/")).toBe(false);
  });

  test("a trailing wildcard matches any top-level domain", () => {
    const s = settingsWith({ websiteFilterMode: "blacklist", websiteExcludeList: ["google.*"] });
    expect(isUrlExcluded(s, "https://google.de/search")).toBe(true);
    expect(isUrlExcluded(s, "https://google.co.uk/")).toBe(true);
    expect(isUrlExcluded(s, "https://bing.com/")).toBe(false);
  });

  test("protocol and port in a rule have to match", () => {
    const s = settingsWith({
      websiteFilterMode: "blacklist",
      websiteExcludeList: ["http://plain.test", "localhost:8080"],
    });
    expect(isUrlExcluded(s, "http://plain.test/")).toBe(true);
    expect(isUrlExcluded(s, "https://plain.test/")).toBe(false);
    expect(isUrlExcluded(s, "http://localhost:8080/app")).toBe(true);
    expect(isUrlExcluded(s, "http://localhost:3000/app")).toBe(false);
  });

  test("blacklist mode ignores the whitelist", () => {
    const s = settingsWith({
      websiteFilterMode: "blacklist",
      websiteExcludeList: [],
      websiteWhiteList: ["allowed.com"],
    });
    expect(isUrlExcluded(s, "https://other.com/")).toBe(false);
  });

  test("whitelist mode blocks everything outside the list, even when it is empty", () => {
    const listed = settingsWith({ websiteFilterMode: "whitelist", websiteWhiteList: ["ok.com"] });
    expect(isUrlExcluded(listed, "https://ok.com/")).toBe(false);
    expect(isUrlExcluded(listed, "https://docs.ok.com/")).toBe(false);
    expect(isUrlExcluded(listed, "https://other.com/")).toBe(true);

    const empty = settingsWith({ websiteFilterMode: "whitelist", websiteWhiteList: [] });
    expect(isUrlExcluded(empty, "https://ok.com/")).toBe(true);
  });

  test("auto mode applies both lists and treats an empty whitelist as no restriction", () => {
    const open = settingsWith({
      websiteFilterMode: "auto",
      websiteExcludeList: ["bad.com"],
      websiteWhiteList: [],
    });
    expect(isUrlExcluded(open, "https://bad.com/")).toBe(true);
    expect(isUrlExcluded(open, "https://good.com/")).toBe(false);

    const restricted = settingsWith({
      websiteFilterMode: "auto",
      websiteExcludeList: ["bad.ok.com"],
      websiteWhiteList: ["ok.com"],
    });
    expect(isUrlExcluded(restricted, "https://ok.com/")).toBe(false);
    expect(isUrlExcluded(restricted, "https://bad.ok.com/")).toBe(true);
    expect(isUrlExcluded(restricted, "https://good.com/")).toBe(true);
  });
});

describe("getEffectiveSettings", () => {
  const base = settingsWith({
    translateTarget: "en",
    websiteTargetLangList: [
      "broken-entry",
      "=ko",
      "news.site.com = ja",
      "site.com=ko",
      "*.site.com=de",
    ],
  });

  test("the first matching site=lang entry overrides the target", () => {
    expect(getEffectiveSettings(base, "https://news.site.com/").translateTarget).toBe("ja");
    expect(getEffectiveSettings(base, "https://site.com/").translateTarget).toBe("ko");
    expect(getEffectiveSettings(base, "https://shop.site.com/").translateTarget).toBe("ko");
  });

  test("no match returns the same object untouched", () => {
    const result = getEffectiveSettings(base, "https://elsewhere.org/");
    expect(result).toBe(base);
    expect(result.translateTarget).toBe("en");
  });

  test("never writes into the original settings", () => {
    getEffectiveSettings(base, "https://site.com/");
    expect(base.translateTarget).toBe("en");
  });
});

describe("createRegexTester", () => {
  test("matches with the user's pattern", () => {
    const test = createRegexTester();
    expect(test("^\\d+$", "12345")).toBe(true);
    expect(test("^\\d+$", "12a45")).toBe(false);
  });

  test("an empty pattern never matches", () => {
    expect(createRegexTester()("", "anything")).toBe(false);
  });

  test("an invalid pattern never matches and does not throw", () => {
    const test = createRegexTester();
    expect(() => test("([unclosed", "([unclosed")).not.toThrow();
    expect(test("([unclosed", "([unclosed")).toBe(false);
  });

  test("picks up a changed pattern", () => {
    const test = createRegexTester();
    expect(test("cat", "a cat")).toBe(true);
    expect(test("dog", "a cat")).toBe(false);
    expect(test("cat", "a cat")).toBe(true);
  });
});
