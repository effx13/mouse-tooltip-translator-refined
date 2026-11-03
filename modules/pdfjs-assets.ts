import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineWxtModule } from "wxt/modules";

const OUT_DIR = "pdfjs";
const DATA_DIRS = ["cmaps", "standard_fonts", "iccs", "wasm"];
// quickjs is only used by the scripting sandbox (disabled); wasm always loads under our CSP
const SKIP = /quickjs|_nowasm_fallback\.js$/i;
const WORKER = "pdf.worker.min.mjs";

export default defineWxtModule({
  name: "pdfjs-assets",
  setup(wxt) {
    const require = createRequire(join(wxt.config.root, "package.json"));
    const root = dirname(require.resolve("pdfjs-dist/package.json"));

    wxt.hooks.hook("prepare:publicPaths", (_wxt, paths) => {
      paths.push(`${OUT_DIR}/${WORKER}`, ...DATA_DIRS.map((dir) => `${OUT_DIR}/${dir}`));
    });

    wxt.hooks.hook("build:publicAssets", async (_wxt, files) => {
      files.push({
        absoluteSrc: join(root, "build", WORKER),
        relativeDest: `${OUT_DIR}/${WORKER}`,
      });
      for (const dir of DATA_DIRS) {
        for (const name of await readdir(join(root, dir))) {
          if (SKIP.test(name)) continue;
          files.push({
            absoluteSrc: join(root, dir, name),
            relativeDest: `${OUT_DIR}/${dir}/${name}`,
          });
        }
      }
    });
  },
});
