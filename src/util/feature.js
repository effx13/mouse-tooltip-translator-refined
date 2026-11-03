// On-demand feature bundles for the content script.
//
// Heavy, optional features are separate unlisted scripts (src/entrypoints/
// *Feature.ts) that register themselves on a global of the content script's
// isolated world. They are only injected into a frame when that frame actually
// needs them (OCR key held over an image, a video site with subtitles on), so
// pages that never use them don't pay for the code.
import browser from "webextension-polyfill";
import * as util from "/src/util";

/** feature name -> bundle file, also the background's allowlist */
export const FEATURE_FILES = {
  ocr: "/ocrFeature.js",
  subtitle: "/subtitleFeature.js",
};

const globalKey = (name) => `__mttFeature_${name}`;
const loading = {};

export function registerFeature(name, api) {
  globalThis[globalKey(name)] = api;
}

export function getLoadedFeature(name) {
  return globalThis[globalKey(name)];
}

export function loadFeature(name) {
  const loaded = getLoadedFeature(name);
  if (loaded) return Promise.resolve(loaded);
  loading[name] ??= inject(name)
    .then(() => {
      const api = getLoadedFeature(name);
      if (!api) throw new Error(`feature ${name} did not register`);
      return api;
    })
    .catch((error) => {
      delete loading[name]; // allow a retry later
      throw error;
    });
  return loading[name];
}

function isExtensionPage() {
  return location.origin === new URL(browser.runtime.getURL("/")).origin;
}

async function inject(name) {
  const file = FEATURE_FILES[name];
  // extension pages (pdf viewer, ebook reader) can not be targeted by
  // scripting.executeScript, but share one world with us: use a script tag
  if (isExtensionPage()) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = browser.runtime.getURL(file);
      script.onload = resolve;
      script.onerror = reject;
      document.documentElement.append(script);
    });
    return;
  }
  const res = await util.sendMessage({ type: "injectFeature", data: { name } });
  if (!res?.ok) throw new Error(`could not inject feature ${name}`);
}
