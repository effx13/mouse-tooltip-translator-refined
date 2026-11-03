import ky from "ky";

export interface ApiRequest {
  method: "get" | "post";
  url: string;
  headers: Record<string, string>;
  searchParams?: Record<string, string>;
  json?: unknown;
}

export const sendApiRequest = <T>({ method, url, headers, searchParams, json }: ApiRequest) =>
  ky(url, { method, headers, searchParams, json, timeout: 20000, retry: 0 }).json<T>();
