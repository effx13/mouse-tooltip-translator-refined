// Extension build: one vite (rolldown) build per entry, emitted as IIFE into
// build/, plus a filtered copy of public/.
//
//   node scripts/build.ts                 production build (chrome/edge, MV3)
//   node scripts/build.ts --firefox       production build with the MV2 manifest
//   node scripts/build.ts --watch         development watch build
import { cp, rm, rename } from "node:fs/promises";
import { build } from "vite";
import { BUILD, ENTRIES, PUBLIC, entryConfig } from "../vite.config.ts";

const args = new Set(process.argv.slice(2));
const watch = args.has("--watch");
const firefox = args.has("--firefox");
const mode = watch || args.has("--dev") ? "development" : "production";

const PUBLIC_EXCLUDE = ["compressed.tracemonkey-pldi-09.pdf", ".md", ".map"];

async function copyPublic() {
  await cp(PUBLIC, BUILD, {
    recursive: true,
    filter: (src) => !PUBLIC_EXCLUDE.some((ex) => src.replaceAll("\\", "/").includes(ex)),
  });
  // build/manifest.json is the one the browser reads
  if (firefox) {
    await rm(`${BUILD}manifest.json`, { force: true });
    await rename(`${BUILD}manifest.firefox.json`, `${BUILD}manifest.json`);
  } else {
    await rm(`${BUILD}manifest.firefox.json`, { force: true });
  }
}

const started = performance.now();
await rm(BUILD, { recursive: true, force: true });
await copyPublic();

// entries are independent builds; run them concurrently
await Promise.all(Object.keys(ENTRIES).map((name) => build(entryConfig(name, { mode, watch }))));

console.log(
  `[build] ${mode}${firefox ? " (firefox)" : ""}: ${Object.keys(ENTRIES).length} entries in ${Math.round(
    performance.now() - started,
  )}ms${watch ? ", watching for changes" : ""}`,
);
