import { matchOrThrow, required } from "./parse";

describe("matchOrThrow", () => {
  test("returns the requested group", () => {
    expect(matchOrThrow('token="abc123"', /token="(\w+)"/)).toBe("abc123");
    expect(matchOrThrow("v=1.2", /v=(\d)\.(\d)/, 2)).toBe("2");
    expect(matchOrThrow("key=value", /key=\w+/, 0)).toBe("key=value");
  });

  test("an empty capture is still a match", () => {
    expect(matchOrThrow('token=""', /token="(\w*)"/)).toBe("");
  });

  test("throws when the page changed shape", () => {
    expect(() => matchOrThrow("<html></html>", /token="(\w+)"/)).toThrow(/no match/);
    expect(() => matchOrThrow("a", /(a)|(b)/, 2)).toThrow(/no match/);
  });
});

describe("required", () => {
  test("passes falsy but present values through", () => {
    expect(required(0, "count")).toBe(0);
    expect(required("", "text")).toBe("");
    expect(required(false, "flag")).toBe(false);
  });

  test("throws on null and undefined with the field name", () => {
    expect(() => required(null, "token")).toThrow("token is missing");
    expect(() => required(undefined, "ig")).toThrow("ig is missing");
  });
});
