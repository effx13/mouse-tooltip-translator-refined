import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { onMessage } from "@/utils/messaging";
import { getSettings, type Settings, watchSettings } from "@/utils/settings";
import { createApp } from "./app";
import { bridgeBookFusion } from "./bookFusion";
import {
  getCurrentUrl,
  isBookFusion,
  isEbookReader,
  isGoogleDoc,
  isPdfDocument,
  isPdfViewer,
  onDomReady,
} from "./env";
import { getEffectiveSettings, isUrlExcluded } from "./filter";
import { injectGoogleDocAnnotation } from "./googleDocs";
import { takeOverPdf } from "./pdf";

export { watchSelection } from "./detect/selection";

// popup bookkeeping that should not reset every tooltip on the page
const IGNORED_CHANGES = new Set<string>(["lastSettingTab", "langPriority"]);

function hasRelevantChange(prev: Settings, next: Settings) {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  return [...keys].some(
    (key) =>
      !IGNORED_CHANGES.has(key) &&
      JSON.stringify(prev[key as keyof Settings]) !== JSON.stringify(next[key as keyof Settings]),
  );
}

function listenForCopy(ctx: ContentScriptContext) {
  const unlisten = onMessage("copyText", async ({ data }) => {
    try {
      await navigator.clipboard.writeText(data);
    } catch {
      // every frame of the tab receives this; unfocused frames cannot write
    }
  });
  ctx.onInvalidated(unlisten);
}

async function run(ctx: ContentScriptContext) {
  const isViewerPage = isPdfViewer() || isEbookReader();
  // Docs reads the annotation flag early, so inject before anything async
  if (isGoogleDoc()) injectGoogleDocAnnotation();

  let rawSettings = await getSettings();
  if (ctx.isInvalid) return;
  const url = getCurrentUrl();
  const state = {
    settings: getEffectiveSettings(rawSettings, url),
    active: !isUrlExcluded(rawSettings, url),
  };
  let app: ReturnType<typeof createApp> | undefined;

  // watch before waiting for the DOM so changes made meanwhile are not lost
  const unwatch = watchSettings((next) => {
    const relevant = hasRelevantChange(rawSettings, next);
    rawSettings = next;
    if (ctx.isInvalid || !relevant) return;
    const settings = getEffectiveSettings(next, url);
    const active = !isUrlExcluded(next, url);
    if (app) {
      app.applySettings(settings, active);
    } else {
      state.settings = settings;
      state.active = active;
    }
  });
  ctx.onInvalidated(unwatch);

  await onDomReady();
  if (ctx.isInvalid) return;
  // the wrapper page only hosts the viewer iframe, which runs its own copy of this script
  if (!isViewerPage && state.active && state.settings.detectPDF && isPdfDocument()) {
    unwatch();
    takeOverPdf();
    return;
  }

  app = createApp(ctx, state);
  app.listen();
  listenForCopy(ctx);
  if (isBookFusion()) bridgeBookFusion(ctx);
}

export async function startContentScript(ctx: ContentScriptContext) {
  try {
    await run(ctx);
  } catch (error) {
    console.log(error);
  }
}
