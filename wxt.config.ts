import { defineConfig } from "wxt";

const PUBLIC_EXCLUDE = [".md", ".map", "compressed.tracemonkey-pldi-09.pdf"];

export default defineConfig({
  srcDir: "src",
  // doc/insertLocale.py and crowdin.yml write public/_locales
  publicDir: "public",
  imports: false,
  modules: ["@wxt-dev/module-svelte"],

  manifest: ({ browser, manifestVersion }) => {
    const firefox = browser === "firefox";
    const csp = "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'";
    return {
      name: "__MSG_appName__",
      description: "__MSG_appDesc__",
      default_locale: "en",
      icons: {
        16: "icons/icon_16.png",
        32: "icons/icon_32.png",
        48: "icons/icon_48.png",
        128: "icons/icon_128.png",
      },
      content_security_policy: manifestVersion === 3 ? { extension_pages: csp } : (csp as never),
      permissions: firefox
        ? [
            "storage",
            "tabs",
            "scripting",
            "contextMenus",
            "search",
            "webRequest",
            "webRequestBlocking",
          ]
        : ["storage", "tabs", "scripting", "contextMenus", "search", "fontSettings"],
      host_permissions: ["<all_urls>"],
      web_accessible_resources: [
        {
          resources: ["pdfjs/web/viewer.html", "googleDocInject.js"],
          matches: ["<all_urls>"],
        },
      ],
      commands: {
        "copy-translated-text": {
          suggested_key: { default: "Ctrl+Shift+6" },
          description: "Copy Translated Text",
        },
        "copy-source-text": {
          suggested_key: { default: "Ctrl+Shift+7" },
          description: "Copy Source Text",
        },
      },
      omnibox: { keyword: "/" },
      options_ui: firefox ? { page: "popup.html" } : { page: "popup.html", open_in_tab: true },
      ...(firefox && {
        browser_specific_settings: { gecko: { id: "mouse-tooltip-translator@effx13" } },
      }),
    };
  },

  zip: {
    excludeSources: ["build/**", "web-ext-artifacts/**", "*.zip"],
  },

  hooks: {
    "build:publicAssets": (_wxt, files) => {
      const keep = files.filter((f) => !PUBLIC_EXCLUDE.some((ex) => f.relativeDest.includes(ex)));
      files.splice(0, files.length, ...keep);
    },
  },

  vite: ({ mode }) => ({
    build: {
      chunkSizeWarningLimit: 10_000,
      rolldownOptions: {
        output: mode === "production" ? { minify: { compress: { dropConsole: true } } } : {},
      },
    },
  }),
});
