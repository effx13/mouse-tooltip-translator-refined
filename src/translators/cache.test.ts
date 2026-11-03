import { IDBFactory, IDBKeyRange, IDBObjectStore } from "fake-indexeddb";
import { createTranslationCache, type CacheOptions } from "@/translators/cache";
import type { TranslateResult } from "@/utils/messaging";

const DAY = 24 * 60 * 60 * 1000;
let dbCount = 0;
let clock = 0;

const result = (targetText: string): TranslateResult => ({
  targetText,
  sourceLang: "en",
  targetLang: "ko",
});

// a fresh database per cache so the tests do not share entries
const makeCache = (options: CacheOptions = {}) =>
  createTranslationCache({ dbName: `cache-test-${dbCount++}`, now: () => clock, ...options });

vi.stubGlobal("indexedDB", new IDBFactory());
vi.stubGlobal("IDBKeyRange", IDBKeyRange);

beforeEach(() => {
  clock = 1_000_000;
});

describe("translation cache", () => {
  test("a stored result is a hit, anything else a miss", async () => {
    const cache = makeCache();
    expect(await cache.get("a")).toBeUndefined();
    await cache.put("a", result("에이"));
    expect(await cache.get("a")).toEqual(result("에이"));
    expect(await cache.get("b")).toBeUndefined();
  });

  test("keys are kept apart", async () => {
    const cache = makeCache();
    await cache.put('["hi","auto","ko","google"]', result("구글"));
    await cache.put('["hi","auto","ko","deepl"]', result("딥엘"));
    expect((await cache.get('["hi","auto","ko","google"]'))?.targetText).toBe("구글");
    expect((await cache.get('["hi","auto","ko","deepl"]'))?.targetText).toBe("딥엘");
    expect(await cache.count()).toBe(2);
  });

  test("entries expire after the TTL", async () => {
    const cache = makeCache({ ttlMs: 30 * DAY });
    await cache.put("old", result("오래됨"));
    clock += 29 * DAY;
    expect(await cache.get("old")).toBeDefined();
    clock += 2 * DAY;
    expect(await cache.get("old")).toBeUndefined();
  });

  test("broken and empty results are never stored", async () => {
    const cache = makeCache();
    await cache.put("broken", { ...result("google is broken"), isBroken: true });
    await cache.put("empty", result(""));
    await cache.put("image", { ...result(""), imageUrl: "data:image/png;base64," });
    expect(await cache.get("broken")).toBeUndefined();
    expect(await cache.get("empty")).toBeUndefined();
    expect(await cache.get("image")).toBeDefined();
    expect(await cache.count()).toBe(1);
  });

  test("survives a restart through IndexedDB", async () => {
    const dbName = `cache-test-${dbCount++}`;
    await createTranslationCache({ dbName, now: () => clock }).put("kept", result("유지"));
    const restarted = createTranslationCache({ dbName, now: () => clock });
    expect((await restarted.get("kept"))?.targetText).toBe("유지");
  });

  test("pruning keeps the newest entries within the cap and drops expired ones", async () => {
    const cache = makeCache({ maxEntries: 3, pruneEvery: 1000, ttlMs: 10 * DAY });
    await cache.put("expired", result("만료"));
    clock += 9 * DAY;
    for (const key of ["one", "two", "three", "four"]) {
      clock += 1000;
      await cache.put(key, result(key));
    }
    clock += 2 * DAY;
    expect(await cache.count()).toBe(5);
    await cache.prune();
    expect(await cache.count()).toBe(3);
    const fresh = createTranslationCache({ dbName: `cache-test-${dbCount - 1}`, now: () => clock });
    expect(await fresh.get("one")).toBeUndefined();
    expect(await fresh.get("four")).toBeDefined();
  });

  test("pruning runs on its own every few writes", async () => {
    const cache = makeCache({ maxEntries: 2, pruneEvery: 4 });
    for (const key of ["a", "b", "c"]) await cache.put(key, result(key));
    expect(await cache.count()).toBe(3);
    await cache.put("d", result("d"));
    expect(await cache.count()).toBe(2);
  });

  test("the in-memory LRU answers without IndexedDB and evicts the least recently used", async () => {
    const cache = makeCache({ lruSize: 2 });
    await cache.put("a", result("a"));
    await cache.put("b", result("b"));
    const spy = vi.spyOn(IDBObjectStore.prototype, "get");
    expect(await cache.get("a")).toBeDefined();
    expect(await cache.get("b")).toBeDefined();
    expect(spy).not.toHaveBeenCalled();
    // "a" was used last before "c" arrives, so "b" falls out of memory
    await cache.get("a");
    await cache.put("c", result("c"));
    await cache.get("b");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test("clear empties both tiers", async () => {
    const cache = makeCache();
    await cache.put("a", result("a"));
    await cache.clear();
    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.count()).toBe(0);
  });
});
