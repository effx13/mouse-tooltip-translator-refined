import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import VueRouter from "unplugin-vue-router/vite";
import type { InlineConfig, Plugin } from "vite";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url)).replaceAll("\\", "/");
export const SRC = `${root}src/`;
export const BUILD = `${root}build/`;
export const PUBLIC = `${root}public/`;

/**
 * Every script the extension loads by file name. The output name must not
 * change: the manifests, public/*.html, the bundled pdfjs/foliate viewers and
 * runtime getURL()/executeScript() calls all hardcode `<name>.js`.
 *
 * All of them are emitted as self-contained IIFE scripts: content scripts, the
 * MV3 service worker (no "type": "module") / Firefox MV2 background page, and
 * the scripts injected through a plain <script src> can not be ES modules.
 */
export const ENTRIES: Record<string, string> = {
  background: "background",
  contentScript: "contentScript",
  popup: "popup",
  subtitle: "subtitle/subtitle",
  googleDocInject: "googleDoc/googleDocInject",
  pdfInject: "pdf/pdfInject",
  ebookEventInject: "ebook/ebookEventInject",
  ocrIframe: "ocr/ocrIframe",
  offscreen: "tts/offscreen",
  opencvHandler: "ocr/opencvHandler",
};

/** entry source path, whether it has been migrated to .ts yet or not */
export function entryPath(name: string): string {
  const base = SRC + ENTRIES[name];
  return existsSync(`${base}.ts`) ? `${base}.ts` : `${base}.js`;
}

// the codebase imports with root-absolute specifiers ("/src/util/lang.js")
const alias = [{ find: /^\/src\//, replacement: SRC }];

function vuePlugins(): Plugin[] {
  return [
    VueRouter({ routesFolder: `${SRC}pages`, dts: false, importMode: "sync" }),
    vue(),
    Components({ dirs: [`${SRC}components`], dts: false }),
    AutoImport({
      include: [/\.vue$/, /\.vue\?vue/],
      imports: ["vue", "vue-router"],
      dts: false,
    }),
  ] as Plugin[];
}

/** vite config that bundles one extension entry into build/<name>.js */
export function entryConfig(
  name: string,
  { mode, watch }: { mode: "production" | "development"; watch: boolean },
): InlineConfig {
  const production = mode === "production";
  return {
    configFile: false,
    root,
    mode,
    logLevel: "warn",
    // public/ is copied once by scripts/build.ts (with an exclude list)
    publicDir: false,
    // assets are referenced relative to the css file that imports them
    base: "./",
    resolve: { alias },
    define: {
      __VUE_OPTIONS_API__: "true",
      __VUE_PROD_DEVTOOLS__: "false",
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
    },
    plugins: name === "popup" ? vuePlugins() : [],
    build: {
      outDir: BUILD,
      emptyOutDir: false,
      target: "es2022",
      minify: production,
      sourcemap: production ? false : true,
      cssCodeSplit: false,
      // same threshold the webpack url-loader used
      assetsInlineLimit: 25000,
      reportCompressedSize: false,
      // single-file bundles by design; size is tracked by the build summary
      chunkSizeWarningLimit: 10_000,
      copyPublicDir: false,
      watch: watch ? {} : null,
      rolldownOptions: {
        input: { [name]: entryPath(name) },
        output: {
          format: "iife",
          codeSplitting: false,
          entryFileNames: "[name].js",
          // popup.html links "popup.css" by that exact name
          assetFileNames: (asset) =>
            asset.names.some((n) => n.endsWith(".css")) ? `${name}.css` : "assets/[name]-[hash][extname]",
          minify: production ? { compress: { dropConsole: true } } : false,
        },
      },
    },
  };
}

// used by vitest (and editors); the extension build goes through scripts/build.ts
export default defineConfig({
  resolve: { alias },
  test: {
    environment: "node",
    globals: true,
    include: ["__tests__/**/*.test.{js,ts}"],
  },
});
