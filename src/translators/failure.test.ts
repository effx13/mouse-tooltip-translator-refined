import { HTTPError, TimeoutError } from "ky";
import { classifyFailure } from "./failure";

const httpError = (status: number) => {
  const request = new Request("https://translation.googleapis.com/x?key=SECRET");
  return new HTTPError(new Response(null, { status }), request, {} as never);
};

describe("classifyFailure", () => {
  test.each([
    [429, "rateLimited"],
    [401, "auth"],
    [403, "auth"],
    [456, "quota"],
    [503, "server"],
    [404, "other"],
  ] as const)("HTTP %i is %s", (status, kind) => {
    expect(classifyFailure("google", httpError(status))).toEqual({
      engine: "google",
      kind,
      status,
    });
  });

  test("timeouts and network errors", () => {
    const timeout = new TimeoutError(new Request("https://example.com"));
    expect(classifyFailure("bing", timeout).kind).toBe("timeout");
    expect(classifyFailure("bing", new TypeError("Failed to fetch")).kind).toBe("network");
  });

  test("other errors keep their message without API keys", () => {
    const failure = classifyFailure("google", new Error("bad https://x?key=SECRET&q=1"));
    expect(failure).toEqual({
      engine: "google",
      kind: "other",
      detail: "bad https://x?key=***&q=1",
    });
  });
});
