// Small async helpers that replace `delay`, `async-wait-until` and `memoizee`.

export const WAIT_FOREVER = Number.POSITIVE_INFINITY;

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after waiting for ${ms} ms`);
    this.name = "TimeoutError";
  }
}

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface WaitUntilOptions {
  /** default 5000ms, like async-wait-until; pass WAIT_FOREVER to never give up */
  timeout?: number;
  /** default 50ms */
  interval?: number;
}

/**
 * Poll `predicate` until it returns a truthy value and resolve with that value.
 * Rejects with TimeoutError after `timeout`, or with whatever the predicate
 * throws (same contract as async-wait-until).
 */
export async function waitUntil<T>(
  predicate: () => T | Promise<T>,
  { timeout = 5000, interval = 50 }: WaitUntilOptions = {},
): Promise<NonNullable<T>> {
  const deadline = timeout === WAIT_FOREVER ? WAIT_FOREVER : Date.now() + timeout;
  for (;;) {
    const value = await predicate();
    if (value) return value as NonNullable<T>;
    if (Date.now() + interval > deadline) {
      await sleep(Math.max(0, deadline - Date.now()));
      const last = await predicate();
      if (last) return last as NonNullable<T>;
      throw new TimeoutError(timeout);
    }
    await sleep(interval);
  }
}

export const waitUntilForever = <T>(predicate: () => T | Promise<T>) =>
  waitUntil(predicate, { timeout: WAIT_FOREVER });

export interface MemoizedAsync<A extends unknown[], R> {
  (...args: A): Promise<R>;
  /** evict the entry for exactly these arguments */
  delete(...args: A): void;
  clear(): void;
}

/**
 * Promise memoization keyed by the JSON of the arguments. Rejected promises
 * are not cached (memoizee `promise: true`), and entries expire after
 * `maxAge` ms.
 */
export function memoizeAsync<A extends unknown[], R>(
  fn: (this: any, ...args: A) => Promise<R>,
  { maxAge = WAIT_FOREVER, length }: { maxAge?: number; length?: number } = {},
): MemoizedAsync<A, R> {
  const cache = new Map<string, { promise: Promise<R>; expires: number }>();
  // memoizee keys on the declared parameter count: missing trailing args are
  // `undefined` and extra args are ignored
  const arity = length ?? fn.length;
  const keyOf = (args: unknown[]) =>
    JSON.stringify(Array.from({ length: arity }, (_, i) => args[i] ?? null));

  // a plain function so `this` is forwarded (callers memoize static methods)
  const memo = function (this: unknown, ...args: A) {
    const key = keyOf(args);
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.promise;
    const promise = fn.apply(this, args);
    cache.set(key, { promise, expires: Date.now() + maxAge });
    promise.catch(() => {
      if (cache.get(key)?.promise === promise) cache.delete(key);
    });
    return promise;
  } as MemoizedAsync<A, R>;
  memo.delete = (...args) => void cache.delete(keyOf(args));
  memo.clear = () => cache.clear();
  return memo;
}
