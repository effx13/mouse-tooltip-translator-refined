import {
  arrow,
  computePosition,
  flip,
  offset,
  shift,
  type Placement,
  type VirtualElement,
} from "@floating-ui/dom";
import type { ContentScriptContext } from "wxt/utils/content-script-context";
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from "wxt/utils/content-script-ui/shadow-root";
import type { Settings } from "@/utils/settings";
import tooltipCss from "./tooltip.css?inline";

interface TooltipElements {
  root: HTMLElement;
  box: HTMLElement;
  content: HTMLElement;
  arrow: HTMLElement;
}

const ANIMATIONS = new Set(["fade", "scale", "shift-away", "shift-toward", "perspective"]);
const GENERIC_FONTS = new Set([
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
]);
const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif';
const SHOW_DURATION = 300;
// the host leaves the DOM this long after hiding
const REMOVE_DELAY = 3000;
const TOPRIGHT_MARGIN = 12;
const VIEWPORT_PADDING = 5;
const ARROW_PADDING = 6;

// user font goes first; named fonts are quoted, generic families are not
function fontFamily(custom: string) {
  if (!custom) return FONT_STACK;
  return `${GENERIC_FONTS.has(custom) ? custom : `"${custom.replaceAll('"', "")}"`}, ${FONT_STACK}`;
}

function createElements(): TooltipElements {
  const root = document.createElement("div");
  root.className = "mtt-root";
  root.dataset.state = "hidden";
  root.setAttribute("role", "mtttooltip");
  const box = document.createElement("div");
  box.className = "mtt-box";
  const content = document.createElement("div");
  const arrowEl = document.createElement("div");
  arrowEl.className = "mtt-arrow";
  box.append(content, arrowEl);
  root.append(box);
  return { root, box, content, arrow: arrowEl };
}

function styleVars(s: Settings): Record<string, string> {
  return {
    "--mtt-width": `${s.tooltipWidth}px`,
    "--mtt-font-size": `${s.tooltipFontSize}px`,
    "--mtt-font-family": fontFamily(s.tooltipFontFamily),
    "--mtt-color": s.tooltipFontColor,
    "--mtt-bg-color": s.tooltipBackgroundColor,
    "--mtt-border-color": s.tooltipBorderColor,
    "--mtt-blur": `${s.tooltipBackgroundBlur}px`,
    "--mtt-text-align": s.tooltipTextAlign,
    "--mtt-show-duration": `${SHOW_DURATION}ms`,
    "--mtt-hide-duration": `${s.tooltipDisappearDuration}ms`,
    // a following tooltip would sit under the cursor; fixed ones can be hovered and selected
    "--mtt-pointer-events": s.tooltipPosition === "follow" ? "none" : "auto",
  };
}

function animationName(animation: string) {
  if (animation === "") return "none";
  return ANIMATIONS.has(animation) ? animation : "fade";
}

function pointElement(x: number, y: number): VirtualElement {
  return {
    getBoundingClientRect: () => ({
      x,
      y,
      left: x,
      top: y,
      right: x,
      bottom: y,
      width: 0,
      height: 0,
    }),
  };
}

export class Tooltip {
  private ui: Promise<ShadowRootContentScriptUi<TooltipElements>> | undefined;
  private elements: TooltipElements | undefined;
  private visible = false;
  private contentKey = "";
  // bumped by every show/hide so a slow async show never undoes a later hide
  private generation = 0;
  private removeTimer: number | undefined;
  private frame: number | undefined;
  private cursor = { x: 0, y: 0 };

  constructor(
    private readonly ctx: ContentScriptContext,
    private readonly getSettings: () => Settings,
  ) {
    ctx.onInvalidated(() => {
      clearTimeout(this.removeTimer);
      if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    });
  }

