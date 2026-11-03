import type { ContentScriptContext } from "wxt/utils/content-script-context";
import { isGoogleDoc } from "../env";
import { getGoogleDocRange } from "../googleDocs";
import {
  type DetectType,
  expandRange,
  extractTextFromRange,
  getPointedRange,
  isPointInElement,
  shouldUseSegmentation,
} from "./range";

export interface HoverResult {
  text: string;
  range: Range | null;
}

// mousemove re-dispatched from an ebook/BookFusion iframe (legacy bridge contract)
export interface BridgedMouseEvent extends MouseEvent {
  ebookWindow?: Window;
  iframeX?: number;
  iframeY?: number;
}

// classes of overlay blocks that are always read as a whole (OCR/text-fit overlays)
const CONTAINER_CLASSES = ["ocr_text_div", "textFitted"];

export interface MouseoverOptions {
  getType: () => DetectType;
  getInterval: () => number;
  onText: (result: HoverResult) => void;
}

export class MouseoverDetector {
  // detection coordinates, local to `win` (an ebook iframe when bridged)
  private x = 0;
  private y = 0;
  private win: Window = window;
  private timer: number | undefined;
  target: EventTarget | null = null;

  constructor(
    private readonly ctx: ContentScriptContext,
    private readonly options: MouseoverOptions,
  ) {
    ctx.onInvalidated(() => clearTimeout(this.timer));
  }

  track(e: BridgedMouseEvent) {
    if (e.ebookWindow) {
      this.win = e.ebookWindow;
      this.x = e.iframeX ?? 0;
      this.y = e.iframeY ?? 0;
    } else {
      // a real event on this window means the pointer left the iframe (legacy stuck to it)
      this.win = window;
      this.x = e.clientX;
      this.y = e.clientY;
    }
    this.target = e.target;
    this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    // native timer: ctx.setTimeout adds an invalidation listener per call, and this runs per mousemove
    this.timer = window.setTimeout(() => void this.trigger(), this.options.getInterval());
  }

  async trigger() {
    clearTimeout(this.timer);
    const result = await this.detect();
    if (this.ctx.isValid) this.options.onText(result);
  }

  private detectType(): DetectType {
    const classList = this.target instanceof Element ? this.target.classList : null;
    if (CONTAINER_CLASSES.some((name) => classList?.contains(name))) return "container";
    return this.options.getType();
  }

  async detect(): Promise<HoverResult> {
    const type = this.detectType();
    const { x, y } = this;

    if (this.win === window && isGoogleDoc()) {
      const { range, cleanup } = getGoogleDocRange(x, y);
      try {
        return this.textFromRange(range, type);
      } finally {
        cleanup();
      }
    }

    const range = getPointedRange(x, y, this.win.document);
    const result = this.textFromRange(range, type);
    // Range.expand fails on some layouts; retry with the segmenter when the container has text
    if (
      !result.text &&
      type !== "container" &&
      !shouldUseSegmentation() &&
      this.textFromRange(range, "container").text
    ) {
      return this.textFromRange(range, type, true);
    }
    return result;
  }

  private textFromRange(
    range: Range | null,
    type: DetectType,
    useSegmentation = false,
  ): HoverResult {
    const expanded = expandRange(range, type, useSegmentation);
    if (expanded && isPointInElement(expanded, this.x, this.y)) {
      return { text: extractTextFromRange(expanded), range: expanded };
    }
    return { text: "", range };
  }
}
