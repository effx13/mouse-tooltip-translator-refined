declare module "foliate-js/view.js" {
  export type LanguageMap = string | Record<string, string>;

  export interface TocItem {
    label: string;
    href?: string;
    subitems?: TocItem[];
  }

  export interface Book {
    dir?: string;
    toc?: TocItem[];
    metadata?: {
      title?: LanguageMap;
      language?: string | string[];
    };
  }

  export interface RelocateDetail {
    fraction?: number;
    tocItem?: TocItem;
    cfi?: string;
  }

  export interface Renderer extends HTMLElement {
    setStyles?(styles: string | [string, string]): void;
    focusView?(): void;
  }

  interface ViewEventMap extends HTMLElementEventMap {
    load: CustomEvent<{ doc: Document; index: number }>;
    relocate: CustomEvent<RelocateDetail>;
  }

  export class View extends HTMLElement {
    book?: Book;
    renderer?: Renderer;
    open(book: File | Blob | string): Promise<void>;
    close(): void;
    init(options: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
    goTo(target: string | number): Promise<unknown>;
    goToFraction(fraction: number): Promise<void>;
    prev(): Promise<void>;
    next(): Promise<void>;
    goLeft(): Promise<void>;
    goRight(): Promise<void>;
    getSectionFractions(): number[];
    addEventListener<K extends keyof ViewEventMap>(
      type: K,
      listener: (this: View, ev: ViewEventMap[K]) => unknown,
      options?: boolean | AddEventListenerOptions,
    ): void;
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void;
  }
}
