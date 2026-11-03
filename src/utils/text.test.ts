import { filterWord, isUrl, trimAllSpace } from "./text";

describe("isUrl", () => {
  test("accepts urls with a protocol or protocol-relative", () => {
    expect(isUrl("https://example.com")).toBe(true);
    expect(isUrl("http://example.com/path?q=1")).toBe(true);
    expect(isUrl("//cdn.example.com/a.js")).toBe(true);
    expect(isUrl("http://localhost:3000/app")).toBe(true);
  });

  test("rejects text that only looks like a domain or has no host", () => {
    expect(isUrl("example.com")).toBe(false);
    expect(isUrl("https://nodot")).toBe(false);
    expect(isUrl("hello world")).toBe(false);
    expect(isUrl("https://exa mple.com")).toBe(false);
    expect(isUrl(42)).toBe(false);
    expect(isUrl(undefined)).toBe(false);
  });
});

describe("trimAllSpace", () => {
  test("collapses every whitespace run and trims", () => {
    expect(trimAllSpace("  hello \n\t world  ")).toBe("hello world");
    expect(trimAllSpace("a  b")).toBe("a b");
  });

  test("empty input gives an empty string", () => {
    expect(trimAllSpace(null)).toBe("");
    expect(trimAllSpace(undefined)).toBe("");
    expect(trimAllSpace("   ")).toBe("");
  });
});

describe("filterWord", () => {
  test("returns normalized text worth translating", () => {
    expect(filterWord("  Hello\n  world ")).toBe("Hello world");
    expect(filterWord("café 3€")).toBe("café 3€");
    expect(filterWord("こんにちは")).toBe("こんにちは");
  });

  test("drops numbers, symbols, currency and emoji only", () => {
    expect(filterWord("123 456")).toBe("");
    expect(filterWord("$1,000.00")).toBe("");
    expect(filterWord("…!?「」")).toBe("");
    expect(filterWord("😀 🎉")).toBe("");
    expect(filterWord("¥500 €20")).toBe("");
  });

  test("drops urls and overly long text", () => {
    expect(filterWord("https://example.com/page")).toBe("");
    expect(filterWord("a".repeat(1001))).toBe("");
    expect(filterWord("a".repeat(1000))).toBe("a".repeat(1000));
  });

  test("empty input gives an empty string", () => {
    expect(filterWord(null)).toBe("");
    expect(filterWord("")).toBe("");
  });
});
