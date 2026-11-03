import { t } from "@/utils/i18n";
import {
  AnnotationEditorType,
  documentOptions,
  EventBus,
  FindState,
  getDocument,
  getPdfFilenameFromUrl,
  LinkTarget,
  PasswordResponses,
  PDFFindController,
  PDFLinkService,
  PDFViewer,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from "./pdfjs";
import { enableRightDragPan } from "./rightPan";
import { fixTextLayerSpacing } from "./textSpacing";

export type PdfSource = { url: string } | { data: Uint8Array; name: string };
export type FindType = "" | "again" | "highlightallchange" | "casesensitivitychange";
export interface FindQuery {
  query: string;
  highlightAll: boolean;
  caseSensitive: boolean;
}
type MatchesCount = { current: number; total: number };

export class PdfController {
  status = $state<"empty" | "loading" | "ready" | "error">("empty");
  progress = $state(0);
  pageNumber = $state(1);
  pagesCount = $state(0);
  scale = $state(1);
  // "auto", "page-fit", "page-width" or the numeric scale as a string
  scaleValue = $state("auto");
  findState = $state<number | null>(null);
  matches = $state<MatchesCount>({ current: 0, total: 0 });
  url = $state("");

  #eventBus = new EventBus();
  #linkService = new PDFLinkService({
    eventBus: this.#eventBus,
    // the viewer may be framed inside the original page
    externalLinkTarget: LinkTarget.BLANK,
  });
  #findController = new PDFFindController({
    eventBus: this.#eventBus,
    linkService: this.#linkService,
  });
  #viewer: PDFViewer;
  #container: HTMLDivElement;
  #task: PDFDocumentLoadingTask | null = null;
  #doc: PDFDocumentProxy | null = null;
  #filename = "document.pdf";
  #onLoadError: () => void;
  #cleanup = new AbortController();

  constructor(container: HTMLDivElement, viewer: HTMLDivElement, onLoadError: () => void) {
    this.#container = container;
    this.#onLoadError = onLoadError;
    this.#viewer = new PDFViewer({
      container,
      viewer,
      eventBus: this.#eventBus,
      linkService: this.#linkService,
      findController: this.#findController,
      // no editing UI; the editor would also turn dropped images into stamps
      annotationEditorMode: AnnotationEditorType.DISABLE,
    });
    this.#linkService.setViewer(this.#viewer);
    this.#listen();
  }

  #listen() {
    const bus = this.#eventBus;
    const { signal } = this.#cleanup;
    bus.on("pagesinit", () => {
      this.#viewer.currentScaleValue = "auto";
      this.#applyHash();
    });
    bus.on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
      this.pageNumber = pageNumber;
    });
    bus.on("scalechanging", ({ scale, presetValue }: { scale: number; presetValue?: string }) => {
      this.scale = scale;
      this.scaleValue = presetValue ?? String(scale);
    });
    bus.on(
      "textlayerrendered",
      ({ source }: { source: { textLayer?: { div: HTMLDivElement } } }) => {
        if (source.textLayer) fixTextLayerSpacing(source.textLayer.div);
      },
    );
    bus.on(
      "updatefindcontrolstate",
      ({ state, matchesCount }: { state: number; matchesCount: MatchesCount }) => {
        this.findState = state;
        this.matches = matchesCount;
      },
    );
    bus.on("updatefindmatchescount", ({ matchesCount }: { matchesCount: MatchesCount }) => {
      this.matches = matchesCount;
    });

    window.addEventListener("hashchange", () => this.#applyHash(), { signal });
    this.#container.addEventListener(
      "wheel",
      (e) => {
        if (!(e.ctrlKey || e.metaKey) || !this.#doc) return;
        e.preventDefault();
        const steps = e.deltaY < 0 ? 1 : -1;
        this.#viewer.updateScale({ steps, origin: [e.clientX, e.clientY] });
      },
      { signal, passive: false },
    );
    signal.addEventListener("abort", enableRightDragPan(this.#container));
  }

  // #page=N, #zoom=…, #nameddest=… like the stock viewer
  #applyHash() {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash && this.#doc) this.#linkService.setHash(hash);
  }

  async open(source: PdfSource) {
    await this.close();
    this.status = "loading";
    this.progress = 0;
    this.url = "url" in source ? source.url : "";
    this.#filename = "url" in source ? getPdfFilenameFromUrl(source.url) : source.name;
    this.findState = null;

    const task = getDocument({
      ...documentOptions(),
      ...("url" in source ? { url: source.url } : { data: source.data }),
    });
    this.#task = task;
    let cancelled = false;
    task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (total) this.progress = Math.min(loaded / total, 1);
    };
    task.onPassword = (update: (password: string) => void, reason: number) => {
      const retry = reason === PasswordResponses.INCORRECT_PASSWORD;
      const password = prompt(
        t(retry ? "Invalid_password_try_again" : "Enter_the_password_to_open_this_PDF_file"),
      );
      if (password !== null) return update(password);
      cancelled = true;
      void task.destroy();
    };

    try {
      const doc = await task.promise;
      if (task !== this.#task) return;
      this.#doc = doc;
      this.pagesCount = doc.numPages;
      this.pageNumber = 1;
      this.#viewer.setDocument(doc);
      this.#linkService.setDocument(doc);
      this.#findController.setDocument(doc);
      this.status = "ready";
      this.#container.focus();
      void this.#loadTitle(doc);
    } catch (error) {
      if (task !== this.#task) return;
      console.log(error);
      this.status = "error";
      if (!cancelled) this.#onLoadError();
    }
  }

  async #loadTitle(doc: PDFDocumentProxy) {
    try {
      const { info } = await doc.getMetadata();
      const title = (info as { Title?: unknown }).Title;
      document.title = typeof title === "string" && title.trim() ? title : this.#filename;
    } catch {
      document.title = this.#filename;
    }
  }

  async close() {
    const task = this.#task;
    this.#task = null;
    if (!task) return;
    this.#doc = null;
    this.pagesCount = 0;
    this.#viewer.setDocument(null);
    this.#linkService.setDocument(null);
    await task.destroy();
  }

  destroy() {
    this.#cleanup.abort();
    void this.close();
  }

  goToPage(page: number) {
    if (Number.isInteger(page) && page >= 1 && page <= this.pagesCount) {
      this.#viewer.currentPageNumber = page;
    }
    return this.#viewer.currentPageNumber;
  }

  previousPage() {
    this.#viewer.previousPage();
  }

  nextPage() {
    this.#viewer.nextPage();
  }

  zoomIn() {
    this.#viewer.increaseScale();
  }

  zoomOut() {
    this.#viewer.decreaseScale();
  }

  setScale(value: string) {
    this.#viewer.currentScaleValue = value;
  }

  find(type: FindType, { query, highlightAll, caseSensitive }: FindQuery, findPrevious = false) {
    this.#eventBus.dispatch("find", {
      source: this,
      type,
      query,
      caseSensitive,
      highlightAll,
      findPrevious,
      entireWord: false,
      matchDiacritics: false,
    });
  }

  closeFind() {
    this.#eventBus.dispatch("findbarclose", { source: this });
    this.findState = null;
    this.matches = { current: 0, total: 0 };
    this.#container.focus();
  }

  get notFound() {
    return this.findState === FindState.NOT_FOUND;
  }

  // edited form fields are kept by saving through pdf.js
  async download() {
    const doc = this.#doc;
    if (!doc) return;
    const data = doc.annotationStorage.size > 0 ? await doc.saveDocument() : await doc.getData();
    const href = URL.createObjectURL(
      new Blob([data as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
    );
    const link = document.createElement("a");
    link.href = href;
    link.download = this.#filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  }
}
