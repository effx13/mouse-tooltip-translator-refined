import type { Settings } from "@/utils/settings";

interface ParsedUrl {
  protocol: string | null;
  host: string;
  port: number | null;
}

const escapeRegExp = (str: string) => str.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");

function parseUrl(url: string): ParsedUrl | null {
  if (!url) return null;
  const protocol = /^(\w+):\/\//.exec(url)?.[1] ?? null;
  let host = url.replace(/^(\w+):\/\//, "").replace(/\/.{0,10000}$/, "");
  const port = /:(\d+)$/.exec(host)?.[1];
  host = host.replace(/:(\d+)$/, "");
  return { protocol, host, port: port ? Number.parseInt(port, 10) : null };
}

// same semantics as the match-url-wildcard package the legacy code used
function matchRule(url: ParsedUrl | null, ruleText: string): boolean {
  const rule = parseUrl(ruleText);
  if (!url || !rule) return false;
  const pattern = rule.host.replace(/^\*\./, ".").replace(/\.\*$/, ".");
  const protocolOk = !rule.protocol || !url.protocol || rule.protocol === url.protocol;
  const portOk = !rule.port || url.port === rule.port;
  let re = "^";
  if (pattern.startsWith(".")) re += ".+";
  re += escapeRegExp(pattern).replaceAll("\\.\\*", "\\..*");
  if (pattern.endsWith(".")) re += ".+";
  re += "$";
  return protocolOk && portOk && new RegExp(re).test(url.host);
}

// a bare "example.com" entry also matches its subdomains
export function matchSite(url: string, list: readonly string[] | undefined): boolean {
  if (!list?.length) return false;
  const parsed = parseUrl(url);
  return list.some((entry) => {
    if (matchRule(parsed, entry)) return true;
    const host = String(entry)
      .replace(/^\w+:\/\//, "")
      .replace(/[/?#].*$/, "")
      .replace(/:\d+$/, "");
    return Boolean(host) && matchRule(parsed, `*.${host}`);
  });
}

export function isUrlExcluded(settings: Settings, url: string): boolean {
  const { websiteFilterMode: mode, websiteExcludeList, websiteWhiteList } = settings;
  const excluded = matchSite(url, websiteExcludeList);
  if (mode === "blacklist") return excluded;
  // explicit whitelist mode: an empty list blocks everywhere
  if (mode === "whitelist") return !matchSite(url, websiteWhiteList);
  // "auto": both lists apply, an empty whitelist means no restriction
  return excluded || (websiteWhiteList.length > 0 && !matchSite(url, websiteWhiteList));
}

// "site=lang" entries, first match wins
export function matchTargetLang(url: string, list: readonly string[] | undefined): string | null {
  for (const entry of list ?? []) {
    const raw = String(entry);
    const sep = raw.indexOf("=");
    if (sep <= 0) continue;
    const site = raw.slice(0, sep).trim();
    const lang = raw.slice(sep + 1).trim();
    if (site && lang && matchSite(url, [site])) return lang;
  }
  return null;
}

// the content script never writes settings, so the per-site target is just a local view
export function getEffectiveSettings(settings: Settings, url: string): Settings {
  const target = matchTargetLang(url, settings.websiteTargetLangList);
  return target ? { ...settings, translateTarget: target } : settings;
}
