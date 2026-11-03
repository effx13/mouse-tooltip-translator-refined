import memoizee from "memoizee";
import { memoizeAsync, waitUntil, TimeoutError, sleep } from "../src/util/async.ts";

// parity with the memoizee options the subtitle code used
// ({ promise: true, maxAge }) on a 4-parameter function
function both() {
  let calls = 0;
  const fn = async function (a?: string, b?: string, c?: string, d?: string) {
    calls++;
    return [a, b, c, d].join("|");
  };
  return {
    old: memoizee(fn, { promise: true, maxAge: 60_000 }),
    neu: memoizeAsync(fn, { maxAge: 60_000 }),
    calls: () => calls,
  };
}

describe("memoizeAsync matches memoizee", () => {
  for (const impl of ["old", "neu"] as const) {
    test(`${impl}: 2-arg delete evicts a 2-arg call of a 4-param fn`, async () => {
      const m = both();
      const f = m[impl] as any;
      await f("url", "en");
      await f("url", "en");
      expect(m.calls()).toBe(1);
      f.delete("url", "en");
      await f("url", "en");
      expect(m.calls()).toBe(2);
      // a 1-arg call is a different key than the 2-arg one
      await f("url");
      expect(m.calls()).toBe(3);
      f.delete("url", "en");
      await f("url");
      expect(m.calls()).toBe(3);
    });

    test(`${impl}: rejections are not cached`, async () => {
      let n = 0;
      const fn = async (_a?: string) => {
        n++;
        throw new Error("x");
      };
      const f: any =
        impl === "old" ? memoizee(fn, { promise: true }) : memoizeAsync(fn);
      await expect(f("a")).rejects.toThrow();
      await sleep(0);
      await expect(f("a")).rejects.toThrow();
      expect(n).toBe(2);
    });
  }

  test("forwards this", async () => {
    const obj = {
      v: 3,
      get: memoizeAsync(async function (this: { v: number }) {
        return this.v;
      }),
    };
    expect(await obj.get()).toBe(3);
  });
});

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
