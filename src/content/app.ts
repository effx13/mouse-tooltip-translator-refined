import type { ContentScriptContext } from "wxt/utils/content-script-context";
import type { TranslateResult } from "@/utils/messaging";
import { isLangExcluded, isRedundantTranslation } from "@/utils/lang";
import type { Settings } from "@/utils/settings";
import { MouseoverDetector, type BridgedMouseEvent, type HoverResult } from "./detect/mouseover";
import type { DetectType } from "./detect/range";
import {
  getSelectionText,
  readSelectionEnd,
  SELECTION_END_EVENT,
  watchSelection,
} from "./detect/selection";
import { getFocusedWritingBox, isBookFusion, isGoogleDoc, isPdfViewer } from "./env";
import { forwardGoogleDocKeys } from "./googleDocs";
import { clearHighlight, removeHighlightStyles, showHighlight } from "./highlight";
import { type KeyAction, KeyState, mouseKey } from "./keys";
import { createPageTranslator } from "./pageTranslate";
import { Tooltip } from "./tooltip";
import { buildTooltipContent } from "./tooltipContent";
import { reportTooltipShown, requestTranslate } from "./translate";
import { createWritingTranslator } from "./writing";

type ActionType = "mouseover" | "select";

const DETECT_TYPES = new Set<string>(["word", "sentence", "container"]);
const asDetectType = (value: string): DetectType =>
  DETECT_TYPES.has(value) ? (value as DetectType) : "sentence";

// mouse counts as "moved" after three moves of more than 3px
const MOVE_THRESHOLD_PX = 3;
const MOVE_COUNT = 3;

export interface AppState {
  settings: Settings;
  // false while the site is excluded by the website filter
  active: boolean;
}

