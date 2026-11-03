// Native WebExtension API, no polyfill. Firefox exposes promise-based
// `browser`, Chromium (MV3) exposes promise-based `chrome`.
//
// In page-context scripts (subtitle.js, googleDocInject.js) there is no
// extension API: `browser.runtime?.id` is undefined there, so guard with
// `isExtensionContext()` before touching anything.
declare global {
  // eslint-disable-next-line no-var
  var browser: typeof chrome | undefined;
}

export const browser: typeof chrome =
  globalThis.browser ?? (globalThis as { chrome?: typeof chrome }).chrome!;

export const isExtensionContext = () => Boolean(browser?.runtime?.id);

export default browser;
