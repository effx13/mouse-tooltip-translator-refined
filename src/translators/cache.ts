import type { TranslateResult } from "@/utils/messaging";

interface CacheEntry {
  key: string;
  result: TranslateResult;
  savedAt: number;
}

export interface CacheOptions {
  dbName?: string;
  lruSize?: number;
  maxEntries?: number;
  ttlMs?: number;
  // prune the database once every this many writes
  pruneEvery?: number;
  now?: () => number;
}

export interface TranslationCache {
  get(key: string): Promise<TranslateResult | undefined>;
  put(key: string, result: TranslateResult): Promise<void>;
  count(): Promise<number>;
  clear(): Promise<void>;
  prune(): Promise<void>;
}

const STORE = "entries";
const DAY_MS = 24 * 60 * 60 * 1000;

const isCacheable = (result: TranslateResult) =>
  !result.isBroken && Boolean(result.targetText || result.imageUrl);

const promisify = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });

const transactionDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.addEventListener("complete", () => resolve());
    tx.addEventListener("error", () => reject(tx.error));
    tx.addEventListener("abort", () => reject(tx.error));
  });

function openDb(name: string): Promise<IDBDatabase> {
  const request = indexedDB.open(name, 1);
  request.addEventListener("upgradeneeded", () => {
    const store = request.result.createObjectStore(STORE, { keyPath: "key" });
    store.createIndex("savedAt", "savedAt");
  });
  return promisify(request);
}

// in-memory LRU in front of IndexedDB (both the MV3 service worker and the MV2 background page have it)
export function createTranslationCache({
  dbName = "translation-cache",
  lruSize = 500,
  maxEntries = 5000,
  ttlMs = 30 * DAY_MS,
  pruneEvery = 100,
  now = Date.now,
}: CacheOptions = {}): TranslationCache {
  const lru = new Map<string, CacheEntry>();
  let db: Promise<IDBDatabase | null> | undefined;
  let writes = 0;

  // without IndexedDB (blocked storage, tests) the cache is memory only
  const getDb = () =>
    (db ??=
      typeof indexedDB === "undefined"
        ? Promise.resolve(null)
        : openDb(dbName).catch((error) => {
            console.log(error);
            return null;
          }));

  async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T | undefined> {
    try {
      const database = await getDb();
      if (!database) return undefined;
      const tx = database.transaction(STORE, mode);
      const [value] = await Promise.all([run(tx.objectStore(STORE)), transactionDone(tx)]);
      return value;
    } catch (error) {
      console.log(error);
      return undefined;
    }
  }

  const remember = (entry: CacheEntry) => {
    lru.delete(entry.key);
    lru.set(entry.key, entry);
    if (lru.size > lruSize) lru.delete(lru.keys().next().value ?? "");
  };
  const isFresh = (entry: CacheEntry) => now() - entry.savedAt < ttlMs;

  async function prune() {
    await withStore("readwrite", async (store) => {
      const index = store.index("savedAt");
      // expired first, then the oldest beyond the cap
      const expired = await promisify(index.getAllKeys(IDBKeyRange.upperBound(now() - ttlMs)));
      for (const key of expired) store.delete(key);
      // requests run in order, so the count already excludes the deletes above
      const excess = (await promisify(store.count())) - maxEntries;
      if (excess <= 0) return;
      const oldest = await promisify(
        index.getAllKeys(IDBKeyRange.lowerBound(now() - ttlMs, true), excess),
      );
      for (const key of oldest) store.delete(key);
    });
  }

  return {
    async get(key) {
      const hot = lru.get(key);
      if (hot && isFresh(hot)) {
        remember(hot);
        return hot.result;
      }
      lru.delete(key);
      const stored = await withStore("readonly", (store) =>
        promisify<CacheEntry | undefined>(store.get(key)),
      );
      if (!stored || !isFresh(stored)) return undefined;
      remember(stored);
      return stored.result;
    },
    async put(key, result) {
      if (!isCacheable(result)) return;
      const entry: CacheEntry = { key, result, savedAt: now() };
      remember(entry);
      await withStore("readwrite", (store) => promisify(store.put(entry)));
      // the MV3 worker rarely lives for many writes, so each process also prunes on its first one
      writes++;
      if (writes === 1 || writes % pruneEvery === 0) await prune();
    },
    async count() {
      const stored = await withStore("readonly", (store) => promisify(store.count()));
      return stored ?? lru.size;
    },
    async clear() {
      lru.clear();
      await withStore("readwrite", (store) => promisify(store.clear()));
    },
    prune,
  };
}

export const translationCache = createTranslationCache();
