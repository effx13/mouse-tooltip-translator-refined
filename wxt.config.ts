import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  // scripts/insertLocale.py writes public/_locales
  publicDir: "public",
  imports: false,
  modules: ["@wxt-dev/module-svelte", "@wxt-dev/auto-icons"],
  autoIcons: { baseIconPath: "assets/icon.svg" },

  manifest: ({ browser, manifestVersion }) => {
    const firefox = browser === "firefox";
    const csp = "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'";
    return {
      name: "__MSG_appName__",
      description: "__MSG_appDesc__",
      default_locale: "en",
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
          resources: ["pdf.html", "googleDocInject.js"],
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
        browser_specific_settings: { gecko: { id: "mouse-tooltip-translator-refined@effx13" } },
      }),
    };
  },

  zip: {
    excludeSources: ["build/**", "web-ext-artifacts/**", "*.zip"],
  },

  vite: ({ mode }) => ({
    plugins: [tailwindcss()],
    build: {
      chunkSizeWarningLimit: 10_000,
      rolldownOptions: {
        output: mode === "production" ? { minify: { compress: { dropConsole: true } } } : {},
      },
    },
  }),
});
