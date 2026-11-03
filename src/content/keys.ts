import type { ContentScriptContext } from "wxt/utils/content-script-context";
import type { Settings } from "@/utils/settings";
import { isCharKey } from "./env";

export const KEY_ACTIONS = [
  "showTooltipWhen",
  "keySecondaryLang",
  "keyHoldMouseoverTextType",
  "keyDownTranslateWriting",
  "keyDownTranslatePage",
  "keyToggleEnable",
] as const satisfies readonly (keyof Settings)[];

export type KeyAction = (typeof KEY_ACTIONS)[number];

const MOUSE_KEYS = ["ClickLeft", "ClickMiddle", "ClickRight"] as const;
// AltGr arrives as a phantom ControlLeft then AltRight; hold ControlLeft this long (#354)
const CTRL_VERIFICATION_DELAY = 20;
const RELEASE_DELAY = 20;

export const mouseKey = (button: number) => MOUSE_KEYS[button];

// synthetic key events forwarded from iframes only carry key/code/ctrlKey
const hasAltGraph = (e: KeyboardEvent) =>
  typeof e.getModifierState === "function" && e.getModifierState("AltGraph");

export interface KeyHandlers {
  onPress: (action: KeyAction) => void;
  onRelease: (key: string) => void;
  onKeydown: (e: KeyboardEvent) => void;
}

export class KeyState {
  private down = new Map<string, boolean>();
  private physicallyHeld = new Set<string>();
  private bindings = new Map<string, KeyAction[]>();
  private pendingCtrl: number | undefined;

  constructor(
    private readonly ctx: ContentScriptContext,
    private readonly getSettings: () => Settings,
    private readonly handlers: KeyHandlers,
  ) {}

  rebuild() {
    this.bindings.clear();
    const settings = this.getSettings();
    for (const action of KEY_ACTIONS) {
      const key = settings[action];
      if (!key || key === "null") continue;
      this.bindings.set(key, [...(this.bindings.get(key) ?? []), action]);
    }
  }

  reset() {
    this.down.clear();
  }

  isDown(key: string | undefined) {
    if (!key || key === "null") return false;
    return key === "always" || this.down.get(key) === true;
  }

  isActive(action: KeyAction) {
    return this.isDown(this.getSettings()[action]);
  }

  // the swap and secondary-language keys flip on each press instead of being held (#321)
  private isToggleKey(key: string) {
    const s = this.getSettings();
    return (
      s.swapKeyToggleMode &&
      key !== "null" &&
      (key === s.keyHoldMouseoverTextType || key === s.keySecondaryLang)
    );
  }

  handleKeydown(e: KeyboardEvent) {
    // a real AltGr cancels its phantom ControlLeft; runs before the ignoreAltGr return (#354)
    if (e.code === "AltRight" && this.pendingCtrl !== undefined && hasAltGraph(e)) {
      clearTimeout(this.pendingCtrl);
      this.pendingCtrl = undefined;
    }
    // opt-in: AltGr typing (@, €, ...) must not fire AltRight shortcuts (#352, #353, #355)
    if (this.getSettings().ignoreAltGr && hasAltGraph(e)) return;
    // IME mode switches (Hangul/Process) are not shortcuts
    if (e.key === "HangulMode" || e.key === "Process") return;
    this.handlers.onKeydown(e);
    // keep a lone Alt from moving focus to the browser menu bar
    if (e.key === "Alt") e.preventDefault();

    if (e.code === "ControlLeft" && this.bindings.has("ControlLeft")) {
      clearTimeout(this.pendingCtrl);
      this.pendingCtrl = this.ctx.setTimeout(() => {
        this.pendingCtrl = undefined;
        this.press("ControlLeft");
      }, CTRL_VERIFICATION_DELAY);
      return;
    }
    this.press(e.code);
  }

  handleKeyup(e: KeyboardEvent) {
    void this.release(e.code);
  }

  handleMouseDown(e: MouseEvent) {
    const key = mouseKey(e.button);
    if (key) this.press(key);
  }

  handleMouseUp(e: MouseEvent) {
    const key = mouseKey(e.button);
    if (key) void this.release(key);
  }

  isBoundToTooltip(key: string) {
    const s = this.getSettings();
    return key === s.showTooltipWhen || key === s.keySecondaryLang;
  }

  private press(key: string) {
    if (!key) return;
    if (this.isToggleKey(key)) {
      // ignore auto-repeat while the key is physically held
      if (this.physicallyHeld.has(key)) return;
      this.physicallyHeld.add(key);
      this.down.set(key, !this.down.get(key));
      this.dispatch(key);
      return;
    }
    if (this.down.get(key) || isCharKey(key)) return;
    this.down.set(key, true);
    this.dispatch(key);
  }

  private dispatch(key: string) {
    for (const action of this.bindings.get(key) ?? []) this.handlers.onPress(action);
  }

  private async release(key: string) {
    await new Promise((resolve) => this.ctx.setTimeout(() => resolve(undefined), RELEASE_DELAY));
    if (this.isToggleKey(key)) {
      this.physicallyHeld.delete(key);
      return;
    }
    this.down.set(key, false);
    this.handlers.onRelease(key);
  }
}