export function createApp(ctx: ContentScriptContext, state: AppState) {
  const getSettings = () => state.settings;

  let mouseMoved = false;
  let movedCount = 0;
  let lastX = 0;
  let lastY = 0;
  let mouseTarget: EventTarget | null = null;
  let selectedText = "";
  let prevSelected = "";
  let stagedText: string | null = null;
  let hovered: HoverResult | null = null;
  // session on/off from keyToggleEnable, per frame and not saved
  let disabled = false;
  let excludeRegex: { src: string; re: RegExp | null } = { src: "", re: null };

  const tooltip = new Tooltip(ctx, getSettings);
  const translateWriting = createWritingTranslator(getSettings);
  const togglePageTranslate = createPageTranslator();

  const useSecondary = () =>
    state.settings.keySecondaryLang !== "null" &&
    keys.isActive("keySecondaryLang") &&
    state.settings.translateTarget2 !== "null";

  function getDetectType(): DetectType {
    const s = state.settings;
    const type = asDetectType(useSecondary() ? s.mouseoverTextType2 : s.mouseoverTextType);
    if (!keys.isActive("keyHoldMouseoverTextType")) return type;
    return type === "word" ? "sentence" : "word";
  }

  const detector = new MouseoverDetector(ctx, {
    getType: getDetectType,
    getInterval: () => state.settings.mouseoverEventInterval,
    onText: (result) => stageHover(result),
  });

  const keys = new KeyState(ctx, getSettings, {
    onPress: handleKeyAction,
    onRelease: handleKeyRelease,
    onKeydown: (e) => {
      // Ctrl+A / Ctrl+F: hide until the mouse moves again
      if (e.ctrlKey && /KeyA|KeyF/.test(e.code ?? "")) {
        mouseMoved = false;
        hideTooltip();
      }
    },
  });
  keys.rebuild();

  function hideTooltip() {
    tooltip.hide();
    clearHighlight();
  }

  // an invalid pattern never excludes
  function isExcludedByRegex(text: string) {
    const src = state.settings.translateExcludeRegex;
    if (!src) return false;
    if (excludeRegex.src !== src) {
      let re: RegExp | null = null;
      try {
        re = new RegExp(src);
      } catch {
        re = null;
      }
      excludeRegex = { src, re };
    }
    return excludeRegex.re?.test(text) ?? false;
  }

  // by default no hover tooltip while typing; Google Docs is always a "writing field"
  const isSuppressedWhileWriting = () =>
    !state.settings.mouseoverWhileWriting && !isGoogleDoc() && Boolean(getFocusedWritingBox());

  function stageHover(result?: HoverResult) {
    if (result) hovered = result;
    if (!state.settings.translateWhen.includes("mouseover") || !hovered) return;
    // an existing selection wins over hover
    if (selectedText || isSuppressedWhileWriting()) return;
    void stageText(hovered.text, "mouseover", hovered.range);
  }

  function stageSelect(text?: string) {
    if (!state.settings.translateWhen.includes("select")) return;
    prevSelected = selectedText;
    if (text !== undefined) selectedText = text;
    // a sentence dragged over several lines (PDF especially) is translated as one
    const selectText = selectedText.replace(/\s+/g, " ").trim();
    // a stationary double-click never moves the mouse, and its mousedown reset mouseMoved
    if (selectText) mouseMoved = true;
    void stageText(selectText, "select", null);
  }

  async function stageText(text: string, action: ActionType, range: Range | null) {
    const secondary = useSecondary();
    const tooltipOn = keys.isActive("showTooltipWhen") || secondary;
    if (
      disabled ||
      ctx.isInvalid ||
      !mouseMoved ||
      document.visibilityState !== "visible" ||
      tooltip.contains(mouseTarget) ||
      stagedText === text ||
      // a select event that changes nothing would make the tooltip flicker
      (action === "select" && !text && selectedText === prevSelected)
    ) {
      return;
    }
    if (!text) {
      stagedText = text;
      hideTooltip();
      return;
    }
    if (!tooltipOn) {
      hideTooltip();
      return;
    }
    if (isExcludedByRegex(text)) {
      stagedText = text;
      hideTooltip();
      return;
    }

    stagedText = text;
    const s = state.settings;
    const result = await requestTranslate({
      text,
      sourceLang: s.translateSource,
      targetLang: secondary ? s.translateTarget2 : s.translateTarget,
      reverseLang: s.translateReverseTarget,
    });
    // a newer text took over while this one was being translated
    if (stagedText !== text || ctx.isInvalid) return;
    if (
      !result?.targetText ||
      isRedundantTranslation(text, result.targetText, result.sourceLang, result.targetLang) ||
      isLangExcluded(state.settings.langExcludeList, result.sourceLang)
    ) {
      hideTooltip();
      return;
    }
    showTranslation(text, result, range);
  }

  function showTranslation(text: string, result: TranslateResult, range: Range | null) {
    const s = state.settings;
    const nodes = buildTooltipContent(text, result, s);
    const key = JSON.stringify([
      text,
      result.targetText,
      result.sourceLang,
      result.targetLang,
      result.dict,
    ]);
    void tooltip.show(nodes, key);
    reportTooltipShown(text, result.targetText);
    if (range && s.mouseoverHighlightText) showHighlight(range, s.mouseoverTextHighlightColor);
    else clearHighlight();
  }

  // re-evaluate what is under the cursor (or the selection) after a key changes the mode
  async function restartWordProcess() {
    // let a click finish changing the selection
    await new Promise((resolve) => ctx.setTimeout(() => resolve(undefined), 10));
    const outerSelection = getSelectionText();
    stagedText = null;
    if (outerSelection || selectedText) stageSelect();
    else void detector.trigger();
  }

  function handleKeyAction(action: KeyAction) {
    switch (action) {
      case "keyDownTranslateWriting":
        void translateWriting();
        break;
      case "keyDownTranslatePage":
        void togglePageTranslate(state.settings.translateTarget);
        break;
      case "keyToggleEnable":
        disabled = !disabled;
        hideTooltip();
        break;
      case "keySecondaryLang":
        if (state.settings.translateTarget2 !== "null") {
          stagedText = null;
          stageHover();
        } else {
          void restartWordProcess();
        }
        break;
      default:
        void restartWordProcess();
    }
  }

  function handleKeyRelease(key: string) {
    const s = state.settings;
    if (key === s.keySecondaryLang && s.translateTarget2 !== "null") {
      stagedText = null;
      stageHover();
    }
    if (key === s.keyHoldMouseoverTextType) void restartWordProcess();
  }

  function resetStatus({ keys: resetKeys = true, mouse = true } = {}) {
    if (resetKeys) keys.reset();
    if (mouse) {
      mouseMoved = false;
      movedCount = 0;
    }
    selectedText = "";
    stagedText = null;
    hideTooltip();
  }

  function checkMouseMoved(x: number, y: number) {
    if (
      !mouseMoved &&
      Math.abs(x - lastX) + Math.abs(y - lastY) > MOVE_THRESHOLD_PX &&
      movedCount < MOVE_COUNT
    ) {
      movedCount++;
    } else if (movedCount >= MOVE_COUNT) {
      mouseMoved = true;
    }
    return mouseMoved;
  }

  function handleMousemove(e: BridgedMouseEvent) {
    if (!state.active) return;
    const moved = checkMouseMoved(e.clientX, e.clientY);
    lastX = e.clientX;
    lastY = e.clientY;
    mouseTarget = e.target;
    if (moved) tooltip.moveTo(e.clientX, e.clientY);
    detector.track(e);
  }

  // a left click hides the tooltip until the mouse moves, unless left click is the trigger
  function dismissOnClick(e: MouseEvent) {
    const key = mouseKey(e.button);
    if (key !== "ClickLeft" || keys.isBoundToTooltip(key)) return;
    mouseMoved = false;
    hideTooltip();
  }

  function listen() {
    const capture = { capture: true };
    ctx.addEventListener(window, "mousemove", handleMousemove, capture);
    ctx.addEventListener(window, "touchstart", () => (mouseMoved = true), capture);
    ctx.addEventListener(window, "scroll", () => clearHighlight(), capture);
    // the text under the cursor changed: document scroll only, except in the pdf viewer whose
    // pages scroll inside their own container
    ctx.addEventListener(
      window,
      "scroll",
      () => state.active && detector.schedule(),
      isPdfViewer() ? capture : undefined,
    );
    ctx.addEventListener(window, "keydown", (e) => state.active && keys.handleKeydown(e), capture);
    ctx.addEventListener(window, "keyup", (e) => state.active && keys.handleKeyup(e), capture);
    ctx.addEventListener(
      window,
      "mousedown",
      (e) => {
        if (!state.active) return;
        keys.handleMouseDown(e);
        dismissOnClick(e);
      },
      capture,
    );
    ctx.addEventListener(window, "mouseup", (e) => state.active && keys.handleMouseUp(e), capture);
    // window blur only (tab/app switch); legacy also reset on every element blur
    ctx.addEventListener(window, "blur", () => resetStatus());
    // drop our node as soon as an editor gets focus so it is never serialized
    ctx.addEventListener(
      window,
      "focusin",
      () => {
        if (isGoogleDoc() || !getFocusedWritingBox()) return;
        tooltip.remove();
        clearHighlight();
      },
      capture,
    );
    ctx.addEventListener(
      window,
      SELECTION_END_EVENT,
      (e: Event) => state.active && stageSelect(readSelectionEnd(e)),
      capture,
    );
    // BookFusion reports selections through its own bridge
    if (!isBookFusion()) watchSelection(window, ctx);
    if (isGoogleDoc()) {
      void forwardGoogleDocKeys(
        ctx,
        (e) => state.active && keys.handleKeydown(e),
        (e) => state.active && keys.handleKeyup(e),
      );
    }
    ctx.onInvalidated(() => {
      removeHighlightStyles();
    });
  }

  function applySettings(settings: Settings, active: boolean) {
    state.settings = settings;
    state.active = active;
    resetStatus({ keys: true, mouse: false });
    keys.rebuild();
    tooltip.applyStyle();
  }

  return { listen, applySettings };
}