  private getUi() {
    this.ui ??= createShadowRootUi<TooltipElements>(this.ctx, {
      name: "mtt-tooltip",
      position: "inline",
      anchor: () => document.documentElement,
      append: "last",
      css: tooltipCss,
      onMount: (container, _shadow, host) => {
        host.id = "mttContainer";
        host.className = "notranslate";
        host.setAttribute("translate", "no");
        // keep the node out of rich-text editors / page builders
        host.setAttribute("contenteditable", "false");
        host.dataset.mtt = "1";
        const elements = createElements();
        // the page may have dropped the host; never stack a second root
        container.replaceChildren(elements.root);
        this.elements = elements;
        this.applyStyle();
        return elements;
      },
      onRemove: () => {
        this.elements = undefined;
        this.visible = false;
      },
    });
    return this.ui;
  }

  contains(target: EventTarget | null) {
    const host = this.elements?.root.getRootNode();
    return host instanceof ShadowRoot && target instanceof Node && host.host.contains(target);
  }

  get isVisible() {
    return this.visible;
  }

  applyStyle() {
    const root = this.elements?.root;
    if (!root) return;
    const s = this.getSettings();
    for (const [name, value] of Object.entries(styleVars(s))) root.style.setProperty(name, value);
    root.dataset.animation = animationName(s.tooltipAnimation);
    if (this.visible) void this.position();
  }

  async show(nodes: Node[], key: string) {
    const generation = ++this.generation;
    clearTimeout(this.removeTimer);
    const ui = await this.getUi();
    if (generation !== this.generation || this.ctx.isInvalid) return;
    if (!ui.mounted || !this.elements?.root.isConnected) ui.mount();
    const elements = this.elements;
    if (!elements) return;

    const changed = key !== this.contentKey || !this.visible;
    this.contentKey = key;
    if (changed) elements.content.replaceChildren(...nodes);
    await this.position();
    if (generation !== this.generation) return;
    if (!this.visible) {
      // commit the hidden start state before animating in
      elements.root.getBoundingClientRect();
      elements.root.dataset.state = "visible";
    }
    this.visible = true;
  }

  hide() {
    this.generation++;
    if (this.elements) this.elements.root.dataset.state = "hidden";
    this.visible = false;
    this.contentKey = "";
    clearTimeout(this.removeTimer);
    this.removeTimer = window.setTimeout(() => this.remove(), REMOVE_DELAY);
  }

  // drop the host from the DOM right away (writing fields)
  remove() {
    clearTimeout(this.removeTimer);
    this.generation++;
    this.visible = false;
    this.contentKey = "";
    void this.ui?.then((ui) => ui.remove());
  }

  moveTo(x: number, y: number) {
    this.cursor = { x, y };
    if (
      !this.visible ||
      this.getSettings().tooltipPosition !== "follow" ||
      this.frame !== undefined
    )
      return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      void this.position();
    });
  }

  private async position() {
    const elements = this.elements;
    if (!elements) return;
    const s = this.getSettings();
    const topRight = s.tooltipPosition === "topright";
    // top-right ignores the cursor and the placement option
    const reference = topRight
      ? pointElement(document.documentElement.clientWidth - TOPRIGHT_MARGIN, TOPRIGHT_MARGIN)
      : pointElement(this.cursor.x, this.cursor.y);
    const placement: Placement = topRight
      ? "bottom-end"
      : s.tooltipPlacement === "bottom"
        ? "bottom"
        : "top";
    const {
      x,
      y,
      placement: finalPlacement,
      middlewareData,
    } = await computePosition(reference, elements.root, {
      strategy: "fixed",
      placement,
      middleware: [
        offset(s.tooltipDistance),
        flip(),
        shift({ padding: VIEWPORT_PADDING }),
        arrow({ element: elements.arrow, padding: ARROW_PADDING }),
      ],
    });
    elements.root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    elements.root.dataset.side = finalPlacement.split("-")[0] ?? "top";
    const arrowX = middlewareData.arrow?.x;
    elements.arrow.style.left = arrowX == null ? "" : `${arrowX}px`;
  }
}
