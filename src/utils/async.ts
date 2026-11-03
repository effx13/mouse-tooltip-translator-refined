export const WAIT_FOREVER = Number.POSITIVE_INFINITY;

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after waiting for ${ms} ms`);
    this.name = "TimeoutError";
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface WaitUntilOptions {
  // default 5000ms, like async-wait-until; pass WAIT_FOREVER to never give up
  timeout?: number;
  // default 50ms
  interval?: number;
}

// rejects with TimeoutError after `timeout` (default 5s), or with what the predicate throws
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
