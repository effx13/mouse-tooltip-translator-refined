import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import VueRouter from "unplugin-vue-router/vite";
import { defineConfig } from "wxt";

const SRC = new URL("./src/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");

// public/ files that must not ship
const PUBLIC_EXCLUDE = [".md", ".map", "compressed.tracemonkey-pldi-09.pdf"];

export default defineConfig({
  srcDir: "src",
  // stays at the repo root: doc/insertLocale.py and crowdin.yml write public/_locales
  publicDir: "public",
  // explicit imports only
  imports: false,
  modules: ["@wxt-dev/module-vue"],

  manifest: ({ browser, manifestVersion }) => {
    const firefox = browser === "firefox";
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
      content_security_policy:
        manifestVersion === 3
          ? { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'" }
          : ("script-src 'self' 'wasm-unsafe-eval'; object-src 'none'" as never),
      permissions: firefox
        ? ["storage", "tabs", "scripting", "contextMenus", "search", "webRequest", "webRequestBlocking"]
        : ["storage", "tts", "tabs", "scripting", "contextMenus", "offscreen", "search", "fontSettings"],
      host_permissions: ["<all_urls>"],
      web_accessible_resources: [
        {
          resources: [
            "pdfjs/web/viewer.html",
            "ocr.html",
            "opencvHandler.html",
            "googleDocInject.js",
            "subtitle.js",
            "popup.html",
          ],
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
      action: { default_title: "Mouse Tooltip Translator" },
      options_ui: firefox
        ? { page: "popup.html" }
        : { page: "popup.html", open_in_tab: true },
      ...(firefox && {
        browser_specific_settings: { gecko: { id: "mouse.tooltip.translator@gmail.com" } },
      }),
    };
  },

  zip: {
    // Firefox AMO review needs the sources zip; keep stale local artifacts out
    excludeSources: ["build/**", "web-ext-artifacts/**", "*.zip"],
  },

  hooks: {
    "build:publicAssets": (_wxt, files) => {
      const keep = files.filter((f) => !PUBLIC_EXCLUDE.some((ex) => f.relativeDest.includes(ex)));
      files.splice(0, files.length, ...keep);
    },
  },

  vite: ({ mode }) => ({
    resolve: {
      // legacy root-absolute specifiers ("/src/util/lang.js")
      alias: [{ find: /^\/src\//, replacement: SRC }],
    },
    define: {
      __VUE_OPTIONS_API__: "true",
      __VUE_PROD_DEVTOOLS__: "false",
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
    },
    plugins: [
      // must run before the vue plugin added by @wxt-dev/module-vue
      VueRouter({ routesFolder: `${SRC}pages`, dts: false }),
      Components({ dirs: [`${SRC}components`], dts: false }),
      AutoImport({ include: [/\.vue$/, /\.vue\?vue/], imports: ["vue", "vue-router"], dts: false }),
    ],
    build: {
      chunkSizeWarningLimit: 10_000,
      rolldownOptions: {
        // production builds strip console.* like the old webpack build did
        output: mode === "production" ? { minify: { compress: { dropConsole: true } } } : {},
      },
    },
  }),
});
