import { waitUntil, TimeoutError } from "@/utils/async";

describe("waitUntil", () => {
  test("resolves with the truthy value", async () => {
    let i = 0;
    expect(await waitUntil(() => (++i > 2 ? "done" : ""), { interval: 1 })).toBe("done");
  });
  test("rejects with TimeoutError", async () => {
    await expect(waitUntil(() => false, { timeout: 30, interval: 5 })).rejects.toBeInstanceOf(
      TimeoutError,
    );
  });
});
