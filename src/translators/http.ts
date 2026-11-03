import ky from "ky";

// no retries: the next engine in the chain is the retry, and ky's default honours Retry-After on
// 429, which kept the tooltip waiting instead of falling back
export const http = ky.create({ retry: 0, timeout: 10_000 });
